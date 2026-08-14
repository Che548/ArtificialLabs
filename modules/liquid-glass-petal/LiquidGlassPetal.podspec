require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LiquidGlassPetal'
  s.version        = package['version']
  s.summary        = 'Native Liquid Glass petal view'
  s.description    = 'A custom-shaped interactive UIGlassEffect view for the journal flow.'
  s.license        = 'MIT'
  s.author         = 'ArtificialLabs'
  s.homepage       = 'https://example.invalid'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
end
