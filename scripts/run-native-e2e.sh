#!/usr/bin/env bash
set -euo pipefail

export PATH="$PATH:${MAESTRO_BIN_DIR:-$HOME/.maestro/bin}"
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-240000}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro is required: https://docs.maestro.dev/getting-started/installing-maestro"
  exit 1
fi

ios_device="${E2E_IOS_DEVICE:-730B98A0-FC3B-45CA-AF3A-9896CEEC16AA}"
android_device="${E2E_ANDROID_DEVICE:-emulator-5554}"
android_package="${E2E_ANDROID_PACKAGE:-engineering.brainwaves.sfera}"
android_avd="${E2E_ANDROID_AVD:-ArtificialLabs_API_36}"
android_memory_mb="${E2E_ANDROID_MEMORY_MB:-3072}"
sequential_simulators="${E2E_SEQUENTIAL_SIMULATORS:-0}"
metro_port="${E2E_METRO_PORT:-8082}"
convex_proxy_port="${E2E_CONVEX_PROXY_PORT:-3320}"
convex_site_proxy_port="${E2E_CONVEX_SITE_PROXY_PORT:-3321}"
convex_ios_proxy_port="${E2E_CONVEX_IOS_PROXY_PORT:-3340}"
run_id="${E2E_RUN_ID:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"
account_tag="${run_id//-/}"
account_tag="${account_tag:0:12}"
export E2E_EMAIL="${E2E_EMAIL:-artificiallabs-e2e+${account_tag}-native@example.test}"
password_id="$account_tag"
export E2E_PASSWORD="${E2E_PASSWORD:-E2e${password_id}Aa1}"
export E2E_REPORT_DIR="${E2E_REPORT_DIR:-output/e2e}"
scan_fixture_source="${E2E_SCAN_FIXTURE_SOURCE:-}"
if [[ -n "$scan_fixture_source" && ! -r "$scan_fixture_source" ]]; then
  echo "E2E scan fixture is not a readable file" >&2
  exit 1
fi
ios_scan_fixture_uri=""
ios_scan_fixture_path=""
android_scan_fixture_uri=""
ios_import_fixture_uri=""
ios_import_fixture_path=""
android_import_fixture_uri=""
import_fixture_source=""
if [[ -n "$scan_fixture_source" ]]; then
  android_scan_fixture_uri="file:///data/user/0/${android_package}/files/e2e/scan.jpg"
  android_import_fixture_uri="file:///data/user/0/${android_package}/files/e2e/import.json"
fi

mkdir -p "$E2E_REPORT_DIR"
e2e_status=0
android_ready=0
environment_blocked=0
ios_primary_ok=0
cloud_snapshot_ok=0
account_deletion_ready=0

record_failure() {
  echo "E2E failure: $1" >&2
  e2e_status=1
}

record_environment_blocked() {
  echo "E2E environment blocked: $1" >&2
  environment_blocked=1
}

copy_maestro_screenshot() {
  local flow="$1"
  local label="$2"
  local destination="$3"
  local source
  source="$(find "${MAESTRO_DEBUG_ROOT:-$HOME/.maestro/tests}" -type f \
    -path "*/${flow}/takeScreenshot/${label}.png" -mmin -20 \
    -print 2>/dev/null | tail -1)"
  # Composite iOS flows keep screenshots under the wrapper flow directory.
  if [[ -z "$source" ]]; then
    source="$(find "${MAESTRO_DEBUG_ROOT:-$HOME/.maestro/tests}" -type f \
      -path "*/takeScreenshot/${label}.png" -mmin -20 \
      -print 2>/dev/null | tail -1)"
  fi
  if [[ -n "$source" ]]; then
    install -m 600 "$source" "$destination"
  else
    record_failure "missing Maestro screenshot ${label}"
  fi
}

ios_network_blocked() {
  local metro_log="$E2E_REPORT_DIR/metro.log"
  [[ -f "$metro_log" ]] &&
    grep -q "WebSocket closed with code 1006" "$metro_log" &&
    grep -Eq "kCFErrorDomainCFNetwork error 2|server (can.t|cannot) be found" "$metro_log"
}

