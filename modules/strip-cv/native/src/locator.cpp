#include "stripcv/locator.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <mutex>
#include <numeric>
#include <stdexcept>
#include <tuple>
#include <vector>

#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#include <opencv2/geometry/3d.hpp>
#else
#include <opencv2/calib3d.hpp>
#endif

namespace stripcv {
namespace {

constexpr double kProposalMaxDimension = 1600.0;
// Full-resolution gradients still determine the returned corners. Extreme
// portrait/landscape captures need fewer coarse pixels than general scenes;
// retaining 1600 px for ordinary frames keeps card and generic-strip goldens
// unchanged.
constexpr double kElongatedProposalMaxDimension = 1400.0;
constexpr double kVeryElongatedProposalMaxDimension = 1450.0;

double polygonArea(const Quad& quad) {
  std::vector<cv::Point2f> points(quad.begin(), quad.end());
  return std::abs(cv::contourArea(points));
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
};

RefinedQuad refineQuadEdges(const cv::Mat& rgb, const Quad& initial,
                            int fixed_polarity = 0,
                            bool allow_weak_end_edges = false) {
  RefinedQuad result;
  if (!validConvexQuad(initial)) {
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
    return result;
  }
  if (!validConvexQuad(result.corners)) {
    return result;
  }
  const double max_shift = std::max(12.0, result.short_edge * 0.35);
  for (size_t index = 0; index < 4; ++index) {
    if (cv::norm(result.corners[index] - initial[index]) > max_shift ||
        result.corners[index].x < -band || result.corners[index].y < -band ||
        result.corners[index].x > rgb.cols - 1 + band ||
        result.corners[index].y > rgb.rows - 1 + band) {
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
  for (int row = 0; row < proposal_rgb.rows; ++row) {
    for (int column = 0; column < proposal_rgb.cols; ++column) {
      const cv::Vec3b pixel = proposal_rgb.at<cv::Vec3b>(row, column);
      const auto [minimum_channel, maximum_channel] =
          std::minmax_element(pixel.val, pixel.val + 3);
      if (*maximum_channel - *minimum_channel >= 18) {
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
      desired_minimum = std::min(desired_minimum,
                                 colored_minimum - 0.55 * width);
      desired_maximum = std::max(desired_maximum,
                                 colored_maximum + 0.55 * width);
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
      if (desired_minimum - image_minimum < 1.5 * width) {
        desired_minimum = image_minimum;
      }
      if (image_maximum - desired_maximum < 1.5 * width) {
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
  for (int row = 0; row < proposal.rgb.rows; row += 2) {
    for (int column = 0; column < proposal.rgb.cols; column += 2) {
      const cv::Vec3b pixel = proposal.rgb.at<cv::Vec3b>(row, column);
      const auto [minimum_channel, maximum_channel] =
          std::minmax_element(pixel.val, pixel.val + 3);
      // A mild global color cast (for example a green tabletop) must not
      // become the "handle" cluster that extends a fragment across the frame.
      if (*maximum_channel - *minimum_channel >= 25) {
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
        desired_minimum, projections[best_begin] - 0.45 * width);
    desired_maximum = std::max(
        desired_maximum, projections[best_end - 1] + 0.45 * width);
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
                        content.score, content.pink});
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
  std::sort(accepted.begin(), accepted.end(),
            [](const BareResult& first, const BareResult& second) {
              return first.score > second.score;
            });
  if (accepted.empty()) {
    result.failure_reason = proposals.empty() ? "strip_not_found"
                                               : "strip_edge_support_insufficient";
    return result;
  }
  const BareResult& best = accepted.front();
  if (best.score < 0.38) {
    result.failure_reason = "strip_not_found";
    return result;
  }
  const double runner_up = accepted.size() > 1 ? accepted[1].score : 0.0;
  const double margin = std::clamp(best.score - runner_up, 0.0, 0.2);
  result.found = true;
  result.corners = best.quad;
  result.homography = best.homography;
  result.confidence = std::clamp(best.score + 0.4 * margin, 0.0, 1.0);
  result.area_fraction = best.area_fraction;
  result.edge_support_fraction = best.support;
  result.rectification_rmse_px = best.rmse * assay.canonical_height /
                                 std::max(1.0, 0.5 *
                                     (edgeLength(best.quad[0], best.quad[3]) +
                                      edgeLength(best.quad[1], best.quad[2])));
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

OnnxRegionLocator::OnnxRegionLocator(std::string model_path)
    : model_path_(std::move(model_path)) {}

LocalizationResult OnnxRegionLocator::locateBare(
    const cv::Mat&, const AssayProfile&) const {
  LocalizationResult result;
  result.mode = "onnx";
  result.failure_reason = "onnx_locator_not_built_or_model_not_loaded";
  return result;
}

LocalizationResult OnnxRegionLocator::locateCard(
    const cv::Mat&, const CardProfile&) const {
  LocalizationResult result;
  result.mode = "onnx";
  result.failure_reason = "onnx_locator_not_built_or_model_not_loaded";
  return result;
}

}  // namespace stripcv
