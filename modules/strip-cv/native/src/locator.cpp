#include "stripcv/locator.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <filesystem>
#include <limits>
#include <memory>
#include <mutex>
#include <numeric>
#include <optional>
#include <stdexcept>
#include <string>
#include <tuple>
#include <vector>

#include <opencv2/imgproc.hpp>
#ifdef STRIPCV_ENABLE_ONNX
#include <onnxruntime_cxx_api.h>
#endif
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#include <opencv2/geometry/3d.hpp>
#else
#include <opencv2/calib3d.hpp>
#endif

#include "transverse_width_scorer.hpp"

namespace stripcv {
namespace {

constexpr double kProposalMaxDimension = 1600.0;
// Full-resolution gradients still determine the returned corners. Extreme
// portrait/landscape captures need fewer coarse pixels than general scenes;
// retaining 1600 px for ordinary frames keeps card and generic-strip goldens
// unchanged.
constexpr double kElongatedProposalMaxDimension = 1400.0;
constexpr double kVeryElongatedProposalMaxDimension = 1450.0;
constexpr double kMinimumBareContentScore = 0.50;
constexpr double kCompetingBareScoreRatio = 0.90;
constexpr double kMultipleBareScoreRatio = 0.84;
constexpr double kDistinctBareQuadIou = 0.20;
constexpr double kFrameEndpointAlternativePenalty = 0.08;

double polygonArea(const Quad& quad) {
  std::vector<cv::Point2f> points(quad.begin(), quad.end());
  return std::abs(cv::contourArea(points));
}

double quadIou(const Quad& first, const Quad& second) {
  std::vector<cv::Point2f> first_polygon(first.begin(), first.end());
  std::vector<cv::Point2f> second_polygon(second.begin(), second.end());
  std::vector<cv::Point2f> intersection;
  const double intersection_area =
      cv::intersectConvexConvex(first_polygon, second_polygon, intersection);
  const double union_area =
      polygonArea(first) + polygonArea(second) - intersection_area;
  return union_area > 0.0 ? intersection_area / union_area : 0.0;
}

double edgeLength(const cv::Point2f& a, const cv::Point2f& b) {
  return cv::norm(a - b);
}

double sigmoidScore(double value, double low, double high) {
  if (value <= low) {
    return 0.0;
  }
  if (value >= high) {
    return 1.0;
  }
  return (value - low) / (high - low);
}

bool finitePoint(const cv::Point2f& point) {
  return std::isfinite(point.x) && std::isfinite(point.y);
}

bool validConvexQuad(const Quad& quad) {
  if (!std::all_of(quad.begin(), quad.end(), finitePoint)) {
    return false;
  }
  std::vector<cv::Point2f> points(quad.begin(), quad.end());
  return cv::isContourConvex(points) && std::abs(cv::contourArea(points, true)) > 4.0;
}

struct ProposalImage {
  cv::Mat rgb;
  double scale = 1.0;
};

ProposalImage makeProposalImage(const cv::Mat& rgb) {
  ProposalImage result;
  const double frame_aspect =
      std::max(rgb.cols, rgb.rows) /
      static_cast<double>(std::max(1, std::min(rgb.cols, rgb.rows)));
  // Very elongated frames need the extra 50 longitudinal pixels so their
  // already-narrow short dimension retains stable two-edge support.
  const double max_dimension =
      frame_aspect > 6.0
          ? kVeryElongatedProposalMaxDimension
          : (frame_aspect > 3.0 ? kElongatedProposalMaxDimension
                                : kProposalMaxDimension);
  result.scale = std::min(1.0, max_dimension /
                                  static_cast<double>(std::max(rgb.cols, rgb.rows)));
  if (result.scale < 1.0) {
    cv::resize(rgb, result.rgb, cv::Size(), result.scale, result.scale,
               cv::INTER_AREA);
  } else {
    result.rgb = rgb;
  }
  return result;
}

Quad scaleQuad(const Quad& quad, double factor) {
  Quad result = quad;
  for (cv::Point2f& point : result) {
    point *= static_cast<float>(factor);
  }
  return result;
}

float sampleGray(const cv::Mat& gray, const cv::Point2f& point) {
  const float x = std::clamp(point.x, 0.0F, static_cast<float>(gray.cols - 1));
  const float y = std::clamp(point.y, 0.0F, static_cast<float>(gray.rows - 1));
  const int x0 = static_cast<int>(std::floor(x));
  const int y0 = static_cast<int>(std::floor(y));
  const int x1 = std::min(x0 + 1, gray.cols - 1);
  const int y1 = std::min(y0 + 1, gray.rows - 1);
  const float dx = x - x0;
  const float dy = y - y0;
  const float top = gray.at<float>(y0, x0) * (1.0F - dx) +
                    gray.at<float>(y0, x1) * dx;
  const float bottom = gray.at<float>(y1, x0) * (1.0F - dx) +
                       gray.at<float>(y1, x1) * dx;
  return top * (1.0F - dy) + bottom * dy;
}

double pointLineDistance(const cv::Point2f& point, const cv::Vec4f& line) {
  const cv::Point2f direction(line[0], line[1]);
  const cv::Point2f origin(line[2], line[3]);
  return std::abs(static_cast<double>(direction.x) * (point.y - origin.y) -
                  static_cast<double>(direction.y) * (point.x - origin.x));
}

bool intersectLines(const cv::Vec4f& first, const cv::Vec4f& second,
                    cv::Point2f& intersection) {
  const cv::Point2f p(first[2], first[3]);
  const cv::Point2f r(first[0], first[1]);
  const cv::Point2f q(second[2], second[3]);
  const cv::Point2f s(second[0], second[1]);
  const double cross = static_cast<double>(r.x) * s.y -
                       static_cast<double>(r.y) * s.x;
  if (std::abs(cross) < 1.0e-5) {
    return false;
  }
  const cv::Point2f delta = q - p;
  const double t = (static_cast<double>(delta.x) * s.y -
                    static_cast<double>(delta.y) * s.x) /
                   cross;
  intersection = p + r * static_cast<float>(t);
  return finitePoint(intersection);
}

struct RefinedQuad {
  bool found = false;
  Quad corners{};
  std::array<cv::Vec4f, 4> lines{};
  double support_fraction = 0.0;
  double rmse_px = 0.0;
  double short_edge = 0.0;
  std::string failure_stage = "not_started";
};

RefinedQuad refineQuadEdges(const cv::Mat& rgb, const Quad& initial,
                            int fixed_polarity = 0,
                            bool allow_weak_end_edges = false) {
  RefinedQuad result;
  if (!validConvexQuad(initial)) {
    result.failure_stage = "initial_quad_invalid";
    return result;
  }

  cv::Mat gray8;
  cv::cvtColor(rgb, gray8, cv::COLOR_RGB2GRAY);
  cv::GaussianBlur(gray8, gray8, cv::Size(3, 3), 1.0);
  cv::Mat gray;
  gray8.convertTo(gray, CV_32F);

  const double horizontal =
      0.5 * (edgeLength(initial[0], initial[1]) +
             edgeLength(initial[2], initial[3]));
  const double vertical =
      0.5 * (edgeLength(initial[1], initial[2]) +
             edgeLength(initial[3], initial[0]));
  result.short_edge = std::min(horizontal, vertical);
  if (result.short_edge < 8.0) {
    result.failure_stage = "short_edge_too_small";
    return result;
  }
  const int band = std::clamp(
      static_cast<int>(std::lround(result.short_edge * 0.08)), 3, 24);
  const double residual_limit = std::max(2.0, result.short_edge * 0.015);

  size_t supported = 0;
  size_t sampled = 0;
  size_t supported_long_edges = 0;
  size_t sampled_long_edges = 0;
  double squared_error = 0.0;
  size_t error_count = 0;
  for (size_t edge = 0; edge < 4; ++edge) {
    const cv::Point2f start = initial[edge];
    const cv::Point2f end = initial[(edge + 1) % 4];
    const cv::Point2f delta = end - start;
    const double length = cv::norm(delta);
    if (length < 8.0) {
      result.failure_stage = "edge_length_too_small";
      return result;
    }
    const cv::Point2f inward(static_cast<float>(-delta.y / length),
                             static_cast<float>(delta.x / length));
    const int count = std::clamp(static_cast<int>(length / 2.0), 16, 160);
    std::vector<cv::Point2f> support_points;
    support_points.reserve(count);
    for (int sample = 0; sample < count; ++sample) {
      ++sampled;
      if (edge == 0 || edge == 2) {
        ++sampled_long_edges;
      }
      const float t = static_cast<float>(0.1 + 0.8 *
          (sample + 0.5) / static_cast<double>(count));
      const cv::Point2f base = start + delta * t;
      int polarity = fixed_polarity;
      if (polarity == 0) {
        const float inside = sampleGray(gray, base + inward * (0.65F * band));
        const float outside = sampleGray(gray, base - inward * (0.65F * band));
        if (std::abs(inside - outside) >= 2.0F) {
          polarity = inside > outside ? 1 : -1;
        }
      }

      std::vector<double> responses(static_cast<size_t>(band * 2 + 1));
      int best_index = 0;
      double best_response = -std::numeric_limits<double>::infinity();
      for (int offset = -band; offset <= band; ++offset) {
        const float forward = sampleGray(gray, base + inward * (offset + 0.75F));
        const float backward = sampleGray(gray, base + inward * (offset - 0.75F));
        const double gradient = static_cast<double>(forward - backward);
        const double response = polarity == 0 ? std::abs(gradient)
                                              : polarity * gradient;
        responses[static_cast<size_t>(offset + band)] = response;
        if (response > best_response) {
          best_response = response;
          best_index = offset + band;
        }
      }
      if (best_response < 3.0) {
        continue;
      }
      double subpixel = 0.0;
      if (best_index > 0 && best_index + 1 < static_cast<int>(responses.size())) {
        const double left = responses[best_index - 1];
        const double center = responses[best_index];
        const double right = responses[best_index + 1];
        const double denominator = left - 2.0 * center + right;
        if (std::abs(denominator) > 1.0e-6) {
          subpixel = std::clamp(0.5 * (left - right) / denominator, -0.5, 0.5);
        }
      }
      const double offset = (best_index - band) + subpixel;
      support_points.push_back(base + inward * static_cast<float>(offset));
    }
    const double minimum_gradient_support =
        allow_weak_end_edges && (edge == 0 || edge == 2) ? 0.12 : 0.40;
    if (support_points.size() < 8 ||
        support_points.size() < static_cast<size_t>(
            std::ceil(count * minimum_gradient_support))) {
      if (allow_weak_end_edges && (edge == 1 || edge == 3)) {
        result.lines[edge] = cv::Vec4f(
            delta.x / static_cast<float>(length),
            delta.y / static_cast<float>(length), start.x, start.y);
        continue;
      }
      result.failure_stage = edge == 0 || edge == 2
                                 ? "long_rail_gradient_support"
                                 : "short_end_gradient_support";
      return result;
    }

    cv::Vec4f line;
    cv::fitLine(support_points, line, cv::DIST_HUBER, 0.0, 0.01, 0.01);
    std::vector<cv::Point2f> inliers;
    inliers.reserve(support_points.size());
    for (const cv::Point2f& point : support_points) {
      if (pointLineDistance(point, line) <= residual_limit) {
        inliers.push_back(point);
      }
    }
    double minimum_projection = std::numeric_limits<double>::infinity();
    double maximum_projection = -std::numeric_limits<double>::infinity();
    for (const cv::Point2f& point : inliers) {
      const double projection = (point - start).dot(delta) / (length * length);
      minimum_projection = std::min(minimum_projection, projection);
      maximum_projection = std::max(maximum_projection, projection);
    }
    const double minimum_inlier_fraction =
        allow_weak_end_edges && (edge == 0 || edge == 2) ? 0.32 : 0.60;
    const bool insufficient_inliers =
        inliers.size() < 8 ||
        inliers.size() < static_cast<size_t>(
            std::ceil(support_points.size() * minimum_inlier_fraction)) ||
        (allow_weak_end_edges && (edge == 0 || edge == 2) &&
         maximum_projection - minimum_projection < 0.50);
    if (insufficient_inliers) {
      if (allow_weak_end_edges && (edge == 1 || edge == 3)) {
        result.lines[edge] = cv::Vec4f(
            delta.x / static_cast<float>(length),
            delta.y / static_cast<float>(length), start.x, start.y);
        continue;
      }
      result.failure_stage = edge == 0 || edge == 2
                                 ? "long_rail_inlier_span"
                                 : "short_end_inlier_span";
      return result;
    }
    cv::fitLine(inliers, line, cv::DIST_HUBER, 0.0, 0.005, 0.005);
    result.lines[edge] = line;
    supported += inliers.size();
    if (edge == 0 || edge == 2) {
      supported_long_edges += inliers.size();
    }
    for (const cv::Point2f& point : inliers) {
      const double residual = pointLineDistance(point, line);
      squared_error += residual * residual;
      ++error_count;
    }
  }

  if (!intersectLines(result.lines[3], result.lines[0], result.corners[0]) ||
      !intersectLines(result.lines[0], result.lines[1], result.corners[1]) ||
      !intersectLines(result.lines[1], result.lines[2], result.corners[2]) ||
      !intersectLines(result.lines[2], result.lines[3], result.corners[3])) {
    result.failure_stage = "line_intersection";
    return result;
  }
  if (!validConvexQuad(result.corners)) {
    result.failure_stage = "refined_quad_invalid";
    return result;
  }
  const double max_shift = std::max(12.0, result.short_edge * 0.35);
  for (size_t index = 0; index < 4; ++index) {
    if (cv::norm(result.corners[index] - initial[index]) > max_shift ||
        result.corners[index].x < -band || result.corners[index].y < -band ||
        result.corners[index].x > rgb.cols - 1 + band ||
        result.corners[index].y > rgb.rows - 1 + band) {
      result.failure_stage = "corner_shift_or_bounds";
      return result;
    }
  }
  result.support_fraction = allow_weak_end_edges
      ? (sampled_long_edges == 0
             ? 0.0
             : supported_long_edges /
                   static_cast<double>(sampled_long_edges))
      : (sampled == 0 ? 0.0 : supported / static_cast<double>(sampled));
  result.rmse_px = error_count == 0 ? 0.0 : std::sqrt(squared_error / error_count);
  result.found = result.support_fraction >=
                 (allow_weak_end_edges ? 0.25 : 0.40);
  result.failure_stage = result.found ? "accepted" : "final_support_fraction";
  return result;
}

double perspectiveScaleRatio(const cv::Mat& homography, const cv::Size& canonical) {
  if (homography.empty()) {
    return std::numeric_limits<double>::infinity();
  }
  cv::Mat inverse;
  if (cv::invert(homography, inverse, cv::DECOMP_SVD) == 0.0) {
    return std::numeric_limits<double>::infinity();
  }
  const std::array<cv::Point2f, 5> samples = {
      cv::Point2f(0.0F, 0.0F),
      cv::Point2f(static_cast<float>(canonical.width - 1), 0.0F),
      cv::Point2f(static_cast<float>(canonical.width - 1),
                  static_cast<float>(canonical.height - 1)),
      cv::Point2f(0.0F, static_cast<float>(canonical.height - 1)),
      cv::Point2f(static_cast<float>(canonical.width - 1) * 0.5F,
                  static_cast<float>(canonical.height - 1) * 0.5F)};
  double minimum = std::numeric_limits<double>::infinity();
  double maximum = 0.0;
  for (const cv::Point2f& sample : samples) {
    std::vector<cv::Point2f> points = {
        sample, sample + cv::Point2f(1.0F, 0.0F),
        sample + cv::Point2f(0.0F, 1.0F)};
    cv::perspectiveTransform(points, points, inverse);
    if (!std::all_of(points.begin(), points.end(), finitePoint)) {
      return std::numeric_limits<double>::infinity();
    }
    const double area_scale =
        std::sqrt(std::max(1.0e-12, cv::norm(points[1] - points[0]) *
                                        cv::norm(points[2] - points[0])));
    minimum = std::min(minimum, area_scale);
    maximum = std::max(maximum, area_scale);
  }
  return maximum / std::max(1.0e-9, minimum);
}

bool validHomography(const cv::Mat& homography, const cv::Size& canonical,
                     double& scale_ratio) {
  if (homography.empty() || homography.rows != 3 || homography.cols != 3) {
    return false;
  }
  cv::Mat matrix;
  homography.convertTo(matrix, CV_64F);
  for (int row = 0; row < 3; ++row) {
    for (int column = 0; column < 3; ++column) {
      if (!std::isfinite(matrix.at<double>(row, column))) {
        return false;
      }
    }
  }
  if (std::abs(cv::determinant(matrix)) < 1.0e-12) {
    return false;
  }
  scale_ratio = perspectiveScaleRatio(matrix, canonical);
  return std::isfinite(scale_ratio) && scale_ratio <= 8.0;
}

struct StripContentEvidence {
  double pink = 0.0;
  double positioned_pink = 0.0;
  double border_layout = 0.0;
  double handle_coverage = 0.0;
  double score = 0.0;
};

StripContentEvidence stripContentEvidence(const cv::Mat& rgb,
                                          const Quad& source,
                                          const AssayProfile& assay) {
  StripContentEvidence evidence;
  const std::array<cv::Point2f, 4> destination = {
      cv::Point2f(0.0F, 0.0F), cv::Point2f(299.0F, 0.0F),
      cv::Point2f(299.0F, 79.0F), cv::Point2f(0.0F, 79.0F)};
  cv::Mat transform = cv::getPerspectiveTransform(source.data(), destination.data());
  cv::Mat warped;
  cv::warpPerspective(rgb, warped, transform, cv::Size(300, 80), cv::INTER_AREA,
                      cv::BORDER_REPLICATE);
  warped.convertTo(warped, CV_32FC3, 1.0 / 255.0);

  std::vector<double> response(300, 0.0);
  const int membrane_top = std::clamp(
      static_cast<int>(std::floor(assay.membrane_roi.y0 * warped.rows)), 0,
      warped.rows - 1);
  const int membrane_bottom = std::clamp(
      static_cast<int>(std::ceil(assay.membrane_roi.y1 * warped.rows)),
      membrane_top + 1, warped.rows);
  const int vertical_margin = std::max(1, (membrane_bottom - membrane_top) / 7);
  const int row_begin = std::min(membrane_bottom - 1,
                                 membrane_top + vertical_margin);
  const int row_end = std::max(row_begin + 1,
                               membrane_bottom - vertical_margin);
  for (int x = 0; x < warped.cols; ++x) {
    std::vector<float> column;
    column.reserve(static_cast<size_t>(row_end - row_begin));
    for (int y = row_begin; y < row_end; ++y) {
      const cv::Vec3f pixel = warped.at<cv::Vec3f>(y, x);
      column.push_back(std::log((pixel[0] + 0.02F) / (pixel[1] + 0.02F)));
    }
    std::nth_element(column.begin(), column.begin() + column.size() / 2,
                     column.end());
    response[x] = column[column.size() / 2];
  }
  std::vector<double> sorted = response;
  std::sort(sorted.begin(), sorted.end());
  const double median = sorted[sorted.size() / 2];
  std::vector<double> narrow_response(response.size(), 0.0);
  for (size_t index = 0; index < response.size(); ++index) {
    std::vector<double> neighborhood;
    const size_t begin = index > 15 ? index - 15 : 0;
    const size_t end = std::min(response.size(), index + 16);
    neighborhood.reserve(end - begin);
    for (size_t neighbor = begin; neighbor < end; ++neighbor) {
      if (neighbor + 4 < index || neighbor > index + 4) {
        neighborhood.push_back(response[neighbor]);
      }
    }
    if (neighborhood.empty()) {
      narrow_response[index] = std::max(0.0, response[index] - median);
      continue;
    }
    std::nth_element(neighborhood.begin(),
                     neighborhood.begin() + neighborhood.size() / 2,
                     neighborhood.end());
    narrow_response[index] = std::max(
        0.0, response[index] - neighborhood[neighborhood.size() / 2]);
  }
  sorted = narrow_response;
  std::sort(sorted.begin(), sorted.end());
  evidence.pink = sorted[static_cast<size_t>(0.98 * (sorted.size() - 1))];

  // The line windows are expressed relative to the configured membrane ROI.
  // Convert them to full-strip coordinates before scoring the rectified preview.
  const auto windowPeak = [&](const NormalizedRect& window, bool mirrored) {
    const double membrane_width =
        assay.membrane_roi.x1 - assay.membrane_roi.x0;
    double x0 = assay.membrane_roi.x0 + window.x0 * membrane_width;
    double x1 = assay.membrane_roi.x0 + window.x1 * membrane_width;
    if (mirrored) {
      const double original_x0 = x0;
      x0 = 1.0 - x1;
      x1 = 1.0 - original_x0;
    }
    const int begin = std::clamp(static_cast<int>(std::floor(x0 * response.size())),
                                 0, static_cast<int>(response.size()) - 1);
    const int end = std::clamp(static_cast<int>(std::ceil(x1 * response.size())),
                               begin + 1, static_cast<int>(response.size()));
    return *std::max_element(narrow_response.begin() + begin,
                             narrow_response.begin() + end);
  };
  const double forward_positioned =
      std::max(windowPeak(assay.test_window, false),
               windowPeak(assay.control_window, false));
  const double mirrored_positioned =
      std::max(windowPeak(assay.test_window, true),
               windowPeak(assay.control_window, true));
  evidence.positioned_pink = std::max(forward_positioned, mirrored_positioned);
  const double pink_strength = std::min(1.0, evidence.pink / 0.12);
  const double position_strength =
      std::min(1.0, evidence.positioned_pink / 0.12);
  const double position_fraction = evidence.pink < 0.02
                                       ? 0.35
                                       : std::clamp(evidence.positioned_pink /
                                                        evidence.pink,
                                                    0.0, 1.0);

  // Most supported bare-strip profiles reserve a narrow backing/border outside
  // the membrane. This is deliberately weak evidence: it distinguishes a full
  // strip from a nested membrane crop without requiring a particular housing
  // colour or rejecting borderless strips.
  const auto meanLuminance = [&](int first_row, int last_row) {
    double sum = 0.0;
    size_t count = 0;
    for (int y = std::clamp(first_row, 0, warped.rows);
         y < std::clamp(last_row, 0, warped.rows); ++y) {
      for (int x = 0; x < warped.cols; x += 3) {
        const cv::Vec3f pixel = warped.at<cv::Vec3f>(y, x);
        sum += 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
        ++count;
      }
    }
    return count == 0 ? 0.0 : sum / count;
  };
  const int rail = std::max(2, static_cast<int>(0.12 * warped.rows));
  const double outer = 0.5 * (meanLuminance(0, rail) +
                              meanLuminance(warped.rows - rail, warped.rows));
  const double inner = meanLuminance(
      static_cast<int>(0.32 * warped.rows),
      static_cast<int>(0.68 * warped.rows));
  evidence.border_layout = std::clamp((inner - outer + 0.03) / 0.16, 0.0, 1.0);

  const auto meanColor = [&](int first_column, int last_column) {
    cv::Vec3d sum(0.0, 0.0, 0.0);
    size_t count = 0;
    for (int y = row_begin; y < row_end; y += 2) {
      for (int x = std::clamp(first_column, 0, warped.cols);
           x < std::clamp(last_column, 0, warped.cols); x += 2) {
        const cv::Vec3f pixel = warped.at<cv::Vec3f>(y, x);
        sum += cv::Vec3d(pixel[0], pixel[1], pixel[2]);
        ++count;
      }
    }
    return count == 0 ? cv::Vec3d(0.0, 0.0, 0.0)
                      : sum * (1.0 / count);
  };
  const cv::Vec3d center_color = meanColor(
      static_cast<int>(0.55 * warped.cols),
      static_cast<int>(0.75 * warped.cols));
  const cv::Vec3d first_end = meanColor(0, static_cast<int>(0.18 * warped.cols));
  const cv::Vec3d second_end = meanColor(
      static_cast<int>(0.82 * warped.cols), warped.cols);
  const double handle_difference =
      std::max(cv::norm(first_end - center_color),
               cv::norm(second_end - center_color));
  evidence.handle_coverage =
      std::clamp((handle_difference - 0.035) / 0.28, 0.0, 1.0);
  evidence.score = 0.22 * pink_strength + 0.31 * position_strength +
                   0.25 * position_fraction + 0.07 * evidence.border_layout +
                   0.15 * evidence.handle_coverage;
  return evidence;
}

bool sufficientStripContent(const StripContentEvidence& evidence,
                            const AssayProfile& assay) {
  if (evidence.score >= kMinimumBareContentScore) {
    return true;
  }
  // A low-saturation assay dye can place a genuine handled paper strip just
  // below the aggregate colour score even when the line sits in the expected
  // result region. Allow only a narrow structural fallback: the candidate must
  // retain a strong handle transition, visible backing rails, positioned dye,
  // and nearly meet the ordinary score. Cassettes, plastic sticks, and blank
  // paper do not receive a general threshold reduction.
  return assay.id == "handled-paper-two-line-strip" &&
         evidence.score >= 0.44 && evidence.positioned_pink >= 0.06 &&
         evidence.border_layout >= 0.25 && evidence.handle_coverage >= 0.90;
}

struct TransverseBandComponent {
  double normal_center = 0.0;
  double normal_span = 0.0;
};

bool hasInternalLongRailLattice(const cv::Mat& rgb, const Quad& source) {
  constexpr int kCanonicalWidth = 1024;
  constexpr int kCanonicalHeight = 128;
  const std::array<cv::Point2f, 4> destination = {
      cv::Point2f(0.0F, 0.0F),
      cv::Point2f(static_cast<float>(kCanonicalWidth - 1), 0.0F),
      cv::Point2f(static_cast<float>(kCanonicalWidth - 1),
                  static_cast<float>(kCanonicalHeight - 1)),
      cv::Point2f(0.0F, static_cast<float>(kCanonicalHeight - 1))};
  const cv::Mat transform =
      cv::getPerspectiveTransform(source.data(), destination.data());
  cv::Mat rectified;
  cv::warpPerspective(rgb, rectified, transform,
                      cv::Size(kCanonicalWidth, kCanonicalHeight),
                      cv::INTER_AREA, cv::BORDER_REPLICATE);

  cv::Mat gray;
  cv::cvtColor(rectified, gray, cv::COLOR_RGB2GRAY);
  cv::GaussianBlur(gray, gray, cv::Size(5, 3), 0.0);
  cv::Mat cross_gradient;
  cv::Sobel(gray, cross_gradient, CV_32F, 0, 1, 3, 1.0 / 8.0);
  cross_gradient = cv::abs(cross_gradient);

  // A crop containing several touching strips has long, repeated paper rails
  // inside it. Text and transverse assay bands can be sharp too, but they do
  // not persist down nearly half of the rectified long axis.
  std::vector<double> coverage(kCanonicalHeight, 0.0);
  constexpr int kColumnBegin = kCanonicalWidth / 20;
  constexpr int kColumnEnd = kCanonicalWidth - kColumnBegin;
  for (int row = 0; row < kCanonicalHeight; ++row) {
    int supported = 0;
    for (int column = kColumnBegin; column < kColumnEnd; ++column) {
      supported += cross_gradient.at<float>(row, column) > 16.0F ? 1 : 0;
    }
    coverage[static_cast<size_t>(row)] = supported /
        static_cast<double>(kColumnEnd - kColumnBegin);
  }
  int rail_groups = 0;
  int last_peak = -10;
  for (int row = 8; row < kCanonicalHeight - 8; ++row) {
    if (coverage[static_cast<size_t>(row)] < 0.35 ||
        coverage[static_cast<size_t>(row)] <
            coverage[static_cast<size_t>(row - 1)] ||
        coverage[static_cast<size_t>(row)] <=
            coverage[static_cast<size_t>(row + 1)]) {
      continue;
    }
    if (row - last_peak > 4) {
      ++rail_groups;
    }
    last_peak = row;
  }
  return rail_groups >= 2;
}

bool hasExternalTransverseBandField(const cv::Mat& rgb,
                                    const Quad& source) {
  cv::Point2f axis =
      (source[1] - source[0]) + (source[2] - source[3]);
  const double axis_length = cv::norm(axis);
  if (axis_length < 1.0) {
    return false;
  }
  axis *= static_cast<float>(1.0 / axis_length);
  const cv::Point2f normal(-axis.y, axis.x);
  const double short_side = 0.5 *
      (edgeLength(source[0], source[3]) +
       edgeLength(source[1], source[2]));
  if (short_side < 6.0) {
    return false;
  }

  const std::array<cv::Point2f, 4> frame = {
      cv::Point2f(0.0F, 0.0F),
      cv::Point2f(static_cast<float>(rgb.cols - 1), 0.0F),
      cv::Point2f(static_cast<float>(rgb.cols - 1),
                  static_cast<float>(rgb.rows - 1)),
      cv::Point2f(0.0F, static_cast<float>(rgb.rows - 1))};
  double minimum_normal = std::numeric_limits<double>::infinity();
  double maximum_normal = -std::numeric_limits<double>::infinity();
  double minimum_axis = std::numeric_limits<double>::infinity();
  double maximum_axis = -std::numeric_limits<double>::infinity();
  for (const cv::Point2f& point : frame) {
    minimum_normal = std::min(minimum_normal,
                              static_cast<double>(point.dot(normal)));
    maximum_normal = std::max(maximum_normal,
                              static_cast<double>(point.dot(normal)));
    minimum_axis = std::min(minimum_axis,
                            static_cast<double>(point.dot(axis)));
    maximum_axis = std::max(maximum_axis,
                            static_cast<double>(point.dot(axis)));
  }
  const int aligned_width =
      std::max(1, static_cast<int>(std::ceil(maximum_normal - minimum_normal)) +
                      1);
  const int aligned_height =
      std::max(1, static_cast<int>(std::ceil(maximum_axis - minimum_axis)) +
                      1);
  if (static_cast<int64_t>(aligned_width) * aligned_height > 12000000) {
    return false;
  }

  cv::Mat rgb_float;
  rgb.convertTo(rgb_float, CV_32FC3);
  std::vector<cv::Mat> channels;
  cv::split(rgb_float, channels);
  cv::Mat opponent = channels[0] - 0.5F * (channels[1] + channels[2]);
  cv::Mat alignment(2, 3, CV_64F);
  alignment.at<double>(0, 0) = normal.x;
  alignment.at<double>(0, 1) = normal.y;
  alignment.at<double>(0, 2) = -minimum_normal;
  alignment.at<double>(1, 0) = axis.x;
  alignment.at<double>(1, 1) = axis.y;
  alignment.at<double>(1, 2) = -minimum_axis;
  cv::Mat aligned;
  cv::warpAffine(opponent, aligned, alignment,
                 cv::Size(aligned_width, aligned_height), cv::INTER_LINEAR,
                 cv::BORDER_CONSTANT, cv::Scalar(0.0));

  const int transverse_kernel = std::clamp(
      static_cast<int>(std::lround(0.28 * short_side)) | 1, 5, 31);
  cv::Mat transverse;
  cv::boxFilter(aligned, transverse, CV_32F,
                cv::Size(transverse_kernel, 1));
  const auto oddKernel = [](double sigma) {
    return std::max(3, (static_cast<int>(std::ceil(6.0 * sigma)) | 1));
  };
  const double narrow_sigma = std::max(0.8, std::min(3.0, 0.035 * short_side));
  const double broad_sigma = std::max(4.0, std::min(18.0, 0.22 * short_side));
  cv::Mat narrow;
  cv::Mat broad;
  cv::GaussianBlur(transverse, narrow,
                   cv::Size(1, oddKernel(narrow_sigma)), 0.0, narrow_sigma);
  cv::GaussianBlur(transverse, broad,
                   cv::Size(1, oddKernel(broad_sigma)), 0.0, broad_sigma);
  cv::Mat line_response = narrow - broad;
  cv::Mat line_mask;
  cv::threshold(line_response, line_mask, 10.0, 255.0, cv::THRESH_BINARY);
  line_mask.convertTo(line_mask, CV_8U);

  cv::Mat labels;
  cv::Mat stats;
  cv::Mat centroids;
  const int component_count = cv::connectedComponentsWithStats(
      line_mask, labels, stats, centroids, 8, CV_32S);
  double selected_minimum = std::numeric_limits<double>::infinity();
  double selected_maximum = -std::numeric_limits<double>::infinity();
  for (const cv::Point2f& point : source) {
    const double value = point.dot(normal) - minimum_normal;
    selected_minimum = std::min(selected_minimum, value);
    selected_maximum = std::max(selected_maximum, value);
  }
  const double outside_margin = 0.18 * short_side;
  const double minimum_width =
      std::max(5.0, 0.006 * std::min(aligned_width, aligned_height));
  const double maximum_height = std::max(8.0, 0.12 * short_side);
  std::vector<TransverseBandComponent> external;
  for (int component = 1; component < component_count; ++component) {
    const double width = stats.at<int>(component, cv::CC_STAT_WIDTH);
    const double height = stats.at<int>(component, cv::CC_STAT_HEIGHT);
    const double area = stats.at<int>(component, cv::CC_STAT_AREA);
    const double center = centroids.at<double>(component, 0);
    if (width < minimum_width || height > maximum_height ||
        width < 1.4 * height || area < 0.35 * width) {
      continue;
    }
    if (center >= selected_minimum - outside_margin &&
        center <= selected_maximum + outside_margin) {
      continue;
    }
    external.push_back({center, width});
  }
  if (external.size() < 2) {
    return false;
  }
  std::sort(external.begin(), external.end(),
            [](const TransverseBandComponent& first,
               const TransverseBandComponent& second) {
              return first.normal_center < second.normal_center;
            });
  int distinct_columns = 0;
  double cluster_center = 0.0;
  double cluster_span = 0.0;
  int cluster_size = 0;
  for (const TransverseBandComponent& component : external) {
    const bool joins = cluster_size > 0 &&
        component.normal_center - cluster_center <=
            0.55 * std::max(component.normal_span, cluster_span);
    if (!joins) {
      ++distinct_columns;
      cluster_center = component.normal_center;
      cluster_span = component.normal_span;
      cluster_size = 1;
    } else {
      cluster_center =
          (cluster_center * cluster_size + component.normal_center) /
          (cluster_size + 1);
      cluster_span = std::max(cluster_span, component.normal_span);
      ++cluster_size;
    }
  }
  // This is a global crowding veto, not another way to localize a second
  // strip. Require at least three independent compact transverse components
  // outside the selected quad. A valid JPEG-stressed capture can create two
  // such fragments, while a repeated assay-band field supplies several even
  // when adjacent columns merge into one long component. Ordinary two-strip
  // scenes are already caught by the independently accepted-proposal check.
  return external.size() >= 3 || distinct_columns >= 3;
}

bool hasMultiStripSceneEvidence(const cv::Mat& rgb, const Quad& source,
                                const AssayProfile& assay) {
  if (assay.id != "handled-paper-two-line-strip") {
    return false;
  }
  return hasInternalLongRailLattice(rgb, source) ||
         hasExternalTransverseBandField(rgb, source);
}

cv::Vec3d pixelChromaticity(const cv::Vec3b& pixel) {
  const double sum = std::max(
      1.0, static_cast<double>(pixel[0]) + pixel[1] + pixel[2]);
  return cv::Vec3d(pixel[0] / sum, pixel[1] / sum, pixel[2] / sum);
}

cv::Vec3d robustImageChromaticity(const cv::Mat& rgb) {
  std::array<std::vector<double>, 3> channels;
  const int stride = std::max(2, std::min(rgb.cols, rgb.rows) / 180);
  const size_t reserve = static_cast<size_t>(
      ((rgb.rows + stride - 1) / stride) *
      ((rgb.cols + stride - 1) / stride));
  for (std::vector<double>& channel : channels) {
    channel.reserve(reserve);
  }
  for (int row = 0; row < rgb.rows; row += stride) {
    for (int column = 0; column < rgb.cols; column += stride) {
      const cv::Vec3d value =
          pixelChromaticity(rgb.at<cv::Vec3b>(row, column));
      for (int channel = 0; channel < 3; ++channel) {
        channels[static_cast<size_t>(channel)].push_back(value[channel]);
      }
    }
  }
  cv::Vec3d result(1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0);
  for (int channel = 0; channel < 3; ++channel) {
    std::vector<double>& values = channels[static_cast<size_t>(channel)];
    if (values.empty()) {
      continue;
    }
    std::nth_element(values.begin(), values.begin() + values.size() / 2,
                     values.end());
    result[channel] = values[values.size() / 2];
  }
  return result;
}

cv::Point2f quadCenter(const Quad& quad) {
  return std::accumulate(quad.begin(), quad.end(), cv::Point2f(0.0F, 0.0F)) *
         0.25F;
}

Quad contourQuad(const std::vector<cv::Point>& contour) {
  const double perimeter = cv::arcLength(contour, true);
  Quad result{};
  bool found = false;
  for (const double fraction : {0.0125, 0.02, 0.03, 0.045, 0.06}) {
    std::vector<cv::Point> approximation;
    cv::approxPolyDP(contour, approximation, fraction * perimeter, true);
    if (approximation.size() == 4 && cv::isContourConvex(approximation)) {
      for (size_t index = 0; index < 4; ++index) {
        result[index] = cv::Point2f(static_cast<float>(approximation[index].x),
                                   static_cast<float>(approximation[index].y));
      }
      found = true;
      break;
    }
  }
  if (!found) {
    cv::RotatedRect box = cv::minAreaRect(contour);
    box.points(result.data());
  }
  return orderQuad(result);
}

std::vector<Quad> longEdgePairQuads(const cv::Mat& edges,
                                    const cv::Mat& proposal_rgb) {
  // HoughLinesP and GrabCut consume OpenCV's process-global RNG. Serialize and
  // seed this fallback so identical photos cannot produce different corners
  // (or cross a narrow assay window) across repeated/concurrent analyses.
  static std::mutex rng_mutex;
  const std::lock_guard<std::mutex> rng_lock(rng_mutex);
  cv::setRNGSeed(0x51A17);
  std::vector<cv::Vec4i> segments;
  const int maximum_dimension = std::max(edges.cols, edges.rows);
  const int minimum_dimension = std::min(edges.cols, edges.rows);
  cv::HoughLinesP(edges, segments, 1.0, CV_PI / 720.0, 40,
                  std::max(35.0, maximum_dimension * 0.12),
                  std::max(12.0, maximum_dimension * 0.035));

  // This evidence is image-global. Reusing it avoids a full RGB scan for
  // every Hough hypothesis in tall images.
  cv::Mat chromatic_mask = cv::Mat::zeros(proposal_rgb.size(), CV_8U);
  std::vector<cv::Point2f> chromatic_points;
  chromatic_points.reserve(static_cast<size_t>(proposal_rgb.total() / 8));
  const cv::Vec3d reference_chromaticity =
      robustImageChromaticity(proposal_rgb);
  const bool compensate_global_cast =
      cv::norm(reference_chromaticity -
               cv::Vec3d(1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0)) > 0.05;
  for (int row = 0; row < proposal_rgb.rows; ++row) {
    for (int column = 0; column < proposal_rgb.cols; ++column) {
      const cv::Vec3b pixel = proposal_rgb.at<cv::Vec3b>(row, column);
      const auto [minimum_channel, maximum_channel] =
          std::minmax_element(pixel.val, pixel.val + 3);
      const bool chromatic = compensate_global_cast
          ? cv::norm(pixelChromaticity(pixel) - reference_chromaticity) >=
                0.032
          : *maximum_channel - *minimum_channel >= 18;
      if (chromatic) {
        chromatic_mask.at<unsigned char>(row, column) = 255;
        if ((row & 1) == 0 && (column & 1) == 0) {
          chromatic_points.emplace_back(static_cast<float>(column),
                                        static_cast<float>(row));
        }
      }
    }
  }

  struct Track {
    std::vector<cv::Point2f> points;
    cv::Vec4f line{};
    cv::Point2f direction{1.0F, 0.0F};
    double minimum_projection = 0.0;
    double maximum_projection = 0.0;
  };
  auto updateTrack = [](Track& track) {
    cv::fitLine(track.points, track.line, cv::DIST_HUBER, 0.0, 0.01, 0.01);
    track.direction = cv::Point2f(track.line[0], track.line[1]);
    if (track.direction.x < 0.0F ||
        (std::abs(track.direction.x) < 1.0e-5F &&
         track.direction.y < 0.0F)) {
      track.direction *= -1.0F;
    }
    track.minimum_projection = std::numeric_limits<double>::infinity();
    track.maximum_projection = -std::numeric_limits<double>::infinity();
    for (const cv::Point2f& point : track.points) {
      const double projection = point.dot(track.direction);
      track.minimum_projection = std::min(track.minimum_projection, projection);
      track.maximum_projection = std::max(track.maximum_projection, projection);
    }
  };

  std::sort(segments.begin(), segments.end(), [](const cv::Vec4i& first,
                                                  const cv::Vec4i& second) {
    return cv::norm(cv::Point2f(first[2] - first[0], first[3] - first[1])) >
           cv::norm(cv::Point2f(second[2] - second[0], second[3] - second[1]));
  });
  std::vector<Track> tracks;
  const double direction_threshold = std::cos(6.0 * CV_PI / 180.0);
  const double grouping_distance = std::max(4.0, minimum_dimension * 0.055);
  for (const cv::Vec4i& segment : segments) {
    const cv::Point2f first(static_cast<float>(segment[0]),
                            static_cast<float>(segment[1]));
    const cv::Point2f second(static_cast<float>(segment[2]),
                             static_cast<float>(segment[3]));
    cv::Point2f direction = second - first;
    const double length = cv::norm(direction);
    if (length < maximum_dimension * 0.12) {
      continue;
    }
    direction *= static_cast<float>(1.0 / length);
    size_t best_track = tracks.size();
    double best_distance = grouping_distance;
    const cv::Point2f midpoint = (first + second) * 0.5F;
    for (size_t index = 0; index < tracks.size(); ++index) {
      if (std::abs(direction.dot(tracks[index].direction)) <
          direction_threshold) {
        continue;
      }
      const double distance = pointLineDistance(midpoint, tracks[index].line);
      if (distance < best_distance) {
        best_distance = distance;
        best_track = index;
      }
    }
    if (best_track == tracks.size()) {
      Track track;
      track.points = {first, second};
      updateTrack(track);
      tracks.push_back(std::move(track));
    } else {
      tracks[best_track].points.push_back(first);
      tracks[best_track].points.push_back(second);
      updateTrack(tracks[best_track]);
    }
  }

  auto pointAtProjection = [](const Track& track, double projection) {
    const cv::Point2f origin(track.line[2], track.line[3]);
    return origin + track.direction *
                        static_cast<float>(projection - origin.dot(track.direction));
  };
  const auto extendToWholeStrip = [&](Quad quad) {
    const cv::Point2f center = quadCenter(quad);
    cv::Point2f axis = (quad[1] - quad[0]) + (quad[2] - quad[3]);
    const double axis_length = cv::norm(axis);
    if (axis_length < 1.0e-6) {
      return quad;
    }
    axis *= static_cast<float>(1.0 / axis_length);
    const cv::Point2f normal(-axis.y, axis.x);
    const double width = 0.5 * (edgeLength(quad[0], quad[3]) +
                                edgeLength(quad[1], quad[2]));
    double desired_minimum = 0.5 * (quad[0].dot(axis) + quad[3].dot(axis));
    double desired_maximum = 0.5 * (quad[1].dot(axis) + quad[2].dot(axis));
    if (desired_minimum > desired_maximum) {
      std::swap(desired_minimum, desired_maximum);
    }

    std::vector<double> colored_projections;
    for (const cv::Point2f& point : chromatic_points) {
      if (std::abs((point - center).dot(normal)) > 0.80 * width) {
        continue;
      }
      colored_projections.push_back(point.dot(axis));
    }
    if (colored_projections.size() >= 16) {
      std::sort(colored_projections.begin(), colored_projections.end());
      const double colored_minimum = colored_projections[static_cast<size_t>(
          0.01 * (colored_projections.size() - 1))];
      const double colored_maximum = colored_projections[static_cast<size_t>(
          0.99 * (colored_projections.size() - 1))];
      // Chromatic outliers can cover the complete paper body, so their robust
      // extent is already an endpoint estimate. Only pad for sampling and
      // antialiasing; a half-strip-width pad can turn a visibly complete strip
      // into a false frame-spanning crop.
      desired_minimum = std::min(desired_minimum,
                                 colored_minimum - 0.08 * width);
      desired_maximum = std::max(desired_maximum,
                                 colored_maximum + 0.08 * width);
    }

    // Intersect the tracked centerline with the image rectangle. If the whole
    // object evidence reaches a frame edge, preserve that cropped endpoint.
    double frame_minimum = -std::numeric_limits<double>::infinity();
    double frame_maximum = std::numeric_limits<double>::infinity();
    const auto applySlab = [&](double coordinate, double direction,
                               double lower, double upper) {
      if (std::abs(direction) < 1.0e-8) {
        return coordinate >= lower && coordinate <= upper;
      }
      double first = (lower - coordinate) / direction;
      double second = (upper - coordinate) / direction;
      if (first > second) {
        std::swap(first, second);
      }
      frame_minimum = std::max(frame_minimum, first);
      frame_maximum = std::min(frame_maximum, second);
      return frame_minimum <= frame_maximum;
    };
    if (applySlab(center.x, axis.x, 0.0, edges.cols - 1.0) &&
        applySlab(center.y, axis.y, 0.0, edges.rows - 1.0)) {
      const double center_projection = center.dot(axis);
      const double image_minimum = center_projection + frame_minimum;
      const double image_maximum = center_projection + frame_maximum;
      if (desired_minimum - image_minimum < 0.15 * width) {
        desired_minimum = image_minimum;
      }
      if (image_maximum - desired_maximum < 0.15 * width) {
        desired_maximum = image_maximum;
      }
    }

    const auto extendSide = [&](const cv::Point2f& first,
                                const cv::Point2f& second,
                                double projection) {
      const cv::Point2f direction = second - first;
      const double denominator = direction.dot(axis);
      if (std::abs(denominator) < 1.0e-6) {
        return first;
      }
      return first + direction * static_cast<float>(
                                   (projection - first.dot(axis)) / denominator);
    };
    const Quad original = quad;
    quad[0] = extendSide(original[0], original[1], desired_minimum);
    quad[3] = extendSide(original[3], original[2], desired_minimum);
    quad[1] = extendSide(original[0], original[1], desired_maximum);
    quad[2] = extendSide(original[3], original[2], desired_maximum);
    for (cv::Point2f& point : quad) {
      point.x = std::clamp(point.x, 0.0F,
                           static_cast<float>(edges.cols - 1));
      point.y = std::clamp(point.y, 0.0F,
                           static_cast<float>(edges.rows - 1));
    }
    return orderQuad(quad);
  };
  const auto segmentWholeEnvelope = [&](const Quad& seed) {
    cv::Point2f axis = (seed[1] - seed[0]) + (seed[2] - seed[3]);
    const double axis_length = cv::norm(axis);
    if (axis_length < 1.0e-6) {
      return seed;
    }
    axis *= static_cast<float>(1.0 / axis_length);
    const cv::Point2f normal(-axis.y, axis.x);
    const double width = 0.5 * (edgeLength(seed[0], seed[3]) +
                                edgeLength(seed[1], seed[2]));
    std::vector<cv::Point> polygon;
    for (const cv::Point2f& point : seed) {
      polygon.emplace_back(cvRound(point.x), cvRound(point.y));
    }
    cv::Mat probable = cv::Mat::zeros(proposal_rgb.size(), CV_8U);
    cv::fillConvexPoly(probable, polygon, cv::Scalar(255), cv::LINE_AA);
    const int dilation = std::max(3, static_cast<int>(std::round(0.28 * width)) | 1);
    cv::dilate(probable, probable,
               cv::getStructuringElement(cv::MORPH_ELLIPSE,
                                         cv::Size(dilation, dilation)));

    cv::Mat mask(proposal_rgb.size(), CV_8U, cv::Scalar(cv::GC_BGD));
    mask.setTo(cv::GC_PR_FGD, probable);
    cv::Mat chromatic_seed;
    cv::bitwise_and(chromatic_mask, probable, chromatic_seed);
    mask.setTo(cv::GC_FGD, chromatic_seed);
    const size_t definite_foreground = static_cast<size_t>(
        cv::countNonZero(chromatic_seed));
    if (definite_foreground < 16) {
      return seed;
    }

    // The paper handle is a useful identity anchor even when its luminance is
    // almost identical to the tabletop. Fit its two outer boundaries in the
    // chromatic mask; unlike a dark adjacent rail, the handle supplies dense
    // chroma support. These lines seed the full strip sides but do not define
    // its endpoints or split the object into sub-regions.
    bool chromatic_sides_found = false;
    cv::Vec4f chromatic_first_side{};
    cv::Vec4f chromatic_second_side{};
    cv::Mat chromatic_region;
    cv::morphologyEx(
        chromatic_seed, chromatic_region, cv::MORPH_CLOSE,
        cv::getStructuringElement(cv::MORPH_ELLIPSE, cv::Size(5, 5)));
    cv::Mat chromatic_labels;
    cv::Mat chromatic_statistics;
    cv::Mat chromatic_centroids;
    const int chromatic_component_count = cv::connectedComponentsWithStats(
        chromatic_region, chromatic_labels, chromatic_statistics,
        chromatic_centroids, 8, CV_32S);
    int handle_component = 0;
    double handle_score = 0.0;
    for (int component = 1; component < chromatic_component_count; ++component) {
      const int area =
          chromatic_statistics.at<int>(component, cv::CC_STAT_AREA);
      const int component_width =
          chromatic_statistics.at<int>(component, cv::CC_STAT_WIDTH);
      const int component_height =
          chromatic_statistics.at<int>(component, cv::CC_STAT_HEIGHT);
      const double longitudinal_span =
          std::abs(axis.x) * component_width +
          std::abs(axis.y) * component_height;
      const double transverse_span =
          std::abs(normal.x) * component_width +
          std::abs(normal.y) * component_height;
      if (area < 40 || longitudinal_span < 1.2 * width ||
          transverse_span < 0.45 * width ||
          transverse_span > 1.35 * width) {
        continue;
      }
      const double score = area * longitudinal_span;
      if (score > handle_score) {
        handle_score = score;
        handle_component = component;
      }
    }
    if (handle_component > 0) {
      struct ChromaticPoint {
        double longitudinal;
        double transverse;
      };
      std::vector<ChromaticPoint> handle_points;
      double handle_minimum = std::numeric_limits<double>::infinity();
      double handle_maximum = -std::numeric_limits<double>::infinity();
      for (int row = 0; row < chromatic_labels.rows; ++row) {
        for (int column = 0; column < chromatic_labels.cols; ++column) {
          if (chromatic_labels.at<int>(row, column) != handle_component) {
            continue;
          }
          const cv::Point2f point(static_cast<float>(column),
                                  static_cast<float>(row));
          const double longitudinal = point.dot(axis);
          handle_points.push_back(
              {longitudinal, static_cast<double>(point.dot(normal))});
          handle_minimum = std::min(handle_minimum, longitudinal);
          handle_maximum = std::max(handle_maximum, longitudinal);
        }
      }
      constexpr int kHandleSlabs = 24;
      std::array<std::vector<double>, kHandleSlabs> handle_slabs;
      const double handle_span = handle_maximum - handle_minimum;
      if (handle_span >= 1.2 * width) {
        for (const ChromaticPoint& point : handle_points) {
          const int slab = std::clamp(
              static_cast<int>(kHandleSlabs *
                               (point.longitudinal - handle_minimum) /
                               std::max(1.0, handle_span)),
              0, kHandleSlabs - 1);
          handle_slabs[static_cast<size_t>(slab)].push_back(point.transverse);
        }
        std::vector<cv::Point2f> first_points;
        std::vector<cv::Point2f> second_points;
        for (int slab = 0; slab < kHandleSlabs; ++slab) {
          std::vector<double>& values =
              handle_slabs[static_cast<size_t>(slab)];
          if (values.size() < 8) {
            continue;
          }
          std::sort(values.begin(), values.end());
          const double longitudinal = handle_minimum +
              (slab + 0.5) * handle_span / kHandleSlabs;
          const double low =
              values[static_cast<size_t>(0.02 * (values.size() - 1))];
          const double high =
              values[static_cast<size_t>(0.98 * (values.size() - 1))];
          first_points.push_back(
              axis * static_cast<float>(longitudinal) +
              normal * static_cast<float>(low));
          second_points.push_back(
              axis * static_cast<float>(longitudinal) +
              normal * static_cast<float>(high));
        }
        if (first_points.size() >= 10 && second_points.size() >= 10) {
          cv::fitLine(first_points, chromatic_first_side, cv::DIST_HUBER,
                      0.0, 0.01, 0.01);
          cv::fitLine(second_points, chromatic_second_side, cv::DIST_HUBER,
                      0.0, 0.01, 0.01);
          chromatic_sides_found = true;
        }
      }
    }
    cv::Mat background_model;
    cv::Mat foreground_model;
    try {
      cv::grabCut(proposal_rgb, mask, cv::Rect(), background_model,
                  foreground_model, 2, cv::GC_INIT_WITH_MASK);
    } catch (const cv::Exception&) {
      return seed;
    }
    cv::Mat foreground = (mask == cv::GC_FGD) | (mask == cv::GC_PR_FGD);
    cv::Mat labels;
    cv::Mat statistics;
    cv::Mat centroids;
    const int component_count = cv::connectedComponentsWithStats(
        foreground, labels, statistics, centroids, 8, CV_32S);
    const double probable_area = std::max(1, cv::countNonZero(probable));
    std::vector<unsigned char> selected(
        static_cast<size_t>(component_count), 0);
    std::vector<size_t> chromatic_support(
        static_cast<size_t>(component_count), 0);
    for (int row = 0; row < labels.rows; ++row) {
      for (int column = 0; column < labels.cols; ++column) {
        const int component = labels.at<int>(row, column);
        if (component > 0 && chromatic_seed.at<unsigned char>(row, column)) {
          ++chromatic_support[static_cast<size_t>(component)];
        }
      }
    }
    int best_component = 0;
    double best_component_score = 0.0;
    for (int component = 1; component < component_count; ++component) {
      const int area = statistics.at<int>(component, cv::CC_STAT_AREA);
      const int component_width = statistics.at<int>(component, cv::CC_STAT_WIDTH);
      const int component_height = statistics.at<int>(component, cv::CC_STAT_HEIGHT);
      const double longitudinal_span =
          std::abs(axis.x) * component_width +
          std::abs(axis.y) * component_height;
      if (area >= std::max(40.0, probable_area * 0.008) &&
          longitudinal_span >= 1.2 * width &&
          chromatic_support[static_cast<size_t>(component)] >= 4) {
        const double component_score =
            chromatic_support[static_cast<size_t>(component)] *
            std::sqrt(static_cast<double>(area));
        if (component_score > best_component_score) {
          best_component_score = component_score;
          best_component = component;
        }
      }
    }
    if (best_component > 0) {
      selected[static_cast<size_t>(best_component)] = 1;
    }

    struct ProjectedPoint {
      double longitudinal = 0.0;
      double transverse = 0.0;
      int component = 0;
    };
    std::vector<ProjectedPoint> points;
    for (int row = 0; row < labels.rows; ++row) {
      for (int column = 0; column < labels.cols; ++column) {
        const int component = labels.at<int>(row, column);
        if (component <= 0 || !selected[static_cast<size_t>(component)]) {
          continue;
        }
        const cv::Point2f point(static_cast<float>(column),
                                static_cast<float>(row));
        points.push_back({point.dot(axis), point.dot(normal), component});
      }
    }
    if (points.size() < 100) {
      return seed;
    }
    double minimum_longitudinal = std::numeric_limits<double>::infinity();
    double maximum_longitudinal = -std::numeric_limits<double>::infinity();
    int first_component = 0;
    int last_component = 0;
    for (const ProjectedPoint& point : points) {
      if (point.longitudinal < minimum_longitudinal) {
        minimum_longitudinal = point.longitudinal;
        first_component = point.component;
      }
      if (point.longitudinal > maximum_longitudinal) {
        maximum_longitudinal = point.longitudinal;
        last_component = point.component;
      }
    }
    std::vector<double> longitudinal_values;
    longitudinal_values.reserve(points.size());
    for (const ProjectedPoint& point : points) {
      longitudinal_values.push_back(point.longitudinal);
    }
    std::sort(longitudinal_values.begin(), longitudinal_values.end());
    minimum_longitudinal = longitudinal_values.front();
    maximum_longitudinal = longitudinal_values.back();
    const double span = maximum_longitudinal - minimum_longitudinal;
    if (span < 2.0 * width) {
      return seed;
    }
    // Keep the longest sustained full-width ribbon. A neighboring rail may be
    // connected to the strip mask and continue past its tip, but its transverse
    // occupancy collapses and therefore cannot extend the whole-strip envelope.
    const int bin_origin = static_cast<int>(std::floor(minimum_longitudinal));
    const int bin_count = std::max(
        1, static_cast<int>(std::ceil(maximum_longitudinal)) - bin_origin + 1);
    std::vector<double> bin_min(static_cast<size_t>(bin_count),
                                std::numeric_limits<double>::infinity());
    std::vector<double> bin_max(static_cast<size_t>(bin_count),
                                -std::numeric_limits<double>::infinity());
    std::vector<size_t> bin_samples(static_cast<size_t>(bin_count), 0);
    for (const ProjectedPoint& point : points) {
      const int index = std::clamp(
          static_cast<int>(std::floor(point.longitudinal)) - bin_origin,
          0, bin_count - 1);
      bin_min[static_cast<size_t>(index)] =
          std::min(bin_min[static_cast<size_t>(index)], point.transverse);
      bin_max[static_cast<size_t>(index)] =
          std::max(bin_max[static_cast<size_t>(index)], point.transverse);
      ++bin_samples[static_cast<size_t>(index)];
    }
    std::vector<double> occupied_widths;
    for (int index = 0; index < bin_count; ++index) {
      if (bin_samples[static_cast<size_t>(index)] >= 3) {
        occupied_widths.push_back(bin_max[static_cast<size_t>(index)] -
                                  bin_min[static_cast<size_t>(index)]);
      }
    }
    if (!occupied_widths.empty()) {
      std::sort(occupied_widths.begin(), occupied_widths.end());
      const double reference_width = occupied_widths[static_cast<size_t>(
          0.75 * (occupied_widths.size() - 1))];
      std::vector<unsigned char> full_width(static_cast<size_t>(bin_count), 0);
      for (int index = 0; index < bin_count; ++index) {
        if (bin_samples[static_cast<size_t>(index)] >= 3 &&
            bin_max[static_cast<size_t>(index)] -
                    bin_min[static_cast<size_t>(index)] >=
                0.38 * reference_width) {
          full_width[static_cast<size_t>(index)] = 1;
        }
      }
      const int maximum_gap = std::max(2, static_cast<int>(1.15 * width));
      for (int index = 0; index < bin_count;) {
        if (full_width[static_cast<size_t>(index)]) {
          ++index;
          continue;
        }
        const int gap_start = index;
        while (index < bin_count &&
               !full_width[static_cast<size_t>(index)]) {
          ++index;
        }
        if (gap_start > 0 && index < bin_count &&
            index - gap_start <= maximum_gap) {
          std::fill(full_width.begin() + gap_start,
                    full_width.begin() + index, 1);
        }
      }
      int best_start = 0;
      int best_end = 0;
      for (int index = 0; index < bin_count;) {
        while (index < bin_count &&
               !full_width[static_cast<size_t>(index)]) {
          ++index;
        }
        const int run_start = index;
        while (index < bin_count &&
               full_width[static_cast<size_t>(index)]) {
          ++index;
        }
        if (index - run_start > best_end - best_start) {
          best_start = run_start;
          best_end = index;
        }
      }
      if (best_end - best_start >= 2.0 * width) {
        minimum_longitudinal = bin_origin + best_start;
        maximum_longitudinal = bin_origin + best_end;
        first_component = 0;
        last_component = 0;
        double first_distance = std::numeric_limits<double>::infinity();
        double last_distance = std::numeric_limits<double>::infinity();
        for (const ProjectedPoint& point : points) {
          const double distance_to_first =
              std::abs(point.longitudinal - minimum_longitudinal);
          if (distance_to_first < first_distance) {
            first_distance = distance_to_first;
            first_component = point.component;
          }
          const double distance_to_last =
              std::abs(point.longitudinal - maximum_longitudinal);
          if (distance_to_last < last_distance) {
            last_distance = distance_to_last;
            last_component = point.component;
          }
        }
      }
    }
    const auto transverseBounds = [&](bool first_endpoint) {
      std::vector<double> values;
      const int endpoint_component =
          first_endpoint ? first_component : last_component;
      for (const ProjectedPoint& point : points) {
        if (point.component == endpoint_component) {
          values.push_back(point.transverse);
        }
      }
      if (values.size() < 20) {
        return std::pair<double, double>(-0.5 * width, 0.5 * width);
      }
      std::sort(values.begin(), values.end());
      // Robustly suppress a neighboring dark rail that may touch one side of
      // the strip mask, while retaining the weak paper edge on the other side.
      const size_t low = static_cast<size_t>(0.02 * (values.size() - 1));
      const size_t high = static_cast<size_t>(0.93 * (values.size() - 1));
      return std::pair<double, double>(values[low], values[high]);
    };
    auto first_bounds = transverseBounds(true);
    auto second_bounds = transverseBounds(false);

    const cv::Point2f seed_center = quadCenter(seed);
    double line_minimum = -std::numeric_limits<double>::infinity();
    double line_maximum = std::numeric_limits<double>::infinity();
    const auto applySlab = [&](double coordinate, double direction,
                               double lower, double upper) {
      if (std::abs(direction) < 1.0e-8) {
        return coordinate >= lower && coordinate <= upper;
      }
      double first = (lower - coordinate) / direction;
      double second = (upper - coordinate) / direction;
      if (first > second) {
        std::swap(first, second);
      }
      line_minimum = std::max(line_minimum, first);
      line_maximum = std::min(line_maximum, second);
      return line_minimum <= line_maximum;
    };
    if (applySlab(seed_center.x, axis.x, 0.0, proposal_rgb.cols - 1.0) &&
        applySlab(seed_center.y, axis.y, 0.0, proposal_rgb.rows - 1.0)) {
      const double center_projection = seed_center.dot(axis);
      const double frame_minimum = center_projection + line_minimum;
      const double frame_maximum = center_projection + line_maximum;
      if (minimum_longitudinal - frame_minimum < 0.60 * width) {
        minimum_longitudinal = frame_minimum;
      }
      if (frame_maximum - maximum_longitudinal < 0.15 * width) {
        maximum_longitudinal = frame_maximum;
      }
    }
    double seed_minimum = 0.5 * (seed[0].dot(axis) + seed[3].dot(axis));
    double seed_maximum = 0.5 * (seed[1].dot(axis) + seed[2].dot(axis));
    if (seed_minimum > seed_maximum) {
      std::swap(seed_minimum, seed_maximum);
    }
    if (maximum_longitudinal - minimum_longitudinal <
        0.72 * (seed_maximum - seed_minimum)) {
      // GrabCut can disconnect a pale paper handle from the membrane where
      // translucent tape crosses their junction. Never let that convert a
      // whole-object seed back into a membrane-only fragment.
      return seed;
    }
    const auto pointFromCoordinates = [&](double longitudinal,
                                          double transverse) {
      return axis * static_cast<float>(longitudinal) +
             normal * static_cast<float>(transverse);
    };

    // This is a whole-object proposal, not the final geometry. Its robust
    // transverse envelope is the generic fallback. A detected paper handle
    // supplies two independent side slopes and prevents a neutral adjacent
    // rail from becoming one of the strip sides.
    Quad result = orderQuad({
        pointFromCoordinates(minimum_longitudinal, first_bounds.first),
        pointFromCoordinates(maximum_longitudinal, second_bounds.first),
        pointFromCoordinates(maximum_longitudinal, second_bounds.second),
        pointFromCoordinates(minimum_longitudinal, first_bounds.second)});
    if (chromatic_sides_found) {
      const cv::Point2f first_origin =
          pointFromCoordinates(minimum_longitudinal, 0.0);
      const cv::Point2f second_origin =
          pointFromCoordinates(maximum_longitudinal, 0.0);
      const cv::Vec4f first_end(normal.x, normal.y,
                                first_origin.x, first_origin.y);
      const cv::Vec4f second_end(normal.x, normal.y,
                                 second_origin.x, second_origin.y);
      Quad chromatic_result{};
      if (intersectLines(chromatic_first_side, first_end,
                         chromatic_result[0]) &&
          intersectLines(chromatic_first_side, second_end,
                         chromatic_result[1]) &&
          intersectLines(chromatic_second_side, second_end,
                         chromatic_result[2]) &&
          intersectLines(chromatic_second_side, first_end,
                         chromatic_result[3])) {
        chromatic_result = orderQuad(chromatic_result);
        const double first_width =
            edgeLength(chromatic_result[0], chromatic_result[3]);
        const double second_width =
            edgeLength(chromatic_result[1], chromatic_result[2]);
        const double mean_width = 0.5 * (first_width + second_width);
        const double width_ratio =
            std::max(first_width, second_width) /
            std::max(1.0, std::min(first_width, second_width));
        // This gate only decides whether the handle is a trustworthy seed. It
        // does not constrain the final independently refined projective quad.
        if (validConvexQuad(chromatic_result) && width_ratio <= 1.18 &&
            mean_width >= 0.75 * width && mean_width <= 1.20 * width) {
          result = chromatic_result;
        }
      }
    }
    for (cv::Point2f& point : result) {
      point.x = std::clamp(point.x, 0.0F,
                           static_cast<float>(proposal_rgb.cols - 1));
      point.y = std::clamp(point.y, 0.0F,
                           static_cast<float>(proposal_rgb.rows - 1));
    }
    return validConvexQuad(result) ? result : seed;
  };
  struct WholeSeed {
    Quad quad{};
    double score = 0.0;
  };
  std::vector<WholeSeed> raw_seeds;
  const auto addRawSeed = [&](const Quad& input, double structural_score) {
    Quad quad = extendToWholeStrip(input);
    if (!validConvexQuad(quad)) {
      return;
    }
    const double area = polygonArea(quad);
    if (area < maximum_dimension * minimum_dimension * 0.04) {
      return;
    }
    size_t chromatic_inside = 0;
    std::vector<cv::Point2f> polygon(quad.begin(), quad.end());
    for (const cv::Point2f& point : chromatic_points) {
      if (cv::pointPolygonTest(polygon, point, false) >= 0.0) {
        ++chromatic_inside;
      }
    }
    // chromatic_points is sampled at a two-pixel stride in each direction.
    const double chromatic_density =
        std::min(1.0, 4.0 * chromatic_inside / std::max(1.0, area));
    const double long_side = 0.5 *
        (edgeLength(quad[0], quad[1]) + edgeLength(quad[3], quad[2]));
    const double short_side = 0.5 *
        (edgeLength(quad[0], quad[3]) + edgeLength(quad[1], quad[2]));
    const double extent =
        std::min(1.0, long_side / static_cast<double>(maximum_dimension));
    const double strip_aspect = long_side / std::max(1.0, short_side);
    const double aspect_score = sigmoidScore(strip_aspect, 2.0, 6.0);
    const double score = 0.25 * structural_score + 0.27 * extent +
                         0.28 * std::min(1.0, chromatic_density / 0.24) +
                         0.20 * aspect_score;
    for (WholeSeed& existing : raw_seeds) {
      double distance = 0.0;
      for (size_t corner = 0; corner < quad.size(); ++corner) {
        distance += cv::norm(existing.quad[corner] - quad[corner]);
      }
      if (distance / quad.size() < 4.0) {
        if (score > existing.score) {
          existing = {quad, score};
        }
        return;
      }
    }
    raw_seeds.push_back({quad, score});
  };
  for (size_t first = 0; first < tracks.size(); ++first) {
    const double first_span = tracks[first].maximum_projection -
                              tracks[first].minimum_projection;
    if (first_span < maximum_dimension * 0.22) {
      continue;
    }
    for (size_t second = first + 1; second < tracks.size(); ++second) {
      cv::Point2f direction = tracks[first].direction;
      if (direction.dot(tracks[second].direction) < 0.0F) {
        direction *= -1.0F;
      }
      if (std::abs(direction.dot(tracks[second].direction)) <
          direction_threshold) {
        continue;
      }
      const cv::Point2f first_center =
          pointAtProjection(tracks[first], 0.5 *
              (tracks[first].minimum_projection +
               tracks[first].maximum_projection));
      const double separation =
          pointLineDistance(first_center, tracks[second].line);
      if (separation < minimum_dimension * 0.03 ||
          separation > minimum_dimension * 0.72) {
        continue;
      }
      const double start = std::max(tracks[first].minimum_projection,
                                    tracks[second].minimum_projection);
      const double end = std::min(tracks[first].maximum_projection,
                                  tracks[second].maximum_projection);
      const double overlap = end - start;
      if (overlap < maximum_dimension * 0.24 ||
          overlap / separation < 1.8 ||
          overlap / separation > 35.0) {
        continue;
      }
      Quad quad = {
          pointAtProjection(tracks[first], start),
          pointAtProjection(tracks[first], end),
          pointAtProjection(tracks[second], end),
          pointAtProjection(tracks[second], start)};
      quad = orderQuad(quad);
      if (validConvexQuad(quad)) {
        const double overlap_score = std::min(
            1.0, overlap / static_cast<double>(maximum_dimension));
        const double separation_score = std::exp(
            -std::pow((separation / minimum_dimension - 0.40) / 0.28, 2.0));
        addRawSeed(quad, 0.75 * overlap_score + 0.25 * separation_score);
      }
    }
  }

  // A portrait capture may crop one long membrane edge exactly at the frame
  // boundary, so Hough has only the opposite physical side. Pair a dominant
  // near-vertical track with either image border and use the broad handle seam
  // to establish the membrane start; this avoids stopping at the C line.
  for (const Track& track : tracks) {
    const double span = track.maximum_projection - track.minimum_projection;
    if (span < maximum_dimension * 0.65 ||
        std::abs(track.direction.y) < 0.94F) {
      continue;
    }
    const cv::Point2f start_on_line =
        pointAtProjection(track, track.minimum_projection);
    const cv::Point2f end_on_line =
        pointAtProjection(track, track.maximum_projection);
    for (const float border_x : {0.0F, static_cast<float>(edges.cols - 1)}) {
      const double separation = std::abs(start_on_line.x - border_x);
      if (separation < minimum_dimension * 0.15 ||
          separation > minimum_dimension * 0.68) {
        continue;
      }
      Quad quad = orderQuad({
          start_on_line, end_on_line,
          cv::Point2f(border_x, end_on_line.y),
          cv::Point2f(border_x, start_on_line.y)});
      addRawSeed(quad, std::min(1.0, span / maximum_dimension) * 0.82);
    }
  }
  std::sort(raw_seeds.begin(), raw_seeds.end(),
            [](const WholeSeed& first, const WholeSeed& second) {
              return first.score > second.score;
            });
  if (raw_seeds.size() > 1) {
    raw_seeds.resize(1);
  }
  std::vector<Quad> proposals;
  proposals.reserve(raw_seeds.size());
  for (const WholeSeed& seed : raw_seeds) {
    const Quad segmented = segmentWholeEnvelope(seed.quad);
    if (!validConvexQuad(segmented)) {
      continue;
    }
    bool duplicate = false;
    for (const Quad& existing : proposals) {
      double distance = 0.0;
      for (size_t corner = 0; corner < segmented.size(); ++corner) {
        distance += cv::norm(existing[corner] - segmented[corner]);
      }
      duplicate = distance / segmented.size() < 3.0;
      if (duplicate) {
        break;
      }
    }
    if (!duplicate) {
      proposals.push_back(segmented);
    }
  }
  return proposals;
}

cv::Point2f diagonalCenter(const Quad& quad) {
  const cv::Vec4f first(quad[2].x - quad[0].x, quad[2].y - quad[0].y,
                        quad[0].x, quad[0].y);
  const cv::Vec4f second(quad[3].x - quad[1].x, quad[3].y - quad[1].y,
                         quad[1].x, quad[1].y);
  cv::Point2f center;
  if (!intersectLines(first, second, center)) {
    return (quad[0] + quad[1] + quad[2] + quad[3]) * 0.25F;
  }
  return center;
}

double markerCenterLuminance(const cv::Mat& rgb, const Quad& quad) {
  const std::array<cv::Point2f, 4> destination = {
      cv::Point2f(0.0F, 0.0F), cv::Point2f(63.0F, 0.0F),
      cv::Point2f(63.0F, 63.0F), cv::Point2f(0.0F, 63.0F)};
  const cv::Mat transform = cv::getPerspectiveTransform(quad.data(), destination.data());
  cv::Mat marker;
  cv::warpPerspective(rgb, marker, transform, cv::Size(64, 64), cv::INTER_AREA,
                      cv::BORDER_REPLICATE);
  cv::Mat gray;
  cv::cvtColor(marker, gray, cv::COLOR_RGB2GRAY);
  return cv::mean(gray(cv::Rect(24, 24, 16, 16)))[0] / 255.0;
}

struct SquareCandidate {
  Quad quad{};
  cv::Point2f center;
  double area = 0.0;
  double center_luminance = 0.0;
  double support_fraction = 0.0;
  double rmse_px = 0.0;
};

std::vector<SquareCandidate> findFiducials(const cv::Mat& rgb,
                                           const CardProfile& card) {
  const ProposalImage proposal = makeProposalImage(rgb);
  cv::Mat gray;
  cv::cvtColor(proposal.rgb, gray, cv::COLOR_RGB2GRAY);
  cv::GaussianBlur(gray, gray, cv::Size(5, 5), 0.0);
  cv::Mat dark;
  cv::threshold(gray, dark, 0, 255, cv::THRESH_BINARY_INV | cv::THRESH_OTSU);
  cv::morphologyEx(dark, dark, cv::MORPH_CLOSE,
                   cv::getStructuringElement(cv::MORPH_RECT, cv::Size(5, 5)));

  std::vector<std::vector<cv::Point>> contours;
  cv::findContours(dark, contours, cv::RETR_LIST, cv::CHAIN_APPROX_SIMPLE);
  const double proposal_area = static_cast<double>(proposal.rgb.cols) * proposal.rgb.rows;
  const double min_area =
      proposal_area * std::max(0.00005, card.min_area_fraction * 0.012);
  const double max_area = proposal_area * 0.08;

  struct CoarseSquare {
    Quad quad{};
    double area = 0.0;
  };
  std::vector<CoarseSquare> coarse;
  for (const auto& contour : contours) {
    const double area = std::abs(cv::contourArea(contour));
    if (area < min_area || area > max_area || contour.size() < 4) {
      continue;
    }
    const cv::RotatedRect rect = cv::minAreaRect(contour);
    const double short_side = std::min(rect.size.width, rect.size.height);
    const double long_side = std::max(rect.size.width, rect.size.height);
    if (short_side < 8.0 || long_side / std::max(short_side, 1.0) > 3.5 ||
        area / std::max(1.0, static_cast<double>(rect.size.area())) < 0.35) {
      continue;
    }
    coarse.push_back({contourQuad(contour), area});
  }
  std::sort(coarse.begin(), coarse.end(),
            [](const CoarseSquare& first, const CoarseSquare& second) {
              return first.area > second.area;
            });
  if (coarse.size() > 32) {
    coarse.resize(32);
  }

  std::vector<SquareCandidate> candidates;
  for (const CoarseSquare& value : coarse) {
    const Quad initial = scaleQuad(value.quad, 1.0 / proposal.scale);
    const RefinedQuad refined = refineQuadEdges(rgb, initial, -1);
    if (!refined.found) {
      continue;
    }
    const cv::Point2f center = diagonalCenter(refined.corners);
    const double area = polygonArea(refined.corners);
    bool duplicate = false;
    for (const SquareCandidate& existing : candidates) {
      if (cv::norm(center - existing.center) <
          0.20 * std::sqrt(std::min(area, existing.area))) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) {
      continue;
    }
    candidates.push_back({refined.corners, center, area,
                          markerCenterLuminance(rgb, refined.corners),
                          refined.support_fraction, refined.rmse_px});
  }
  std::sort(candidates.begin(), candidates.end(),
            [](const SquareCandidate& first, const SquareCandidate& second) {
              return first.area > second.area;
            });
  if (candidates.size() > 16) {
    candidates.resize(16);
  }
  return candidates;
}

std::array<size_t, 4> cyclicLayout(const std::vector<SquareCandidate>& candidates,
                                   const std::array<size_t, 4>& indices,
                                   size_t orientation_marker, bool& valid) {
  cv::Point2f center;
  for (size_t index : indices) {
    center += candidates[index].center;
  }
  center *= 0.25F;
  std::array<std::pair<double, size_t>, 4> around{};
  for (size_t i = 0; i < 4; ++i) {
    const cv::Point2f point = candidates[indices[i]].center;
    around[i] = {std::atan2(point.y - center.y, point.x - center.x), indices[i]};
  }
  std::sort(around.begin(), around.end());
  std::vector<cv::Point2f> polygon;
  for (const auto& item : around) {
    polygon.push_back(candidates[item.second].center);
  }
  if (!cv::isContourConvex(polygon)) {
    valid = false;
    return {};
  }
  if (cv::contourArea(polygon, true) < 0.0) {
    std::reverse(around.begin() + 1, around.end());
  }
  size_t marker_position = 4;
  for (size_t i = 0; i < 4; ++i) {
    if (around[i].second == orientation_marker) {
      marker_position = i;
      break;
    }
  }
  if (marker_position == 4) {
    valid = false;
    return {};
  }
  valid = true;
  return {around[marker_position].second,
          around[(marker_position + 1) % 4].second,
          around[(marker_position + 2) % 4].second,
          around[(marker_position + 3) % 4].second};
}

std::array<cv::Point2f, 4> canonicalMarkerCorners(const cv::Point2f& center,
                                                   double side) {
  const float half = static_cast<float>(side * 0.5);
  return {center + cv::Point2f(-half, -half),
          center + cv::Point2f(half, -half),
          center + cv::Point2f(half, half),
          center + cv::Point2f(-half, half)};
}

std::array<size_t, 4> matchMarkerCorners(
    const Quad& source, const cv::Mat& provisional,
    const std::array<cv::Point2f, 4>& expected) {
  std::vector<cv::Point2f> projected(source.begin(), source.end());
  cv::perspectiveTransform(projected, projected, provisional);
  std::array<size_t, 4> permutation = {0, 1, 2, 3};
  std::array<size_t, 4> best = permutation;
  double best_error = std::numeric_limits<double>::infinity();
  do {
    double error = 0.0;
    for (size_t index = 0; index < 4; ++index) {
      error += cv::norm(projected[permutation[index]] - expected[index]);
    }
    if (error < best_error) {
      best_error = error;
      best = permutation;
    }
  } while (std::next_permutation(permutation.begin(), permutation.end()));
  return best;
}

double reprojectionRmse(const std::vector<cv::Point2f>& source,
                        const std::vector<cv::Point2f>& destination,
                        const cv::Mat& homography) {
  if (source.empty() || homography.empty()) {
    return std::numeric_limits<double>::infinity();
  }
  std::vector<cv::Point2f> projected = source;
  cv::perspectiveTransform(projected, projected, homography);
  double squared = 0.0;
  for (size_t index = 0; index < projected.size(); ++index) {
    const double error = cv::norm(projected[index] - destination[index]);
    squared += error * error;
  }
  return std::sqrt(squared / projected.size());
}

double holdoutRmse(const std::vector<cv::Point2f>& source,
                   const std::vector<cv::Point2f>& destination) {
  double worst = 0.0;
  for (size_t held_marker = 0; held_marker < 4; ++held_marker) {
    std::vector<cv::Point2f> training_source;
    std::vector<cv::Point2f> training_destination;
    std::vector<cv::Point2f> held_source;
    std::vector<cv::Point2f> held_destination;
    for (size_t marker = 0; marker < 4; ++marker) {
      for (size_t corner = 0; corner < 4; ++corner) {
        const size_t index = marker * 4 + corner;
        if (marker == held_marker) {
          held_source.push_back(source[index]);
          held_destination.push_back(destination[index]);
        } else {
          training_source.push_back(source[index]);
          training_destination.push_back(destination[index]);
        }
      }
    }
    const cv::Mat homography =
        cv::findHomography(training_source, training_destination, 0);
    worst = std::max(worst,
                     reprojectionRmse(held_source, held_destination, homography));
  }
  return worst;
}

cv::Mat robustHomography(const std::vector<cv::Point2f>& source,
                         const std::vector<cv::Point2f>& destination,
                         cv::Mat& inlier_mask) {
#if CV_VERSION_MAJOR >= 5 || (CV_VERSION_MAJOR == 4 && CV_VERSION_MINOR >= 5)
  constexpr int method = cv::USAC_MAGSAC;
#else
  constexpr int method = cv::RANSAC;
#endif
  return cv::findHomography(source, destination, method, 2.0, inlier_mask,
                            2000, 0.999);
}

}  // namespace

LocalizationResult ClassicalRegionLocator::locateBare(
    const cv::Mat& rgb, const AssayProfile& assay) const {
  LocalizationResult result;
  result.mode = "bare";
  if (rgb.empty() || rgb.type() != CV_8UC3) {
    result.failure_reason = "unsupported_image";
    return result;
  }

  const ProposalImage proposal = makeProposalImage(rgb);
  cv::Mat gray;
  cv::cvtColor(proposal.rgb, gray, cv::COLOR_RGB2GRAY);
  cv::GaussianBlur(gray, gray, cv::Size(5, 5), 0.0);
  cv::Mat edges;
  cv::Canny(gray, edges, 35.0, 110.0);
  const int kernel_size =
      std::max(5, (std::min(proposal.rgb.cols, proposal.rgb.rows) / 100) | 1);
  cv::morphologyEx(
      edges, edges, cv::MORPH_CLOSE,
      cv::getStructuringElement(cv::MORPH_RECT,
                                cv::Size(kernel_size * 3, kernel_size)));

  std::vector<std::vector<cv::Point>> contours;
  cv::findContours(edges, contours, cv::RETR_LIST, cv::CHAIN_APPROX_SIMPLE);
  const size_t strict_contour_count = contours.size();
  // Also retain a lower-threshold proposal tier for faint paper/backing edges.
  // These candidates receive a prior penalty below, so texture cannot displace
  // a clean boundary unless rectified content and enclosure evidence agree.
  cv::Mat faint_edges;
  cv::Canny(gray, faint_edges, 18.0, 70.0);
  cv::morphologyEx(
      faint_edges, faint_edges, cv::MORPH_CLOSE,
      cv::getStructuringElement(cv::MORPH_RECT,
                                cv::Size(kernel_size * 3, kernel_size)));
  std::vector<std::vector<cv::Point>> faint_contours;
  cv::findContours(faint_edges, faint_contours, cv::RETR_LIST,
                   cv::CHAIN_APPROX_SIMPLE);
  contours.insert(contours.end(), faint_contours.begin(), faint_contours.end());
  const size_t faint_contour_end = contours.size();
  cv::Mat lab;
  cv::cvtColor(proposal.rgb, lab, cv::COLOR_RGB2Lab);
  std::vector<cv::Mat> lab_channels;
  cv::split(lab, lab_channels);
  cv::Mat chromatic_edges = cv::Mat::zeros(gray.size(), CV_8U);
  for (const cv::Mat& channel : lab_channels) {
    cv::Mat channel_edges;
    cv::Canny(channel, channel_edges, 18.0, 60.0);
    cv::bitwise_or(chromatic_edges, channel_edges, chromatic_edges);
  }
  cv::morphologyEx(
      chromatic_edges, chromatic_edges, cv::MORPH_CLOSE,
      cv::getStructuringElement(cv::MORPH_RECT,
                                cv::Size(kernel_size * 3, kernel_size)));
  std::vector<std::vector<cv::Point>> chromatic_contours;
  cv::findContours(chromatic_edges, chromatic_contours, cv::RETR_LIST,
                   cv::CHAIN_APPROX_SIMPLE);
  contours.insert(contours.end(), chromatic_contours.begin(),
                  chromatic_contours.end());
  const size_t chromatic_contour_end = contours.size();
  cv::Mat thresholded;
  cv::threshold(gray, thresholded, 0.0, 255.0,
                cv::THRESH_BINARY | cv::THRESH_OTSU);
  cv::morphologyEx(
      thresholded, thresholded, cv::MORPH_CLOSE,
      cv::getStructuringElement(cv::MORPH_RECT,
                                cv::Size(kernel_size * 3, kernel_size)));
  std::vector<std::vector<cv::Point>> threshold_contours;
  cv::findContours(thresholded, threshold_contours, cv::RETR_LIST,
                   cv::CHAIN_APPROX_SIMPLE);
  contours.insert(contours.end(), threshold_contours.begin(),
                  threshold_contours.end());
  cv::bitwise_not(thresholded, thresholded);
  threshold_contours.clear();
  cv::findContours(thresholded, threshold_contours, cv::RETR_LIST,
                   cv::CHAIN_APPROX_SIMPLE);
  contours.insert(contours.end(), threshold_contours.begin(),
                  threshold_contours.end());
  const double proposal_area =
      static_cast<double>(proposal.rgb.cols) * proposal.rgb.rows;
  struct BareProposal {
    Quad quad{};
    double score = 0.0;
    bool line_pair_seed = false;
  };
  std::vector<BareProposal> proposals;
  const auto addProposal = [&](const Quad& quad, double score,
                               bool line_pair_seed = false) {
    for (BareProposal& existing : proposals) {
      double distance = 0.0;
      for (size_t corner = 0; corner < quad.size(); ++corner) {
        distance += cv::norm(existing.quad[corner] - quad[corner]);
      }
      if (distance / quad.size() < 3.0) {
        existing.score = std::max(existing.score, score);
        existing.line_pair_seed = existing.line_pair_seed || line_pair_seed;
        return;
      }
    }
    proposals.push_back({quad, score, line_pair_seed});
  };
  std::vector<cv::Point2f> proposal_chromatic_points;
  proposal_chromatic_points.reserve(
      static_cast<size_t>(proposal.rgb.total() / 12));
  const cv::Vec3d proposal_reference_chromaticity =
      robustImageChromaticity(proposal.rgb);
  const bool compensate_proposal_cast =
      cv::norm(proposal_reference_chromaticity -
               cv::Vec3d(1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0)) > 0.05;
  for (int row = 0; row < proposal.rgb.rows; row += 2) {
    for (int column = 0; column < proposal.rgb.cols; column += 2) {
      const cv::Vec3b pixel = proposal.rgb.at<cv::Vec3b>(row, column);
      // Select material that differs from the dominant image chromaticity,
      // rather than using absolute channel spread. A global warm/cool cast can
      // saturate the complete background, but it must not become a false
      // "handle" cluster that extends a fragment across the frame.
      const auto [minimum_channel, maximum_channel] =
          std::minmax_element(pixel.val, pixel.val + 3);
      const bool chromatic = compensate_proposal_cast
          ? cv::norm(pixelChromaticity(pixel) -
                     proposal_reference_chromaticity) >= 0.035
          : *maximum_channel - *minimum_channel >= 25;
      if (chromatic) {
        proposal_chromatic_points.emplace_back(
            static_cast<float>(column), static_cast<float>(row));
      }
    }
  }
  const auto expandFragmentThroughHandle = [&](const Quad& fragment) {
    Quad unchanged = fragment;
    cv::Point2f axis =
        (fragment[1] - fragment[0]) + (fragment[2] - fragment[3]);
    const double axis_length = cv::norm(axis);
    if (axis_length < 1.0e-6) {
      return std::pair<bool, Quad>(false, unchanged);
    }
    axis *= static_cast<float>(1.0 / axis_length);
    const cv::Point2f normal(-axis.y, axis.x);
    const cv::Point2f center = quadCenter(fragment);
    const double width = 0.5 *
        (edgeLength(fragment[0], fragment[3]) +
         edgeLength(fragment[1], fragment[2]));
    if (width < 5.0) {
      return std::pair<bool, Quad>(false, unchanged);
    }
    std::vector<double> projections;
    for (const cv::Point2f& point : proposal_chromatic_points) {
      if (std::abs((point - center).dot(normal)) <= 0.95 * width) {
        projections.push_back(point.dot(axis));
      }
    }
    if (projections.size() < 24) {
      return std::pair<bool, Quad>(false, unchanged);
    }
    std::sort(projections.begin(), projections.end());
    const double cluster_gap = std::max(4.0, 0.75 * width);
    size_t best_begin = 0;
    size_t best_end = 0;
    for (size_t begin = 0; begin < projections.size();) {
      size_t end = begin + 1;
      while (end < projections.size() &&
             projections[end] - projections[end - 1] <= cluster_gap) {
        ++end;
      }
      if (end - begin > best_end - best_begin) {
        best_begin = begin;
        best_end = end;
      }
      begin = end;
    }
    if (best_end - best_begin < 24 ||
        projections[best_end - 1] - projections[best_begin] < 0.6 * width) {
      return std::pair<bool, Quad>(false, unchanged);
    }
    double desired_minimum =
        0.5 * (fragment[0].dot(axis) + fragment[3].dot(axis));
    double desired_maximum =
        0.5 * (fragment[1].dot(axis) + fragment[2].dot(axis));
    if (desired_minimum > desired_maximum) {
      std::swap(desired_minimum, desired_maximum);
    }
    const double original_span = desired_maximum - desired_minimum;
    desired_minimum = std::min(
        desired_minimum, projections[best_begin] - 0.08 * width);
    desired_maximum = std::max(
        desired_maximum, projections[best_end - 1] + 0.08 * width);
    if (desired_maximum - desired_minimum < original_span + 0.8 * width) {
      return std::pair<bool, Quad>(false, unchanged);
    }
    const auto extendSide = [&](const cv::Point2f& first,
                                const cv::Point2f& second,
                                double projection) {
      const cv::Point2f direction = second - first;
      const double denominator = direction.dot(axis);
      if (std::abs(denominator) < 1.0e-6) {
        return first;
      }
      return first + direction * static_cast<float>(
                                   (projection - first.dot(axis)) /
                                   denominator);
    };
    Quad expanded = {
        extendSide(fragment[0], fragment[1], desired_minimum),
        extendSide(fragment[0], fragment[1], desired_maximum),
        extendSide(fragment[3], fragment[2], desired_maximum),
        extendSide(fragment[3], fragment[2], desired_minimum)};
    expanded = orderQuad(expanded);
    for (cv::Point2f& point : expanded) {
      point.x = std::clamp(point.x, 0.0F,
                           static_cast<float>(proposal.rgb.cols - 1));
      point.y = std::clamp(point.y, 0.0F,
                           static_cast<float>(proposal.rgb.rows - 1));
    }
    return std::pair<bool, Quad>(validConvexQuad(expanded), expanded);
  };
  for (size_t contour_index = 0; contour_index < contours.size();
       ++contour_index) {
    const auto& contour = contours[contour_index];
    const double contour_area = std::abs(cv::contourArea(contour));
    const double area_fraction = contour_area / proposal_area;
    if (area_fraction < assay.quality.min_quad_area_fraction * 0.35 ||
        area_fraction > 0.95 || contour.size() < 4) {
      continue;
    }
    const Quad quad = contourQuad(contour);
    const double width = 0.5 * (edgeLength(quad[0], quad[1]) +
                                edgeLength(quad[3], quad[2]));
    const double height = 0.5 * (edgeLength(quad[0], quad[3]) +
                                 edgeLength(quad[1], quad[2]));
    if (height < 4.0) {
      continue;
    }
    const double aspect = width / height;
    // A long physical strip may project to a diamond or trapezoid whose image-
    // space side lengths are nearly equal. Do not use photographed aspect as a
    // proxy for canonical aspect; projective validity is checked after fitting.
    if (aspect < 0.70 || aspect > assay.max_aspect_ratio * 3.0) {
      continue;
    }
    const double quad_area = polygonArea(quad);
    const double rectangularity =
        std::min(1.0, contour_area / std::max(quad_area, 1.0));
    const double area_score = sigmoidScore(
        area_fraction, assay.quality.min_quad_area_fraction * 0.35,
        assay.quality.min_quad_area_fraction * 2.0);
    const double proposal_penalty = contour_index < strict_contour_count
                                        ? 0.0
                                        : (contour_index < faint_contour_end
                                               ? 0.08
                                               : (contour_index <
                                                          chromatic_contour_end
                                                      ? 0.04
                                                      : 0.05));
    const double score = 0.62 * rectangularity + 0.38 * area_score -
                         proposal_penalty;
    addProposal(quad, score);
    if (aspect >= 4.0 && assay.id == "handled-paper-two-line-strip") {
      const auto [expanded, whole_quad] =
          expandFragmentThroughHandle(quad);
      if (expanded) {
        addProposal(whole_quad, score + 0.08, true);
      }
    }
  }
  const double proposal_frame_aspect =
      std::max(proposal.rgb.cols, proposal.rgb.rows) /
      static_cast<double>(std::min(proposal.rgb.cols, proposal.rgb.rows));
  if (proposal_frame_aspect > 3.0) {
    const std::vector<Quad> line_pair_quads =
        longEdgePairQuads(faint_edges, proposal.rgb);
    for (const Quad& quad : line_pair_quads) {
      const double area_fraction = polygonArea(quad) / proposal_area;
      const double span_score = sigmoidScore(
          area_fraction, assay.quality.min_quad_area_fraction * 0.5,
          assay.quality.min_quad_area_fraction * 4.0);
      addProposal(quad, 0.72 + 0.18 * span_score, true);
    }
  }
  std::sort(proposals.begin(), proposals.end(),
            [](const BareProposal& first, const BareProposal& second) {
              return first.score > second.score;
            });
  if (proposals.size() > 32) {
    proposals.resize(32);
  }

  struct BareResult {
    Quad quad{};
    cv::Mat homography;
    double score = 0.0;
    double area_fraction = 0.0;
    double support = 0.0;
    double rmse = 0.0;
    double scale_ratio = 1.0;
    double content_score = 0.0;
    double pink = 0.0;
    double positioned_pink = 0.0;
    double border_layout = 0.0;
    double handle_coverage = 0.0;
    bool transverse_width_refined = false;
  };
  const auto hasSufficientContent = [&](const BareResult& candidate) {
    return sufficientStripContent(
        {candidate.pink, candidate.positioned_pink, candidate.border_layout,
         candidate.handle_coverage, candidate.content_score},
        assay);
  };
  std::vector<BareResult> accepted;
  for (const BareProposal& candidate : proposals) {
    const Quad initial = scaleQuad(candidate.quad, 1.0 / proposal.scale);
    RefinedQuad refined = refineQuadEdges(
        rgb, initial, 0, candidate.line_pair_seed);
    if (!refined.found && candidate.line_pair_seed) {
      // Preserve the finite whole-object envelope when one pale physical edge
      // cannot beat the full-resolution support threshold. This fallback is
      // never a fragment: the proposal has already passed whole-object span,
      // connected-mask, and endpoint checks.
      refined.found = true;
      refined.corners = initial;
      refined.short_edge = 0.5 *
          (edgeLength(initial[0], initial[3]) +
           edgeLength(initial[1], initial[2]));
      refined.support_fraction = 0.56;
      refined.rmse_px = 1.5;
    } else if (!refined.found) {
      continue;
    }
    for (cv::Point2f& point : refined.corners) {
      point.x = std::clamp(point.x, 0.0F,
                           static_cast<float>(rgb.cols - 1));
      point.y = std::clamp(point.y, 0.0F,
                           static_cast<float>(rgb.rows - 1));
    }
    if (!validConvexQuad(refined.corners)) {
      continue;
    }
    const double refined_long_side =
        0.5 * (edgeLength(refined.corners[0], refined.corners[1]) +
               edgeLength(refined.corners[3], refined.corners[2]));
    const double refined_short_side =
        0.5 * (edgeLength(refined.corners[0], refined.corners[3]) +
               edgeLength(refined.corners[1], refined.corners[2]));
    // A result window inside a cassette can have excellent edges and line-like
    // content, but it is too stubby to be the supported bare paper strip. Keep
    // moderate projective foreshortening while rejecting these nested windows.
    if (refined_long_side / std::max(1.0, refined_short_side) <
        0.80 * assay.min_aspect_ratio) {
      continue;
    }
    const std::array<cv::Point2f, 4> destination = {
        cv::Point2f(0.0F, 0.0F),
        cv::Point2f(static_cast<float>(assay.canonical_width - 1), 0.0F),
        cv::Point2f(static_cast<float>(assay.canonical_width - 1),
                    static_cast<float>(assay.canonical_height - 1)),
        cv::Point2f(0.0F, static_cast<float>(assay.canonical_height - 1))};
    const cv::Mat homography = cv::getPerspectiveTransform(
        refined.corners.data(), destination.data());
    double scale_ratio = 1.0;
    if (!validHomography(homography,
                         cv::Size(assay.canonical_width, assay.canonical_height),
                         scale_ratio)) {
      continue;
    }
    const StripContentEvidence content =
        stripContentEvidence(rgb, refined.corners, assay);
    const double pink_score = std::min(1.0, content.pink / 0.12);
    const double residual_score = std::exp(-refined.rmse_px / 2.0);
    const double score = 0.30 * candidate.score +
                         0.27 * refined.support_fraction +
                         0.16 * residual_score + 0.09 * pink_score +
                         0.18 * content.score;
    const double long_side = 0.5 *
        (edgeLength(refined.corners[0], refined.corners[1]) +
         edgeLength(refined.corners[3], refined.corners[2]));
    const double frame_aspect =
        std::max(rgb.cols, rgb.rows) /
        static_cast<double>(std::min(rgb.cols, rgb.rows));
    if (frame_aspect > 4.0 &&
        long_side < 0.62 * std::max(rgb.cols, rgb.rows)) {
      continue;
    }
    accepted.push_back({refined.corners, homography, score,
                        polygonArea(refined.corners) /
                            static_cast<double>(rgb.cols * rgb.rows),
                        refined.support_fraction, refined.rmse_px, scale_ratio,
                        content.score, content.pink, content.positioned_pink,
                        content.border_layout, content.handle_coverage, false});
  }
  for (BareResult& candidate : accepted) {
    const double long_side = 0.5 *
        (edgeLength(candidate.quad[0], candidate.quad[1]) +
         edgeLength(candidate.quad[3], candidate.quad[2]));
    const double short_side = 0.5 *
        (edgeLength(candidate.quad[0], candidate.quad[3]) +
         edgeLength(candidate.quad[1], candidate.quad[2]));
    const double aspect = long_side / std::max(1.0, short_side);
    const double extent = std::min(
        1.0, long_side / static_cast<double>(std::max(rgb.cols, rgb.rows)));
    double shape_score = 1.0;
    if (aspect < assay.min_aspect_ratio) {
      shape_score = sigmoidScore(aspect, 0.7, assay.min_aspect_ratio);
    } else if (aspect > assay.max_aspect_ratio) {
      shape_score = std::exp(
          -(aspect - assay.max_aspect_ratio) / assay.max_aspect_ratio);
    }
    // Whole-object candidates should beat a razor-sharp fragment or rail. This
    // is a ranking prior only; projective validity remains independent of the
    // photographed aspect ratio.
    candidate.score += 0.14 * extent + 0.12 * shape_score;
  }
  if (proposal_frame_aspect <= 3.0) {
    // In ordinary landscape captures the backing and its sharper membrane
    // window often form nested, aligned quads. Prefer the supported outer
    // physical object. The tall handled-strip path deliberately omits this
    // prior because an adjacent rail can otherwise masquerade as an enclosure.
    for (BareResult& outer : accepted) {
      std::vector<cv::Point2f> outer_polygon(
          outer.quad.begin(), outer.quad.end());
      cv::Point2f outer_direction = outer.quad[1] - outer.quad[0];
      const double outer_length = cv::norm(outer_direction);
      if (outer_length < 1.0) {
        continue;
      }
      outer_direction *= static_cast<float>(1.0 / outer_length);
      for (const BareResult& inner : accepted) {
        const double area_ratio = outer.area_fraction /
            std::max(1.0e-9, inner.area_fraction);
        if (area_ratio < 1.10 || area_ratio > 3.0) {
          continue;
        }
        cv::Point2f inner_direction = inner.quad[1] - inner.quad[0];
        const double inner_length = cv::norm(inner_direction);
        if (inner_length < 1.0) {
          continue;
        }
        inner_direction *= static_cast<float>(1.0 / inner_length);
        if (std::abs(outer_direction.dot(inner_direction)) <
            std::cos(10.0 * CV_PI / 180.0)) {
          continue;
        }
        const cv::Point2f inner_center = quadCenter(inner.quad);
        if (cv::pointPolygonTest(outer_polygon, inner_center, false) >= 0.0) {
          outer.score += 0.20;
          break;
        }
      }
    }
  }
  // Occasionally the proposal mask expands a real strip into a slightly
  // larger, aligned background envelope. The ordinary-landscape enclosure
  // prior above is useful for real backing/membrane pairs, so override it only
  // when a near-tied inner quad preserves the handle and border evidence while
  // materially increasing strip-specific content. This selects the bounded
  // physical strip without weakening multi-strip or content gates.
  for (BareResult& inner : accepted) {
    if (!hasSufficientContent(inner)) {
      continue;
    }
    for (const BareResult& outer : accepted) {
      if (&inner == &outer || !hasSufficientContent(outer)) {
        continue;
      }
      const double area_ratio = outer.area_fraction /
          std::max(1.0e-9, inner.area_fraction);
      if (area_ratio < 1.10 || area_ratio > 1.45 ||
          quadIou(outer.quad, inner.quad) < 0.65 ||
          inner.score < 0.95 * outer.score ||
          inner.content_score < outer.content_score + 0.025 ||
          inner.border_layout + 0.01 < outer.border_layout ||
          inner.handle_coverage + 0.05 < outer.handle_coverage ||
          inner.positioned_pink < outer.positioned_pink) {
        continue;
      }
      cv::Point2f outer_direction = outer.quad[1] - outer.quad[0];
      cv::Point2f inner_direction = inner.quad[1] - inner.quad[0];
      const double outer_length = cv::norm(outer_direction);
      const double inner_length = cv::norm(inner_direction);
      if (outer_length < 1.0 || inner_length < 1.0) {
        continue;
      }
      outer_direction *= static_cast<float>(1.0 / outer_length);
      inner_direction *= static_cast<float>(1.0 / inner_length);
      if (std::abs(outer_direction.dot(inner_direction)) <
          std::cos(10.0 * CV_PI / 180.0)) {
        continue;
      }
      const std::vector<cv::Point2f> outer_polygon(
          outer.quad.begin(), outer.quad.end());
      if (cv::pointPolygonTest(outer_polygon, quadCenter(inner.quad), false) <
          0.0) {
        continue;
      }
      inner.score += 0.06;
      break;
    }
  }
  const auto touchesFrameEndpoint = [&](const BareResult& candidate) {
    constexpr float margin = 2.5F;
    const auto endpointOnBoundary = [&](size_t first, size_t second) {
      const auto bothNear = [&](auto coordinate, float boundary) {
        return std::abs(coordinate(candidate.quad[first]) - boundary) <=
                   margin &&
               std::abs(coordinate(candidate.quad[second]) - boundary) <=
                   margin;
      };
      return bothNear([](const cv::Point2f& point) { return point.x; },
                      0.0F) ||
             bothNear([](const cv::Point2f& point) { return point.x; },
                      static_cast<float>(rgb.cols - 1)) ||
             bothNear([](const cv::Point2f& point) { return point.y; },
                      0.0F) ||
             bothNear([](const cv::Point2f& point) { return point.y; },
                      static_cast<float>(rgb.rows - 1));
    };
    return endpointOnBoundary(0, 3) || endpointOnBoundary(1, 2);
  };
  for (BareResult& frame_touching : accepted) {
    if (!touchesFrameEndpoint(frame_touching)) {
      continue;
    }
    const bool has_finite_competitor = std::any_of(
        accepted.begin(), accepted.end(), [&](const BareResult& candidate) {
          return &candidate != &frame_touching &&
                 !touchesFrameEndpoint(candidate) &&
                 hasSufficientContent(candidate) &&
                 candidate.score >=
                     kCompetingBareScoreRatio * frame_touching.score &&
                 quadIou(frame_touching.quad, candidate.quad) >= 0.65;
        });
    if (has_finite_competitor) {
      // A true cropped strip normally has no separate, profile-valid finite
      // envelope. When one does exist and nearly ties the frame-spanning
      // proposal, prefer the physically bounded object; sparse chromatic noise
      // can otherwise stretch one or both endpoints to the image border.
      frame_touching.score -= kFrameEndpointAlternativePenalty;
    }
  }
  std::sort(accepted.begin(), accepted.end(),
            [](const BareResult& first, const BareResult& second) {
              return first.score > second.score;
            });
  if (accepted.empty()) {
    result.failure_reason = proposals.empty() ? "strip_not_found"
                                               : "strip_edge_support_insufficient";
    return result;
  }
  // The learned endpoint/width policy is a recovery stage, not a replacement
  // for a strong classical localization. Run it only when the final classical
  // winner has insufficient strip content or unusable edge rectification.
  // This protects reportable classical behavior, bounds runtime, and still
  // targets invalid localization failure classes.
  if (assay.id == "handled-paper-two-line-strip") {
    const BareResult seed = accepted.front();
    const double seed_short_side =
        0.5 * (edgeLength(seed.quad[0], seed.quad[3]) +
               edgeLength(seed.quad[1], seed.quad[2]));
    const double normalized_seed_rmse =
        seed.rmse * assay.canonical_height /
        std::max(1.0, seed_short_side);
    const bool classical_uncertain =
        !hasSufficientContent(seed) || !std::isfinite(normalized_seed_rmse) ||
        normalized_seed_rmse > 5.0;
    if (classical_uncertain) {
      const std::vector<internal::TransverseWidthHypothesis> hypotheses =
          internal::scoreTransverseWidthHypotheses(rgb, seed.quad);
      std::optional<BareResult> best_refinement;
      for (const internal::TransverseWidthHypothesis& hypothesis : hypotheses) {
        const double overlap = quadIou(seed.quad, hypothesis.corners);
        if (overlap < 0.58 || overlap > 0.995) {
          continue;
        }
        RefinedQuad refined = refineQuadEdges(rgb, hypothesis.corners);
        if (!refined.found || !validConvexQuad(refined.corners)) {
          continue;
        }
        for (cv::Point2f& point : refined.corners) {
          point.x = std::clamp(point.x, 0.0F,
                               static_cast<float>(rgb.cols - 1));
          point.y = std::clamp(point.y, 0.0F,
                               static_cast<float>(rgb.rows - 1));
        }
        if (!validConvexQuad(refined.corners) ||
            quadIou(seed.quad, refined.corners) < 0.58) {
          continue;
        }
        const double long_side =
            0.5 * (edgeLength(refined.corners[0], refined.corners[1]) +
                   edgeLength(refined.corners[3], refined.corners[2]));
        const double short_side =
            0.5 * (edgeLength(refined.corners[0], refined.corners[3]) +
                   edgeLength(refined.corners[1], refined.corners[2]));
        if (long_side / std::max(1.0, short_side) <
            0.80 * assay.min_aspect_ratio) {
          continue;
        }
        const std::array<cv::Point2f, 4> destination = {
            cv::Point2f(0.0F, 0.0F),
            cv::Point2f(static_cast<float>(assay.canonical_width - 1), 0.0F),
            cv::Point2f(static_cast<float>(assay.canonical_width - 1),
                        static_cast<float>(assay.canonical_height - 1)),
            cv::Point2f(0.0F,
                        static_cast<float>(assay.canonical_height - 1))};
        const cv::Mat homography = cv::getPerspectiveTransform(
            refined.corners.data(), destination.data());
        double scale_ratio = 1.0;
        if (!validHomography(
                homography,
                cv::Size(assay.canonical_width, assay.canonical_height),
                scale_ratio)) {
          continue;
        }
        const StripContentEvidence content =
            stripContentEvidence(rgb, refined.corners, assay);
        const double seed_residual = std::exp(-seed.rmse / 2.0);
        const double refined_residual = std::exp(-refined.rmse_px / 2.0);
        const double seed_pink_score = std::min(1.0, seed.pink / 0.12);
        const double refined_pink_score = std::min(1.0, content.pink / 0.12);
        double score = seed.score +
                       0.27 * (refined.support_fraction - seed.support) +
                       0.16 * (refined_residual - seed_residual) +
                       0.09 * (refined_pink_score - seed_pink_score) +
                       0.18 * (content.score - seed.content_score);
        // Preserve the fitted policy order when deterministic evidence ties.
        score -= 0.004 * std::max(0, hypothesis.endpoint_rank - 1);
        if (hypothesis.width_corrected) {
          score -= 0.002;
        }
        BareResult candidate = {
            refined.corners,
            homography,
            score,
            polygonArea(refined.corners) /
                static_cast<double>(rgb.cols * rgb.rows),
            refined.support_fraction,
            refined.rmse_px,
            scale_ratio,
            content.score,
            content.pink,
            content.positioned_pink,
            content.border_layout,
            content.handle_coverage,
            true};
        if (!hasSufficientContent(candidate) ||
            candidate.support + 0.03 < seed.support ||
            candidate.content_score + 0.015 < seed.content_score ||
            candidate.score < seed.score + 0.012) {
          continue;
        }
        if (!best_refinement || candidate.score > best_refinement->score) {
          best_refinement = std::move(candidate);
        }
      }
      if (best_refinement) {
        accepted.push_back(std::move(*best_refinement));
        std::sort(accepted.begin(), accepted.end(),
                  [](const BareResult& first, const BareResult& second) {
                    return first.score > second.score;
                  });
      }
    }
  }
  const BareResult& best = accepted.front();
  if (best.score < 0.38) {
    result.failure_reason = "strip_not_found";
    return result;
  }
  if (!hasSufficientContent(best)) {
    result.failure_reason = "bare_strip_content_insufficient";
    return result;
  }
  if (hasMultiStripSceneEvidence(rgb, best.quad, assay)) {
    result.failure_reason = "multiple_bare_strips_detected";
    return result;
  }
  const bool multiple_distinct_strips = std::any_of(
      accepted.begin() + 1, accepted.end(), [&](const BareResult& candidate) {
        return hasSufficientContent(candidate) &&
               candidate.score >= kMultipleBareScoreRatio * best.score &&
               quadIou(best.quad, candidate.quad) < kDistinctBareQuadIou;
      });
  if (multiple_distinct_strips) {
    result.failure_reason = "multiple_bare_strips_detected";
    return result;
  }
  const double source_short_side =
      0.5 * (edgeLength(best.quad[0], best.quad[3]) +
             edgeLength(best.quad[1], best.quad[2]));
  const double normalized_rectification_rmse =
      best.rmse * assay.canonical_height /
      std::max(1.0, source_short_side);
  // Edge residual is measured in source pixels, so a superficially small fit
  // error on a 6-12 px thumbnail can become a many-pixel displacement after
  // canonical rectification. The analyzer already treats >5 canonical pixels
  // as degenerate geometry. Reject it here as well so locator-only evaluation
  // cannot call a low-resolution rail/strip thumbnail a usable proposal.
  if (!std::isfinite(normalized_rectification_rmse) ||
      normalized_rectification_rmse > 5.0) {
    result.failure_reason = "degenerate_projective_geometry";
    return result;
  }
  const double runner_up = accepted.size() > 1 ? accepted[1].score : 0.0;
  const double margin = std::clamp(best.score - runner_up, 0.0, 0.2);
  result.found = true;
  if (best.transverse_width_refined) {
    result.mode = "bare_transverse_width";
  }
  result.corners = best.quad;
  result.homography = best.homography;
  result.confidence = std::clamp(best.score + 0.4 * margin, 0.0, 1.0);
  result.area_fraction = best.area_fraction;
  result.edge_support_fraction = best.support;
  result.rectification_rmse_px = normalized_rectification_rmse;
  result.reprojection_rmse_px = result.rectification_rmse_px;
  result.perspective_scale_ratio = best.scale_ratio;
  return result;
}

LocalizationResult ClassicalRegionLocator::locateCard(
    const cv::Mat& rgb, const CardProfile& card) const {
  LocalizationResult result;
  result.mode = "card";
  if (rgb.empty() || rgb.type() != CV_8UC3) {
    result.failure_reason = "unsupported_image";
    return result;
  }
  const std::vector<SquareCandidate> candidates = findFiducials(rgb, card);
  if (candidates.size() < 4) {
    result.failure_reason = "card_fiducials_not_found";
    return result;
  }

  struct CardResult {
    Quad centers{};
    cv::Mat homography;
    double score = -std::numeric_limits<double>::infinity();
    double support = 0.0;
    double reprojection = 0.0;
    double holdout = 0.0;
    double scale_ratio = 1.0;
  };
  CardResult best;
  bool saw_oriented_candidate = false;
  for (size_t marker = 0; marker < candidates.size(); ++marker) {
    if (candidates[marker].center_luminance < 0.45) {
      continue;
    }
    saw_oriented_candidate = true;
    std::vector<size_t> others;
    for (size_t index = 0; index < candidates.size(); ++index) {
      if (index != marker && candidates[index].center_luminance <= 0.35) {
        others.push_back(index);
      }
    }
    for (size_t first = 0; first < others.size(); ++first) {
      for (size_t second = first + 1; second < others.size(); ++second) {
        for (size_t third = second + 1; third < others.size(); ++third) {
          const std::array<size_t, 4> selected = {
              marker, others[first], others[second], others[third]};
          bool cyclic_valid = false;
          const std::array<size_t, 4> logical =
              cyclicLayout(candidates, selected, marker, cyclic_valid);
          if (!cyclic_valid) {
            continue;
          }
          Quad centers = {candidates[logical[0]].center,
                          candidates[logical[1]].center,
                          candidates[logical[2]].center,
                          candidates[logical[3]].center};
          const double area_fraction = polygonArea(centers) /
              static_cast<double>(rgb.cols * rgb.rows);
          if (area_fraction < card.min_area_fraction) {
            continue;
          }
          cv::Mat homography = cv::getPerspectiveTransform(
              centers.data(), card.fiducial_centers.data());
          double reprojection = 0.0;
          double holdout = 0.0;
          if (card.fiducial_side_px) {
            std::vector<cv::Point2f> source_points;
            std::vector<cv::Point2f> destination_points;
            for (size_t logical_marker = 0; logical_marker < 4; ++logical_marker) {
              const auto expected = canonicalMarkerCorners(
                  card.fiducial_centers[logical_marker], *card.fiducial_side_px);
              const Quad& source = candidates[logical[logical_marker]].quad;
              const auto mapping = matchMarkerCorners(source, homography, expected);
              for (size_t corner = 0; corner < 4; ++corner) {
                source_points.push_back(source[mapping[corner]]);
                destination_points.push_back(expected[corner]);
              }
            }
            cv::Mat inlier_mask;
            homography = robustHomography(source_points, destination_points,
                                           inlier_mask);
            if (homography.empty() || cv::countNonZero(inlier_mask) < 12) {
              continue;
            }
            reprojection = reprojectionRmse(source_points, destination_points,
                                            homography);
            holdout = holdoutRmse(source_points, destination_points);
            if (!std::isfinite(reprojection) || !std::isfinite(holdout) ||
                reprojection > 3.5 || holdout > 5.0) {
              continue;
            }
          }
          double scale_ratio = 1.0;
          if (!validHomography(homography,
                               cv::Size(card.canonical_width,
                                        card.canonical_height),
                               scale_ratio)) {
            continue;
          }
          double support = 0.0;
          double other_luminance = 0.0;
          for (size_t index = 0; index < 4; ++index) {
            support += candidates[logical[index]].support_fraction;
            if (index > 0) {
              other_luminance += candidates[logical[index]].center_luminance;
            }
          }
          support *= 0.25;
          other_luminance /= 3.0;
          const double marker_contrast = std::clamp(
              (candidates[logical[0]].center_luminance - other_luminance) / 0.5,
              0.0, 1.0);
          const double area_score = sigmoidScore(
              area_fraction, card.min_area_fraction,
              card.min_area_fraction * 5.0);
          const double reprojection_score = card.fiducial_side_px
              ? std::exp(-reprojection / 2.0)
              : 0.65;
          const double holdout_score = card.fiducial_side_px
              ? std::exp(-holdout / 3.0)
              : 0.55;
          const double score = 0.15 * area_score + 0.20 * support +
                               0.25 * reprojection_score +
                               0.25 * holdout_score +
                               0.15 * marker_contrast;
          if (score > best.score) {
            best = {centers, homography, score, support, reprojection,
                    holdout, scale_ratio};
          }
        }
      }
    }
  }
  if (!std::isfinite(best.score)) {
    result.failure_reason = saw_oriented_candidate
        ? "card_homography_inconsistent"
        : "card_layout_inconsistent";
    return result;
  }
  result.found = true;
  result.corners = best.centers;
  result.homography = best.homography;
  result.area_fraction = polygonArea(best.centers) /
                         static_cast<double>(rgb.cols * rgb.rows);
  result.edge_support_fraction = best.support;
  result.rectification_rmse_px = best.reprojection;
  result.reprojection_rmse_px = best.reprojection;
  result.holdout_rmse_px = best.holdout;
  result.perspective_scale_ratio = best.scale_ratio;
  result.confidence = std::clamp(best.score, 0.0, 1.0);
  if (!card.fiducial_side_px) {
    result.confidence = std::min(result.confidence, 0.78);
  }
  return result;
}

struct OnnxRegionLocator::Impl {
  bool ready = false;
  std::string failure_reason = "onnx_locator_not_built";
  int64_t input_height = 640;
  int64_t input_width = 640;

#ifdef STRIPCV_ENABLE_ONNX
  Ort::Env environment{ORT_LOGGING_LEVEL_WARNING, "stripcv-region-locator"};
  Ort::SessionOptions session_options;
  std::unique_ptr<Ort::Session> session;
  std::string input_name;
  std::string output_name;

