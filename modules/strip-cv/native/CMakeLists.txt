cmake_minimum_required(VERSION 3.24)
project(stripcv VERSION 0.4.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs)
if(OpenCV_VERSION VERSION_LESS 5)
  find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs calib3d)
else()
  find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs geometry)
endif()

add_library(stripcv_core STATIC
  src/analyzer.cpp
  src/calibration.cpp
  src/c_api.cpp
  src/locator.cpp
  src/transverse_width_scorer.cpp
  src/types.cpp
)
target_include_directories(stripcv_core PUBLIC include vendor)
target_link_libraries(stripcv_core PUBLIC ${OpenCV_LIBS})
target_compile_definitions(stripcv_core PUBLIC STRIPCV_VERSION="${PROJECT_VERSION}")

# The web build uses a small Node HTTP adapter that forwards browser RGB
# buffers to this same production core. Keeping the adapter here avoids a
# second JavaScript/Python implementation of the CV algorithm.
add_executable(stripcv_cli src/cli.cpp)
target_link_libraries(stripcv_cli PRIVATE stripcv_core)

enable_testing()
add_executable(stripcv_c_api_boundary_test tests/c_api_boundary_test.cpp)
target_link_libraries(stripcv_c_api_boundary_test PRIVATE stripcv_core)
add_test(NAME stripcv_c_api_boundary COMMAND stripcv_c_api_boundary_test)

add_executable(stripcv_result_serialization_test tests/result_serialization_test.cpp)
target_link_libraries(stripcv_result_serialization_test PRIVATE stripcv_core)
add_test(NAME stripcv_result_serialization COMMAND stripcv_result_serialization_test)

add_executable(stripcv_quality_policy_test tests/quality_policy_test.cpp)
target_link_libraries(stripcv_quality_policy_test PRIVATE stripcv_core)
add_test(NAME stripcv_quality_policy COMMAND stripcv_quality_policy_test)
