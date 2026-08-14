cmake_minimum_required(VERSION 3.22.1)
project(stripcv_android LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

find_package(opencv_java5 REQUIRED CONFIG)

set(STRIPCV_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../../../../native)

add_library(stripcv SHARED
  StripCvBridge.cpp
  ${STRIPCV_ROOT}/src/analyzer.cpp
  ${STRIPCV_ROOT}/src/calibration.cpp
  ${STRIPCV_ROOT}/src/c_api.cpp
  ${STRIPCV_ROOT}/src/locator.cpp
  ${STRIPCV_ROOT}/src/types.cpp
)

target_include_directories(
  stripcv
  PRIVATE
    ${STRIPCV_ROOT}/include
    ${STRIPCV_ROOT}/vendor
)
target_compile_definitions(stripcv PRIVATE STRIPCV_VERSION="0.3.1")
target_compile_options(stripcv PRIVATE -Wall -Wextra -Wpedantic)
target_link_libraries(
  stripcv
  opencv_java5::opencv_java5
  android
  jnigraphics
  log
)
