#!/usr/bin/env bash
set -euo pipefail

export PATH="$PATH:${MAESTRO_BIN_DIR:-$HOME/.maestro/bin}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro is required: https://docs.maestro.dev/getting-started/installing-maestro"
  exit 1
fi

ios_device="${E2E_IOS_DEVICE:-730B98A0-FC3B-45CA-AF3A-9896CEEC16AA}"
android_device="${E2E_ANDROID_DEVICE:-emulator-5554}"
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

mkdir -p "$E2E_REPORT_DIR"
e2e_status=0
android_ready=0
environment_blocked=0
ios_primary_ok=0
cloud_snapshot_ok=0

record_failure() {
  echo "E2E failure: $1" >&2
  e2e_status=1
}

record_environment_blocked() {
  echo "E2E environment blocked: $1" >&2
  environment_blocked=1
}

android_type() {
  local field_id="$1"
  local value="$2"
  maestro --device "$android_device" test .maestro/focus-field.yml \
    --env E2E_FIELD_ID="$field_id"
  adb -s "$android_device" shell input text "$value" >/dev/null
}

ios_network_blocked() {
  local metro_log="$E2E_REPORT_DIR/metro.log"
  [[ -f "$metro_log" ]] &&
    grep -q "WebSocket closed with code 1006" "$metro_log" &&
    grep -Eq "kCFErrorDomainCFNetwork error 2|server (can.t|cannot) be found" "$metro_log"
}

android_maestro_blocked() {
  local maestro_root="${MAESTRO_DEBUG_ROOT:-$HOME/.maestro/tests}"
  [[ -d "$maestro_root" ]] &&
    find "$maestro_root" -type f -name maestro.log -mmin -10 -print0 2>/dev/null |
      xargs -0 grep -Eq \
        "Device server died|Android driver did not start up|AndroidDriverTimeoutException|DEADLINE_EXCEEDED"
}

metro_pid=""
convex_proxy_pid=""
android_launch_pid=""
e2e_cert_dir=""
cleanup() {
  if [[ -n "$android_launch_pid" ]]; then
    kill "$android_launch_pid" 2>/dev/null || true
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
  node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts cleanup || true
}
trap cleanup EXIT

e2e_cert_dir="$(mktemp -d "${TMPDIR:-/tmp}/artificiallabs-e2e-cert.XXXXXX")"
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj "/CN=ArtificialLabs Local E2E" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -keyout "$e2e_cert_dir/localhost.key" \
  -out "$e2e_cert_dir/localhost.crt" >/dev/null 2>&1
chmod 600 "$e2e_cert_dir/localhost.key"
xcrun simctl keychain "$ios_device" add-root-cert "$e2e_cert_dir/localhost.crt"

E2E_CONVEX_TLS_CERT="$e2e_cert_dir/localhost.crt" \
E2E_CONVEX_TLS_KEY="$e2e_cert_dir/localhost.key" \
node --env-file-if-exists=.env.local --import tsx scripts/convex-e2e-proxy.ts \
  >"$E2E_REPORT_DIR/convex-proxy.log" 2>&1 &
convex_proxy_pid="$!"
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${convex_proxy_port}/__e2e_proxy_health" >/dev/null 2>&1 && \
    curl -fsS "http://127.0.0.1:${convex_site_proxy_port}/__e2e_proxy_health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${convex_proxy_port}/version" >/dev/null
curl --cacert "$e2e_cert_dir/localhost.crt" -fsS \
  "https://localhost:${convex_ios_proxy_port}/version" >/dev/null

EXPO_PUBLIC_E2E_IOS_CONVEX_URL="https://localhost:${convex_ios_proxy_port}" \
EXPO_PUBLIC_E2E_ANDROID_CONVEX_URL="http://localhost:${convex_proxy_port}" \
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
if node --import tsx tests/e2e/android-preflight.ts "$android_device"; then
  android_ready=1
else
  preflight_status="$?"
  if [[ "$preflight_status" -eq 75 ]]; then
    record_environment_blocked "Android AVD preflight"
  else
    record_failure "Android AVD preflight"
  fi
fi
if [[ "$android_ready" -eq 1 ]]; then
  adb -s "$android_device" reverse "tcp:${metro_port}" "tcp:${metro_port}"
  adb -s "$android_device" reverse "tcp:${convex_proxy_port}" "tcp:${convex_proxy_port}"
  adb -s "$android_device" reverse "tcp:${convex_site_proxy_port}" "tcp:${convex_site_proxy_port}"
  adb -s "$android_device" shell pm path com.anonymous.privateexpo >/dev/null
fi

ios_dev_url="private-expo://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${metro_port}"
android_dev_url="private-expo://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${metro_port}"
maestro --device "$ios_device" test .maestro/reset.yml
xcrun simctl openurl "$ios_device" "$ios_dev_url"
if [[ "$android_ready" -eq 1 ]]; then
  adb -s "$android_device" shell pm clear com.anonymous.privateexpo >/dev/null
  adb -s "$android_device" shell am start -a android.intent.action.VIEW -d "$android_dev_url" com.anonymous.privateexpo \
    >"$E2E_REPORT_DIR/android-launch.log" 2>&1 &
  android_launch_pid="$!"
fi
sleep 10
maestro --device "$ios_device" test .maestro/open-dev-client.yml
sleep 20

if maestro --device "$ios_device" test .maestro/ios-primary.yml \
  --env E2E_EMAIL="$E2E_EMAIL" --env E2E_PASSWORD="$E2E_PASSWORD"; then
  ios_primary_ok=1
elif ios_network_blocked; then
  record_environment_blocked "iOS Simulator cannot resolve or reach the Convex endpoint"
else
  record_failure "iOS primary flow"
fi
if [[ "$ios_primary_ok" -eq 1 ]]; then
  if node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts snapshot; then
    cloud_snapshot_ok=1
  else
    record_failure "iOS cloud snapshot"
  fi
fi

if [[ "$android_ready" -eq 1 && "$cloud_snapshot_ok" -eq 1 ]]; then
  if ! maestro --device "$android_device" test .maestro/android-auth-ready.yml || \
    ! android_type "e2e-auth-password" "$E2E_PASSWORD" || \
    ! maestro --device "$android_device" test .maestro/android-sign-in-submit.yml || \
    ! maestro --device "$android_device" test .maestro/android-onboarding-name.yml || \
    ! android_type "e2e-onboarding-name" "E2EAndroid" || \
    ! maestro --device "$android_device" test .maestro/android-onboarding-sync.yml; then
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
  fi
  if [[ "$android_ready" -eq 1 ]] && ! node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts snapshot; then
    record_failure "Android cloud snapshot"
  fi
fi

if [[ "$cloud_snapshot_ok" -eq 1 ]]; then
  if ! maestro --device "$ios_device" test .maestro/ios-delete.yml; then
    record_failure "iOS account deletion flow"
  fi
  if ! node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts pending; then
    record_failure "pending-deletion backend status"
  fi
fi

if [[ "$android_ready" -eq 1 && "$cloud_snapshot_ok" -eq 1 ]]; then
  if ! maestro --device "$android_device" test .maestro/android-restore.yml; then
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
  fi
  if [[ "$android_ready" -eq 1 ]] && ! node --env-file-if-exists=.env.local --import tsx tests/e2e/native-account.ts active; then
    record_failure "restored backend status"
  fi
fi

if [[ "$e2e_status" -eq 0 && "$environment_blocked" -eq 1 ]]; then
  exit 75
fi
exit "$e2e_status"
