#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <functional>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#include <sstream>
#include <string>
#include <vector>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif

#include "stripcv/types.hpp"

namespace stripcv::test {

struct StripOptions {
  bool test_line = true;
  bool control_line = true;
  bool extra_line = false;
  bool broad_test_stain = false;
  bool dye_run = false;
  bool control_glare = false;
  bool clipped_region = false;
  bool shadow_gradient = false;
  bool shadow_step = false;
  bool bright_paper = false;
  double test_strength = 0.18;
  double control_strength = 0.32;
  double test_width_factor = 1.0;
  double control_width_factor = 1.0;
  double test_position = -1.0;
  double control_position = -1.0;
  double line_vertical_fraction = 1.0;
  double test_vertical_fraction = -1.0;
  double control_vertical_fraction = -1.0;
  double test_vertical_center = 0.5;
  double control_vertical_center = 0.5;
  double test_vertical_gradient = 0.0;
  double control_vertical_gradient = 0.0;
  double test_vertical_modulation = 0.0;
  double control_vertical_modulation = 0.0;
  double test_vertical_phase = 0.0;
  double control_vertical_phase = 0.0;
  cv::Vec3d test_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  cv::Vec3d control_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
};

struct Capture {
  cv::Mat rgb;
  Quad corners{};
};

inline AssayProfile handledAssay() {
  AssayProfile assay;
  assay.schema_version = "1.0";
  assay.id = "handled-paper-two-line-strip";
  assay.version = "1.0-observed-real-layout";
  assay.canonical_width = 1024;
  assay.canonical_height = 160;
  assay.min_aspect_ratio = 3.0;
  assay.max_aspect_ratio = 35.0;
  assay.membrane_roi = {0.38, 0.15, 0.97, 0.85};
  assay.test_window = {0.17, 0.0, 0.27, 1.0};
  assay.control_window = {0.075, 0.0, 0.17, 1.0};
  assay.expected_line_width = 0.035;
  assay.integration_half_width = 0.03;
  assay.sample_to_wick = "left_to_right";
  assay.default_cutoff.reset();
  assay.positive_when = "gte";
  assay.quality.min_control_snr = 5.0;
  assay.quality.min_test_snr = 3.0;
  assay.quality.min_control_area = 1.0e-4;
  assay.quality.min_valid_fraction = 0.65;
  assay.quality.min_blur_variance = 18.0;
  assay.quality.max_clipped_fraction = 0.08;
  assay.quality.max_glare_fraction = 0.03;
  assay.quality.min_quad_area_fraction = 0.025;
  assay.quality.max_calibration_residual = 0.12;
  return assay;
}

inline cv::Rect membraneRect(const AssayProfile& assay) {
  const int x0 = cvRound(assay.membrane_roi.x0 * assay.canonical_width);
  const int y0 = cvRound(assay.membrane_roi.y0 * assay.canonical_height);
  const int x1 = cvRound(assay.membrane_roi.x1 * assay.canonical_width);
  const int y1 = cvRound(assay.membrane_roi.y1 * assay.canonical_height);
  return {x0, y0, x1 - x0, y1 - y0};
}

inline void blendLine(cv::Mat& strip, const AssayProfile& assay,
                      double normalized_position, double strength,
                      double width_factor = 1.0,
                      double vertical_fraction = 1.0,
                      const cv::Vec3d& dye = cv::Vec3d(196.0, 52.0, 92.0),
                      double vertical_center = 0.5,
                      double vertical_gradient = 0.0,
                      double vertical_modulation = 0.0,
                      double vertical_phase = 0.0) {
  const cv::Rect membrane = membraneRect(assay);
  const double center = membrane.x + normalized_position * membrane.width;
  const double sigma = std::max(
      1.0, width_factor * assay.expected_line_width * membrane.width / 2.355);
  const int line_height = std::max(
      1, cvRound(std::clamp(vertical_fraction, 0.0, 1.0) * membrane.height));
  const double clamped_center = std::clamp(vertical_center, 0.0, 1.0);
  const int first_row = membrane.y + std::clamp(
      cvRound(clamped_center * membrane.height - 0.5 * line_height), 0,
      membrane.height - line_height);
  const int last_row = first_row + line_height;
  for (int column = membrane.x; column < membrane.x + membrane.width;
       ++column) {
    const double distance = (column + 0.5 - center) / sigma;
    const double base_alpha =
        strength * std::exp(-0.5 * distance * distance);
    if (base_alpha < 1.0e-4) {
      continue;
    }
    for (int row = first_row; row < last_row; ++row) {
      const double normalized_row =
          (row + 0.5 - membrane.y) / static_cast<double>(membrane.height);
      // Real colloidal bands are rarely perfectly uniform along the paper
      // height. Model both a smooth edge-to-edge fade and deterministic local
      // mottling while retaining a physically continuous deposited band.
      const double strength_scale = std::clamp(
          1.0 + vertical_gradient * (2.0 * normalized_row - 1.0) +
              vertical_modulation *
                  std::sin(2.0 * CV_PI *
                           (2.25 * normalized_row + vertical_phase)),
          0.05, 2.0);
      const double alpha = std::clamp(base_alpha * strength_scale, 0.0, 1.0);
      cv::Vec3b& pixel = strip.at<cv::Vec3b>(row, column);
      for (int channel = 0; channel < 3; ++channel) {
        pixel[channel] = cv::saturate_cast<unsigned char>(
            pixel[channel] * (1.0 - alpha) + dye[channel] * alpha);
      }
    }
  }
}

inline cv::Mat makeCanonicalStrip(const StripOptions& options = {}) {
  const AssayProfile assay = handledAssay();
  const cv::Scalar backing = options.bright_paper ? cv::Scalar(246, 245, 241)
                                                  : cv::Scalar(218, 216, 209);
  const cv::Scalar membrane_color = options.bright_paper
                                        ? cv::Scalar(247, 246, 242)
                                        : cv::Scalar(224, 222, 213);
  cv::Mat strip(assay.canonical_height, assay.canonical_width, CV_8UC3,
                backing);
  const cv::Rect membrane = membraneRect(assay);
  strip(cv::Rect(0, 0, membrane.x, strip.rows))
      .setTo(cv::Scalar(228, 142, 171));
  strip(membrane).setTo(membrane_color);
  strip(cv::Rect(membrane.x + membrane.width, 0,
                 strip.cols - membrane.x - membrane.width, strip.rows))
      .setTo(cv::Scalar(207, 207, 200));

  for (int row = 0; row < strip.rows; ++row) {
    for (int column = 0; column < strip.cols; ++column) {
      cv::Vec3b& pixel = strip.at<cv::Vec3b>(row, column);
      const int texture =
          ((column * 17 + row * 29 + (column * row) % 13) % 9) - 4;
      for (int channel = 0; channel < 3; ++channel) {
        pixel[channel] =
            cv::saturate_cast<unsigned char>(pixel[channel] + texture);
      }
    }
  }
  cv::putText(strip, "hCG", cv::Point(80, 102), cv::FONT_HERSHEY_SIMPLEX, 1.7,
              cv::Scalar(184, 74, 118), 4, cv::LINE_AA);

  const double test_center =
      options.test_position >= 0.0
          ? options.test_position
          : 0.5 * (assay.test_window.x0 + assay.test_window.x1);
  const double control_center =
      options.control_position >= 0.0
          ? options.control_position
          : 0.5 * (assay.control_window.x0 + assay.control_window.x1);
  if (options.test_line) {
    blendLine(strip, assay, test_center, options.test_strength,
              options.broad_test_stain ? 6.0 : options.test_width_factor,
              options.test_vertical_fraction >= 0.0
                  ? options.test_vertical_fraction
                  : options.line_vertical_fraction,
              options.test_dye_rgb, options.test_vertical_center,
              options.test_vertical_gradient,
              options.test_vertical_modulation, options.test_vertical_phase);
  }
  if (options.control_line) {
    blendLine(strip, assay, control_center, options.control_strength,
              options.control_width_factor,
              options.control_vertical_fraction >= 0.0
                  ? options.control_vertical_fraction
                  : options.line_vertical_fraction,
              options.control_dye_rgb, options.control_vertical_center,
              options.control_vertical_gradient,
              options.control_vertical_modulation,
              options.control_vertical_phase);
  }
  if (options.extra_line) {
    blendLine(strip, assay, 0.32, 0.58);
  }
  if (options.dye_run) {
    blendLine(strip, assay, 0.34, 0.42, 10.0);
  }
  if (options.control_glare) {
    const int center = membrane.x + cvRound(control_center * membrane.width);
    cv::rectangle(strip, cv::Rect(center - 16, membrane.y, 32, membrane.height),
                  cv::Scalar(248, 248, 248), cv::FILLED);
  }
  if (options.clipped_region) {
    cv::rectangle(strip,
                  cv::Rect(membrane.x + membrane.width / 2, membrane.y,
                           membrane.width / 3, membrane.height),
                  cv::Scalar(255, 255, 255), cv::FILLED);
  }
  if (options.shadow_gradient) {
    for (int column = membrane.x; column < membrane.x + membrane.width;
         ++column) {
      const double fraction =
          (column - membrane.x) / static_cast<double>(membrane.width - 1);
      const double multiplier = 0.38 + 0.62 * fraction;
      for (int row = membrane.y; row < membrane.y + membrane.height; ++row) {
        cv::Vec3b& pixel = strip.at<cv::Vec3b>(row, column);
        for (int channel = 0; channel < 3; ++channel) {
          pixel[channel] =
              cv::saturate_cast<unsigned char>(pixel[channel] * multiplier);
        }
      }
    }
  }
  if (options.shadow_step) {
    const int boundary = membrane.x + membrane.width / 2;
    for (int column = membrane.x; column < boundary; ++column) {
      for (int row = membrane.y; row < membrane.y + membrane.height; ++row) {
        cv::Vec3b& pixel = strip.at<cv::Vec3b>(row, column);
        for (int channel = 0; channel < 3; ++channel) {
          pixel[channel] = cv::saturate_cast<unsigned char>(
              pixel[channel] * 0.38);
        }
      }
    }
  }
  return strip;
}

inline Quad defaultSceneCorners() {
  return {
      cv::Point2f(132.0F, 252.0F),
      cv::Point2f(1142.0F, 214.0F),
      cv::Point2f(1160.0F, 424.0F),
      cv::Point2f(116.0F, 452.0F),
  };
}

inline Capture placeInScene(const cv::Mat& strip,
                            const Quad& corners = defaultSceneCorners(),
                            cv::Size size = cv::Size(1280, 720)) {
  Capture capture;
  capture.corners = corners;
  capture.rgb = cv::Mat(size, CV_8UC3, cv::Scalar(105, 126, 112));
  for (int row = 0; row < capture.rgb.rows; ++row) {
    for (int column = 0; column < capture.rgb.cols; ++column) {
      cv::Vec3b& pixel = capture.rgb.at<cv::Vec3b>(row, column);
      const int texture = ((column * 7 + row * 11) % 13) - 6;
      pixel[0] = cv::saturate_cast<unsigned char>(pixel[0] + texture);
      pixel[1] = cv::saturate_cast<unsigned char>(pixel[1] + texture);
      pixel[2] = cv::saturate_cast<unsigned char>(pixel[2] + texture);
    }
  }
  const std::array<cv::Point2f, 4> source = {
      cv::Point2f(0.0F, 0.0F),
      cv::Point2f(static_cast<float>(strip.cols - 1), 0.0F),
      cv::Point2f(static_cast<float>(strip.cols - 1),
                  static_cast<float>(strip.rows - 1)),
      cv::Point2f(0.0F, static_cast<float>(strip.rows - 1)),
  };
  const cv::Mat homography =
      cv::getPerspectiveTransform(source.data(), corners.data());
  cv::Mat warped;
  cv::warpPerspective(strip, warped, homography, size, cv::INTER_LINEAR,
                      cv::BORDER_CONSTANT, cv::Scalar(0, 0, 0));
  cv::Mat source_mask(strip.size(), CV_8U, cv::Scalar(255));
  cv::Mat mask;
  cv::warpPerspective(source_mask, mask, homography, size, cv::INTER_NEAREST,
                      cv::BORDER_CONSTANT, cv::Scalar(0));
  warped.copyTo(capture.rgb, mask);
  return capture;
}

inline Capture makeCapture(const StripOptions& options = {},
                           const Quad& corners = defaultSceneCorners()) {
  return placeInScene(makeCanonicalStrip(options), corners);
}

inline cv::Mat exposureAndCast(const cv::Mat& rgb, double exposure,
                               const cv::Vec3d& channel_gains) {
  cv::Mat result(rgb.size(), rgb.type());
  for (int row = 0; row < rgb.rows; ++row) {
    const cv::Vec3b* source = rgb.ptr<cv::Vec3b>(row);
    cv::Vec3b* destination = result.ptr<cv::Vec3b>(row);
    for (int column = 0; column < rgb.cols; ++column) {
      for (int channel = 0; channel < 3; ++channel) {
        destination[column][channel] = cv::saturate_cast<unsigned char>(
            source[column][channel] * exposure * channel_gains[channel]);
      }
    }
  }
  return result;
}

inline cv::Mat jpegRoundTrip(const cv::Mat& rgb, int quality) {
  cv::Mat bgr;
  cv::cvtColor(rgb, bgr, cv::COLOR_RGB2BGR);
  std::vector<unsigned char> encoded;
  cv::imencode(".jpg", bgr, encoded, {cv::IMWRITE_JPEG_QUALITY, quality});
  cv::Mat decoded = cv::imdecode(encoded, cv::IMREAD_COLOR);
  cv::cvtColor(decoded, decoded, cv::COLOR_BGR2RGB);
  return decoded;
}

inline bool reportableTwoLine(const AnalysisResult& result) {
  return result.status == "valid" && result.control_peak.detected &&
         result.test_peak.detected;
}

inline bool reportableOneLine(const AnalysisResult& result) {
  return result.status == "valid" && result.control_peak.detected &&
         !result.test_peak.detected;
}

inline bool hasReason(const AnalysisResult& result, const std::string& reason) {
  return std::find(result.reason_codes.begin(), result.reason_codes.end(),
                   reason) != result.reason_codes.end();
}

inline std::string diagnostic(const AnalysisResult& result) {
  std::ostringstream output;
  output << "status=" << result.status
         << " C(detected=" << result.control_peak.detected
         << ",position=" << result.control_peak.position
         << ",snr=" << result.control_peak.snr
         << ",area=" << result.control_peak.area
         << ",fwhm=" << result.control_peak.fwhm
         << ") T(detected=" << result.test_peak.detected
         << ",position=" << result.test_peak.position
         << ",snr=" << result.test_peak.snr << ",area=" << result.test_peak.area
         << ",fwhm=" << result.test_peak.fwhm << ") reasons=";
  for (const std::string& reason : result.reason_codes) {
    output << reason << ',';
  }
  output << " corners=";
  for (const cv::Point2f& point : result.geometry.corners) {
    output << '(' << point.x << ':' << point.y << ')';
  }
  const double threshold =
      std::max(0.04, 6.0 * result.quality.background_noise);
  const size_t broad = static_cast<size_t>(std::count_if(
      result.corrected_profile.begin(), result.corrected_profile.end(),
      [threshold](double value) { return value > threshold; }));
  output << " noise=" << result.quality.background_noise << " broad_fraction="
         << (result.corrected_profile.empty()
                 ? 0.0
                 : broad /
                       static_cast<double>(result.corrected_profile.size()));
  if (!result.raw_profile.empty()) {
    const auto raw_range = std::minmax_element(result.raw_profile.begin(),
                                               result.raw_profile.end());
    const auto corrected_range =
        std::minmax_element(result.corrected_profile.begin(),
                            result.corrected_profile.end());
    output << " raw_range=" << *raw_range.first << ':' << *raw_range.second
           << " corrected_range=" << *corrected_range.first << ':'
           << *corrected_range.second;
  }
  output << " valid_fraction=" << result.quality.valid_fraction
         << " clipped_fraction=" << result.quality.clipped_fraction
         << " glare_fraction=" << result.quality.glare_fraction;
  std::vector<std::pair<double, double>> local_peaks;
  for (size_t index = 1; index + 1 < result.corrected_profile.size(); ++index) {
    if (result.corrected_profile[index] >=
            result.corrected_profile[index - 1] &&
        result.corrected_profile[index] >=
            result.corrected_profile[index + 1] &&
        (result.corrected_profile[index] >
             result.corrected_profile[index - 1] ||
         result.corrected_profile[index] >
             result.corrected_profile[index + 1])) {
      local_peaks.emplace_back(result.corrected_profile[index],
                               result.x[index]);
    }
  }
  std::sort(local_peaks.begin(), local_peaks.end(),
            std::greater<std::pair<double, double>>());
  output << " profile_peaks=";
  for (size_t index = 0; index < std::min<size_t>(6, local_peaks.size());
       ++index) {
    output << '(' << local_peaks[index].second << ':'
           << local_peaks[index].first << ')';
  }
  return output.str();
}

}  // namespace stripcv::test