android_maestro_blocked() {
  local maestro_root="${MAESTRO_DEBUG_ROOT:-$HOME/.maestro/tests}"
  [[ -d "$maestro_root" ]] || return 1
  if find "$maestro_root" -type f -name maestro.log -mmin -10 -print0 2>/dev/null |
    xargs -0 grep -Eq \
      "Device server died|Android driver did not start up|AndroidDriverTimeoutException|AndroidInstrumentationSetupFailure|Maestro instrumentation could not be initialized|DEADLINE_EXCEEDED"; then
    return 0
  fi
  find "$maestro_root" -type f -path "*/screen-hierarchy/*.json" -mmin -10 -print0 2>/dev/null |
    xargs -0 grep -Eqi \
      "(System UI|Process system) (isn't|is not) responding"
}

ios_maestro_blocked() {
  local log_file="$1"
  [[ -f "$log_file" ]] && grep -Eq \
    "LocalSimulatorUtils\.setLocationPermission|simctl privacy|IOSDriver\.setPermissions|Maestro.*driver.*start|Unable to boot device|Failed to launch.*UITests" \
    "$log_file"
}

metro_pid=""
convex_proxy_pid=""
android_launch_pid=""
android_emulator_pid=""
e2e_cert_dir=""
cleanup() {
  if [[ -n "$ios_scan_fixture_path" && -f "$ios_scan_fixture_path" ]]; then
    unlink "$ios_scan_fixture_path"
  fi
  if [[ -n "$ios_import_fixture_path" && -f "$ios_import_fixture_path" ]]; then
    unlink "$ios_import_fixture_path"
  fi
  if [[ -n "$android_scan_fixture_uri" ]]; then
    adb -s "$android_device" shell run-as "$android_package" \
      rm -f files/e2e/scan.jpg files/e2e/import.json 2>/dev/null || true
  fi
  if [[ -n "$android_launch_pid" ]]; then
    kill "$android_launch_pid" 2>/dev/null || true
  fi
  if [[ -n "$android_emulator_pid" ]]; then
    adb -s "$android_device" emu kill >/dev/null 2>&1 || true
    kill "$android_emulator_pid" 2>/dev/null || true
  fi
  if [[ -n "$metro_pid" ]]; then
    kill "$metro_pid" 2>/dev/null || true
  fi
  if [[ -n "$convex_proxy_pid" ]]; then
    kill "$convex_proxy_pid" 2>/dev/null || true
  fi
  if [[ -n "$e2e_cert_dir" && -d "$e2e_cert_dir" ]]; then
    if [[ -f "$e2e_cert_dir/localhost.key" ]]; then
      unlink "$e2e_cert_dir/localhost.key"
    fi
    if [[ -f "$e2e_cert_dir/localhost.crt" ]]; then
      unlink "$e2e_cert_dir/localhost.crt"
    fi
    rmdir "$e2e_cert_dir" 2>/dev/null || true
  fi
  if [[ -n "$import_fixture_source" && -f "$import_fixture_source" ]]; then
    unlink "$import_fixture_source"
  fi
  node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts cleanup || true
}
trap cleanup EXIT

