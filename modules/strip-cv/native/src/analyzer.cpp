#include "stripcv/analyzer.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <limits>
#include <numeric>
#include <string>
#include <utility>
#include <vector>

#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif

namespace stripcv {
namespace {

#ifndef STRIPCV_VERSION
#define STRIPCV_VERSION "0.3.1"
#endif

using Clock = std::chrono::steady_clock;

double elapsedMs(const Clock::time_point& start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

void addReason(AnalysisResult& result, const std::string& reason) {
  if (std::find(result.reason_codes.begin(), result.reason_codes.end(), reason) ==
      result.reason_codes.end()) {
    result.reason_codes.push_back(reason);
  }
}

double clamp01(double value) { return std::clamp(value, 0.0, 1.0); }

double srgbToLinear(double value) {
  value = clamp01(value);
  return value <= 0.04045 ? value / 12.92
                          : std::pow((value + 0.055) / 1.055, 2.4);
}

double linearToSrgb(double value) {
  value = clamp01(value);
  return value <= 0.0031308 ? 12.92 * value
                            : 1.055 * std::pow(value, 1.0 / 2.4) - 0.055;
}

cv::Vec3d referenceLinear(const std::array<double, 3>& rgb) {
  return {srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])};
}

cv::Mat toLinear(const cv::Mat& rgb) {
  cv::Mat output(rgb.size(), CV_32FC3);
  for (int row = 0; row < rgb.rows; ++row) {
    const cv::Vec3b* source = rgb.ptr<cv::Vec3b>(row);
    cv::Vec3f* destination = output.ptr<cv::Vec3f>(row);
    for (int column = 0; column < rgb.cols; ++column) {
      for (int channel = 0; channel < 3; ++channel) {
        destination[column][channel] = static_cast<float>(
            srgbToLinear(source[column][channel] / 255.0));
      }
    }
  }
  return output;
}

cv::Mat toSrgb8(const cv::Mat& linear) {
  cv::Mat output(linear.size(), CV_8UC3);
  for (int row = 0; row < linear.rows; ++row) {
    const cv::Vec3f* source = linear.ptr<cv::Vec3f>(row);
    cv::Vec3b* destination = output.ptr<cv::Vec3b>(row);
    for (int column = 0; column < linear.cols; ++column) {
      for (int channel = 0; channel < 3; ++channel) {
        destination[column][channel] = cv::saturate_cast<unsigned char>(
            std::round(255.0 * linearToSrgb(source[column][channel])));
      }
    }
  }
  return output;
}

cv::Rect pixelRect(const NormalizedRect& normalized, const cv::Size& size) {
  const int x0 = std::clamp(static_cast<int>(std::round(normalized.x0 * size.width)),
                            0, size.width - 1);
  const int y0 = std::clamp(static_cast<int>(std::round(normalized.y0 * size.height)),
                            0, size.height - 1);
  const int x1 = std::clamp(static_cast<int>(std::round(normalized.x1 * size.width)),
                            x0 + 1, size.width);
  const int y1 = std::clamp(static_cast<int>(std::round(normalized.y1 * size.height)),
                            y0 + 1, size.height);
  return {x0, y0, x1 - x0, y1 - y0};
}

double polygonArea(const Quad& quad) {
  return std::abs(cv::contourArea(std::vector<cv::Point2f>(quad.begin(), quad.end())));
}

double blurVariance(const cv::Mat& rgb) {
  cv::Mat gray;
  cv::cvtColor(rgb, gray, cv::COLOR_RGB2GRAY);
  cv::Mat laplacian;
  cv::Laplacian(gray, laplacian, CV_64F);
  cv::Scalar mean;
  cv::Scalar deviation;
  cv::meanStdDev(laplacian, mean, deviation);
  // Normalize the focus measure for unsaturated global exposure changes. A raw
  // Laplacian variance scales approximately with luminance squared, which would
  // otherwise turn an equally sharp dim capture into a false blur failure.
  const double mean_luminance = cv::mean(gray)[0];
  const double exposure_scale = std::max(0.15, mean_luminance / 192.0);
  return deviation[0] * deviation[0] / (exposure_scale * exposure_scale);
}

cv::Mat artifactMask(const cv::Mat& rgb, double& clipped_fraction,
                     double& glare_fraction) {
  cv::Mat mask(rgb.size(), CV_8U, cv::Scalar(0));
  size_t clipped = 0;
  size_t glare = 0;
  for (int row = 0; row < rgb.rows; ++row) {
    const cv::Vec3b* pixels = rgb.ptr<cv::Vec3b>(row);
    unsigned char* invalid = mask.ptr<unsigned char>(row);
    for (int column = 0; column < rgb.cols; ++column) {
      const cv::Vec3b pixel = pixels[column];
      const int minimum = std::min({pixel[0], pixel[1], pixel[2]});
      const int maximum = std::max({pixel[0], pixel[1], pixel[2]});
      const bool is_clipped = minimum <= 2 || maximum >= 253;
      const bool is_glare = minimum >= 238 && maximum - minimum <= 14;
      clipped += is_clipped ? 1U : 0U;
      glare += is_glare ? 1U : 0U;
      invalid[column] = (is_clipped || is_glare) ? 255 : 0;
    }
  }
  const double count = static_cast<double>(rgb.total());
  clipped_fraction = clipped / count;
  glare_fraction = glare / count;
  return mask;
}

cv::Vec3d meanLinearPatch(const cv::Mat& linear, const NormalizedRect& roi) {
  const cv::Rect rect = pixelRect(roi, linear.size());
  const int margin_x = rect.width / 6;
  const int margin_y = rect.height / 6;
  cv::Rect inner(rect.x + margin_x, rect.y + margin_y,
                 std::max(1, rect.width - 2 * margin_x),
                 std::max(1, rect.height - 2 * margin_y));
  const cv::Scalar mean = cv::mean(linear(inner));
  return {mean[0], mean[1], mean[2]};
}

double median(std::vector<double> values);

cv::Vec3d solvePlane(const std::vector<cv::Vec3d>& coordinates_and_values,
                     double fallback) {
  if (coordinates_and_values.size() < 3) {
    return {fallback, 0.0, 0.0};
  }
  cv::Mat design(static_cast<int>(coordinates_and_values.size()), 3, CV_64F);
  cv::Mat values(static_cast<int>(coordinates_and_values.size()), 1, CV_64F);
  for (int row = 0; row < design.rows; ++row) {
    design.at<double>(row, 0) = 1.0;
    design.at<double>(row, 1) = coordinates_and_values[row][0];
    design.at<double>(row, 2) = coordinates_and_values[row][1];
    values.at<double>(row, 0) = coordinates_and_values[row][2];
  }
  cv::Mat coefficients;
  if (!cv::solve(design, values, coefficients, cv::DECOMP_SVD)) {
    return {fallback, 0.0, 0.0};
  }
  return {coefficients.at<double>(0), coefficients.at<double>(1),
          coefficients.at<double>(2)};
}

cv::Vec3f transformPixel(const cv::Vec3f& source, const cv::Matx33d& matrix) {
  cv::Vec3f output;
  for (int destination = 0; destination < 3; ++destination) {
    double value = 0.0;
    for (int input = 0; input < 3; ++input) {
      value += source[input] * matrix(input, destination);
    }
    output[destination] = static_cast<float>(clamp01(value));
  }
  return output;
}

struct CardCorrectionModel {
  cv::Vec3d black{0.0, 0.0, 0.0};
  cv::Vec3d gains{1.0, 1.0, 1.0};
  cv::Matx33d color_matrix = cv::Matx33d::eye();
  double validation_residual = 0.0;
};

cv::Mat applyCardCorrection(const cv::Mat& linear,
                            const CardCorrectionModel& model) {
  cv::Mat corrected(linear.size(), CV_32FC3);
  for (int row = 0; row < linear.rows; ++row) {
    const cv::Vec3f* source = linear.ptr<cv::Vec3f>(row);
    cv::Vec3f* destination = corrected.ptr<cv::Vec3f>(row);
    for (int column = 0; column < linear.cols; ++column) {
      cv::Vec3f normalized;
      for (int channel = 0; channel < 3; ++channel) {
        normalized[channel] = static_cast<float>(clamp01(
            std::max(0.0, source[column][channel] - model.black[channel]) *
            model.gains[channel]));
      }
      destination[column] = transformPixel(normalized, model.color_matrix);
    }
  }
  return corrected;
}

CardCorrectionModel estimateCardCorrection(const cv::Mat& card_rgb,
                                            const CardProfile& profile) {
  CardCorrectionModel model;
  const cv::Mat linear = toLinear(card_rgb);
  for (const CardPatch& patch : profile.patches) {
    if (patch.role == "black") {
      model.black = meanLinearPatch(linear, patch.roi);
      break;
    }
  }

  // The tile may be anywhere and at any orientation relative to the strip, so
  // its neutral patches estimate global exposure/white balance only. Local
  // strip shading is corrected later from blank membrane pixels.
  for (int channel = 0; channel < 3; ++channel) {
    std::vector<double> ratios;
    for (const CardPatch& patch : profile.patches) {
      if (patch.role != "neutral") {
        continue;
      }
      const cv::Vec3d observed = meanLinearPatch(linear, patch.roi);
      const cv::Vec3d reference = referenceLinear(patch.reference_rgb);
      const double denominator =
          std::max(0.01, observed[channel] - model.black[channel]);
      const double ratio = std::clamp(reference[channel] / denominator, 0.2, 5.0);
      ratios.push_back(ratio);
    }
    if (!ratios.empty()) {
      model.gains[channel] = median(ratios);
    }
  }

  const cv::Mat globally_normalized = applyCardCorrection(linear, model);
  if (profile.enrolled) {
    std::vector<cv::Vec3d> observed_rows;
    std::vector<cv::Vec3d> reference_rows;
    for (const CardPatch& patch : profile.patches) {
      if (patch.role != "calibration" && patch.role != "neutral") {
        continue;
      }
      observed_rows.push_back(meanLinearPatch(globally_normalized, patch.roi));
      reference_rows.push_back(referenceLinear(patch.reference_rgb));
    }
    if (observed_rows.size() >= 3) {
      cv::Mat a(static_cast<int>(observed_rows.size()), 3, CV_64F);
      cv::Mat b(static_cast<int>(reference_rows.size()), 3, CV_64F);
      for (int row = 0; row < a.rows; ++row) {
        for (int channel = 0; channel < 3; ++channel) {
          a.at<double>(row, channel) = observed_rows[row][channel];
          b.at<double>(row, channel) = reference_rows[row][channel];
        }
      }
      const double regularization = 1.0e-3;
      cv::Mat normal = a.t() * a + regularization * cv::Mat::eye(3, 3, CV_64F);
      cv::Mat target = a.t() * b + regularization * cv::Mat::eye(3, 3, CV_64F);
      cv::Mat solved;
      if (cv::solve(normal, target, solved, cv::DECOMP_SVD)) {
        for (int row = 0; row < 3; ++row) {
          for (int column = 0; column < 3; ++column) {
            model.color_matrix(row, column) = solved.at<double>(row, column);
          }
        }
      }
    }
  }

  const cv::Mat corrected = applyCardCorrection(linear, model);
  std::vector<double> residuals;
  for (const CardPatch& patch : profile.patches) {
    if (patch.role != "holdout") {
      continue;
    }
    const cv::Vec3d measured = meanLinearPatch(corrected, patch.roi);
    const cv::Vec3d expected = referenceLinear(patch.reference_rgb);
    residuals.push_back(cv::norm(measured - expected) / std::sqrt(3.0));
  }
  model.validation_residual =
      residuals.empty()
          ? 0.0
          : *std::max_element(residuals.begin(), residuals.end());
  return model;
}

bool inLineWindow(double x, const AssayProfile& assay) {
  return (x >= assay.test_window.x0 && x <= assay.test_window.x1) ||
         (x >= assay.control_window.x0 && x <= assay.control_window.x1);
}

cv::Mat correctSpatialLinear(const cv::Mat& input_linear,
                             const AssayProfile& assay,
                             const cv::Mat& invalid_mask,
                             double& illumination_span,
                             bool diagonal_white_balance) {
  cv::Mat linear;
  cv::medianBlur(input_linear, linear, 3);
  const cv::Rect membrane = pixelRect(assay.membrane_roi, linear.size());
  std::array<cv::Vec3d, 3> planes;
  std::array<std::vector<double>, 3> channel_values;
  const int stride = std::max(1, static_cast<int>(
                                     std::sqrt(membrane.area() / 20000.0)));
  for (int channel = 0; channel < 3; ++channel) {
    std::vector<cv::Vec3d> samples;
    for (int row = membrane.y; row < membrane.y + membrane.height; row += stride) {
      for (int column = membrane.x; column < membrane.x + membrane.width;
           column += stride) {
        const double x = (column - membrane.x + 0.5) / membrane.width;
        if (inLineWindow(x, assay) || invalid_mask.at<unsigned char>(row, column)) {
          continue;
        }
        const cv::Vec3f pixel = linear.at<cv::Vec3f>(row, column);
        const auto [minimum_channel, maximum_channel] =
            std::minmax_element(pixel.val, pixel.val + 3);
        // Coloured handles/grips are structural material, not blank membrane.
        // Including them in the illumination plane can apply a severe channel
        // cast to the T/C region after otherwise correct full-strip geometry.
        if (*maximum_channel - *minimum_channel > 0.12F) {
          continue;
        }
        const double nx = x - 0.5;
        const double ny = (row - membrane.y + 0.5) / membrane.height - 0.5;
        const double value = pixel[channel];
        samples.emplace_back(nx, ny, value);
        channel_values[channel].push_back(value);
      }
    }
    double fallback = 0.5;
    if (!channel_values[channel].empty()) {
      auto values = channel_values[channel];
      std::nth_element(values.begin(), values.begin() + values.size() / 2,
                       values.end());
      fallback = values[values.size() / 2];
    }
    planes[channel] = solvePlane(samples, fallback);
  }
  const double neutral_target =
      (planes[0][0] + planes[1][0] + planes[2][0]) / 3.0;
  illumination_span = 1.0;
  for (int channel = 0; channel < 3; ++channel) {
    const double corner_min = std::max(
        0.01, planes[channel][0] - 0.5 * std::abs(planes[channel][1]) -
                  0.5 * std::abs(planes[channel][2]));
    const double corner_max =
        planes[channel][0] + 0.5 * std::abs(planes[channel][1]) +
        0.5 * std::abs(planes[channel][2]);
    illumination_span = std::max(illumination_span, corner_max / corner_min);
  }

  cv::Mat corrected(linear.size(), CV_32FC3);
  for (int row = 0; row < linear.rows; ++row) {
    const double y = (row - membrane.y + 0.5) / membrane.height - 0.5;
    const cv::Vec3f* source = linear.ptr<cv::Vec3f>(row);
    cv::Vec3f* destination = corrected.ptr<cv::Vec3f>(row);
    for (int column = 0; column < linear.cols; ++column) {
      const double x = (column - membrane.x + 0.5) / membrane.width - 0.5;
      for (int channel = 0; channel < 3; ++channel) {
        const double background = std::clamp(
            planes[channel][0] + planes[channel][1] * x +
                planes[channel][2] * y,
            0.02, 1.0);
        const double target = diagonal_white_balance ? neutral_target
                                                     : planes[channel][0];
        destination[column][channel] = static_cast<float>(clamp01(
            source[column][channel] * target / background));
      }
    }
  }
  return corrected;
}

cv::Mat correctBare(const cv::Mat& strip_rgb, const AssayProfile& assay,
                    const cv::Mat& invalid_mask, double& illumination_span) {
  return correctSpatialLinear(toLinear(strip_rgb), assay, invalid_mask,
                              illumination_span, true);
}

double median(std::vector<double> values) {
  if (values.empty()) {
    return 0.0;
  }
  const size_t middle = values.size() / 2;
  std::nth_element(values.begin(), values.begin() + middle, values.end());
  double result = values[middle];
  if (values.size() % 2 == 0) {
    const auto lower = std::max_element(values.begin(), values.begin() + middle);
    result = 0.5 * (result + *lower);
  }
  return result;
}

double robustNoise(const std::vector<double>& values) {
  const double center = median(values);
  std::vector<double> deviations;
  deviations.reserve(values.size());
  for (double value : values) {
    deviations.push_back(std::abs(value - center));
  }
  return std::max(1.0e-6, 1.4826 * median(std::move(deviations)));
}

std::vector<double> fitHuberBaseline(const std::vector<double>& x,
                                     const std::vector<double>& raw,
                                     const AssayProfile& assay,
                                     const std::vector<unsigned char>& valid) {
  std::vector<size_t> indices;
  for (size_t index = 0; index < x.size(); ++index) {
    if (valid[index] && !inLineWindow(x[index], assay)) {
      indices.push_back(index);
    }
  }
  if (indices.size() < 6) {
    return std::vector<double>(raw.size(), median(raw));
  }
  cv::Mat coefficients = cv::Mat::zeros(3, 1, CV_64F);
  std::vector<double> weights(indices.size(), 1.0);
  for (int iteration = 0; iteration < 6; ++iteration) {
    cv::Mat normal = cv::Mat::zeros(3, 3, CV_64F);
    cv::Mat target = cv::Mat::zeros(3, 1, CV_64F);
    std::vector<double> residuals;
    residuals.reserve(indices.size());
    for (size_t row = 0; row < indices.size(); ++row) {
      const size_t index = indices[row];
      const cv::Vec3d basis(1.0, x[index], x[index] * x[index]);
      for (int a = 0; a < 3; ++a) {
        target.at<double>(a) += weights[row] * basis[a] * raw[index];
        for (int b = 0; b < 3; ++b) {
          normal.at<double>(a, b) += weights[row] * basis[a] * basis[b];
        }
      }
    }
    cv::solve(normal, target, coefficients, cv::DECOMP_SVD);
    for (size_t row = 0; row < indices.size(); ++row) {
      const size_t index = indices[row];
      const double predicted = coefficients.at<double>(0) +
                               coefficients.at<double>(1) * x[index] +
                               coefficients.at<double>(2) * x[index] * x[index];
      residuals.push_back(raw[index] - predicted);
    }
    const double scale = robustNoise(residuals);
    const double delta = 1.345 * scale;
    for (size_t row = 0; row < residuals.size(); ++row) {
      weights[row] = std::abs(residuals[row]) <= delta
                         ? 1.0
                         : delta / std::abs(residuals[row]);
    }
  }
  std::vector<double> baseline(x.size());
  for (size_t index = 0; index < x.size(); ++index) {
    baseline[index] = coefficients.at<double>(0) +
                      coefficients.at<double>(1) * x[index] +
                      coefficients.at<double>(2) * x[index] * x[index];
  }
  return baseline;
}

std::vector<double> gaussianSmooth(const std::vector<double>& values,
                                   double sigma_samples) {
  sigma_samples = std::max(0.6, sigma_samples);
  const int radius = std::max(2, static_cast<int>(std::ceil(3.0 * sigma_samples)));
  std::vector<double> kernel(2 * radius + 1);
  double kernel_sum = 0.0;
  for (int offset = -radius; offset <= radius; ++offset) {
    const double weight =
        std::exp(-0.5 * offset * offset / (sigma_samples * sigma_samples));
    kernel[offset + radius] = weight;
    kernel_sum += weight;
  }
  for (double& weight : kernel) {
    weight /= kernel_sum;
  }
  std::vector<double> output(values.size(), 0.0);
  for (size_t index = 0; index < values.size(); ++index) {
    for (int offset = -radius; offset <= radius; ++offset) {
      const int source = std::clamp(static_cast<int>(index) + offset, 0,
                                    static_cast<int>(values.size()) - 1);
      output[index] += values[source] * kernel[offset + radius];
    }
  }
  return output;
}

double integratePositive(const std::vector<double>& x,
                         const std::vector<double>& profile, double center,
                         double half_width) {
  double area = 0.0;
  for (size_t index = 1; index < x.size(); ++index) {
    if (0.5 * (x[index - 1] + x[index]) < center - half_width ||
        0.5 * (x[index - 1] + x[index]) > center + half_width) {
      continue;
    }
    area += 0.5 * (std::max(0.0, profile[index - 1]) +
                   std::max(0.0, profile[index])) *
            (x[index] - x[index - 1]);
  }
  return area;
}

PeakMetrics measurePeak(const std::vector<double>& x,
                        const std::vector<double>& profile,
                        const NormalizedRect& window, double noise,
                        double integration_half_width,
                        std::optional<double> forced_center = std::nullopt) {
  PeakMetrics peak;
  size_t peak_index = 0;
  if (forced_center) {
    double best_distance = std::numeric_limits<double>::infinity();
    for (size_t index = 0; index < x.size(); ++index) {
      const double distance = std::abs(x[index] - *forced_center);
      if (distance < best_distance) {
        best_distance = distance;
        peak_index = index;
      }
    }
  } else {
    double best = -std::numeric_limits<double>::infinity();
    for (size_t index = 0; index < x.size(); ++index) {
      if (x[index] >= window.x0 && x[index] <= window.x1 &&
          profile[index] > best) {
        best = profile[index];
        peak_index = index;
      }
    }
  }
  peak.position = forced_center.value_or(x[peak_index]);
  peak.height = profile[peak_index];
  std::vector<double> shoulders;
  for (size_t index = 0; index < x.size(); ++index) {
    if (x[index] >= window.x0 && x[index] <= window.x1 &&
        std::abs(x[index] - peak.position) > integration_half_width) {
      shoulders.push_back(profile[index]);
    }
  }
  double shoulder_level = median(std::move(shoulders));
  double left_minimum = std::numeric_limits<double>::infinity();
  double right_minimum = std::numeric_limits<double>::infinity();
  bool has_left_minimum = false;
  bool has_right_minimum = false;
  for (size_t index = peak_index; index > 0;) {
    --index;
    if (x[index] < window.x0) {
      break;
    }
    left_minimum = std::min(left_minimum, profile[index]);
    has_left_minimum = true;
    if (profile[index] > peak.height) {
      break;
    }
  }
  for (size_t index = peak_index + 1; index < profile.size(); ++index) {
    if (x[index] > window.x1) {
      break;
    }
    right_minimum = std::min(right_minimum, profile[index]);
    has_right_minimum = true;
    if (profile[index] > peak.height) {
      break;
    }
  }
  if (has_left_minimum && has_right_minimum) {
    // Use the higher of the two neighboring valleys, matching the usual
    // topographic-prominence contour. This separates a narrow line riding on
    // a broad background feature without inflating its measured FWHM.
    shoulder_level = std::max(left_minimum, right_minimum);
  }
  peak.prominence = peak.height - shoulder_level;
  peak.snr = peak.prominence / std::max(noise, 1.0e-6);
  peak.area = integratePositive(x, profile, peak.position, integration_half_width);
  const double half_height =
      shoulder_level + 0.5 * std::max(0.0, peak.prominence);
  size_t left = peak_index;
  size_t right = peak_index;
  while (left > 0 && profile[left] > half_height) {
    --left;
  }
  while (right + 1 < profile.size() && profile[right] > half_height) {
    ++right;
  }
  peak.fwhm = x[right] - x[left];
  return peak;
}

PeakMetrics selectLinePeak(const std::vector<double>& x,
                           const std::vector<double>& profile,
                           const NormalizedRect& window, double noise,
                           double integration_half_width,
                           double expected_line_width) {
  std::vector<size_t> candidate_indices;
  size_t highest_index = 0;
  double highest_value = -std::numeric_limits<double>::infinity();
  for (size_t index = 0; index < x.size(); ++index) {
    if (x[index] < window.x0 || x[index] > window.x1) {
      continue;
    }
    if (profile[index] > highest_value) {
      highest_value = profile[index];
      highest_index = index;
    }
    const double left = index == 0 ? profile[index] : profile[index - 1];
    const double right = index + 1 == profile.size() ? profile[index]
                                                      : profile[index + 1];
    if (profile[index] >= left && profile[index] >= right &&
        (profile[index] > left || profile[index] > right)) {
      candidate_indices.push_back(index);
    }
  }

  // Monotonic/flat windows may not contain a strict local maximum. Retain the
  // previous behavior as a deterministic fallback, and always include the
  // highest sample in case its maximum lies exactly on a configured edge.
  if (highest_value == -std::numeric_limits<double>::infinity()) {
    return measurePeak(x, profile, window, noise, integration_half_width);
  }
  if (std::find(candidate_indices.begin(), candidate_indices.end(),
                highest_index) == candidate_indices.end()) {
    candidate_indices.push_back(highest_index);
  }

  std::vector<PeakMetrics> candidates;
  candidates.reserve(candidate_indices.size());
  double max_height = 0.0;
  double max_prominence = 0.0;
  for (const size_t index : candidate_indices) {
    PeakMetrics candidate =
        measurePeak(x, profile, window, noise, integration_half_width,
                    x[index]);
    max_height = std::max(max_height, std::max(0.0, candidate.height));
    max_prominence =
        std::max(max_prominence, std::max(0.0, candidate.prominence));
    candidates.push_back(candidate);
  }

  PeakMetrics best = candidates.front();
  double best_score = -1.0;
  const double sample_width =
      x.size() > 1 ? std::abs(x[1] - x[0]) : expected_line_width;
  for (const PeakMetrics& candidate : candidates) {
    const double height_score =
        max_height > 0.0 ? std::max(0.0, candidate.height) / max_height : 0.0;
    const double prominence_score =
        max_prominence > 0.0
            ? std::max(0.0, candidate.prominence) / max_prominence
            : 0.0;
    const double strength_score = 0.5 * (height_score + prominence_score);

    // Profiles are already smoothed at the expected assay-line scale, so an
    // impulse cannot win merely by being one pixel wide. Widths at or below
    // the expected line width receive full shape credit; broader candidates
    // are progressively penalized as likely stains or smears.
    const double measured_width =
        std::max(candidate.fwhm, std::max(sample_width, 1.0e-6));
    const double narrowness_score =
        std::min(1.0, expected_line_width / measured_width);

    // A harmonic mean requires both qualities: a very sharp but weak noise
    // fluctuation and a very high but broad stain both rank below a strong,
    // line-shaped candidate.
    const double score =
        strength_score + narrowness_score > 0.0
            ? 2.0 * strength_score * narrowness_score /
                  (strength_score + narrowness_score)
            : 0.0;
    if (score > best_score + 1.0e-12 ||
        (std::abs(score - best_score) <= 1.0e-12 &&
         candidate.prominence > best.prominence)) {
      best = candidate;
      best_score = score;
    }
  }
  return best;
}

struct OrderedPeakPair {
  PeakMetrics test;
  PeakMetrics control;
  double confidence = 0.0;
};

std::vector<PeakMetrics> credibleLinePeaks(
    const std::vector<double>& x, const std::vector<double>& profile,
    const AssayProfile& assay, double noise,
    const NormalizedRect& search_window) {
  std::vector<PeakMetrics> candidates;
  for (size_t index = 0; index < x.size(); ++index) {
    if (x[index] < search_window.x0 || x[index] > search_window.x1) {
      continue;
    }
    const double left = index == 0 ? profile[index] : profile[index - 1];
    const double right = index + 1 == profile.size() ? profile[index]
                                                      : profile[index + 1];
    if (!(profile[index] >= left && profile[index] >= right &&
          (profile[index] > left || profile[index] > right))) {
      continue;
    }
    PeakMetrics candidate =
        measurePeak(x, profile, search_window, noise,
                    assay.integration_half_width, x[index]);
    const bool strong_enough =
        candidate.height > 0.0 && candidate.snr >= assay.quality.min_test_snr &&
        candidate.area > 0.0;
    const bool line_shaped =
        candidate.fwhm >= 0.45 * assay.expected_line_width &&
        candidate.fwhm <= 3.5 * assay.expected_line_width;
    if (strong_enough && line_shaped) {
      candidates.push_back(candidate);
    }
  }
  double maximum_prominence = 0.0;
  for (const PeakMetrics& candidate : candidates) {
    maximum_prominence =
        std::max(maximum_prominence, std::max(0.0, candidate.prominence));
  }
  const double relative_prominence_floor = 0.05 * maximum_prominence;
  candidates.erase(
      std::remove_if(candidates.begin(), candidates.end(),
                     [relative_prominence_floor](const PeakMetrics& candidate) {
                       return candidate.prominence < relative_prominence_floor;
                     }),
      candidates.end());
  return candidates;
}

NormalizedRect configuredLineSearchWindow(const AssayProfile& assay) {
  return {std::min(assay.test_window.x0, assay.control_window.x0), 0.0,
          std::max(assay.test_window.x1, assay.control_window.x1), 1.0};
}

std::optional<OrderedPeakPair> recoverOrderedPeakPair(
    std::vector<PeakMetrics> candidates, const AssayProfile& assay) {
  // Recovery is intentionally conservative. With exactly two credible lines,
  // assay order supplies their identity. Three or more candidates are
  // ambiguous and remain non-reportable rather than being relabeled by
  // intensity.
  if (candidates.size() != 2) {
    return std::nullopt;
  }
  std::sort(candidates.begin(), candidates.end(),
            [](const PeakMetrics& first, const PeakMetrics& second) {
              return first.position < second.position;
            });
  const double test_center =
      0.5 * (assay.test_window.x0 + assay.test_window.x1);
  const double control_center =
      0.5 * (assay.control_window.x0 + assay.control_window.x1);
  OrderedPeakPair pair;
  if (control_center > test_center) {
    pair.test = candidates[0];
    pair.control = candidates[1];
  } else {
    pair.control = candidates[0];
    pair.test = candidates[1];
  }
  const double separation =
      std::abs(pair.control.position - pair.test.position);
  const double minimum_separation =
      std::max(1.5 * assay.expected_line_width,
               1.05 * assay.integration_half_width);
  if (separation < minimum_separation ||
      pair.control.snr < assay.quality.min_control_snr ||
      pair.control.area < assay.quality.min_control_area) {
    return std::nullopt;
  }

  auto line_quality = [&](const PeakMetrics& peak, double required_snr) {
    const double snr_score = std::min(1.0, peak.snr / required_snr);
    const double width_score = std::min(
        1.0, assay.expected_line_width / std::max(peak.fwhm, 1.0e-6));
    return snr_score + width_score > 0.0
               ? 2.0 * snr_score * width_score /
                     (snr_score + width_score)
               : 0.0;
  };
  pair.test.detected = true;
  pair.control.detected = true;
  pair.confidence =
      std::min(line_quality(pair.test, assay.quality.min_test_snr),
               line_quality(pair.control, assay.quality.min_control_snr));
  return pair;
}

std::optional<OrderedPeakPair> recoverPartialStripPeakPair(
    const std::vector<PeakMetrics>& candidates, const AssayProfile& assay) {
  if (candidates.size() < 2) {
    return std::nullopt;
  }
  double maximum_prominence = 0.0;
  for (const PeakMetrics& candidate : candidates) {
    maximum_prominence =
        std::max(maximum_prominence, std::max(0.0, candidate.prominence));
  }
  if (maximum_prominence <= 0.0) {
    return std::nullopt;
  }

  const double test_center =
      0.5 * (assay.test_window.x0 + assay.test_window.x1);
  const double control_center =
      0.5 * (assay.control_window.x0 + assay.control_window.x1);
  const double expected_separation = std::abs(test_center - control_center);
  const double minimum_separation =
      std::max(1.5 * assay.expected_line_width,
               0.45 * expected_separation);
  const double maximum_separation =
      std::min(0.30, 2.1 * expected_separation);

  auto lineQuality = [&](const PeakMetrics& peak, double required_snr) {
    const double snr_score = std::min(1.0, peak.snr / required_snr);
    const double width_score = std::min(
        1.0, assay.expected_line_width / std::max(peak.fwhm, 1.0e-6));
    return snr_score + width_score > 0.0
               ? 2.0 * snr_score * width_score /
                     (snr_score + width_score)
               : 0.0;
  };

  struct ScoredPair {
    OrderedPeakPair pair;
    double score = 0.0;
  };
  std::vector<ScoredPair> pairs;
  for (size_t first = 0; first + 1 < candidates.size(); ++first) {
    for (size_t second = first + 1; second < candidates.size(); ++second) {
      const PeakMetrics& low = candidates[first].position < candidates[second].position
                                   ? candidates[first]
                                   : candidates[second];
      const PeakMetrics& high = candidates[first].position < candidates[second].position
                                    ? candidates[second]
                                    : candidates[first];
      const double separation = high.position - low.position;
      if (separation < minimum_separation || separation > maximum_separation) {
        continue;
      }
      OrderedPeakPair pair;
      if (control_center < test_center) {
        pair.control = low;
        pair.test = high;
      } else {
        pair.test = low;
        pair.control = high;
      }
      if (pair.control.snr < assay.quality.min_control_snr ||
          pair.control.area < assay.quality.min_control_area ||
          pair.test.snr < assay.quality.min_test_snr) {
        continue;
      }
      const double control_quality =
          lineQuality(pair.control, assay.quality.min_control_snr);
      const double test_quality =
          lineQuality(pair.test, assay.quality.min_test_snr);
      const double strength =
          std::min(pair.control.prominence, pair.test.prominence) /
          maximum_prominence;
      const double separation_score = std::exp(
          -std::abs(std::log(separation / std::max(expected_separation, 1.0e-6))));
      pair.control.detected = true;
      pair.test.detected = true;
      pair.confidence = std::min(control_quality, test_quality);
      pairs.push_back(
          {pair, 0.55 * pair.confidence + 0.35 * strength +
                     0.10 * separation_score});
    }
  }
  if (pairs.empty()) {
    return std::nullopt;
  }
  std::sort(pairs.begin(), pairs.end(),
            [](const ScoredPair& first, const ScoredPair& second) {
              return first.score > second.score;
            });
  const bool clearly_best =
      pairs.size() == 1 || pairs.front().score - pairs[1].score >= 0.10;
  if (pairs.front().score < 0.55 || !clearly_best) {
    return std::nullopt;
  }
  return pairs.front().pair;
}

bool quadEndOnFrameBoundary(const Quad& corners, size_t first, size_t second,
                            const cv::Size& size) {
  constexpr float margin = 2.5F;
  const auto bothNear = [&](auto coordinate, float boundary) {
    return std::abs(coordinate(corners[first]) - boundary) <= margin &&
           std::abs(coordinate(corners[second]) - boundary) <= margin;
  };
  return bothNear([](const cv::Point2f& point) { return point.x; }, 0.0F) ||
         bothNear([](const cv::Point2f& point) { return point.x; },
                  static_cast<float>(size.width - 1)) ||
         bothNear([](const cv::Point2f& point) { return point.y; }, 0.0F) ||
         bothNear([](const cv::Point2f& point) { return point.y; },
                  static_cast<float>(size.height - 1));
}

bool handledStripSpansFrame(const LocalizationResult& localization,
                            const AssayProfile& assay, const cv::Size& size) {
  return assay.id == "handled-paper-two-line-strip" &&
         quadEndOnFrameBoundary(localization.corners, 0, 3, size) &&
         quadEndOnFrameBoundary(localization.corners, 1, 2, size);
}

double maskedFraction(const cv::Mat& mask, const cv::Rect& roi) {
  return cv::countNonZero(mask(roi)) / static_cast<double>(roi.area());
}

void annotate(cv::Mat& rgb, const Quad& corners, const std::string& label,
              const cv::Scalar& color) {
  std::vector<cv::Point> polygon;
  for (const cv::Point2f& point : corners) {
    polygon.emplace_back(cvRound(point.x), cvRound(point.y));
  }
  cv::polylines(rgb, polygon, true, color, 4, cv::LINE_AA);
  cv::putText(rgb, label, polygon.front() + cv::Point(0, -10),
              cv::FONT_HERSHEY_SIMPLEX, 0.8, color, 2, cv::LINE_AA);
}

}  // namespace

