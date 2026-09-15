cmake_minimum_required(VERSION 3.24)
project(stripcv VERSION 0.4.2 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs dnn)
if(OpenCV_VERSION VERSION_LESS 5)
  find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs dnn calib3d)
else()
  find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs dnn geometry)
endif()

add_library(stripcv_core STATIC
  src/analyzer.cpp
  src/calibration.cpp
  src/c_api.cpp
  src/locator.cpp
  src/learned_reader.cpp
  src/transverse_width_scorer.cpp
  src/types.cpp
)
target_include_directories(stripcv_core PUBLIC include vendor)
target_link_libraries(stripcv_core PUBLIC ${OpenCV_LIBS})
target_compile_definitions(stripcv_core PUBLIC STRIPCV_VERSION="${PROJECT_VERSION}")
option(STRIPCV_DISABLE_TRANSVERSE_WIDTH_SCORER
  "Disable the learned transverse-width proposal stage for paired host evaluation"
  OFF)
if(STRIPCV_DISABLE_TRANSVERSE_WIDTH_SCORER)
  target_compile_definitions(stripcv_core PRIVATE
    STRIPCV_DISABLE_TRANSVERSE_WIDTH_SCORER=1)
endif()

# The web build uses a small Node HTTP adapter that forwards browser RGB
# buffers to this same production core. Keeping the adapter here avoids a
# second JavaScript/Python implementation of the CV algorithm.
add_executable(stripcv_cli src/cli.cpp)
target_link_libraries(stripcv_cli PRIVATE stripcv_core)

# File-oriented host evaluator for the same app-linked core. It is not linked
# into either mobile bridge and exists only for offline geometry qualification.
add_executable(stripcv_eval_cli src/eval_cli.cpp)
target_link_libraries(stripcv_eval_cli PRIVATE stripcv_core)

add_executable(stripcv_learned_cli src/learned_reader_cli.cpp)
target_link_libraries(stripcv_learned_cli PRIVATE stripcv_core)

enable_testing()
add_executable(stripcv_precise_warp_test tests/precise_warp_test.cpp)
target_link_libraries(stripcv_precise_warp_test PRIVATE stripcv_core)
add_test(NAME stripcv_precise_warp COMMAND stripcv_precise_warp_test)

add_executable(stripcv_c_api_boundary_test tests/c_api_boundary_test.cpp)
target_link_libraries(stripcv_c_api_boundary_test PRIVATE stripcv_core)
add_test(NAME stripcv_c_api_boundary COMMAND stripcv_c_api_boundary_test)

add_executable(stripcv_result_serialization_test tests/result_serialization_test.cpp)
target_link_libraries(stripcv_result_serialization_test PRIVATE stripcv_core)
add_test(NAME stripcv_result_serialization COMMAND stripcv_result_serialization_test)

add_executable(stripcv_quality_policy_test tests/quality_policy_test.cpp)
target_link_libraries(stripcv_quality_policy_test PRIVATE stripcv_core)
add_test(NAME stripcv_quality_policy COMMAND stripcv_quality_policy_test)

add_executable(stripcv_signal_detection_test tests/signal_detection_test.cpp)
target_link_libraries(stripcv_signal_detection_test PRIVATE stripcv_core)
add_test(NAME stripcv_signal_detection COMMAND stripcv_signal_detection_test)

add_executable(stripcv_locator_test tests/locator_test.cpp)
target_link_libraries(stripcv_locator_test PRIVATE stripcv_core)
add_test(NAME stripcv_locator COMMAND stripcv_locator_test)

add_executable(stripcv_end_to_end_test tests/end_to_end_test.cpp)
target_link_libraries(stripcv_end_to_end_test PRIVATE stripcv_core)
add_test(NAME stripcv_end_to_end COMMAND stripcv_end_to_end_test)

add_executable(stripcv_quality_matrix_test tests/quality_matrix_test.cpp)
target_link_libraries(stripcv_quality_matrix_test PRIVATE stripcv_core)
add_test(NAME stripcv_quality_matrix COMMAND stripcv_quality_matrix_test)

add_executable(stripcv_metamorphic_test tests/metamorphic_test.cpp)
target_link_libraries(stripcv_metamorphic_test PRIVATE stripcv_core)
add_test(NAME stripcv_metamorphic COMMAND stripcv_metamorphic_test)

add_executable(stripcv_parameter_sweep_test tests/parameter_sweep_test.cpp)
target_link_libraries(stripcv_parameter_sweep_test PRIVATE stripcv_core)
add_test(NAME stripcv_parameter_sweep COMMAND stripcv_parameter_sweep_test)

add_executable(stripcv_automatic_sweep_test tests/automatic_sweep_test.cpp)
target_link_libraries(stripcv_automatic_sweep_test PRIVATE stripcv_core)
add_test(NAME stripcv_automatic_sweep COMMAND stripcv_automatic_sweep_test)

add_executable(stripcv_faint_line_safety_test tests/faint_line_safety_test.cpp)
target_link_libraries(stripcv_faint_line_safety_test PRIVATE stripcv_core)
add_test(NAME stripcv_faint_line_safety COMMAND stripcv_faint_line_safety_test)

add_executable(stripcv_dye_robustness_test tests/dye_robustness_test.cpp)
target_link_libraries(stripcv_dye_robustness_test PRIVATE stripcv_core)
add_test(NAME stripcv_dye_robustness COMMAND stripcv_dye_robustness_test)

add_executable(stripcv_randomized_recognition_test tests/randomized_recognition_test.cpp)
target_link_libraries(stripcv_randomized_recognition_test PRIVATE stripcv_core)
add_test(NAME stripcv_randomized_recognition COMMAND stripcv_randomized_recognition_test)

add_executable(stripcv_transverse_width_scorer_test
  tests/transverse_width_scorer_test.cpp)
target_include_directories(stripcv_transverse_width_scorer_test PRIVATE src)
target_link_libraries(stripcv_transverse_width_scorer_test PRIVATE stripcv_core)
add_test(NAME stripcv_transverse_width_scorer
  COMMAND stripcv_transverse_width_scorer_test)
