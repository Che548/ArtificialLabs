#include <cstdlib>
#include <iostream>
#include <string>

#include <opencv2/core.hpp>

#include "stripcv/types.hpp"

int main() {
  stripcv::AnalysisResult empty_result;
  if (!empty_result.toJson().at("rectified_image_uri").is_null()) {
    std::cerr << "empty rectified image was not serialized as null\n";
    return EXIT_FAILURE;
  }

  stripcv::AnalysisResult live_preview_result;
  live_preview_result.rectified_rgb =
      cv::Mat(4, 12, CV_8UC3, cv::Scalar(24, 128, 220));
  if (!live_preview_result.toJson().at("rectified_image_uri").is_null()) {
    std::cerr << "live preview unexpectedly serialized a rectified image\n";
    return EXIT_FAILURE;
  }

  stripcv::AnalysisResult result;
  result.rectified_rgb = cv::Mat(4, 12, CV_8UC3, cv::Scalar(24, 128, 220));
  result.include_rectified_image = true;
  const std::string uri = result.toJson().at("rectified_image_uri").get<std::string>();
  constexpr char prefix[] = "data:image/jpeg;base64,";
  if (uri.rfind(prefix, 0) != 0 || uri.size() <= sizeof(prefix) - 1) {
    std::cerr << "rectified image was not serialized as a JPEG data URI\n";
    return EXIT_FAILURE;
  }

  std::cout << "StripCV rectified image serialization test passed.\n";
  return EXIT_SUCCESS;
}
