module AndroidReleasePolicy
  PACKAGE = 'engineering.brainwaves.sfera'
  TRACK = 'internal'
  def self.next_code(codes, run_number)
    values = codes + [6, run_number]
    raise 'Invalid version code' unless values.all? { |v| v.to_s.match?(/\A[1-9]\d*\z/) }
    code = values.map(&:to_i).max + 1
    raise 'Android version code limit reached' if code > 2_100_000_000
    code
  end
  def self.validate_receipt(data, tag, sha, version)
    raise 'Android receipt identity mismatch' unless data['schema'] == 1 &&
      data['platform'] == 'android' && data['tag'] == tag && data['sha'] == sha &&
      data['app_version'] == version && data['package'] == PACKAGE && data['track'] == TRACK &&
      data['build'].is_a?(Integer) && data['build'].between?(1, 2_100_000_000)
  end
  def self.resume(data, remote_hash)
    if remote_hash
      raise 'Google build is not owned by this release' unless data['sha256'] &&
        data['state'] != 'reserved' && data['sha256'].downcase == remote_hash.downcase
      return :existing
    end
    raise 'Previous Google upload is unresolved; do not upload again' unless data['state'] == 'reserved'
    :upload
  end
end