start_android_avd() {
  if adb -s "$android_device" get-state >/dev/null 2>&1; then
    return 0
  fi
  local emulator_bin
  emulator_bin="${ANDROID_HOME:-$HOME/Library/Android/sdk}/emulator/emulator"
  if [[ ! -x "$emulator_bin" ]]; then
    emulator_bin="$(command -v emulator || true)"
  fi
  if [[ -z "$emulator_bin" ]]; then
    return 1
  fi
  "$emulator_bin" -avd "$android_avd" -no-snapshot-load -no-boot-anim \
    -gpu host -memory "$android_memory_mb" \
    >"$E2E_REPORT_DIR/android-emulator.log" 2>&1 &
  android_emulator_pid="$!"
  for _ in {1..180}; do
    if [[ "$(adb -s "$android_device" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

stop_android_avd() {
  adb -s "$android_device" emu kill >/dev/null 2>&1 || true
  if [[ -n "$android_emulator_pid" ]]; then
    wait "$android_emulator_pid" 2>/dev/null || true
    android_emulator_pid=""
  fi
}

boot_ios_simulator() {
  xcrun simctl boot "$ios_device" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$ios_device" -b >/dev/null
  xcrun simctl launch "$ios_device" com.anonymous.privateexpo >/dev/null 2>&1 || true
  sleep 10
}

open_ios_dev_url() {
  local url="$1"
  for _ in {1..30}; do
    xcrun simctl openurl "$ios_device" "$url" >/dev/null 2>&1 &
    local open_pid="$!"
    for _ in {1..15}; do
      if ! kill -0 "$open_pid" 2>/dev/null; then
        if wait "$open_pid"; then
          return 0
        fi
        break
      fi
      sleep 1
    done
    if kill -0 "$open_pid" 2>/dev/null; then
      kill "$open_pid" 2>/dev/null || true
      wait "$open_pid" 2>/dev/null || true
    fi
    sleep 2
  done
  return 1
}

start_convex_proxy() {
  E2E_CONVEX_TLS_CERT="$e2e_cert_dir/localhost.crt" \
  E2E_CONVEX_TLS_KEY="$e2e_cert_dir/localhost.key" \
  node --env-file-if-exists=.env.local --import tsx scripts/convex-e2e-proxy.ts \
    >>"$E2E_REPORT_DIR/convex-proxy.log" 2>&1 &
  convex_proxy_pid="$!"
  for _ in {1..30}; do
    if curl -fsS "http://127.0.0.1:${convex_proxy_port}/__e2e_proxy_health" >/dev/null 2>&1 && \
      curl -fsS "http://127.0.0.1:${convex_site_proxy_port}/__e2e_proxy_health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

stop_convex_proxy() {
  [[ -n "$convex_proxy_pid" ]] || return 0
  kill "$convex_proxy_pid" 2>/dev/null || true
  for _ in {1..10}; do
    if ! kill -0 "$convex_proxy_pid" 2>/dev/null; then
      wait "$convex_proxy_pid" 2>/dev/null || true
      convex_proxy_pid=""
      return 0
    fi
    sleep 1
  done
  kill -KILL "$convex_proxy_pid" 2>/dev/null || true
  wait "$convex_proxy_pid" 2>/dev/null || true
  convex_proxy_pid=""
}

e2e_cert_dir="$(mktemp -d "${TMPDIR:-/tmp}/artificiallabs-e2e-cert.XXXXXX")"
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj "/CN=ArtificialLabs Local E2E" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -keyout "$e2e_cert_dir/localhost.key" \
  -out "$e2e_cert_dir/localhost.crt" >/dev/null 2>&1
chmod 600 "$e2e_cert_dir/localhost.key"
boot_ios_simulator
xcrun simctl keychain "$ios_device" reset
xcrun simctl keychain "$ios_device" add-root-cert "$e2e_cert_dir/localhost.crt"

: >"$E2E_REPORT_DIR/convex-proxy.log"
start_convex_proxy
curl -fsS "http://127.0.0.1:${convex_proxy_port}/version" >/dev/null
curl --cacert "$e2e_cert_dir/localhost.crt" -fsS \
  "https://localhost:${convex_ios_proxy_port}/version" >/dev/null

if [[ -n "$scan_fixture_source" ]]; then
  import_fixture_source="$(mktemp "${TMPDIR:-/tmp}/artificiallabs-e2e-import.XXXXXX")"
  node scripts/create-native-e2e-import.cjs "$import_fixture_source"
  chmod 600 "$import_fixture_source"
  maestro --device "$ios_device" test .maestro/reset.yml
  ios_data_container="$(xcrun simctl get_app_container "$ios_device" com.anonymous.privateexpo data)"
  ios_scan_fixture_path="$ios_data_container/Documents/e2e-scan.jpg"
  ios_import_fixture_path="$ios_data_container/Documents/e2e-import.json"
  install -m 600 "$scan_fixture_source" "$ios_scan_fixture_path"
  install -m 600 "$import_fixture_source" "$ios_import_fixture_path"
  ios_scan_fixture_uri="file://${ios_scan_fixture_path}"
  ios_import_fixture_uri="file://${ios_import_fixture_path}"
fi

EXPO_PUBLIC_E2E_IOS_CONVEX_URL="https://localhost:${convex_ios_proxy_port}" \
EXPO_PUBLIC_E2E_ANDROID_CONVEX_URL="http://localhost:${convex_proxy_port}" \
EXPO_PUBLIC_E2E_SCAN_FIXTURE_IOS_URI="$ios_scan_fixture_uri" \
EXPO_PUBLIC_E2E_SCAN_FIXTURE_ANDROID_URI="$android_scan_fixture_uri" \
EXPO_PUBLIC_E2E_DOCUMENT_FIXTURE_IOS_URI="$ios_scan_fixture_uri" \
EXPO_PUBLIC_E2E_DOCUMENT_FIXTURE_ANDROID_URI="$android_scan_fixture_uri" \
EXPO_PUBLIC_E2E_IMPORT_FIXTURE_IOS_URI="$ios_import_fixture_uri" \
EXPO_PUBLIC_E2E_IMPORT_FIXTURE_ANDROID_URI="$android_import_fixture_uri" \
EXPO_PUBLIC_E2E_MODE=1 \
EXPO_PUBLIC_E2E_EMAIL="$E2E_EMAIL" \
CI=1 npx expo start --dev-client --localhost --clear --port "$metro_port" \
  --scheme private-expo \
  >"$E2E_REPORT_DIR/metro.log" 2>&1 &
metro_pid="$!"
for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:${metro_port}/status" 2>/dev/null | grep -q "packager-status:running"; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:${metro_port}/status" | grep -q "packager-status:running"
xcrun simctl get_app_container "$ios_device" com.anonymous.privateexpo app >/dev/null

prepare_android_client() {
  local clear_data="${1:-0}"
  android_ready=0
  if ! start_android_avd; then
    record_environment_blocked "Android AVD startup"
    return 1
  fi
  if node --import tsx tests/e2e/android-preflight.ts "$android_device"; then
    android_ready=1
  else
    local preflight_status="$?"
    if [[ "$preflight_status" -eq 75 ]]; then
      record_environment_blocked "Android AVD preflight"
    else
      record_failure "Android AVD preflight"
    fi
    return 1
  fi
  adb -s "$android_device" reverse "tcp:${metro_port}" "tcp:${metro_port}"
  adb -s "$android_device" reverse "tcp:${convex_proxy_port}" "tcp:${convex_proxy_port}"
  adb -s "$android_device" reverse "tcp:${convex_site_proxy_port}" "tcp:${convex_site_proxy_port}"
  adb -s "$android_device" shell pm path "$android_package" >/dev/null
  if [[ "$clear_data" -eq 1 ]]; then
    adb -s "$android_device" shell pm clear "$android_package" >/dev/null
  fi
  if [[ -n "$scan_fixture_source" ]]; then
    adb -s "$android_device" push "$scan_fixture_source" /data/local/tmp/artificiallabs-e2e-scan.jpg >/dev/null
    adb -s "$android_device" shell run-as "$android_package" mkdir -p files/e2e
    adb -s "$android_device" shell run-as "$android_package" cp \
      /data/local/tmp/artificiallabs-e2e-scan.jpg files/e2e/scan.jpg
    adb -s "$android_device" shell rm -f /data/local/tmp/artificiallabs-e2e-scan.jpg
    adb -s "$android_device" push "$import_fixture_source" /data/local/tmp/artificiallabs-e2e-import.json >/dev/null
    adb -s "$android_device" shell run-as "$android_package" cp \
      /data/local/tmp/artificiallabs-e2e-import.json files/e2e/import.json
    adb -s "$android_device" shell rm -f /data/local/tmp/artificiallabs-e2e-import.json
  fi
}

if [[ "$sequential_simulators" -ne 1 ]]; then
  prepare_android_client 1 || true
fi

ios_dev_url="exp+private-expo://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${metro_port}"
android_dev_url="exp+private-expo://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${metro_port}"
if [[ -z "$scan_fixture_source" ]]; then
  maestro --device "$ios_device" test .maestro/reset.yml
fi
xcrun simctl openurl "$ios_device" "$ios_dev_url"
if [[ "$android_ready" -eq 1 ]]; then
  adb -s "$android_device" shell am start -a android.intent.action.VIEW -d "$android_dev_url" "$android_package" \
    >"$E2E_REPORT_DIR/android-launch.log" 2>&1 &
  android_launch_pid="$!"
fi
sleep 10
# Run the iOS application surface in a single XCUITest session. Maestro's iOS
# 26 driver can lose its localhost port between separate CLI invocations.
ios_complete_flow=".maestro/ios-complete.yml"
[[ -n "$scan_fixture_source" ]] && ios_complete_flow=".maestro/ios-complete-with-scan.yml"
if maestro --device "$ios_device" test "$ios_complete_flow" \
  --env E2E_EMAIL="$E2E_EMAIL" --env E2E_PASSWORD="$E2E_PASSWORD" \
  --env E2E_PRODUCT_SCREENSHOT="ios-product-surface" \
  --env E2E_SCAN_RESULT_SCREENSHOT="ios-scan-result" \
  --env E2E_SCAN_SAVED_SCREENSHOT="ios-scan-saved"; then
  ios_primary_ok=1
  xcrun simctl io "$ios_device" screenshot \
    "$E2E_REPORT_DIR/ios-live-sync.png" >/dev/null 2>&1 || true
elif ios_network_blocked; then
  record_environment_blocked "iOS Simulator cannot resolve or reach the Convex endpoint"
else
  record_failure "iOS primary flow"
fi
if [[ "$ios_primary_ok" -eq 1 ]]; then
  copy_maestro_screenshot product-surface ios-product-surface \
    "$E2E_REPORT_DIR/ios-product-surface.png"
  if [[ -n "$scan_fixture_source" ]]; then
    copy_maestro_screenshot scan-fixture ios-scan-result "$E2E_REPORT_DIR/ios-scan-result.png"
    copy_maestro_screenshot scan-fixture ios-scan-saved "$E2E_REPORT_DIR/ios-scan-saved.png"
  fi
  expected_scan_count=0
  [[ -n "$scan_fixture_source" ]] && expected_scan_count=1
  if E2E_EXPECT_PRODUCT_DATA=1 E2E_EXPECT_SCAN_COUNT="$expected_scan_count" \
    node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts snapshot; then
    cloud_snapshot_ok=1
  else
    record_failure "iOS cloud snapshot"
  fi
fi

if [[ "$sequential_simulators" -eq 1 && "$cloud_snapshot_ok" -eq 1 ]]; then
  xcrun simctl shutdown "$ios_device" >/dev/null 2>&1 || true
  if prepare_android_client 1; then
    adb -s "$android_device" shell am start -W -a android.intent.action.VIEW \
      -d "$android_dev_url" "$android_package" \
      >"$E2E_REPORT_DIR/android-launch-sequential.log" 2>&1 || true
    sleep 15
  fi
fi

if [[ "$android_ready" -eq 1 && "$cloud_snapshot_ok" -eq 1 ]]; then
  if [[ -n "$scan_fixture_source" ]]; then
    adb -s "$android_device" shell run-as "$android_package" mkdir -p files/e2e
    adb -s "$android_device" push "$scan_fixture_source" \
      /data/local/tmp/artificiallabs-e2e-scan.jpg >/dev/null
    adb -s "$android_device" shell run-as "$android_package" cp \
      /data/local/tmp/artificiallabs-e2e-scan.jpg files/e2e/scan.jpg
    adb -s "$android_device" shell rm -f /data/local/tmp/artificiallabs-e2e-scan.jpg
    adb -s "$android_device" push "$import_fixture_source" \
      /data/local/tmp/artificiallabs-e2e-import.json >/dev/null
    adb -s "$android_device" shell run-as "$android_package" cp \
      /data/local/tmp/artificiallabs-e2e-import.json files/e2e/import.json
    adb -s "$android_device" shell rm -f /data/local/tmp/artificiallabs-e2e-import.json
  fi
  adb -s "$android_device" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  adb -s "$android_device" shell wm dismiss-keyguard >/dev/null 2>&1 || true
  adb -s "$android_device" shell am force-stop "$android_package"
  adb -s "$android_device" shell am start -W -a android.intent.action.VIEW \
    -d "$android_dev_url" "$android_package" \
    >"$E2E_REPORT_DIR/android-launch-secondary.log" 2>&1
  sleep 5
  if ! MAESTRO_APP_ID="$android_package" maestro --device "$android_device" test .maestro/android-secondary.yml \
    --env E2E_EMAIL="$E2E_EMAIL" --env E2E_PASSWORD="$E2E_PASSWORD"; then
    if android_maestro_blocked; then
      record_environment_blocked "Android Maestro driver failed"
      android_ready=0
    elif node --import tsx tests/e2e/android-preflight.ts "$android_device"; then
      record_failure "Android secondary flow"
    else
      preflight_status="$?"
      if [[ "$preflight_status" -eq 75 ]]; then
        record_environment_blocked "Android System UI during secondary flow"
        android_ready=0
      else
        record_failure "Android secondary flow"
      fi
    fi
  else
    if [[ "$android_device" == emulator-* ]]; then
      stop_convex_proxy
      if ! MAESTRO_APP_ID="$android_package" maestro --device "$android_device" test .maestro/offline-mode.yml \
        --env E2E_OFFLINE_SCREENSHOT="android-offline-local-save"; then
        record_failure "Android offline local-first flow"
      else
        copy_maestro_screenshot offline-mode android-offline-local-save \
          "$E2E_REPORT_DIR/android-offline-local-save.png"
      fi
      if ! start_convex_proxy; then
        record_environment_blocked "Android Convex proxy restart"
        android_ready=0
      elif ! MAESTRO_APP_ID="$android_package" maestro --device "$android_device" test .maestro/reconnect-mode.yml \
        --env E2E_RECONNECTED_SCREENSHOT="android-reconnected-sync"; then
        record_failure "Android reconnect and retry flow"
      else
        copy_maestro_screenshot reconnect-mode android-reconnected-sync \
          "$E2E_REPORT_DIR/android-reconnected-sync.png"
      fi
    fi
    if ! MAESTRO_APP_ID="$android_package" maestro --device "$android_device" test .maestro/product-surface.yml \
      --env E2E_PRODUCT_SCREENSHOT="android-product-surface"; then
      if android_maestro_blocked; then
        record_environment_blocked "Android Maestro driver during product flow"
        android_ready=0
      else
        record_failure "Android product surface flow"
      fi
    else
      copy_maestro_screenshot product-surface android-product-surface \
        "$E2E_REPORT_DIR/android-product-surface.png"
    fi
    if [[ "$android_ready" -eq 1 && -n "$scan_fixture_source" ]] && ! MAESTRO_APP_ID="$android_package" maestro --device "$android_device" test .maestro/scan-fixture.yml \
      --env E2E_SCAN_RESULT_SCREENSHOT="android-scan-result" \
      --env E2E_SCAN_SAVED_SCREENSHOT="android-scan-saved"; then
      if android_maestro_blocked; then
        record_environment_blocked "Android Maestro driver during scan flow"
        android_ready=0
      else
        record_failure "Android real-photo scan flow"
      fi
    elif [[ "$android_ready" -eq 1 && -n "$scan_fixture_source" ]]; then
      copy_maestro_screenshot scan-fixture android-scan-result "$E2E_REPORT_DIR/android-scan-result.png"
      copy_maestro_screenshot scan-fixture android-scan-saved "$E2E_REPORT_DIR/android-scan-saved.png"
    fi
    if ! adb -s "$android_device" exec-out screencap -p \
      >"$E2E_REPORT_DIR/android-live-sync.png"; then
      unlink "$E2E_REPORT_DIR/android-live-sync.png" 2>/dev/null || true
    fi
  fi
  expected_scan_count=0
  [[ -n "$scan_fixture_source" ]] && expected_scan_count=2
  if [[ "$android_ready" -eq 1 ]] && ! E2E_EXPECT_PRODUCT_DATA=1 E2E_EXPECT_OFFLINE_RECORD=1 E2E_EXPECT_SCAN_COUNT="$expected_scan_count" \
    node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts snapshot; then
    record_failure "Android cloud snapshot"
  fi
fi

if [[ "$sequential_simulators" -eq 1 && "$cloud_snapshot_ok" -eq 1 ]]; then
  stop_android_avd
  boot_ios_simulator
  if ! open_ios_dev_url "$ios_dev_url"; then
    record_environment_blocked "iOS Simulator did not accept the development URL after reboot"
  fi
  sleep 10
fi

if [[ "$cloud_snapshot_ok" -eq 1 ]]; then
  ios_delete_log="$E2E_REPORT_DIR/ios-delete-maestro.log"
  if ! maestro --device "$ios_device" test .maestro/ios-delete.yml \
    2>&1 | tee "$ios_delete_log"; then
    if ios_maestro_blocked "$ios_delete_log"; then
      record_environment_blocked "iOS Maestro driver during account deletion"
    else
      record_failure "iOS account deletion flow"
    fi
  else
    account_deletion_ready=1
    xcrun simctl io "$ios_device" screenshot \
      "$E2E_REPORT_DIR/ios-live-pending-deletion.png" >/dev/null 2>&1 || true
  fi
  if [[ "$account_deletion_ready" -eq 1 ]] && \
    ! node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts pending; then
    record_failure "pending-deletion backend status"
  fi
fi

if [[ "$sequential_simulators" -eq 1 && "$android_ready" -eq 1 && "$account_deletion_ready" -eq 1 ]]; then
  xcrun simctl shutdown "$ios_device" >/dev/null 2>&1 || true
  if prepare_android_client 0; then
    adb -s "$android_device" shell am start -W -a android.intent.action.VIEW \
      -d "$android_dev_url" "$android_package" \
      >"$E2E_REPORT_DIR/android-launch-restore.log" 2>&1 || true
    sleep 10
  fi
fi

if [[ "$android_ready" -eq 1 && "$account_deletion_ready" -eq 1 ]]; then
  if ! MAESTRO_APP_ID="$android_package" maestro --device "$android_device" test .maestro/android-restore.yml \
    --env E2E_EMAIL="$E2E_EMAIL" --env E2E_PASSWORD="$E2E_PASSWORD"; then
    if node --import tsx tests/e2e/android-preflight.ts "$android_device"; then
      record_failure "Android account restore flow"
    else
      preflight_status="$?"
      if [[ "$preflight_status" -eq 75 ]]; then
        record_environment_blocked "Android System UI during restore flow"
        android_ready=0
      else
        record_failure "Android account restore flow"
      fi
    fi
  else
    if ! adb -s "$android_device" exec-out screencap -p \
      >"$E2E_REPORT_DIR/android-live-restored.png"; then
      unlink "$E2E_REPORT_DIR/android-live-restored.png" 2>/dev/null || true
    fi
  fi
  if [[ "$android_ready" -eq 1 ]] && ! node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts active; then
    record_failure "restored backend status"
  fi
fi

if [[ "$e2e_status" -eq 0 && "$environment_blocked" -eq 1 ]]; then
  exit 75
fi
exit "$e2e_status"
