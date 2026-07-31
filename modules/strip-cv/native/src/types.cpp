#include "stripcv/types.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif

namespace stripcv {
namespace {

template <typename T>
void readIfPresent(const json& value, const char* key, T& destination) {
  if (value.contains(key) && !value.at(key).is_null()) {
    destination = value.at(key).get<T>();
  }
}

json pointToJson(const cv::Point2f& point) {
  return json::array({point.x, point.y});
}

json peakToJson(const PeakMetrics& peak) {
  return {
      {"detected", peak.detected},
      {"position", peak.position},
      {"height", peak.height},
      {"prominence", peak.prominence},
      {"snr", peak.snr},
      {"fwhm", peak.fwhm},
      {"area", peak.area},
  };
}

double distanceSquared(const cv::Point2f& a, const cv::Point2f& b) {
  const double dx = static_cast<double>(a.x) - b.x;
  const double dy = static_cast<double>(a.y) - b.y;
  return dx * dx + dy * dy;
}

}  // namespace

NormalizedRect normalizedRectFromJson(const json& value) {
  NormalizedRect result;
  if (value.is_array() && value.size() == 4) {
    result.x0 = value.at(0).get<double>();
    result.y0 = value.at(1).get<double>();
    result.x1 = value.at(2).get<double>();
    result.y1 = value.at(3).get<double>();
  } else if (value.is_object()) {
    result.x0 = value.at("x0").get<double>();
    result.y0 = value.at("y0").get<double>();
    result.x1 = value.at("x1").get<double>();
    result.y1 = value.at("y1").get<double>();
  } else {
    throw std::invalid_argument("A normalized rectangle must contain four coordinates");
  }
  if (!(result.x0 >= 0.0 && result.y0 >= 0.0 && result.x1 <= 1.0 &&
        result.y1 <= 1.0 && result.x1 > result.x0 && result.y1 > result.y0)) {
    throw std::invalid_argument("Normalized rectangle is outside [0, 1] or empty");
  }
  return result;
}

json normalizedRectToJson(const NormalizedRect& value) {
  return json::array({value.x0, value.y0, value.x1, value.y1});
}

AssayProfile AssayProfile::fromJson(const json& value) {
  AssayProfile result;
  readIfPresent(value, "schema_version", result.schema_version);
  readIfPresent(value, "id", result.id);
  readIfPresent(value, "version", result.version);
  readIfPresent(value, "canonical_width", result.canonical_width);
  readIfPresent(value, "canonical_height", result.canonical_height);
  readIfPresent(value, "min_aspect_ratio", result.min_aspect_ratio);
  readIfPresent(value, "max_aspect_ratio", result.max_aspect_ratio);
  if (value.contains("membrane_roi")) {
    result.membrane_roi = normalizedRectFromJson(value.at("membrane_roi"));
  }
  if (value.contains("test_window")) {
    result.test_window = normalizedRectFromJson(value.at("test_window"));
  }
  if (value.contains("control_window")) {
    result.control_window = normalizedRectFromJson(value.at("control_window"));
  }
  readIfPresent(value, "expected_line_width", result.expected_line_width);
  readIfPresent(value, "integration_half_width", result.integration_half_width);
  readIfPresent(value, "sample_to_wick", result.sample_to_wick);
  readIfPresent(value, "positive_when", result.positive_when);
  if (value.contains("default_cutoff") && !value.at("default_cutoff").is_null()) {
    result.default_cutoff = value.at("default_cutoff").get<double>();
  }
  if (value.contains("quality")) {
    const json& quality = value.at("quality");
    readIfPresent(quality, "min_control_snr", result.quality.min_control_snr);
    readIfPresent(quality, "min_test_snr", result.quality.min_test_snr);
    readIfPresent(quality, "min_control_area", result.quality.min_control_area);
    readIfPresent(quality, "min_valid_fraction", result.quality.min_valid_fraction);
    readIfPresent(quality, "min_blur_variance", result.quality.min_blur_variance);
    readIfPresent(quality, "max_clipped_fraction", result.quality.max_clipped_fraction);
    readIfPresent(quality, "max_glare_fraction", result.quality.max_glare_fraction);
    readIfPresent(quality, "min_quad_area_fraction",
                  result.quality.min_quad_area_fraction);
    readIfPresent(quality, "max_calibration_residual",
                  result.quality.max_calibration_residual);
  }
  if (result.canonical_width < 128 || result.canonical_height < 32 ||
      result.min_aspect_ratio <= 1.0 ||
      result.max_aspect_ratio <= result.min_aspect_ratio ||
      result.expected_line_width <= 0.0 || result.integration_half_width <= 0.0) {
    throw std::invalid_argument("Invalid assay profile dimensions or geometry");
  }
  if (result.positive_when != "gte") {
    throw std::invalid_argument("Only positive_when='gte' is supported in v1");
  }
  if (result.sample_to_wick != "left_to_right" &&
      result.sample_to_wick != "right_to_left") {
    throw std::invalid_argument(
        "sample_to_wick must be 'left_to_right' or 'right_to_left'");
  }
  return result;
}

json AssayProfile::toJson() const {
  json quality_json = {
      {"min_control_snr", quality.min_control_snr},
      {"min_test_snr", quality.min_test_snr},
      {"min_control_area", quality.min_control_area},
      {"min_valid_fraction", quality.min_valid_fraction},
      {"min_blur_variance", quality.min_blur_variance},
      {"max_clipped_fraction", quality.max_clipped_fraction},
      {"max_glare_fraction", quality.max_glare_fraction},
      {"min_quad_area_fraction", quality.min_quad_area_fraction},
      {"max_calibration_residual", quality.max_calibration_residual},
  };
  return {
      {"schema_version", schema_version},
      {"id", id},
      {"version", version},
      {"canonical_width", canonical_width},
      {"canonical_height", canonical_height},
      {"min_aspect_ratio", min_aspect_ratio},
      {"max_aspect_ratio", max_aspect_ratio},
      {"membrane_roi", normalizedRectToJson(membrane_roi)},
      {"test_window", normalizedRectToJson(test_window)},
      {"control_window", normalizedRectToJson(control_window)},
      {"expected_line_width", expected_line_width},
      {"integration_half_width", integration_half_width},
      {"sample_to_wick", sample_to_wick},
      {"default_cutoff", default_cutoff ? json(*default_cutoff) : json(nullptr)},
      {"positive_when", positive_when},
      {"quality", quality_json},
  };
}

CardProfile CardProfile::fromJson(const json& value) {
  CardProfile result;
  readIfPresent(value, "schema_version", result.schema_version);
  readIfPresent(value, "id", result.id);
  readIfPresent(value, "version", result.version);
  readIfPresent(value, "print_batch", result.print_batch);
  readIfPresent(value, "enrolled", result.enrolled);
  readIfPresent(value, "canonical_width", result.canonical_width);
  readIfPresent(value, "canonical_height", result.canonical_height);
  readIfPresent(value, "physical_width_mm", result.physical_width_mm);
  readIfPresent(value, "physical_height_mm", result.physical_height_mm);
  readIfPresent(value, "min_area_fraction", result.min_area_fraction);
  readIfPresent(value, "max_holdout_residual", result.max_holdout_residual);
  if (value.contains("fiducial_side_px") &&
      !value.at("fiducial_side_px").is_null()) {
    result.fiducial_side_px = value.at("fiducial_side_px").get<double>();
  }
  if (!value.contains("fiducial_centers") ||
      value.at("fiducial_centers").size() != 4) {
    throw std::invalid_argument("Card profile requires four fiducial centers");
  }
  for (size_t index = 0; index < 4; ++index) {
    const auto& point = value.at("fiducial_centers").at(index);
    result.fiducial_centers[index] = cv::Point2f(point.at(0).get<float>(),
                                                 point.at(1).get<float>());
  }
  if (value.contains("patches")) {
    for (const auto& patch_json : value.at("patches")) {
      CardPatch patch;
      patch.id = patch_json.at("id").get<std::string>();
      patch.role = patch_json.at("role").get<std::string>();
      patch.roi = normalizedRectFromJson(patch_json.at("roi"));
      if (patch_json.contains("reference_rgb")) {
        for (size_t channel = 0; channel < 3; ++channel) {
          patch.reference_rgb[channel] =
              patch_json.at("reference_rgb").at(channel).get<double>();
        }
      }
      result.patches.push_back(patch);
    }
  }
  if (result.canonical_width < 256 || result.canonical_height < 256 ||
      std::abs(result.canonical_width - result.canonical_height) > 1 ||
      result.physical_width_mm <= 0.0 || result.physical_height_mm <= 0.0 ||
      std::abs(result.physical_width_mm - result.physical_height_mm) > 0.01 ||
      result.min_area_fraction <= 0.0 || result.min_area_fraction >= 1.0 ||
      (result.fiducial_side_px && *result.fiducial_side_px <= 0.0) ||
      result.patches.empty()) {
    throw std::invalid_argument("Invalid or incomplete card profile");
  }
  return result;
}

json CardProfile::toJson() const {
  json patch_values = json::array();
  for (const CardPatch& patch : patches) {
    patch_values.push_back({
        {"id", patch.id},
        {"role", patch.role},
        {"roi", normalizedRectToJson(patch.roi)},
        {"reference_rgb", patch.reference_rgb},
    });
  }
  json centers = json::array();
  for (const cv::Point2f& center : fiducial_centers) {
    centers.push_back(pointToJson(center));
  }
  json result = {
      {"schema_version", schema_version},
      {"id", id},
      {"version", version},
      {"print_batch", print_batch},
      {"enrolled", enrolled},
      {"canonical_width", canonical_width},
      {"canonical_height", canonical_height},
      {"physical_width_mm", physical_width_mm},
      {"physical_height_mm", physical_height_mm},
      {"min_area_fraction", min_area_fraction},
      {"fiducial_centers", centers},
      {"patches", patch_values},
      {"max_holdout_residual", max_holdout_residual},
  };
  if (fiducial_side_px) {
    result["fiducial_side_px"] = *fiducial_side_px;
  }
  return result;
}

AnalysisOptions AnalysisOptions::fromJson(const json& value) {
  AnalysisOptions result;
  readIfPresent(value, "flip_orientation", result.flip_orientation);
  if (value.contains("cutoff") && !value.at("cutoff").is_null()) {
    result.cutoff = value.at("cutoff").get<double>();
  }
  if (value.contains("corner_override") && !value.at("corner_override").is_null()) {
    const auto& corners = value.at("corner_override");
    if (corners.size() != 4) {
      throw std::invalid_argument("corner_override must contain four points");
    }
    Quad quad{};
    for (size_t index = 0; index < 4; ++index) {
      quad[index] = cv::Point2f(corners.at(index).at(0).get<float>(),
                                corners.at(index).at(1).get<float>());
    }
    result.corner_override = orderQuad(quad);
  }
  return result;
}

json AnalysisResult::toJson() const {
  json corners = json::array();
  for (const cv::Point2f& point : geometry.corners) {
    corners.push_back(pointToJson(point));
  }
  json homography_json = json::array();
  if (!geometry.homography.empty()) {
    cv::Mat matrix;
    geometry.homography.convertTo(matrix, CV_64F);
    for (int row = 0; row < matrix.rows; ++row) {
      json values = json::array();
      for (int column = 0; column < matrix.cols; ++column) {
        values.push_back(matrix.at<double>(row, column));
      }
      homography_json.push_back(values);
    }
  }
  json tile_corners = json::array();
  if (geometry.calibration_tile_detected) {
    for (const cv::Point2f& point : geometry.calibration_tile_corners) {
      tile_corners.push_back(pointToJson(point));
    }
  }
  json tile_homography = json::array();
  if (!geometry.calibration_tile_homography.empty()) {
    cv::Mat matrix;
    geometry.calibration_tile_homography.convertTo(matrix, CV_64F);
    for (int row = 0; row < matrix.rows; ++row) {
      json values = json::array();
      for (int column = 0; column < matrix.cols; ++column) {
        values.push_back(matrix.at<double>(row, column));
      }
      tile_homography.push_back(values);
    }
  }
  json result = {
      {"schema_version", schema_version},
      {"algorithm_version", algorithm_version},
      {"assay_profile", {{"id", assay_profile_id}, {"version", assay_profile_version}}},
      {"status", status},
      {"reason_codes", reason_codes},
      {"calibration_mode", calibration_mode},
      {"geometry",
       {{"mode", geometry.mode},
        {"corners", corners},
        {"homography", homography_json},
        {"manually_corrected", geometry.manually_corrected},
        {"calibration_tile",
         {{"detected", geometry.calibration_tile_detected},
          {"corners", tile_corners},
          {"homography", tile_homography}}}}},
      {"quality",
       {{"locator_confidence", quality.locator_confidence},
        {"quad_area_fraction", quality.quad_area_fraction},
        {"locator_edge_support_fraction",
         quality.locator_edge_support_fraction},
        {"locator_rectification_rmse_px",
         quality.locator_rectification_rmse_px},
        {"perspective_scale_ratio", quality.perspective_scale_ratio},
        {"calibration_tile_confidence", quality.calibration_tile_confidence},
        {"calibration_tile_area_fraction",
         quality.calibration_tile_area_fraction},
        {"calibration_tile_edge_support_fraction",
         quality.calibration_tile_edge_support_fraction},
        {"calibration_tile_reprojection_rmse_px",
         quality.calibration_tile_reprojection_rmse_px},
        {"calibration_tile_holdout_rmse_px",
         quality.calibration_tile_holdout_rmse_px},
        {"blur_variance", quality.blur_variance},
        {"clipped_fraction", quality.clipped_fraction},
        {"glare_fraction", quality.glare_fraction},
        {"valid_fraction", quality.valid_fraction},
        {"calibration_residual", quality.calibration_residual},
        {"background_noise", quality.background_noise},
        {"peak_pair_confidence", quality.peak_pair_confidence}}},
      {"profile",
       {{"x", x},
        {"raw", raw_profile},
        {"baseline", baseline_profile},
        {"corrected", corrected_profile}}},
      {"peaks", {{"test", peakToJson(test_peak)}, {"control", peakToJson(control_peak)}}},
      {"signal",
       {{"metric", "test_control_peak_area_ratio"},
        {"value", signal_ratio ? json(*signal_ratio) : json(nullptr)},
        {"cutoff", cutoff ? json(*cutoff) : json(nullptr)},
        {"cutoff_source", cutoff_source},
        {"positive_when", "gte"},
        {"classification", classification ? json(*classification) : json(nullptr)}}},
      {"artifacts",
       {{"clipped_fraction", quality.clipped_fraction},
        {"specular_fraction", quality.glare_fraction},
        {"valid_fraction", quality.valid_fraction}}},
      {"timings_ms", timings_ms},
  };
  return result;
}

Quad orderQuad(const Quad& points) {
  const cv::Point2f center =
      (points[0] + points[1] + points[2] + points[3]) * 0.25F;
  std::array<std::pair<double, cv::Point2f>, 4> around{};
  for (size_t index = 0; index < points.size(); ++index) {
    around[index] = {std::atan2(points[index].y - center.y,
                                points[index].x - center.x),
                     points[index]};
  }
  std::sort(around.begin(), around.end(),
            [](const auto& first, const auto& second) {
              return first.first < second.first;
            });
  Quad ordered = {around[0].second, around[1].second, around[2].second,
                  around[3].second};

  // Keep clockwise winding in image coordinates. Unlike sum/difference
  // ordering, this remains well-defined for diamonds and strong keystone.
  std::vector<cv::Point2f> polygon(ordered.begin(), ordered.end());
  if (cv::contourArea(polygon, true) < 0.0) {
    ordered = {ordered[0], ordered[3], ordered[2], ordered[1]};
  }

  const double first_axis =
      0.5 * (distanceSquared(ordered[0], ordered[1]) +
             distanceSquared(ordered[2], ordered[3]));
  const double second_axis =
      0.5 * (distanceSquared(ordered[1], ordered[2]) +
             distanceSquared(ordered[3], ordered[0]));
  if (first_axis < second_axis) {
    ordered = {ordered[1], ordered[2], ordered[3], ordered[0]};
  }

  // The long axis has a 180-degree ambiguity. Resolve it by choosing the
  // uppermost (then leftmost) endpoint, without changing the winding.
  const bool opposite_first =
      ordered[2].y < ordered[0].y ||
      (ordered[2].y == ordered[0].y && ordered[2].x < ordered[0].x);
  if (opposite_first) {
    ordered = {ordered[2], ordered[3], ordered[0], ordered[1]};
  }
  return ordered;
}

}  // namespace stripcv
