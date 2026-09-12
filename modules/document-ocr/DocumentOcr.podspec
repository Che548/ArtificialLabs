Pod::Spec.new do |s|
  s.name = 'DocumentOcr'
  s.version = '0.1.0'
  s.summary = 'Local-only document recognition with user-reviewed output'
  s.description = 'Platform PDF rendering and pinned Tesseract 5 Russian/English recognition.'
  s.license = { :type => 'Proprietary' }
  s.author = 'Brainwaves Engineering'
  s.homepage = 'https://brainwaves.engineering'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/**/*.{h,mm,swift}', 'native/*.{hpp,cpp}'
  s.public_header_files = 'ios/DocumentOcrBridge.h'
  s.frameworks = 'Foundation', 'UIKit', 'CoreGraphics', 'PDFKit', 'ImageIO'
  s.vendored_frameworks = 'prebuilt/DocumentOcrDependencies.xcframework'
  s.resource_bundles = { 'DocumentOcrModels' => ['vendor/tessdata', 'prebuilt/assets/*-LICENSE.txt'] }
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'DEFINES_MODULE' => 'YES',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/prebuilt/ios/include"'
  }
end