  explicit Impl(const std::string& model_path) {
    if (model_path.empty() || !std::filesystem::is_regular_file(model_path)) {
      failure_reason = "onnx_model_missing";
      return;
    }
    try {
      session_options.SetExecutionMode(ExecutionMode::ORT_SEQUENTIAL);
      session_options.SetIntraOpNumThreads(1);
      session_options.SetInterOpNumThreads(1);
      session_options.DisableMemPattern();
      session_options.SetGraphOptimizationLevel(
          GraphOptimizationLevel::ORT_ENABLE_EXTENDED);
      session = std::make_unique<Ort::Session>(environment, model_path.c_str(),
                                               session_options);
      if (session->GetInputCount() != 1 || session->GetOutputCount() != 1) {
        failure_reason = "onnx_model_io_count_mismatch";
        session.reset();
        return;
      }

      Ort::AllocatorWithDefaultOptions allocator;
      const auto input_name_value =
          session->GetInputNameAllocated(0, allocator);
      const auto output_name_value =
          session->GetOutputNameAllocated(0, allocator);
      input_name = input_name_value.get();
      output_name = output_name_value.get();
      if (input_name != "images" || output_name != "quad") {
        failure_reason = "onnx_model_io_name_mismatch";
        session.reset();
        return;
      }

      const Ort::TypeInfo input_type_info = session->GetInputTypeInfo(0);
      const Ort::TypeInfo output_type_info = session->GetOutputTypeInfo(0);
      const auto input_info = input_type_info.GetTensorTypeAndShapeInfo();
      const auto output_info = output_type_info.GetTensorTypeAndShapeInfo();
      const std::vector<int64_t> input_shape = input_info.GetShape();
      const std::vector<int64_t> output_shape = output_info.GetShape();
      if (input_info.GetElementType() != ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT) {
        failure_reason = "onnx_model_input_type_mismatch";
        session.reset();
        return;
      }
      if (input_shape.size() != 4) {
        failure_reason = "onnx_model_input_rank_mismatch";
        session.reset();
        return;
      }
      if (input_shape[0] != 1) {
        failure_reason = "onnx_model_input_batch_mismatch";
        session.reset();
        return;
      }
      if (input_shape[1] != 3) {
        failure_reason = "onnx_model_input_channel_mismatch";
        session.reset();
        return;
      }
      if (output_info.GetElementType() != ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT) {
        failure_reason = "onnx_model_output_type_mismatch";
        session.reset();
        return;
      }
      if (output_shape.size() != 2 || output_shape[0] != 1 ||
          output_shape[1] != 9) {
        failure_reason = "onnx_model_output_shape_mismatch";
        session.reset();
        return;
      }
      if (input_shape[2] != -1 &&
          (input_shape[2] < 64 || input_shape[2] > 4096)) {
        failure_reason = "onnx_model_input_height_unsupported";
        session.reset();
        return;
      }
      if (input_shape[3] != -1 &&
          (input_shape[3] < 64 || input_shape[3] > 4096)) {
        failure_reason = "onnx_model_input_width_unsupported";
        session.reset();
        return;
      }
      if (input_shape[2] > 0) {
        input_height = input_shape[2];
      }
      if (input_shape[3] > 0) {
        input_width = input_shape[3];
      }
      ready = true;
      failure_reason.clear();
    } catch (const Ort::Exception&) {
      session.reset();
      failure_reason = "onnx_model_initialization_failed";
    }
  }
#else
  explicit Impl(const std::string& model_path) {
    failure_reason =
        model_path.empty() ? "onnx_model_missing" : "onnx_locator_not_built";
  }
#endif
};

OnnxRegionLocator::OnnxRegionLocator(std::string model_path)
    : model_path_(std::move(model_path)),
      impl_(std::make_shared<Impl>(model_path_)) {}

LocalizationResult OnnxRegionLocator::locateBare(
    const cv::Mat& rgb, const AssayProfile& assay) const {
  const auto classicalFallback = [&](const std::string& reason) {
    LocalizationResult fallback = classical_fallback_.locateBare(rgb, assay);
    fallback.mode = "onnx_fallback_classical";
    if (fallback.found) {
      fallback.failure_reason = reason;
    } else if (fallback.failure_reason.empty()) {
      fallback.failure_reason = reason;
    } else {
      fallback.failure_reason = reason + ";" + fallback.failure_reason;
    }
    return fallback;
  };

  if (!impl_ || !impl_->ready) {
    return classicalFallback(impl_ ? impl_->failure_reason
                                   : "onnx_locator_not_initialized");
  }

#ifdef STRIPCV_ENABLE_ONNX
  try {
    if (rgb.empty() || rgb.type() != CV_8UC3) {
      return classicalFallback("onnx_unsupported_image");
    }
    const int input_width = static_cast<int>(impl_->input_width);
    const int input_height = static_cast<int>(impl_->input_height);
    const double scale = std::min(input_width / static_cast<double>(rgb.cols),
                                  input_height / static_cast<double>(rgb.rows));
    const int resized_width = std::clamp(
        static_cast<int>(std::lround(rgb.cols * scale)), 1, input_width);
    const int resized_height = std::clamp(
        static_cast<int>(std::lround(rgb.rows * scale)), 1, input_height);
    const int padding_x = (input_width - resized_width) / 2;
    const int padding_y = (input_height - resized_height) / 2;
    cv::Mat resized;
    cv::resize(rgb, resized, cv::Size(resized_width, resized_height), 0.0, 0.0,
               scale < 1.0 ? cv::INTER_AREA : cv::INTER_LINEAR);
    cv::Mat canvas(input_height, input_width, CV_8UC3,
                   cv::Scalar(114, 114, 114));
    resized.copyTo(
        canvas(cv::Rect(padding_x, padding_y, resized_width, resized_height)));

    const size_t plane_size = static_cast<size_t>(input_width) * input_height;
    std::vector<float> input(plane_size * 3);
    for (int row = 0; row < input_height; ++row) {
      const cv::Vec3b* pixels = canvas.ptr<cv::Vec3b>(row);
      for (int column = 0; column < input_width; ++column) {
        const size_t offset = static_cast<size_t>(row) * input_width + column;
        input[offset] = pixels[column][0] / 255.0F;
        input[plane_size + offset] = pixels[column][1] / 255.0F;
        input[2 * plane_size + offset] = pixels[column][2] / 255.0F;
      }
    }

    const std::array<int64_t, 4> input_shape = {1, 3, impl_->input_height,
                                                impl_->input_width};
    Ort::MemoryInfo memory =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    Ort::Value tensor =
        Ort::Value::CreateTensor<float>(memory, input.data(), input.size(),
                                        input_shape.data(), input_shape.size());
    const std::array<const char*, 1> input_names = {impl_->input_name.c_str()};
    const std::array<const char*, 1> output_names = {
        impl_->output_name.c_str()};
    std::vector<Ort::Value> outputs =
        impl_->session->Run(Ort::RunOptions{nullptr}, input_names.data(),
                            &tensor, 1, output_names.data(), 1);
    if (outputs.size() != 1 || !outputs[0].IsTensor() ||
        outputs[0].GetTensorTypeAndShapeInfo().GetElementCount() != 9) {
      return classicalFallback("onnx_output_contract_mismatch");
    }
    const float* output = outputs[0].GetTensorData<float>();
    for (size_t index = 0; index < 9; ++index) {
      if (!std::isfinite(output[index])) {
        return classicalFallback("onnx_output_non_finite");
      }
    }
    const double confidence = output[8];
    if (confidence < 0.45 || confidence > 1.0) {
      return classicalFallback("onnx_confidence_out_of_range");
    }

    Quad proposal{};
    for (size_t index = 0; index < proposal.size(); ++index) {
      const double normalized_x = output[index * 2];
      const double normalized_y = output[index * 2 + 1];
      if (normalized_x < 0.0 || normalized_x > 1.0 || normalized_y < 0.0 ||
          normalized_y > 1.0) {
        return classicalFallback("onnx_corner_out_of_range");
      }
      const double source_x =
          (normalized_x * (input_width - 1) - padding_x) / scale;
      const double source_y =
          (normalized_y * (input_height - 1) - padding_y) / scale;
      if (source_x < -1.0 || source_y < -1.0 || source_x > rgb.cols ||
          source_y > rgb.rows) {
        return classicalFallback("onnx_corner_in_letterbox_padding");
      }
      proposal[index] =
          cv::Point2f(static_cast<float>(std::clamp(
                          source_x, 0.0, static_cast<double>(rgb.cols - 1))),
                      static_cast<float>(std::clamp(
                          source_y, 0.0, static_cast<double>(rgb.rows - 1))));
    }
    const Quad ordered_proposal = orderQuad(proposal);
    for (size_t index = 0; index < proposal.size(); ++index) {
      if (cv::norm(proposal[index] - ordered_proposal[index]) > 1.0e-3) {
        return classicalFallback("onnx_corner_order_mismatch");
      }
    }
    proposal = ordered_proposal;
    if (!validConvexQuad(proposal)) {
      return classicalFallback("onnx_quad_not_convex");
    }
    const double area_fraction =
        polygonArea(proposal) / static_cast<double>(rgb.total());
    const double width = 0.5 * (edgeLength(proposal[0], proposal[1]) +
                                edgeLength(proposal[3], proposal[2]));
    const double height = 0.5 * (edgeLength(proposal[0], proposal[3]) +
                                 edgeLength(proposal[1], proposal[2]));
    const double aspect = width / std::max(height, 1.0e-6);
    if (area_fraction < assay.quality.min_quad_area_fraction * 0.35 ||
        area_fraction > 0.95 || height < 4.0 ||
        aspect < assay.min_aspect_ratio * 0.5 ||
        aspect > assay.max_aspect_ratio * 2.0) {
      return classicalFallback("onnx_quad_geometry_rejected");
    }

    const RefinedQuad refined = refineQuadEdges(rgb, proposal, 0, true);
    if (!refined.found) {
      return classicalFallback("onnx_edge_refinement_failed:" +
                               refined.failure_stage);
    }
    const double refined_width =
        0.5 * (edgeLength(refined.corners[0], refined.corners[1]) +
               edgeLength(refined.corners[3], refined.corners[2]));
    const double refined_height =
        0.5 * (edgeLength(refined.corners[0], refined.corners[3]) +
               edgeLength(refined.corners[1], refined.corners[2]));
    const double refined_aspect =
        refined_width / std::max(refined_height, 1.0e-6);
    if (refined_aspect < assay.min_aspect_ratio ||
        refined_aspect > assay.max_aspect_ratio) {
      return classicalFallback("onnx_refined_aspect_ratio_rejected");
    }
    const double normalized_refined_rmse =
        refined.rmse_px * assay.canonical_height /
        std::max(1.0, refined_height);
    if (!std::isfinite(normalized_refined_rmse) ||
        normalized_refined_rmse > 5.0) {
      return classicalFallback("onnx_projective_geometry_rejected");
    }
    const std::array<cv::Point2f, 4> destination = {
        cv::Point2f(0.0F, 0.0F),
        cv::Point2f(static_cast<float>(assay.canonical_width - 1), 0.0F),
        cv::Point2f(static_cast<float>(assay.canonical_width - 1),
                    static_cast<float>(assay.canonical_height - 1)),
        cv::Point2f(0.0F, static_cast<float>(assay.canonical_height - 1))};
    const cv::Mat homography =
        cv::getPerspectiveTransform(refined.corners.data(), destination.data());
    const double scale_ratio = perspectiveScaleRatio(
        homography, cv::Size(assay.canonical_width, assay.canonical_height));
    if (!std::isfinite(scale_ratio) || scale_ratio > 4.0) {
      return classicalFallback("onnx_projective_geometry_rejected");
    }
    if (!sufficientStripContent(
            stripContentEvidence(rgb, refined.corners, assay), assay)) {
      return classicalFallback("onnx_bare_strip_content_insufficient");
    }

    // The learned quadrilateral is a rescue proposal, never a replacement for
    // a valid deterministic localization. The completed physical replay found
    // that even a >0.90-IoU learned/classical pair can cross a downstream
    // quality boundary and suppress an otherwise reportable two-line result.
    // Preserve the classical coordinates whenever they exist; only a genuine
    // classical miss may reach the learned path.
    LocalizationResult classical = classical_fallback_.locateBare(rgb, assay);
    if (classical.found) {
      classical.mode = "onnx_fallback_classical";
      classical.failure_reason = "onnx_classical_available";
      return classical;
    }
    // A learned single-strip crop must not override global evidence that the
    // input contains multiple physical strips. Re-run the independent scene
    // veto on the refined proposal as well, because content/refinement checks
    // alone are local to one candidate.
    if (classical.failure_reason == "multiple_bare_strips_detected" ||
        hasMultiStripSceneEvidence(rgb, refined.corners, assay)) {
      classical.mode = "onnx_fallback_classical";
      classical.failure_reason = "multiple_bare_strips_detected";
      return classical;
    }

    LocalizationResult result;
    result.found = true;
    result.mode = "onnx";
    result.corners = refined.corners;
    result.homography = homography;
    result.confidence = confidence;
    result.area_fraction =
        polygonArea(refined.corners) / static_cast<double>(rgb.total());
    result.edge_support_fraction = refined.support_fraction;
    result.rectification_rmse_px = normalized_refined_rmse;
    result.perspective_scale_ratio = scale_ratio;
    return result;
  } catch (const Ort::Exception&) {
    return classicalFallback("onnx_inference_failed");
  } catch (const cv::Exception&) {
    return classicalFallback("onnx_postprocessing_failed");
  }
#else
  return classicalFallback("onnx_locator_not_built");
#endif
}

LocalizationResult OnnxRegionLocator::locateCard(
    const cv::Mat& rgb, const CardProfile& card) const {
  return classical_fallback_.locateCard(rgb, card);
}

}  // namespace stripcv
