# Offline regression tests: execute the real lane with fake Apple/GitHub APIs.
require 'tmpdir'
require 'ostruct'
def opt_out_usage; end
def default_platform(*); end
def platform(*) = yield
def desc(*); end
def lane(name, &block) = (@lanes ||= {})[name] = block
module UI
  def self.user_error!(message) = raise(message)
end
module Spaceship
  module ConnectAPI
    def self.patch_builds(build_id:, attributes:)
      raise 'Wrong compliance answer' unless attributes == { usesNonExemptEncryption: false }
      $patched_build.uses_non_exempt_encryption = false
      $patched_build.build_beta_detail.external_build_state = 'READY_FOR_BETA_SUBMISSION'
      $compliance_patches += 1
    end
  end
end
load File.expand_path('../fastlane/Fastfile', __dir__)
ENV['RELEASE_TAG'] = 'v1.0.1'
ENV['RELEASE_SHA'] = 'a' * 40
ENV['SFERA_RELEASE_VERSION'] = '1.0.1'
ENV['GITHUB_REPOSITORY'] = 'example/repo'
def gh_json(*args, input: nil)
  return @releases unless input
  @saved = JSON.parse(input)
end
@receipt = { 'schema' => 1, 'tag' => 'v1.0.1', 'sha' => 'a' * 40,
             'build' => 8, 'state' => 'uploaded', 'runtime' => 'b' * 40 }
@releases = [{ 'id' => 1, 'draft' => true, 'tag_name' => 'untagged-example',
               'body' => JSON.generate(@receipt) }]
raise 'Lost draft receipt' unless release_receipt.last == @receipt
ENV['SFERA_RELEASE_VERSION'] = '1.0.0'
begin
  release_receipt
  raise 'Legacy app version changed silently'
rescue RuntimeError => e
  raise unless e.message.include?('app version changed')
end
@releases.first['body'] = JSON.generate(@receipt.merge('app_version' => '1.0.0'))
raise 'Separate source/app versions rejected' unless release_receipt.last['app_version'] == '1.0.0'
ENV['SFERA_RELEASE_VERSION'] = '1.0.1'
@releases.first['body'] = JSON.generate(@receipt)
save_receipt(@releases.first, @receipt)
raise 'PATCH lost tag' unless @saved['tag_name'] == 'v1.0.1'
@releases.first['body'] = JSON.generate(@receipt.merge('sha' => 'c' * 40))
begin
  release_receipt
  raise 'Moved SHA accepted'
rescue RuntimeError => e
  raise unless e.message.include?('identity mismatch')
end
@releases.first['body'] = JSON.generate(@receipt)
def apple_session = [nil, nil, @group]
def exact_build(*) = @build
def upload_to_testflight(**options)
  raise 'Duplicate binary upload' unless options[:distribute_only]
  raise 'Interactive platform prompt' unless options[:app_platform] == 'ios'
  @submissions += 1
  @build.build_beta_detail.external_build_state = 'WAITING_FOR_BETA_REVIEW'
  @assigned << @build # Pilot submits review, then assigns the group.
end
Dir.mktmpdir do |dir|
  ENV['GITHUB_STEP_SUMMARY'] = File.join(dir, 'summary')
  ['READY_FOR_BETA_SUBMISSION', 'WAITING_FOR_BETA_REVIEW', 'IN_BETA_TESTING'].each do |state|
    @assigned = []
    @submissions = 0
    @build = OpenStruct.new(id: 'build-8', processing_state: 'VALID',
      build_beta_detail: OpenStruct.new(external_build_state: state))
    def @build.processed? = true
    assigned = @assigned
    @build.define_singleton_method(:add_beta_groups) do |**|
      raise 'Assigned before beta submission' if build_beta_detail.external_build_state == 'READY_FOR_BETA_SUBMISSION'
      assigned << self
    end
    @group = Object.new
    @group.define_singleton_method(:fetch_builds) { assigned }
    @group.define_singleton_method(:name) { 'Public beta' }
    @lanes[:deliver_beta].call
    raise 'Wrong submission count' unless @submissions == (state == 'READY_FOR_BETA_SUBMISSION' ? 1 : 0)
    raise 'Missing group' unless @assigned.length == 1
    @lanes[:deliver_beta].call
    raise 'Duplicate group' unless @assigned.length == 1
  end
  %w[MISSING_EXPORT_COMPLIANCE IN_EXPORT_COMPLIANCE_REVIEW BETA_REJECTED EXPIRED].each do |state|
    @build.uses_non_exempt_encryption = true
    @submissions = 0
    @assigned.clear
    @build.build_beta_detail.external_build_state = state
    begin
      @lanes[:deliver_beta].call
      raise 'Blocked state accepted'
    rescue RuntimeError => e
      raise unless e.message.include?("manual action: #{state}")
    end
    raise 'Submitted blocked build' unless @submissions.zero? && @assigned.empty?
  end
  @build.uses_non_exempt_encryption = nil
  @build.build_beta_detail.external_build_state = 'MISSING_EXPORT_COMPLIANCE'
  $patched_build = @build
  $compliance_patches = 0
  @lanes[:deliver_beta].call
  @lanes[:deliver_beta].call
  raise 'Compliance not idempotent' unless $compliance_patches == 1 && @submissions == 1
end
puts 'Beta delivery: draft recovery, SHA protection, review ordering and retries passed'
