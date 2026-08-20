#include "transverse_width_scorer.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <numeric>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>
#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif

#include "transverse_width_model.generated.hpp"

namespace stripcv::internal {
namespace {

using json = nlohmann::json;

constexpr int kFieldSize = 64;
constexpr int kFeatureCount = 20;
constexpr int kExtentFeatureCount = 173;
constexpr std::array<int, 5> kStatisticIndices = {0, 6, 10, 11, 12};
constexpr std::array<int, 5> kMeasurementIndices = {18, 19, 15, 16, 17};
constexpr std::array<int, 5> kContinuationIndices = {10, 11, 12, 13, 14};
constexpr std::array<int, 4> kHandleRows = {0, 4, 8, 12};
constexpr std::array<int, 4> kWickRows = {51, 55, 59, 63};

struct RidgeModel {
  double intercept = 0.0;
  std::vector<double> coefficients;
  std::vector<double> mean;
  std::vector<double> scale;
};

struct RuntimePolicy {
  RidgeModel extent;
  std::vector<int> feature_indices;
  std::array<double, 2> part_boundaries{};
  std::array<int, 3> correction{};
  int base_hypotheses = 0;
  int corrected_base_hypotheses = 0;
  std::string policy_id;
  bool valid = false;
};

struct FeatureField {
  std::array<std::array<cv::Mat, kFeatureCount>, 2> channels;
};

struct OrientedInput {
  cv::Mat rgb;
  Quad anchor{};
  cv::Size original_size;
  bool rotated_clockwise = false;
};

RidgeModel parseRidge(const json& value) {
  RidgeModel model;
  model.intercept = value.at("intercept").get<double>();
  model.coefficients = value.at("coefficients").get<std::vector<double>>();
  model.mean = value.at("mean").get<std::vector<double>>();
  model.scale = value.at("scale").get<std::vector<double>>();
  if (model.coefficients.empty() ||
      model.mean.size() != model.coefficients.size() ||
      model.scale.size() != model.coefficients.size() ||
      !std::isfinite(model.intercept)) {
    throw std::runtime_error("invalid transverse-width ridge model");
  }
  for (size_t index = 0; index < model.coefficients.size(); ++index) {
    if (!std::isfinite(model.coefficients[index]) ||
        !std::isfinite(model.mean[index]) ||
        !std::isfinite(model.scale[index]) || model.scale[index] <= 0.0) {
      throw std::runtime_error("non-finite transverse-width ridge model");
    }
  }
  return model;
}

RuntimePolicy parsePolicy() {
  RuntimePolicy policy;
  try {
    const json artifact = json::parse(kTransverseWidthModelJson);
    if (artifact.at("schema_version") != "1.0" ||
        artifact.at("policy_id") !=
            "transverse-width-p1-base1-correct-s16-top-4") {
      return policy;
    }
    policy.policy_id = artifact.at("policy_id").get<std::string>();
    policy.extent = parseRidge(
        artifact.at("models").at("endpoint_extent"));
    const json& configuration = artifact.at("policy");
    policy.feature_indices =
        configuration.at("extent_feature_indices").get<std::vector<int>>();
    const std::vector<double> boundaries =
        configuration.at("part_boundaries").get<std::vector<double>>();
    const std::vector<std::vector<int>> corrections =
        configuration.at("correction_patterns")
            .get<std::vector<std::vector<int>>>();
    policy.base_hypotheses =
        configuration.at("base_hypotheses_per_parent").get<int>();
    policy.corrected_base_hypotheses =
        configuration.at("corrected_base_hypotheses").get<int>();
    if (policy.feature_indices.empty() ||
        policy.extent.coefficients.size() != policy.feature_indices.size() ||
        boundaries.size() != 2 || corrections.size() != 1 ||
        corrections.front().size() != 3 ||
        policy.base_hypotheses != 3 ||
        policy.corrected_base_hypotheses != 1 ||
        configuration.at("feature_backend") != "prefix" ||
        configuration.at("extent_normalization") != "parent_standardized") {
      return RuntimePolicy{};
    }
    for (size_t index = 0; index < 2; ++index) {
      policy.part_boundaries[index] = boundaries[index];
    }
    for (size_t index = 0; index < 3; ++index) {
      policy.correction[index] = corrections.front()[index];
    }
    if (!(policy.part_boundaries[0] > 0.25 &&
          policy.part_boundaries[0] < policy.part_boundaries[1] &&
          policy.part_boundaries[1] < 0.80) ||
        policy.correction != std::array<int, 3>{-1, 2, 2} ||
        std::any_of(policy.feature_indices.begin(),
                    policy.feature_indices.end(), [](int index) {
                      return index < 0 || index >= kExtentFeatureCount;
                    })) {
      return RuntimePolicy{};
    }
    policy.valid = true;
  } catch (const std::exception&) {
    return RuntimePolicy{};
  }
  return policy;
}

const RuntimePolicy& runtimePolicy() {
  static const RuntimePolicy policy = parsePolicy();
  return policy;
}

cv::Mat horizontalSample(const cv::Mat& field, int distance, bool left) {
  cv::Mat padded;
  cv::copyMakeBorder(field, padded, 0, 0, distance, distance,
                     cv::BORDER_REPLICATE);
  return padded(cv::Rect(left ? 0 : 2 * distance, 0, field.cols,
                         field.rows))
      .clone();
}

FeatureField buildFeatureField(const cv::Mat& rgb) {
  if (rgb.empty() || rgb.type() != CV_8UC3) {
    throw std::invalid_argument("invalid transverse-width image");
  }
  cv::Mat resized;
  cv::resize(rgb, resized, cv::Size(kFieldSize, kFieldSize), 0.0, 0.0,
             cv::INTER_AREA);
  cv::Mat float_rgb;
  resized.convertTo(float_rgb, CV_32FC3, 1.0 / 255.0);
  std::vector<cv::Mat> rgb_channels;
  cv::split(float_rgb, rgb_channels);
  cv::Mat luma = 0.2126F * rgb_channels[0] +
                 0.7152F * rgb_channels[1] +
                 0.0722F * rgb_channels[2];

  cv::Mat lab;
  cv::cvtColor(float_rgb, lab, cv::COLOR_RGB2Lab);
  std::vector<cv::Mat> lab_channels;
  cv::split(lab, lab_channels);

  std::array<cv::Mat, 4> signed_luma;
  std::array<cv::Mat, 4> color_distance;
  std::array<std::array<cv::Mat, 3>, 4> left_rgb;
  std::array<std::array<cv::Mat, 3>, 4> right_rgb;
  for (int distance = 1; distance <= 3; ++distance) {
    cv::Mat squared = cv::Mat::zeros(luma.size(), CV_32F);
    signed_luma[distance] = cv::Mat::zeros(luma.size(), CV_32F);
    for (int channel = 0; channel < 3; ++channel) {
      left_rgb[distance][channel] =
          horizontalSample(rgb_channels[channel], distance, true);
      right_rgb[distance][channel] =
          horizontalSample(rgb_channels[channel], distance, false);
      const cv::Mat difference = left_rgb[distance][channel] -
                                 right_rgb[distance][channel];
      const float weight = channel == 0 ? 0.2126F
                           : channel == 1 ? 0.7152F
                                          : 0.0722F;
      signed_luma[distance] += weight * difference;
      squared += difference.mul(difference);
    }
    cv::sqrt(squared, color_distance[distance]);
  }

  const cv::Mat lab_a_left = horizontalSample(lab_channels[1], 2, true);
  const cv::Mat lab_a_right = horizontalSample(lab_channels[1], 2, false);
  const cv::Mat lab_b_left = horizontalSample(lab_channels[2], 2, true);
  const cv::Mat lab_b_right = horizontalSample(lab_channels[2], 2, false);
  cv::Mat chroma_squared =
      (lab_a_left - lab_a_right).mul(lab_a_left - lab_a_right) +
      (lab_b_left - lab_b_right).mul(lab_b_left - lab_b_right);
  cv::Mat chroma_distance;
  cv::sqrt(chroma_squared, chroma_distance);
  chroma_distance *= 1.0F / 128.0F;

  cv::Mat long_signed;
  cv::Mat long_color;
  cv::blur(signed_luma[2], long_signed, cv::Size(1, 9),
           cv::Point(-1, -1), cv::BORDER_REFLECT_101);
  cv::blur(color_distance[2], long_color, cv::Size(1, 9),
           cv::Point(-1, -1), cv::BORDER_REFLECT_101);
  cv::Mat sobel_x;
  cv::Mat sobel_y;
  cv::Sobel(luma, sobel_x, CV_32F, 1, 0, 3);
  cv::Sobel(luma, sobel_y, CV_32F, 0, 1, 3);
  cv::Mat absolute_x;
  cv::Mat absolute_y;
  cv::absdiff(sobel_x, cv::Scalar(0), absolute_x);
  cv::absdiff(sobel_y, cv::Scalar(0), absolute_y);
  cv::blur(absolute_x, absolute_x, cv::Size(1, 9), cv::Point(-1, -1),
           cv::BORDER_REFLECT_101);
  cv::blur(absolute_y, absolute_y, cv::Size(1, 9), cv::Point(-1, -1),
           cv::BORDER_REFLECT_101);
  cv::Mat denominator = absolute_y + 0.05F;
  cv::Mat vertical_coherence;
  cv::divide(absolute_x, denominator, vertical_coherence);

  cv::Mat interior_luma = 0.2126F * left_rgb[2][0] +
                          0.7152F * left_rgb[2][1] +
                          0.0722F * left_rgb[2][2];
  cv::Mat exterior_luma = 0.2126F * right_rgb[2][0] +
                          0.7152F * right_rgb[2][1] +
                          0.0722F * right_rgb[2][2];
  cv::Mat maximum_rgb;
  cv::Mat minimum_rgb;
  cv::max(rgb_channels[0], rgb_channels[1], maximum_rgb);
  cv::max(maximum_rgb, rgb_channels[2], maximum_rgb);
  cv::min(rgb_channels[0], rgb_channels[1], minimum_rgb);
  cv::min(minimum_rgb, rgb_channels[2], minimum_rgb);

  FeatureField output;
  auto& right = output.channels[0];
  right = {signed_luma[1], signed_luma[2], signed_luma[3],
           left_rgb[2][0] - right_rgb[2][0],
           left_rgb[2][1] - right_rgb[2][1],
           left_rgb[2][2] - right_rgb[2][2], color_distance[1],
           color_distance[2], color_distance[3], chroma_distance,
           long_signed, long_color, vertical_coherence, interior_luma,
           exterior_luma, rgb_channels[0], rgb_channels[1], rgb_channels[2],
           luma, maximum_rgb - minimum_rgb};
  auto& left = output.channels[1];
  for (int feature = 0; feature < kFeatureCount; ++feature) {
    left[feature] = right[feature].clone();
  }
  for (int feature = 0; feature < 6; ++feature) {
    left[feature] *= -1.0F;
  }
  left[10] *= -1.0F;
  std::swap(left[13], left[14]);
  return output;
}

double quantile(std::vector<double> values, double probability) {
  if (values.empty()) {
    return 0.0;
  }
  std::sort(values.begin(), values.end());
  const double position = probability * (values.size() - 1);
  const size_t lower = static_cast<size_t>(std::floor(position));
  const size_t upper = static_cast<size_t>(std::ceil(position));
  const double weight = position - lower;
  return values[lower] * (1.0 - weight) + values[upper] * weight;
}

float valueAt(const FeatureField& field, int channel, int feature, int y,
              int x) {
  return field.channels[static_cast<size_t>(channel)]
                       [static_cast<size_t>(feature)]
                           .at<float>(y, x);
}

cv::Point2f pointAtY(const cv::Point2f& first, const cv::Point2f& second,
                     double y) {
  const double denominator = second.y - first.y;
  if (std::abs(denominator) < 1.0e-8) {
    throw std::runtime_error("degenerate transverse-width rail");
  }
  const double fraction = (y - first.y) / denominator;
  return cv::Point2f(
      static_cast<float>(first.x + fraction * (second.x - first.x)),
      static_cast<float>(y));
}

std::vector<Quad> extentLattice(const Quad& anchor) {
  if (anchor[1].y - anchor[0].y <= 1.0e-6F ||
      anchor[2].y - anchor[3].y <= 1.0e-6F) {
    return {};
  }
  std::vector<Quad> output;
  output.reserve(16);
  for (const int handle_row : kHandleRows) {
    for (const int wick_row : kWickRows) {
      const double handle_y = handle_row / 63.0;
      const double wick_y = wick_row / 63.0;
      output.push_back({pointAtY(anchor[0], anchor[1], handle_y),
                        pointAtY(anchor[0], anchor[1], wick_y),
                        pointAtY(anchor[3], anchor[2], wick_y),
                        pointAtY(anchor[3], anchor[2], handle_y)});
    }
  }
  return output;
}

std::array<int, 64> railX(const cv::Point2f& first,
                          const cv::Point2f& second) {
  std::array<int, 64> output{};
  for (int y = 0; y < 64; ++y) {
    output[static_cast<size_t>(y)] = std::clamp(
        static_cast<int>(std::nearbyint(
            first.x * 63.0 + y * (second.x - first.x))),
        0, 63);
  }
  return output;
}

std::vector<double> extentFeatureVector(
    const FeatureField& field, const Quad& candidate, const Quad& full_quad,
    const Quad& anchor,
    const std::array<double, 2>& part_boundaries) {
  const std::array<int, 64> right_x = railX(full_quad[0], full_quad[1]);
  const std::array<int, 64> left_x = railX(full_quad[3], full_quad[2]);
  const int handle_row = std::clamp(
      static_cast<int>(std::nearbyint(candidate[0].y * 63.0)), 0, 63);
  const int wick_row = std::clamp(
      static_cast<int>(std::nearbyint(candidate[1].y * 63.0)), 0, 63);
  if (wick_row - handle_row < 20) {
    throw std::runtime_error("short transverse-width endpoint candidate");
  }
  std::vector<double> vector;
  vector.reserve(kExtentFeatureCount);

  std::array<std::array<double, kFeatureCount>, 2> rail_means{};
  for (int channel = 0; channel < 2; ++channel) {
    const auto& x = channel == 0 ? right_x : left_x;
    for (int feature = 0; feature < kFeatureCount; ++feature) {
      double sum = 0.0;
      for (int y = handle_row; y <= wick_row; ++y) {
        sum += valueAt(field, channel, feature, y,
                       x[static_cast<size_t>(y)]);
      }
      rail_means[static_cast<size_t>(channel)]
                [static_cast<size_t>(feature)] =
          sum / (wick_row - handle_row + 1);
      vector.push_back(rail_means[static_cast<size_t>(channel)]
                                  [static_cast<size_t>(feature)]);
    }
  }
  for (int channel = 0; channel < 2; ++channel) {
    const auto& x = channel == 0 ? right_x : left_x;
    for (const int feature : kStatisticIndices) {
      std::vector<double> values;
      values.reserve(static_cast<size_t>(wick_row - handle_row + 1));
      for (int y = handle_row; y <= wick_row; ++y) {
        values.push_back(valueAt(field, channel, feature, y,
                                 x[static_cast<size_t>(y)]));
      }
      vector.push_back(quantile(values, 0.10));
      vector.push_back(quantile(values, 0.50));
      vector.push_back(quantile(values, 0.90));
    }
  }
  vector.push_back(std::min(rail_means[0][10], rail_means[1][10]));
  vector.push_back(std::min(rail_means[0][11], rail_means[1][11]));
  vector.push_back(-std::abs(rail_means[0][10] - rail_means[1][10]));
  vector.push_back(-std::abs(rail_means[0][11] - rail_means[1][11]));

  const int length = wick_row - handle_row;
  const int handle_stop = std::clamp(
      static_cast<int>(std::ceil(
          handle_row + part_boundaries[0] * length)),
      handle_row + 1, wick_row - 1);
  const int wick_begin = std::clamp(
      static_cast<int>(std::ceil(
          handle_row + part_boundaries[1] * length)),
      handle_stop + 1, wick_row);
  std::array<std::array<double, 5>, 3> region_means{};
  const std::array<std::pair<int, int>, 3> regions = {
      std::pair<int, int>{handle_row, handle_stop},
      std::pair<int, int>{handle_stop, wick_begin},
      std::pair<int, int>{wick_begin, wick_row + 1}};
  for (size_t region = 0; region < regions.size(); ++region) {
    const auto [start, stop] = regions[region];
    std::array<double, 5> sums{};
    std::array<double, 5> squares{};
    size_t count = 0;
    for (int y = start; y < stop; ++y) {
      const int x0 = std::min(left_x[static_cast<size_t>(y)],
                              right_x[static_cast<size_t>(y)]);
      const int x1 = std::max(left_x[static_cast<size_t>(y)],
                              right_x[static_cast<size_t>(y)]);
      for (int x = x0; x <= x1; ++x) {
        ++count;
        for (size_t measurement = 0;
             measurement < kMeasurementIndices.size(); ++measurement) {
          const double value = valueAt(
              field, 0, kMeasurementIndices[measurement], y, x);
          sums[measurement] += value;
          squares[measurement] += value * value;
        }
      }
    }
    for (size_t measurement = 0;
         measurement < kMeasurementIndices.size(); ++measurement) {
      const double mean = sums[measurement] / std::max<size_t>(1, count);
      const double variance = std::max(
          0.0, squares[measurement] / std::max<size_t>(1, count) -
                   mean * mean);
      region_means[region][measurement] = mean;
      vector.push_back(mean);
      vector.push_back(std::sqrt(variance));
    }
  }
  vector.push_back(region_means[0][0] - region_means[1][0]);
  vector.push_back(region_means[1][0] - region_means[2][0]);
  vector.push_back(region_means[0][1] - region_means[1][1]);
  vector.push_back(region_means[1][1] - region_means[2][1]);

  for (int channel = 0; channel < 2; ++channel) {
    const auto& x = channel == 0 ? right_x : left_x;
    const std::array<std::pair<int, int>, 4> windows = {
        std::pair<int, int>{handle_row - 4, handle_row},
        std::pair<int, int>{handle_row, handle_row + 4},
        std::pair<int, int>{wick_row - 3, wick_row + 1},
        std::pair<int, int>{wick_row + 1, wick_row + 5}};
    for (const auto [raw_start, raw_stop] : windows) {
      const int start = std::clamp(raw_start, 0, 64);
      const int stop = std::clamp(raw_stop, 0, 64);
      const int count = std::max(0, stop - start);
      for (const int feature : kContinuationIndices) {
        double sum = 0.0;
        for (int y = start; y < stop; ++y) {
          sum += valueAt(field, channel, feature, y,
                         x[static_cast<size_t>(y)]);
        }
        vector.push_back(count == 0 ? 0.0 : sum / count);
      }
      vector.push_back(count / 4.0);
    }
  }

  const double normalized_handle = handle_row / 63.0;
  const double normalized_wick = wick_row / 63.0;
  vector.insert(vector.end(),
                {normalized_handle, normalized_wick,
                 normalized_wick - normalized_handle,
                 normalized_handle - anchor[0].y,
                 normalized_wick - anchor[1].y,
                 std::abs(normalized_handle - anchor[0].y),
                 std::abs(normalized_wick - anchor[1].y),
                 anchor[0].y, anchor[1].y});
  for (const int row : kHandleRows) {
    vector.push_back(row == handle_row ? 1.0 : 0.0);
  }
  for (const int row : kWickRows) {
    vector.push_back(row == wick_row ? 1.0 : 0.0);
  }
  if (vector.size() != kExtentFeatureCount) {
    throw std::runtime_error("transverse-width feature contract mismatch");
  }
  return vector;
}

double ridgeScore(const std::vector<double>& features,
                  const RidgeModel& model) {
  if (features.size() != model.coefficients.size()) {
    throw std::runtime_error("transverse-width ridge input mismatch");
  }
  double score = model.intercept;
  for (size_t index = 0; index < features.size(); ++index) {
    score += ((features[index] - model.mean[index]) / model.scale[index]) *
             model.coefficients[index];
  }
  return score;
}

bool finiteConvexNormalized(const Quad& quad) {
  for (const cv::Point2f& point : quad) {
    if (!std::isfinite(point.x) || !std::isfinite(point.y) ||
        point.x < 0.0F || point.x > 1.0F || point.y < 0.0F || point.y > 1.0F) {
      return false;
    }
  }
  const std::vector<cv::Point2f> polygon(quad.begin(), quad.end());
  return cv::isContourConvex(polygon) &&
         std::abs(cv::contourArea(polygon)) > 1.0e-5;
}

Quad applyCorrection(const Quad& source,
                     const std::array<int, 3>& correction,
                     bool& valid) {
  const int right_shift = correction[0];
  const int handle_delta = correction[1];
  const int wick_delta = correction[2];
  const double handle_width = (source[0].x - source[3].x) * 63.0;
  const double wick_width = (source[1].x - source[2].x) * 63.0;
  const double corrected_handle_width = handle_width + handle_delta;
  const double corrected_wick_width = wick_width + wick_delta;
  if (corrected_handle_width <= 1.0 || corrected_wick_width <= 1.0) {
    valid = false;
    return {};
  }
  const float right_handle =
      source[0].x + static_cast<float>(right_shift / 63.0);
  const float right_wick =
      source[1].x + static_cast<float>(right_shift / 63.0);
  Quad corrected = {
      cv::Point2f(right_handle, source[0].y),
      cv::Point2f(right_wick, source[1].y),
      cv::Point2f(static_cast<float>(
                      right_wick - corrected_wick_width / 63.0),
                  source[2].y),
      cv::Point2f(static_cast<float>(
                      right_handle - corrected_handle_width / 63.0),
                  source[3].y)};
  valid = finiteConvexNormalized(corrected);
  return corrected;
}

OrientedInput orientInput(const cv::Mat& rgb, const Quad& anchor) {
  OrientedInput output;
  output.original_size = rgb.size();
  const double longitudinal_x =
      0.5 * (std::abs(anchor[1].x - anchor[0].x) +
             std::abs(anchor[2].x - anchor[3].x));
  const double longitudinal_y =
      0.5 * (std::abs(anchor[1].y - anchor[0].y) +
             std::abs(anchor[2].y - anchor[3].y));
  output.rotated_clockwise = longitudinal_x > longitudinal_y;
  if (output.rotated_clockwise) {
    cv::rotate(rgb, output.rgb, cv::ROTATE_90_CLOCKWISE);
    for (size_t index = 0; index < anchor.size(); ++index) {
      output.anchor[index] = cv::Point2f(
          static_cast<float>(rgb.rows - 1) - anchor[index].y,
          anchor[index].x);
    }
  } else {
    output.rgb = rgb;
    output.anchor = anchor;
  }
  output.anchor = orderQuad(output.anchor);
  const float x_scale = std::max(1, output.rgb.cols - 1);
  const float y_scale = std::max(1, output.rgb.rows - 1);
  for (cv::Point2f& point : output.anchor) {
    point.x /= x_scale;
    point.y /= y_scale;
  }
  return output;
}

Quad restoreCorners(const Quad& normalized, const OrientedInput& input) {
  Quad output{};
  for (size_t index = 0; index < normalized.size(); ++index) {
    const float x = normalized[index].x * (input.rgb.cols - 1);
    const float y = normalized[index].y * (input.rgb.rows - 1);
    output[index] = input.rotated_clockwise
                        ? cv::Point2f(y, input.original_size.height - 1 - x)
                        : cv::Point2f(x, y);
  }
  return orderQuad(output);
}

}  // namespace

const char* transverseWidthPolicyId() {
  return "transverse-width-p1-base1-correct-s16-top-4";
}

std::vector<TransverseWidthHypothesis> scoreTransverseWidthHypotheses(
    const cv::Mat& rgb, const Quad& classical_anchor) {
#if defined(STRIPCV_DISABLE_TRANSVERSE_WIDTH_SCORER)
  (void)rgb;
  (void)classical_anchor;
  return {};
#else
  const RuntimePolicy& policy = runtimePolicy();
  if (!policy.valid || rgb.empty() || rgb.type() != CV_8UC3) {
    return {};
  }
  try {
    const OrientedInput input = orientInput(rgb, classical_anchor);
    if (!finiteConvexNormalized(input.anchor) ||
        input.anchor[1].y - input.anchor[0].y < 0.20F ||
        input.anchor[2].y - input.anchor[3].y < 0.20F) {
      return {};
    }
    const FeatureField field = buildFeatureField(input.rgb);
    std::vector<Quad> variants;
    for (Quad variant : extentLattice(input.anchor)) {
      const bool within_tolerance = std::all_of(
          variant.begin(), variant.end(), [](const cv::Point2f& point) {
            constexpr float tolerance = 1.0F / 63.0F;
            return point.x >= -tolerance && point.x <= 1.0F + tolerance &&
                   point.y >= -tolerance && point.y <= 1.0F + tolerance;
          });
      if (!within_tolerance) {
        continue;
      }
      for (cv::Point2f& point : variant) {
        point.x = std::clamp(point.x, 0.0F, 1.0F);
        point.y = std::clamp(point.y, 0.0F, 1.0F);
      }
      variants.push_back(variant);
    }
    if (variants.size() < static_cast<size_t>(policy.base_hypotheses)) {
      return {};
    }
    Quad full_quad = {pointAtY(input.anchor[0], input.anchor[1], 0.0),
                      pointAtY(input.anchor[0], input.anchor[1], 1.0),
                      pointAtY(input.anchor[3], input.anchor[2], 1.0),
                      pointAtY(input.anchor[3], input.anchor[2], 0.0)};
    std::vector<std::vector<double>> features;
    features.reserve(variants.size());
    for (const Quad& variant : variants) {
      features.push_back(extentFeatureVector(
          field, variant, full_quad, input.anchor,
          policy.part_boundaries));
    }
    std::vector<std::vector<double>> normalized = features;
    for (int feature = 0; feature < kExtentFeatureCount; ++feature) {
      double mean = 0.0;
      for (const auto& row : features) {
        mean += row[static_cast<size_t>(feature)];
      }
      mean /= features.size();
      double variance = 0.0;
      for (const auto& row : features) {
        const double centered = row[static_cast<size_t>(feature)] - mean;
        variance += centered * centered;
      }
      const double scale = std::max(
          1.0e-4, std::sqrt(variance / features.size()));
      for (size_t row = 0; row < features.size(); ++row) {
        normalized[row][static_cast<size_t>(feature)] =
            (features[row][static_cast<size_t>(feature)] - mean) / scale;
      }
    }
    std::vector<double> scores(variants.size());
    for (size_t row = 0; row < variants.size(); ++row) {
      std::vector<double> selected;
      selected.reserve(policy.feature_indices.size());
      for (const int feature : policy.feature_indices) {
        selected.push_back(normalized[row][static_cast<size_t>(feature)]);
      }
      scores[row] = ridgeScore(selected, policy.extent);
    }
    std::vector<size_t> order(variants.size());
    std::iota(order.begin(), order.end(), 0);
    std::stable_sort(order.begin(), order.end(), [&](size_t first,
                                                      size_t second) {
      return scores[first] > scores[second];
    });

    std::vector<TransverseWidthHypothesis> output;
    for (int rank = 0; rank < policy.base_hypotheses; ++rank) {
      const size_t index = order[static_cast<size_t>(rank)];
      output.push_back({restoreCorners(variants[index], input), scores[index],
                        rank + 1, false});
    }
    bool correction_valid = false;
    const Quad corrected = applyCorrection(
        variants[order.front()], policy.correction, correction_valid);
    if (correction_valid) {
      output.push_back({restoreCorners(corrected, input), scores[order.front()],
                        1, true});
    }
    return output;
  } catch (const std::exception&) {
    return {};
  }
#endif
}

}  // namespace stripcv::internal
