#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <string>

#include <opencv2/core.hpp>

#include "stripcv/analyzer.hpp"
#include "../src/recognition_policy.hpp"

namespace {

stripcv::AssayProfile testAssay() {
  stripcv::AssayProfile assay;
  assay.id = "quality-policy-test";
  assay.version = "1.0";
  assay.canonical_width = 256;
  assay.canonical_height = 64;
  assay.membrane_roi = {0.03, 0.15, 0.97, 0.85};
  assay.test_window = {0.33, 0.0, 0.41, 1.0};
  assay.control_window = {0.41, 0.0, 0.49, 1.0};
  assay.expected_line_width = 0.025;
  assay.integration_half_width = 0.025;
  assay.quality.min_control_snr = 5.0;
  assay.quality.min_test_snr = 3.0;
  assay.quality.min_control_area = 1.0e-5;
  assay.quality.min_valid_fraction = 0.65;
  assay.quality.min_blur_variance = 18.0;
  assay.quality.max_clipped_fraction = 0.08;
  assay.quality.max_glare_fraction = 0.03;
  assay.quality.min_quad_area_fraction = 0.025;
  assay.default_cutoff = 1.0;
  return assay;
}

stripcv::Quad fullFrameCorners() {
  return {
      cv::Point2f(8.0F, 8.0F),
      cv::Point2f(504.0F, 8.0F),
      cv::Point2f(504.0F, 248.0F),
      cv::Point2f(8.0F, 248.0F),
  };
}

bool hasReason(const stripcv::AnalysisResult& result, const std::string& reason) {
  return std::find(result.reason_codes.begin(), result.reason_codes.end(), reason) !=
         result.reason_codes.end();
}

}  // namespace

int main() {
  const stripcv::AssayProfile assay = testAssay();
  stripcv::Analyzer analyzer;
  const cv::Mat blank(256, 512, CV_8UC3, cv::Scalar(255, 255, 255));

  // Freeze the exact quiet-profile paper ripple exposed by the corrected
  // compact-locator recognition stress set. It is line-shaped in 1-D but has
  // only 0.20% of C area. Neighboring real faint-line metrics remain eligible
  // because they are physically wider or independently stronger.
  stripcv::PeakMetrics strong_control;
  strong_control.detected = true;
  strong_control.area = 0.03165542696193015;
  stripcv::PeakMetrics paper_ripple;
  paper_ripple.detected = true;
  paper_ripple.area = 0.00006482415244443854;
  paper_ripple.fwhm = 0.016556291390728478;
  paper_ripple.snr = 3.889910207720217;
  stripcv::PeakMetrics real_faint_line;
  real_faint_line.detected = true;
  real_faint_line.area = 0.0000132478;
  real_faint_line.fwhm = 0.031457;
  real_faint_line.snr = 7.25156;
  if (!stripcv::internal::unsupportedTinyRelativeTestSignal(
          strong_control, paper_ripple, 0.035, 3.0) ||
      stripcv::internal::unsupportedTinyRelativeTestSignal(
          strong_control, real_faint_line, 0.035, 3.0)) {
    std::cerr << "tiny control-relative test-signal policy lost selectivity\n";
    return EXIT_FAILURE;
  }

  stripcv::AnalysisOptions enforced_options;
  enforced_options.corner_override = fullFrameCorners();
  const stripcv::AnalysisResult enforced =
      analyzer.analyze(blank, assay, enforced_options);

  stripcv::AnalysisOptions deprecated_bypass_options = enforced_options;
  deprecated_bypass_options.bypass_quality_checks = true;
  const stripcv::AnalysisResult deprecated_bypass =
      analyzer.analyze(blank, assay, deprecated_bypass_options);

  if (enforced.status != "invalid" || deprecated_bypass.status != "invalid") {
    std::cerr << "quality bypass changed an invalid blank capture into a reportable result\n";
    return EXIT_FAILURE;
  }
  if (!hasReason(deprecated_bypass, "quality_checks_bypass_ignored") ||
      hasReason(deprecated_bypass, "quality_checks_bypassed_for_testing")) {
    std::cerr << "deprecated bypass diagnostic was not deterministic\n";
    return EXIT_FAILURE;
  }
  if (!hasReason(enforced, "control_not_detected") ||
      !hasReason(deprecated_bypass, "control_not_detected")) {
    std::cerr << "missing-control failure was not enforced in both modes\n";
    return EXIT_FAILURE;
  }

  std::cout << "StripCV shared quality policy test passed.\n";
  return EXIT_SUCCESS;
}