Analyzer::Analyzer(std::shared_ptr<const IRegionLocator> locator)
    : locator_(locator ? std::move(locator)
                       : std::make_shared<ClassicalRegionLocator>()) {}

AnalysisResult Analyzer::analyze(const cv::Mat& rgb, const AssayProfile& assay,
                                 const AnalysisOptions& options) const {
  const auto total_start = Clock::now();
  AnalysisResult result;
  result.algorithm_version = STRIPCV_VERSION;
  result.include_rectified_image = options.include_rectified_image;
  if (options.bypass_quality_checks) {
    // Kept for native JSON compatibility with older callers. Safety and
    // quality checks are always enforced, regardless of this deprecated flag.
    addReason(result, "quality_checks_bypass_ignored");
  }
  result.assay_profile_id = assay.id;
  result.assay_profile_version = assay.version;
  result.cutoff = options.cutoff ? options.cutoff : assay.default_cutoff;
  result.cutoff_source = options.cutoff ? "session_override"
                                        : (assay.default_cutoff ? "assay_profile" : "none");
  if (rgb.empty() || rgb.type() != CV_8UC3 || rgb.cols < 64 || rgb.rows < 64) {
    addReason(result, "unsupported_or_too_small_image");
    result.timings_ms["total"] = elapsedMs(total_start);
    return result;
  }
  result.annotated_rgb = rgb.clone();

  const auto localization_start = Clock::now();
  LocalizationResult tile_localization;
  if (options.card_profile) {
    tile_localization = locator_->locateCard(rgb, *options.card_profile);
  }

  LocalizationResult localization;
  if (options.corner_override) {
    localization.found = true;
    localization.mode = "manual_bare";
    localization.corners = *options.corner_override;
    localization.confidence = 1.0;
    localization.area_fraction = polygonArea(localization.corners) /
                                 static_cast<double>(rgb.total());
    result.geometry.manually_corrected = true;
  } else {
    localization = locator_->locateBare(rgb, assay);
  }
  const bool tile_found = tile_localization.found;
  if (options.card_profile && !tile_found && options.card_profile->enrolled) {
    addReason(result, "calibration_tile_not_found_using_internal_reference");
    if (tile_localization.failure_reason == "card_homography_inconsistent") {
      addReason(result, tile_localization.failure_reason);
    }
  }
  if (tile_found) {
    result.geometry.calibration_tile_detected = true;
    result.geometry.calibration_tile_corners = tile_localization.corners;
    result.quality.calibration_tile_confidence = tile_localization.confidence;
    result.quality.calibration_tile_area_fraction =
        tile_localization.area_fraction;
    result.quality.calibration_tile_edge_support_fraction =
        tile_localization.edge_support_fraction;
    result.quality.calibration_tile_reprojection_rmse_px =
        tile_localization.reprojection_rmse_px;
    result.quality.calibration_tile_holdout_rmse_px =
        tile_localization.holdout_rmse_px;
    annotate(result.annotated_rgb, tile_localization.corners,
             "calibration tile", cv::Scalar(39, 196, 255));
  }
  result.timings_ms["localization"] = elapsedMs(localization_start);
  if (!localization.found) {
    addReason(result, localization.failure_reason.empty()
                          ? "strip_not_found"
                          : localization.failure_reason);
    result.timings_ms["total"] = elapsedMs(total_start);
    return result;
  }

  result.geometry.mode = localization.mode;
  result.geometry.corners = localization.corners;
  result.quality.locator_confidence = localization.confidence;
  result.quality.quad_area_fraction = localization.area_fraction;
  result.quality.locator_edge_support_fraction =
      localization.edge_support_fraction;
  result.quality.locator_rectification_rmse_px =
      localization.rectification_rmse_px;
  result.quality.perspective_scale_ratio =
      localization.perspective_scale_ratio;
  const bool partial_handled_strip =
      !result.geometry.manually_corrected &&
      handledStripSpansFrame(localization, assay, rgb.size());
  annotate(result.annotated_rgb, localization.corners, "strip",
           cv::Scalar(40, 220, 80));

  const auto rectification_start = Clock::now();
  cv::Mat strip_rgb;
  std::optional<CardCorrectionModel> tile_correction;
  double source_strip_height = 0.0;
  const std::array<cv::Point2f, 4> destination = {
      cv::Point2f(0.0F, 0.0F),
      cv::Point2f(static_cast<float>(assay.canonical_width - 1), 0.0F),
      cv::Point2f(static_cast<float>(assay.canonical_width - 1),
                  static_cast<float>(assay.canonical_height - 1)),
      cv::Point2f(0.0F, static_cast<float>(assay.canonical_height - 1))};
  result.geometry.homography = localization.homography.empty()
      ? cv::getPerspectiveTransform(localization.corners.data(),
                                    destination.data())
      : localization.homography.clone();
  cv::warpPerspective(rgb, strip_rgb, result.geometry.homography,
                      cv::Size(assay.canonical_width, assay.canonical_height),
                      cv::INTER_LINEAR, cv::BORDER_REPLICATE);
  source_strip_height =
      0.5 * (cv::norm(localization.corners[3] - localization.corners[0]) +
             cv::norm(localization.corners[2] - localization.corners[1]));

  if (tile_found && options.card_profile) {
    const CardProfile& card = *options.card_profile;
    result.geometry.calibration_tile_homography =
        tile_localization.homography.empty()
            ? cv::getPerspectiveTransform(tile_localization.corners.data(),
                                          card.fiducial_centers.data())
            : tile_localization.homography.clone();
    cv::Mat rectified_tile;
    cv::warpPerspective(rgb, rectified_tile,
                        result.geometry.calibration_tile_homography,
                        cv::Size(card.canonical_width, card.canonical_height),
                        cv::INTER_LINEAR, cv::BORDER_REPLICATE);
    result.calibration_tile_rgb = rectified_tile;
    tile_correction = estimateCardCorrection(rectified_tile, card);
    result.quality.calibration_residual =
        tile_correction->validation_residual;
    result.calibration_mode = card.enrolled ? "card_calibrated"
                                             : "card_uncalibrated";
    if (!card.enrolled) {
      addReason(result, "card_print_batch_not_enrolled");
    }
  } else {
    result.calibration_mode = "internal_reference";
  }
  const bool assay_orientation_flip = assay.sample_to_wick == "right_to_left";
  const bool apply_orientation_flip =
      assay_orientation_flip != options.flip_orientation;
  if (apply_orientation_flip) {
    cv::rotate(strip_rgb, strip_rgb, cv::ROTATE_180);
  }
  if (assay_orientation_flip) {
    addReason(result, "orientation_normalized_from_assay");
  }
  if (options.flip_orientation) {
    addReason(result, "orientation_flipped_by_user");
  }
  result.timings_ms["rectification"] = elapsedMs(rectification_start);

  const auto correction_start = Clock::now();
  result.quality.blur_variance = blurVariance(strip_rgb);
  result.artifact_mask = artifactMask(strip_rgb, result.quality.clipped_fraction,
                                      result.quality.glare_fraction);
  cv::Mat measurement_invalid_mask = result.artifact_mask.clone();
  const cv::Rect material_roi = pixelRect(assay.membrane_roi, strip_rgb.size());
  const auto meanColumnRange = [&](int first_column, int last_column) {
    cv::Vec3d sum(0.0, 0.0, 0.0);
    size_t count = 0;
    for (int column = std::clamp(first_column, material_roi.x,
                                 material_roi.x + material_roi.width);
         column < std::clamp(last_column, material_roi.x,
                             material_roi.x + material_roi.width);
         column += 2) {
      for (int row = material_roi.y;
           row < material_roi.y + material_roi.height; row += 2) {
        const cv::Vec3b pixel = strip_rgb.at<cv::Vec3b>(row, column);
        sum += cv::Vec3d(pixel[0], pixel[1], pixel[2]);
        ++count;
      }
    }
    if (count == 0) {
      return cv::Vec3d(1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0);
    }
    sum *= 1.0 / count;
    return sum * (1.0 / std::max(1.0, sum[0] + sum[1] + sum[2]));
  };
  const cv::Vec3d reference_chromaticity = meanColumnRange(
      material_roi.x + static_cast<int>(0.55 * material_roi.width),
      material_roi.x + static_cast<int>(0.75 * material_roi.width));
  for (int column = material_roi.x;
       column < material_roi.x + material_roi.width; ++column) {
    const double normalized_x =
        (column - material_roi.x + 0.5) / material_roi.width;
    if ((normalized_x >= 0.25 && normalized_x <= 0.75) ||
        inLineWindow(normalized_x, assay)) {
      continue;
    }
    const cv::Vec3d column_chromaticity = meanColumnRange(column, column + 1);
    // Compare chromaticity to the strip's own central membrane, making handle
    // masking invariant to a global warm/cool camera cast.
    if (cv::norm(column_chromaticity - reference_chromaticity) > 0.12) {
      measurement_invalid_mask.col(column).setTo(255);
    }
  }
  double illumination_span = 1.0;
  cv::Mat corrected_linear;
  if (tile_correction) {
    const cv::Mat globally_corrected =
        applyCardCorrection(toLinear(strip_rgb), *tile_correction);
    corrected_linear = correctSpatialLinear(
        globally_corrected, assay, measurement_invalid_mask, illumination_span,
        false);
  } else {
    corrected_linear = correctBare(strip_rgb, assay, measurement_invalid_mask,
                                   illumination_span);
  }
  result.rectified_rgb = toSrgb8(corrected_linear);
  result.timings_ms["color_and_artifacts"] = elapsedMs(correction_start);

  const auto profile_start = Clock::now();
  const cv::Rect membrane = pixelRect(assay.membrane_roi, corrected_linear.size());
  const int aggregate_margin = static_cast<int>(std::round(membrane.height * 0.15));
  const int row_start = membrane.y + aggregate_margin;
  const int row_end = membrane.y + membrane.height - aggregate_margin;
  size_t valid_pixels = 0;
  size_t candidate_pixels = 0;
  result.x.reserve(membrane.width);
  result.raw_profile.reserve(membrane.width);
  std::vector<unsigned char> profile_valid;
  profile_valid.reserve(membrane.width);
  for (int offset = 0; offset < membrane.width; ++offset) {
    const int column = membrane.x + offset;
    std::vector<double> responses;
    responses.reserve(row_end - row_start);
    for (int row = row_start; row < row_end; ++row) {
      ++candidate_pixels;
      if (measurement_invalid_mask.at<unsigned char>(row, column)) {
        continue;
      }
      const cv::Vec3f pixel = corrected_linear.at<cv::Vec3f>(row, column);
      responses.push_back(std::log((pixel[0] + 1.0e-4F) /
                                   (pixel[1] + 1.0e-4F)));
      ++valid_pixels;
    }
    double value = 0.0;
    if (!responses.empty()) {
      std::sort(responses.begin(), responses.end());
      const size_t trim = responses.size() / 10;
      const size_t begin = std::min(trim, responses.size() - 1);
      const size_t end = std::max(begin + 1, responses.size() - trim);
      value = std::accumulate(responses.begin() + begin,
                              responses.begin() + end, 0.0) /
              (end - begin);
    } else if (!result.raw_profile.empty()) {
      value = result.raw_profile.back();
    }
    profile_valid.push_back(responses.empty() ? 0 : 1);
    result.x.push_back((offset + 0.5) / membrane.width);
    result.raw_profile.push_back(value);
  }
  const auto first_valid =
      std::find(profile_valid.begin(), profile_valid.end(), 1);
  if (first_valid != profile_valid.end()) {
    const size_t first_index =
        static_cast<size_t>(std::distance(profile_valid.begin(), first_valid));
    std::fill(result.raw_profile.begin(),
              result.raw_profile.begin() + first_index,
              result.raw_profile[first_index]);
  }
  result.quality.valid_fraction =
      candidate_pixels == 0 ? 0.0 : valid_pixels / static_cast<double>(candidate_pixels);
  result.baseline_profile =
      fitHuberBaseline(result.x, result.raw_profile, assay, profile_valid);
  std::vector<double> baseline_corrected(result.raw_profile.size());
  for (size_t index = 0; index < baseline_corrected.size(); ++index) {
    baseline_corrected[index] =
        result.raw_profile[index] - result.baseline_profile[index];
  }
  const double sigma = std::max(0.7, assay.expected_line_width * membrane.width / 2.355);
  result.corrected_profile = gaussianSmooth(baseline_corrected, sigma);

  std::vector<double> background;
  for (size_t index = 0; index < result.x.size(); ++index) {
    if (profile_valid[index] && !inLineWindow(result.x[index], assay)) {
      background.push_back(result.corrected_profile[index]);
    }
  }
  result.quality.background_noise = robustNoise(background);
  const std::vector<PeakMetrics> configured_line_peaks = credibleLinePeaks(
      result.x, result.corrected_profile, assay,
      result.quality.background_noise, configuredLineSearchWindow(assay));
  bool ambiguous_extra_line_peak = configured_line_peaks.size() > 2;
  result.control_peak = selectLinePeak(
      result.x, result.corrected_profile, assay.control_window,
      result.quality.background_noise, assay.integration_half_width,
      assay.expected_line_width);
  result.control_peak.detected =
      result.control_peak.snr >= assay.quality.min_control_snr &&
      result.control_peak.area >= assay.quality.min_control_area &&
      result.control_peak.height > 0.0 &&
      result.control_peak.fwhm >= 0.45 * assay.expected_line_width &&
      result.control_peak.fwhm <= 3.0 * assay.expected_line_width;
  bool ordered_pair_recovered = false;
  bool inner_region_recovery = false;
  std::optional<OrderedPeakPair> pair =
      recoverOrderedPeakPair(configured_line_peaks, assay);
  if (partial_handled_strip ||
      (assay.id == "handled-paper-two-line-strip" && !pair &&
       !result.control_peak.detected)) {
    const std::vector<PeakMetrics> inner_region_peaks = credibleLinePeaks(
        result.x, result.corrected_profile, assay,
        result.quality.background_noise, {0.03, 0.0, 0.92, 1.0});
    pair = recoverPartialStripPeakPair(inner_region_peaks, assay);
    inner_region_recovery = pair.has_value();
    if (inner_region_recovery) {
      // The inner-region selector already requires a unique winner with a
      // margin over the runner-up, so unrelated handle marks do not make the
      // accepted pair ambiguous.
      ambiguous_extra_line_peak = false;
    }
  }
  if (pair) {
    const bool selected_control_disagrees =
        !result.control_peak.detected ||
        std::abs(result.control_peak.position - pair->control.position) >
            0.5 * assay.expected_line_width;
    if (selected_control_disagrees) {
      result.test_peak = pair->test;
      result.control_peak = pair->control;
      result.quality.peak_pair_confidence = pair->confidence;
      addReason(result,
                inner_region_recovery
                    ? (partial_handled_strip
                           ? "partial_strip_peak_pair_recovered"
                           : "inner_measurement_region_peak_pair_recovered")
                    : "ordered_peak_pair_recovered");
      ordered_pair_recovered = true;
    }
  }
  if (!ordered_pair_recovered) {
    const double control_center =
        0.5 * (assay.control_window.x0 + assay.control_window.x1);
    const double test_center =
        0.5 * (assay.test_window.x0 + assay.test_window.x1);
    const double predicted_test =
        std::clamp(test_center + result.control_peak.position - control_center,
                   assay.test_window.x0, assay.test_window.x1);
    // Keep a real search around the control-relative expected location. The
    // wider configured window absorbs manufacturing/placement variation, while
    // this narrower gate prevents a remote stain or second peak from replacing
    // the assay-defined test line.
    const double test_search_half_width =
        std::max(1.5 * assay.expected_line_width,
                 assay.integration_half_width);
    NormalizedRect test_search_window = assay.test_window;
    test_search_window.x0 =
        std::max(assay.test_window.x0, predicted_test - test_search_half_width);
    test_search_window.x1 =
        std::min(assay.test_window.x1, predicted_test + test_search_half_width);
    const PeakMetrics test_candidate = selectLinePeak(
        result.x, result.corrected_profile, test_search_window,
        result.quality.background_noise, assay.integration_half_width,
        assay.expected_line_width);
    // Once selected, compute prominence against the complete configured assay
    // window so a narrow search gate does not inflate ordinary-noise SNR.
    PeakMetrics searched_test = measurePeak(
        result.x, result.corrected_profile, assay.test_window,
        result.quality.background_noise, assay.integration_half_width,
        test_candidate.position);
    if (searched_test.snr >= assay.quality.min_test_snr &&
        searched_test.height > 0.0) {
      searched_test.detected = true;
      result.test_peak = searched_test;
    } else {
      result.test_peak = measurePeak(
          result.x, result.corrected_profile, assay.test_window,
          result.quality.background_noise, assay.integration_half_width,
          predicted_test);
      result.test_peak.detected = false;
    }
  }
  auto draw_peak_marker = [&](const PeakMetrics& peak, const char* label,
                              const cv::Scalar& color) {
    const int position = membrane.x +
                         cvRound(peak.position * membrane.width);
    cv::line(result.rectified_rgb, cv::Point(position, membrane.y),
             cv::Point(position, membrane.y + membrane.height - 1), color,
             peak.detected ? 2 : 1, cv::LINE_AA);
    cv::putText(result.rectified_rgb, label,
                cv::Point(position + 4, membrane.y + 18),
                cv::FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv::LINE_AA);
  };
  draw_peak_marker(result.control_peak, "C", cv::Scalar(24, 150, 125));
  draw_peak_marker(result.test_peak, result.test_peak.detected ? "T" : "T?",
                   cv::Scalar(220, 72, 105));
  double measurement_x0 =
      std::min(assay.control_window.x0, assay.test_window.x0);
  double measurement_x1 =
      std::max(assay.control_window.x1, assay.test_window.x1);
  if (inner_region_recovery && ordered_pair_recovered) {
    const double first_position =
        std::min(result.control_peak.position, result.test_peak.position);
    const double last_position =
        std::max(result.control_peak.position, result.test_peak.position);
    const double pair_span = last_position - first_position;
    measurement_x0 = std::max(0.0, first_position - 0.65 * pair_span);
    measurement_x1 = std::min(1.0, last_position + 0.65 * pair_span);
  } else if (result.control_peak.detected) {
    // Preserve the configured C/T box width, but follow an observed control
    // shift so C-only strips show the same region used to predict T.
    const double control_center =
        0.5 * (assay.control_window.x0 + assay.control_window.x1);
    const double box_width = measurement_x1 - measurement_x0;
    measurement_x0 = std::clamp(
        measurement_x0 + result.control_peak.position - control_center, 0.0,
        1.0 - box_width);
    measurement_x1 = measurement_x0 + box_width;
  }
  const int inner_x0 = membrane.x +
                       cvRound(measurement_x0 * membrane.width);
  const int inner_x1 = membrane.x +
                       cvRound(measurement_x1 * membrane.width);
  cv::rectangle(result.rectified_rgb,
                cv::Rect(inner_x0, membrane.y,
                         std::max(1, inner_x1 - inner_x0), membrane.height),
                cv::Scalar(245, 185, 35), 2, cv::LINE_AA);

  std::vector<cv::Point2f> rectified_inner = {
      cv::Point2f(static_cast<float>(inner_x0),
                  static_cast<float>(membrane.y)),
      cv::Point2f(static_cast<float>(inner_x1),
                  static_cast<float>(membrane.y)),
      cv::Point2f(static_cast<float>(inner_x1),
                  static_cast<float>(membrane.y + membrane.height - 1)),
      cv::Point2f(static_cast<float>(inner_x0),
                  static_cast<float>(membrane.y + membrane.height - 1))};
  if (apply_orientation_flip) {
    for (cv::Point2f& point : rectified_inner) {
      point.x = static_cast<float>(strip_rgb.cols - 1) - point.x;
      point.y = static_cast<float>(strip_rgb.rows - 1) - point.y;
    }
  }
  cv::Mat inverse_homography;
  if (cv::invert(result.geometry.homography, inverse_homography)) {
    std::vector<cv::Point2f> source_inner;
    cv::perspectiveTransform(rectified_inner, source_inner,
                             inverse_homography);
    if (source_inner.size() == 4) {
      const Quad inner_quad = {source_inner[0], source_inner[1],
                               source_inner[2], source_inner[3]};
      annotate(result.annotated_rgb, inner_quad, "C/T measurement",
               cv::Scalar(245, 185, 35));
    }
  }
  result.timings_ms["profile_and_peaks"] = elapsedMs(profile_start);

  bool invalid = false;
  bool review = false;
    if (partial_handled_strip) {
      addReason(result, "strip_endpoints_out_of_frame");
      review = true;
    }
    const double perspective_ratio = localization.perspective_scale_ratio;
    if (localization.confidence < 0.45) {
      addReason(result, "geometry_unreliable");
      invalid = true;
    } else if (localization.confidence < 0.65) {
      addReason(result, "check_detected_corners");
      review = true;
    }
    if (result.quality.quad_area_fraction < assay.quality.min_quad_area_fraction &&
        !result.geometry.manually_corrected) {
      // Framing scale is useful while guiding the live camera, but it must not
      // turn an otherwise analyzable capture into a failed result. The
      // remaining shared quality checks still reject unreliable measurements.
      addReason(result, "move_closer");
    }
    if (!result.geometry.manually_corrected &&
        localization.edge_support_fraction < 0.40) {
      addReason(result, "geometry_edge_support_insufficient");
      invalid = true;
    } else if (!result.geometry.manually_corrected &&
               localization.edge_support_fraction < 0.55) {
      addReason(result, "check_detected_corners");
      review = true;
    }
    if (!result.geometry.manually_corrected &&
        localization.rectification_rmse_px > 5.0) {
      addReason(result, "degenerate_projective_geometry");
      invalid = true;
    } else if (!result.geometry.manually_corrected &&
               localization.rectification_rmse_px > 3.0) {
      addReason(result, "check_detected_corners");
      review = true;
    }
    if (perspective_ratio > 4.0) {
      addReason(result, "degenerate_projective_geometry");
      invalid = true;
    } else if (perspective_ratio > 2.5) {
      addReason(result, "retake_more_overhead");
      review = true;
    }
    if (source_strip_height < 60.0) {
      // Keep this as live-camera guidance only. It is not a result validity
      // signal: control detection, confidence, blur, and the other shared
      // quality checks decide whether this frame is reportable.
      addReason(result, "move_closer");
    }
    if (result.quality.blur_variance < assay.quality.min_blur_variance * 0.5) {
      addReason(result, "image_too_blurry");
      invalid = true;
    } else if (result.quality.blur_variance < assay.quality.min_blur_variance) {
      addReason(result, "hold_camera_steady");
      review = true;
    }
    if (result.quality.valid_fraction < assay.quality.min_valid_fraction) {
      addReason(result, "insufficient_valid_membrane_pixels");
      invalid = true;
    }
    if (result.quality.clipped_fraction > assay.quality.max_clipped_fraction * 2.0) {
      addReason(result, "exposure_clipping");
      invalid = true;
    } else if (result.quality.clipped_fraction > assay.quality.max_clipped_fraction) {
      addReason(result, "adjust_exposure");
      review = true;
    }
    const double control_roi_x0 =
        partial_handled_strip && result.control_peak.detected
            ? std::max(0.0, result.control_peak.position -
                                assay.integration_half_width)
            : assay.control_window.x0;
    const double control_roi_x1 =
        partial_handled_strip && result.control_peak.detected
            ? std::min(1.0, result.control_peak.position +
                                assay.integration_half_width)
            : assay.control_window.x1;
    const cv::Rect control_roi(
        membrane.x + static_cast<int>(control_roi_x0 * membrane.width),
        row_start,
        std::max(1, static_cast<int>((control_roi_x1 - control_roi_x0) *
                                     membrane.width)),
        std::max(1, row_end - row_start));
    if (maskedFraction(result.artifact_mask,
                       control_roi & cv::Rect(0, 0, strip_rgb.cols, strip_rgb.rows)) >
        assay.quality.max_glare_fraction) {
      addReason(result, "glare_crosses_control_line");
      review = true;
    } else if (result.quality.glare_fraction > assay.quality.max_glare_fraction) {
      addReason(result, "reduce_glare");
      review = true;
    }
    if (illumination_span > 2.0) {
      addReason(result, "broad_shadow_or_illumination_gradient");
      review = true;
    }
    const bool broad_control =
        result.control_peak.fwhm > assay.expected_line_width * 3.5;
    const bool broad_test = result.test_peak.detected &&
                            result.test_peak.fwhm >
                                assay.expected_line_width * 3.5;
    const double broad_threshold =
        std::max(0.04, 6.0 * result.quality.background_noise);
    const size_t broad_samples = static_cast<size_t>(std::count_if(
        result.corrected_profile.begin(), result.corrected_profile.end(),
        [broad_threshold](double value) { return value > broad_threshold; }));
    const double broad_fraction =
        result.corrected_profile.empty()
            ? 0.0
            : broad_samples / static_cast<double>(result.corrected_profile.size());
    if (broad_control || broad_test || broad_fraction > 0.18) {
      addReason(result, "broad_stain_or_smeared_line");
      review = true;
    }
    if (ambiguous_extra_line_peak) {
      addReason(result, "ambiguous_extra_line_peak");
      review = true;
    }
    if (tile_found && options.card_profile && options.card_profile->enrolled &&
        result.quality.calibration_residual >
            std::min(options.card_profile->max_holdout_residual,
                     assay.quality.max_calibration_residual)) {
      addReason(result, "color_calibration_validation_failed");
      review = true;
    }
    if (!result.control_peak.detected) {
      addReason(result, "control_not_detected");
      invalid = true;
    }

  if (invalid) {
    result.status = "invalid";
  } else if (review) {
    result.status = "review";
  } else {
    result.status = "valid";
  }

  if (result.status == "valid") {
    if (result.control_peak.area > assay.quality.min_control_area) {
      result.signal_ratio = result.test_peak.detected
                                ? result.test_peak.area / result.control_peak.area
                                : 0.0;
      if (result.cutoff) {
        result.classification = *result.signal_ratio >= *result.cutoff ? "POS" : "NEG";
      }
    } else {
      addReason(result, "control_denominator_too_small");
      result.status = "invalid";
    }
  }
  result.timings_ms["total"] = elapsedMs(total_start);
  return result;
}

}  // namespace stripcv
