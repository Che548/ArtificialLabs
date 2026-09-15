#pragma once

#include <algorithm>
#include <cmath>
#include <opencv2/core.hpp>

namespace stripcv {

// OpenCV 4 quantizes INTER_LINEAR perspective coordinates to a 1/32-pixel
// table; OpenCV 5 does not. At low contrast this changes row evidence between
// iOS and Android. Use the same bilinear sampler for measured RGB pixels and
// synthetic captures, independent of the linked OpenCV major version.
inline void preciseWarpPerspective(const cv::Mat& source, cv::Mat& destination,
                                   const cv::Mat& homography, cv::Size size,
                                   bool replicate_border = false) {
  CV_Assert(!source.empty() && source.depth() == CV_8U &&
            (source.channels() == 1 || source.channels() == 3) &&
            size.width > 0 && size.height > 0);
  cv::Mat matrix;
  homography.convertTo(matrix, CV_64F);
  CV_Assert(matrix.rows == 3 && matrix.cols == 3 && cv::checkRange(matrix));
  cv::Mat inverse;
  CV_Assert(cv::invert(matrix, inverse) != 0);
  const double* m = inverse.ptr<double>();
  cv::Mat output(size, source.type(), cv::Scalar::all(0));
  const int channels = source.channels();
  for (int y = 0; y < size.height; ++y) {
    unsigned char* row = output.ptr<unsigned char>(y);
    for (int x = 0; x < size.width; ++x) {
      const double denominator = m[6] * x + m[7] * y + m[8];
      if (denominator == 0) continue;
      double sx = (m[0] * x + m[1] * y + m[2]) / denominator;
      double sy = (m[3] * x + m[4] * y + m[5]) / denominator;
      if (!std::isfinite(sx) || !std::isfinite(sy)) continue;
      if (replicate_border) {
        sx = std::clamp(sx, 0.0, static_cast<double>(source.cols - 1));
        sy = std::clamp(sy, 0.0, static_cast<double>(source.rows - 1));
      } else if (sx <= -1 || sy <= -1 || sx >= source.cols || sy >= source.rows) {
        continue;
      }
      const int x0 = static_cast<int>(std::floor(sx));
      const int y0 = static_cast<int>(std::floor(sy));
      const double fx = sx - x0, fy = sy - y0;
      for (int channel = 0; channel < channels; ++channel) {
        const auto pixel = [&](int px, int py) -> double {
          if (replicate_border) {
            px = std::clamp(px, 0, source.cols - 1);
            py = std::clamp(py, 0, source.rows - 1);
          }
          if (px < 0 || py < 0 || px >= source.cols || py >= source.rows) return 0;
          return source.ptr<unsigned char>(py)[px * channels + channel];
        };
        const double top = pixel(x0, y0) * (1 - fx) + pixel(x0 + 1, y0) * fx;
        const double bottom = pixel(x0, y0 + 1) * (1 - fx) + pixel(x0 + 1, y0 + 1) * fx;
        row[x * channels + channel] = cv::saturate_cast<unsigned char>(top * (1 - fy) + bottom * fy);
      }
    }
  }
  destination = output;
}

} // namespace stripcv
