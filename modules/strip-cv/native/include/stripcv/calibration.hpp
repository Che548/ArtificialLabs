#pragma once

#include <array>
#include <map>
#include <string>

#include <opencv2/core.hpp>

#include "stripcv/locator.hpp"
#include "stripcv/types.hpp"

namespace stripcv {

struct CardSampleResult {
  bool found = false;
  Quad corners{};
  double confidence = 0.0;
  std::map<std::string, std::array<double, 3>> patch_rgb;
  cv::Mat rectified_rgb;
  std::string error;
};

CardSampleResult sampleCard(const cv::Mat& rgb, const CardProfile& profile,
                            const IRegionLocator& locator);

}  // namespace stripcv

