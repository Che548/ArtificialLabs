#include "stripcv/precise_warp.hpp"
#include <cstdlib>
#include <iostream>

int main() {
  const cv::Mat identity = cv::Mat::eye(3, 3, CV_64F);
  cv::Mat image = (cv::Mat_<unsigned char>(2, 2) << 0, 64, 128, 192);
  cv::Mat result;
  stripcv::preciseWarpPerspective(image, result, identity, image.size());
  if (cv::countNonZero(image != result)) return EXIT_FAILURE;
  cv::Mat translation = identity.clone();
  translation.at<double>(0, 2) = -0.25;
  translation.at<double>(1, 2) = -0.5;
  stripcv::preciseWarpPerspective(image, result, translation, {1, 1});
  if (result.at<unsigned char>(0, 0) != 80) return EXIT_FAILURE;

  // This non-table-aligned coordinate must not round to OpenCV 4's 1/32 grid.
  image = (cv::Mat_<unsigned char>(1, 2) << 0, 240);
  translation = identity.clone();
  translation.at<double>(0, 2) = -0.013;
  stripcv::preciseWarpPerspective(image, result, translation, {1, 1});
  if (result.at<unsigned char>(0, 0) != 3) return EXIT_FAILURE;

  cv::Mat rgb(3, 4, CV_8UC3, cv::Scalar(80, 120, 200));
  const cv::Mat roi = rgb(cv::Rect(1, 1, 2, 2)); // Non-contiguous input.
  translation.at<double>(0, 2) = 0.5;
  stripcv::preciseWarpPerspective(roi, result, translation, {1, 1});
  if (result.at<cv::Vec3b>(0, 0) != cv::Vec3b(40, 60, 100)) return EXIT_FAILURE;
  stripcv::preciseWarpPerspective(roi, result, translation, {1, 1}, true);
  if (result.at<cv::Vec3b>(0, 0) != cv::Vec3b(80, 120, 200)) return EXIT_FAILURE;
  stripcv::preciseWarpPerspective(rgb, rgb, identity, rgb.size());
  if (rgb.at<cv::Vec3b>(2, 3) != cv::Vec3b(80, 120, 200)) return EXIT_FAILURE;
  bool rejected = false;
  try {
    stripcv::preciseWarpPerspective(image, result, cv::Mat::zeros(3, 3, CV_64F), {1, 1});
  } catch (const cv::Exception&) { rejected = true; }
  if (!rejected) return EXIT_FAILURE;
  std::cout << "Precise bilinear sampling: identity, fractional coordinates, borders, ROI, aliasing and invalid matrix passed\n";
}
