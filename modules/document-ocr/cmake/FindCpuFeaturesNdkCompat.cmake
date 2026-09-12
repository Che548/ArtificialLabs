# Compatibility target using the pinned NDK's own CPU feature detector.
if(NOT ANDROID_NDK)
  message(FATAL_ERROR "OCR Android build requires ANDROID_NDK")
endif()
set(_cpu "${ANDROID_NDK}/sources/android/cpufeatures")
file(SHA256 "${_cpu}/cpu-features.c" _source_sha)
file(SHA256 "${_cpu}/cpu-features.h" _header_sha)
if(NOT _source_sha STREQUAL "1b8a88eb7d3a5437d17e12475539398d3e1c5eef13d85941679841254af0a8f5" OR
   NOT _header_sha STREQUAL "f4989fabece7ea538e3c1272dca47f8a9a4423a87c79a1344a2611e884cb7319")
  message(FATAL_ERROR "Unexpected NDK CPU feature source checksum")
endif()
add_library(CpuFeatures::ndk_compat INTERFACE IMPORTED)
set_target_properties(CpuFeatures::ndk_compat PROPERTIES
  INTERFACE_SOURCES "${_cpu}/cpu-features.c"
  INTERFACE_INCLUDE_DIRECTORIES "${_cpu}"
  INTERFACE_LINK_LIBRARIES dl)
set(CpuFeaturesNdkCompat_DIR "${_cpu}")
set(CpuFeaturesNdkCompat_FOUND TRUE)
