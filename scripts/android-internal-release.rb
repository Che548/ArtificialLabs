require 'json'
require 'open3'
require 'stringio'
require 'digest'
require 'google/apis/androidpublisher_v3'
require 'googleauth'
require_relative 'android-release-policy'

# Separate private draft receipt: parallel iOS updates never overwrite it.
def gh(path, method: 'GET', body: nil)
  args = ['gh', 'api', path, '--method', method]
  args += ['--input', '-'] if body
  out, _err, status = Open3.capture3(*args, stdin_data: body ? JSON.generate(body) : '')
  raise 'GitHub Android receipt request failed' unless status.success?
  JSON.parse(out)
end
begin
tag = ENV.fetch('RELEASE_TAG')
sha = ENV.fetch('RELEASE_SHA')
version = ENV.fetch('SFERA_RELEASE_VERSION')
raise 'Invalid release identity' unless tag.match?(/\Av\d+\.\d+\.\d+\z/) && sha.match?(/\A[a-f0-9]{40}\z/)
base = "repos/#{ENV.fetch('GITHUB_REPOSITORY')}/releases"
name = "Android internal #{tag}"
release = nil
page = 1
loop do
  rows = gh("#{base}?per_page=100&page=#{page}")
  release = rows.find { |r| r['name'] == name }
  break if release || rows.length < 100
  page += 1
end
api = Google::Apis::AndroidpublisherV3::AndroidPublisherService.new
api.authorization = Google::Auth::ServiceAccountCredentials.make_creds(
  json_key_io: StringIO.new(ENV.fetch('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')),
  scope: 'https://www.googleapis.com/auth/androidpublisher')
package = AndroidReleasePolicy::PACKAGE
edit = api.insert_edit(package)
committed = false
begin
  bundles = api.list_edit_bundles(package, edit.id).bundles || []
  apks = api.list_edit_apks(package, edit.id).apks || []
  tracks = api.list_edit_tracks(package, edit.id).tracks || []
  if release
    data = JSON.parse(release.fetch('body'))
    AndroidReleasePolicy.validate_receipt(data, tag, sha, version)
  else
    raise 'Missing reservation' unless ARGV.first == 'prepare'
    codes = bundles.map(&:version_code) + apks.map(&:version_code) +
      tracks.flat_map { |t| (t.releases || []).flat_map { |r| r.version_codes || [] } }
    data = { 'schema' => 1, 'platform' => 'android', 'tag' => tag, 'sha' => sha,
      'app_version' => version, 'package' => package, 'track' => 'internal',
      'build' => AndroidReleasePolicy.next_code(codes, ENV.fetch('GITHUB_RUN_NUMBER')),
      'state' => 'reserved' }
    release = gh(base, method: 'POST', body: {name: name, tag_name: "android-internal-#{tag}",
      target_commitish: sha, draft: true, prerelease: true, body: JSON.generate(data)})
  end
  save = -> { gh("#{base}/#{release.fetch('id')}", method: 'PATCH', body: {
    tag_name: "android-internal-#{tag}", body: JSON.generate(data)}) }
  remote = bundles.find { |b| b.version_code.to_i == data['build'] }
  mode = AndroidReleasePolicy.resume(data, remote&.sha256)
  if ARGV.first == 'prepare'
    File.open(ENV.fetch('GITHUB_ENV'), 'a') do |f|
      f.puts "SFERA_ANDROID_VERSION_CODE=#{data['build']}"
      f.puts "ANDROID_BUILD_EXISTS=#{mode == :existing}"
    end
  elsif ARGV.first == 'upload'
    if mode == :upload
      aab = 'android/app/build/outputs/bundle/release/app-release.aab'
      # Verifier checks package, version, upload certificate and runtime BEFORE upload.
      system('node', 'scripts/verify-android-release.mjs', exception: true)
      data['sha256'] = Digest::SHA256.file(aab).hexdigest
      data['runtime'] = File.read('output/android-internal-runtime.txt').strip
      data['state'] = 'upload_attempted'
      save.call
      remote = api.upload_edit_bundle(package, edit.id, upload_source: aab, content_type: 'application/octet-stream')
      raise 'Uploaded version/hash mismatch' unless remote.version_code.to_i == data['build'] && remote.sha256.downcase == data['sha256']
    end
    current = tracks.find { |t| t.track == 'internal' }
    already = (current&.releases || []).any? { |r| r.status == 'completed' && (r.version_codes || []).map(&:to_i).include?(data['build']) }
    unless already
      track = Google::Apis::AndroidpublisherV3::Track.new(track: 'internal', releases: [
        Google::Apis::AndroidpublisherV3::TrackRelease.new(name: "#{version} (#{data['build']}) #{tag}",
          status: 'completed', version_codes: [data['build'].to_s])])
      api.update_edit_track(package, edit.id, 'internal', track)
      api.commit_edit(package, edit.id)
      committed = true
    end
    data['state'] = 'committed_to_internal'
    save.call
    File.open(ENV.fetch('GITHUB_STEP_SUMMARY'), 'a') do |f|
      f.puts "## Android internal\nSource: #{tag} / #{sha}\n\nApp: #{version} (#{data['build']})\n\nRuntime: #{data['runtime']}\n\nGoogle edit committed to internal only. Google processing/review may still apply."
    end
  else
    raise 'Choose prepare or upload'
  end
ensure
  api.delete_edit(package, edit.id) unless committed
end
rescue StandardError => error
  # Provider/parser exceptions may include request bodies or credential fragments.
  warn "Android internal release stopped (#{error.class}); inspect configuration, Google status and private receipt. No automatic re-upload."
  exit 1
end
