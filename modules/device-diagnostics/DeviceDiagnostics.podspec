require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'DeviceDiagnostics'
  s.version = package['version']
  s.summary = 'Privacy-safe local device resource counters'
  s.description = 'Numeric process CPU, memory and disk counters for the internal diagnostics screen.'
  s.license = 'MIT'
  s.author = 'ArtificialLabs'
  s.homepage = 'https://example.invalid'
  s.platforms = { :ios => '15.1' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
end
