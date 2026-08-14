#include "stripcv/calibration.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif

namespace stripcv {
namespace {

cv::Rect pixelRect(const NormalizedRect& normalized, const cv::Size& size) {
  const int x0 = std::clamp(static_cast<int>(std::round(normalized.x0 * size.width)),
                            0, size.width - 1);
  const int y0 = std::clamp(static_cast<int>(std::round(normalized.y0 * size.height)),
                            0, size.height - 1);
  const int x1 = std::clamp(static_cast<int>(std::round(normalized.x1 * size.width)),
                            x0 + 1, size.width);
  const int y1 = std::clamp(static_cast<int>(std::round(normalized.y1 * size.height)),
                            y0 + 1, size.height);
  return cv::Rect(x0, y0, x1 - x0, y1 - y0);
}

std::array<double, 3> robustPatchRgb(const cv::Mat& patch) {
  std::array<double, 3> output{};
  for (int channel = 0; channel < 3; ++channel) {
    std::vector<unsigned char> values;
    values.reserve(patch.total());
    for (int row = 0; row < patch.rows; ++row) {
      const cv::Vec3b* pixels = patch.ptr<cv::Vec3b>(row);
      for (int column = 0; column < patch.cols; ++column) {
        values.push_back(pixels[column][channel]);
      }
    }
    const size_t low = values.size() / 10;
    const size_t high = values.size() - low;
    std::nth_element(values.begin(), values.begin() + low, values.end());
    std::nth_element(values.begin() + low, values.begin() + high, values.end());
    double sum = 0.0;
    for (size_t index = low; index < high; ++index) {
      sum += values[index];
    }
    output[channel] = sum / (255.0 * static_cast<double>(high - low));
  }
  return output;
}

}  // namespace

CardSampleResult sampleCard(const cv::Mat& rgb, const CardProfile& profile,
                            const IRegionLocator& locator) {
  CardSampleResult result;
  const LocalizationResult localization = locator.locateCard(rgb, profile);
  result.corners = localization.corners;
  result.confidence = localization.confidence;
  if (!localization.found) {
    result.error = localization.failure_reason;
    return result;
  }

  const cv::Mat transform = localization.homography.empty()
      ? cv::getPerspectiveTransform(localization.corners.data(),
                                    profile.fiducial_centers.data())
      : localization.homography;
  cv::warpPerspective(rgb, result.rectified_rgb, transform,
                      cv::Size(profile.canonical_width, profile.canonical_height),
                      cv::INTER_LINEAR, cv::BORDER_REPLICATE);
  for (const CardPatch& patch : profile.patches) {
    const cv::Rect roi = pixelRect(patch.roi, result.rectified_rgb.size());
    result.patch_rgb[patch.id] = robustPatchRgb(result.rectified_rgb(roi));
  }
  result.found = true;
  return result;
}

}  // namespace stripcv
