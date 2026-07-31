Pod::Spec.new do |s|
  s.name           = 'StripCv'
  s.version        = '0.3.1'
  s.summary        = 'Native StripCV pipeline for biochemical strip analysis'
  s.description    = 'Expo module that analyzes local camera images with the StripCV C++ core.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Artificial Labs'
  s.homepage       = 'https://example.invalid/artificial-labs/strip-cv'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'OpenCV-Dynamic-Framework', '~> 4.10.0.1'

  s.source_files = 'ios/**/*.{h,m,mm,swift}', 'native/include/**/*.{h,hpp}', 'native/src/**/*.{cpp}', 'native/vendor/**/*.hpp'
  s.public_header_files = 'ios/StripCvBridge.h', 'native/include/stripcv/c_api.h'
  s.header_mappings_dir = 'native/include'
  s.frameworks = 'Foundation', 'UIKit', 'CoreGraphics'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'DEFINES_MODULE' => 'YES',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) STRIPCV_VERSION=\\\"0.3.1\\\"',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/native/include" "$(PODS_TARGET_SRCROOT)/native/vendor"'
  }
end
