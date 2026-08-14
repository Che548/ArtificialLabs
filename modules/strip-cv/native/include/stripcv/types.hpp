#pragma once

#include <array>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>
#include <opencv2/core.hpp>

namespace stripcv {

using json = nlohmann::json;
using Quad = std::array<cv::Point2f, 4>;

struct NormalizedRect {
  double x0 = 0.0;
  double y0 = 0.0;
  double x1 = 1.0;
  double y1 = 1.0;
};

struct QualityThresholds {
  double min_control_snr = 5.0;
  double min_test_snr = 3.0;
  double min_control_area = 1.0e-5;
  double min_valid_fraction = 0.65;
  double min_blur_variance = 18.0;
  double max_clipped_fraction = 0.08;
  double max_glare_fraction = 0.03;
  double min_quad_area_fraction = 0.025;
  double max_calibration_residual = 0.12;
};

struct AssayProfile {
  std::string schema_version = "1.0";
  std::string id = "generic-pink-two-line-strip";
  std::string version = "1.1-observed-layout";
  int canonical_width = 1024;
  int canonical_height = 160;
  double min_aspect_ratio = 3.0;
  double max_aspect_ratio = 20.0;
  NormalizedRect membrane_roi{0.03, 0.15, 0.97, 0.85};
  NormalizedRect test_window{0.33, 0.0, 0.41, 1.0};
  NormalizedRect control_window{0.41, 0.0, 0.49, 1.0};
  double expected_line_width = 0.025;
  double integration_half_width = 0.025;
  std::string sample_to_wick = "left_to_right";
  std::optional<double> default_cutoff;
  std::string positive_when = "gte";
  QualityThresholds quality;

  static AssayProfile fromJson(const json& value);
  json toJson() const;
};

struct CardPatch {
  std::string id;
  std::string role;
  NormalizedRect roi;
  std::array<double, 3> reference_rgb{0.5, 0.5, 0.5};
};

struct CardProfile {
  std::string schema_version = "1.0";
  std::string id = "stripcv-square-tile";
  std::string version = "2.0";
  std::string print_batch = "UNENROLLED";
  bool enrolled = false;
  int canonical_width = 720;
  int canonical_height = 720;
  double physical_width_mm = 70.0;
  double physical_height_mm = 70.0;
  double min_area_fraction = 0.005;
  std::array<cv::Point2f, 4> fiducial_centers{};
  std::optional<double> fiducial_side_px;
  std::vector<CardPatch> patches;
  double max_holdout_residual = 0.12;

  static CardProfile fromJson(const json& value);
  json toJson() const;
};

struct AnalysisOptions {
  std::optional<CardProfile> card_profile;
  std::optional<Quad> corner_override;
  std::optional<double> cutoff;
  bool flip_orientation = false;
  // Deprecated compatibility flag. Quality checks are always enforced.
  bool bypass_quality_checks = false;
  bool include_rectified_image = false;

  static AnalysisOptions fromJson(const json& value);
};

struct PeakMetrics {
  bool detected = false;
  double position = 0.0;
  double height = 0.0;
  double prominence = 0.0;
  double snr = 0.0;
  double fwhm = 0.0;
  double area = 0.0;
};

struct QualityMetrics {
  double locator_confidence = 0.0;
  double quad_area_fraction = 0.0;
  double locator_edge_support_fraction = 0.0;
  double locator_rectification_rmse_px = 0.0;
  double perspective_scale_ratio = 1.0;
  double calibration_tile_confidence = 0.0;
  double calibration_tile_area_fraction = 0.0;
  double calibration_tile_edge_support_fraction = 0.0;
  double calibration_tile_reprojection_rmse_px = 0.0;
  double calibration_tile_holdout_rmse_px = 0.0;
  double blur_variance = 0.0;
  double clipped_fraction = 0.0;
  double glare_fraction = 0.0;
  double valid_fraction = 0.0;
  double calibration_residual = 0.0;
  double background_noise = 0.0;
  double peak_pair_confidence = 0.0;
};

struct GeometryInfo {
  std::string mode = "none";
  Quad corners{};
  cv::Mat homography;
  bool manually_corrected = false;
  bool calibration_tile_detected = false;
  Quad calibration_tile_corners{};
  cv::Mat calibration_tile_homography;
};

struct AnalysisResult {
  std::string schema_version = "1.0";
  std::string algorithm_version;
  std::string assay_profile_id;
  std::string assay_profile_version;
  std::string status = "invalid";
  std::vector<std::string> reason_codes;
  std::string calibration_mode = "none";
  bool include_rectified_image = false;
  GeometryInfo geometry;
  QualityMetrics quality;
  std::vector<double> x;
  std::vector<double> raw_profile;
  std::vector<double> baseline_profile;
  std::vector<double> corrected_profile;
  PeakMetrics test_peak;
  PeakMetrics control_peak;
  std::optional<double> signal_ratio;
  std::optional<double> cutoff;
  std::string cutoff_source = "none";
  std::optional<std::string> classification;
  std::map<std::string, double> timings_ms;
  cv::Mat rectified_rgb;
  cv::Mat artifact_mask;
  cv::Mat annotated_rgb;
  cv::Mat calibration_tile_rgb;

  json toJson() const;
};

NormalizedRect normalizedRectFromJson(const json& value);
json normalizedRectToJson(const NormalizedRect& value);
Quad orderQuad(const Quad& points);

}  // namespace stripcv
