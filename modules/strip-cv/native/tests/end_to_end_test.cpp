#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>
#include <utility>

#include "stripcv/analyzer.hpp"
#include "synthetic_fixture.hpp"

namespace {

class FixedLearnedRescueLocator final : public stripcv::IRegionLocator {
 public:
  explicit FixedLearnedRescueLocator(const stripcv::Quad& corners,
                                     double edge_support,
                                     std::string mode = "onnx",
                                     double confidence = 0.99,
                                     double rectification_rmse = 2.0,
                                     double perspective_scale_ratio = 1.1)
      : corners_(corners), edge_support_(edge_support), mode_(std::move(mode)),
        confidence_(confidence), rectification_rmse_(rectification_rmse),
        perspective_scale_ratio_(perspective_scale_ratio) {}

  stripcv::LocalizationResult locateBare(
      const cv::Mat&, const stripcv::AssayProfile&) const override {
    stripcv::LocalizationResult result;
    result.found = true;
    result.mode = mode_;
    result.corners = corners_;
    result.confidence = confidence_;
    result.area_fraction = 0.30;
    result.edge_support_fraction = edge_support_;
    result.rectification_rmse_px = rectification_rmse_;
    result.perspective_scale_ratio = perspective_scale_ratio_;
    return result;
  }

  stripcv::LocalizationResult locateCard(
      const cv::Mat&, const stripcv::CardProfile&) const override {
    stripcv::LocalizationResult result;
    result.mode = "card";
    result.failure_reason = "card_not_used";
    return result;
  }

 private:
  stripcv::Quad corners_{};
  double edge_support_ = 0.0;
  std::string mode_;
  double confidence_ = 0.0;
  double rectification_rmse_ = 0.0;
  double perspective_scale_ratio_ = 1.0;
};

}  // namespace

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const stripcv::Analyzer analyzer;

  const stripcv::AnalysisResult positive =
      analyzer.analyze(stripcv::test::makeCapture().rgb, assay);
  if (!stripcv::test::reportableTwoLine(positive)) {
    std::cerr
        << "automatic pipeline did not report the synthetic two-line strip: "
        << stripcv::test::diagnostic(positive) << '\n';
    return EXIT_FAILURE;
  }

  // A rescue-only learned quad in the ordinary review-support interval may
  // report only when an independently strong, coherent C/T pair proves its
  // registration. This freezes the labeled physical failure class without
  // weakening the global edge-support invalid threshold.
  stripcv::test::StripOptions learned_positive_options;
  learned_positive_options.test_strength = 0.30;
  learned_positive_options.control_strength = 0.32;
  learned_positive_options.control_position = 0.097;
  learned_positive_options.test_position = 0.181;
  const stripcv::test::Capture learned_positive_capture =
      stripcv::test::makeCapture(learned_positive_options);
  const auto learned_locator = std::make_shared<FixedLearnedRescueLocator>(
      learned_positive_capture.corners, 0.41);
  const stripcv::AnalysisResult learned_positive =
      stripcv::Analyzer(learned_locator).analyze(learned_positive_capture.rgb,
                                                 assay);
  if (!stripcv::test::reportableTwoLine(learned_positive) ||
      !stripcv::test::hasReason(
          learned_positive,
          "locator_geometry_confirmed_by_strong_pair")) {
    std::cerr << "strong learned-rescue pair did not prove geometry: "
              << stripcv::test::diagnostic(learned_positive)
              << " pair_confidence="
              << learned_positive.quality.peak_pair_confidence << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions shadow_pair_options = learned_positive_options;
  shadow_pair_options.shadow_gradient = true;
  const stripcv::test::Capture shadow_pair_capture =
      stripcv::test::makeCapture(shadow_pair_options);
  const auto shadow_pair_locator =
      std::make_shared<FixedLearnedRescueLocator>(shadow_pair_capture.corners,
                                                  0.90, "bare", 0.99);
  const stripcv::AnalysisResult shadow_pair =
      stripcv::Analyzer(shadow_pair_locator)
          .analyze(shadow_pair_capture.rgb, assay);
  if (!stripcv::test::reportableTwoLine(shadow_pair) ||
      !stripcv::test::hasReason(
          shadow_pair, "illumination_gradient_confirmed_by_strong_pair")) {
    std::cerr << "strong coherent pair did not disambiguate illumination: "
              << stripcv::test::diagnostic(shadow_pair) << '\n';
    return EXIT_FAILURE;
  }

  const auto transverse_width_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          learned_positive_capture.corners, 0.90,
          "bare_transverse_width");
  const stripcv::AnalysisResult transverse_width_positive =
      stripcv::Analyzer(transverse_width_locator)
          .analyze(learned_positive_capture.rgb, assay);
  if (transverse_width_positive.status != "review" ||
      !stripcv::test::hasReason(transverse_width_positive,
                                "check_detected_corners")) {
    std::cerr << "transverse-width recovery bypassed manual geometry review: "
              << stripcv::test::diagnostic(transverse_width_positive) << '\n';
    return EXIT_FAILURE;
  }

  // The completed labeled replay found three ordinary, strong ordered pairs
  // whose refined geometry had only 0.2625--0.3281 measured rail support, but
  // whose independently replayed raw learned proposal preserved the same two
  // physical bands. Freeze the observed 0.25 lower boundary and its immediate
  // invalid neighbor. This must remain the same strict two-line proof, not a
  // global weakening of automatic geometry policy.
  const auto low_edge_proven_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          learned_positive_capture.corners, 0.26);
  const stripcv::AnalysisResult low_edge_proven =
      stripcv::Analyzer(low_edge_proven_locator)
          .analyze(learned_positive_capture.rgb, assay);
  if (!stripcv::test::reportableTwoLine(low_edge_proven) ||
      !stripcv::test::hasReason(
          low_edge_proven, "locator_geometry_confirmed_by_strong_pair")) {
    std::cerr << "strong pair did not confirm labeled low-edge geometry: "
              << stripcv::test::diagnostic(low_edge_proven) << '\n';
    return EXIT_FAILURE;
  }
  const auto sub_floor_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          learned_positive_capture.corners, 0.24);
  const stripcv::AnalysisResult sub_floor_positive =
      stripcv::Analyzer(sub_floor_locator)
          .analyze(learned_positive_capture.rgb, assay);
  if (sub_floor_positive.status != "invalid" ||
      !stripcv::test::hasReason(
          sub_floor_positive, "geometry_edge_support_insufficient")) {
    std::cerr << "strong pair bypassed the measured geometry floor: "
              << stripcv::test::diagnostic(sub_floor_positive) << '\n';
    return EXIT_FAILURE;
  }

  // The proof is about independently strong C/T signal and measured geometry,
  // not the name of the proposal backend. The completed raw replay contained
  // three safe strong pairs in the same edge-support interval after the
  // classical-first fallback won over the learned proposal. Freeze that mode
  // independence so equivalent evidence receives equivalent policy.
  const auto classical_fallback_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          learned_positive_capture.corners, 0.41,
          "onnx_fallback_classical");
  const stripcv::AnalysisResult classical_fallback_positive =
      stripcv::Analyzer(classical_fallback_locator)
          .analyze(learned_positive_capture.rgb, assay);
  if (!stripcv::test::reportableTwoLine(classical_fallback_positive) ||
      !stripcv::test::hasReason(
          classical_fallback_positive,
          "locator_geometry_confirmed_by_strong_pair")) {
    std::cerr << "strong classical-fallback pair did not prove geometry: "
              << stripcv::test::diagnostic(classical_fallback_positive)
              << '\n';
    return EXIT_FAILURE;
  }

  // Locator confidence is backend-calibrated. The last safe replay candidate
  // scored 0.944 under classical fallback even though every geometric and
  // signal proof was strong. Freeze a shared 0.90 evidence floor and its
  // nearby rejection neighbor rather than retaining an ONNX-specific 0.95.
  const auto calibrated_fallback_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          learned_positive_capture.corners, 0.41,
          "onnx_fallback_classical", 0.91);
  const stripcv::AnalysisResult calibrated_fallback_positive =
      stripcv::Analyzer(calibrated_fallback_locator)
          .analyze(learned_positive_capture.rgb, assay);
  if (!stripcv::test::reportableTwoLine(calibrated_fallback_positive)) {
    std::cerr << "backend-calibrated strong pair did not prove geometry: "
              << stripcv::test::diagnostic(calibrated_fallback_positive)
              << '\n';
    return EXIT_FAILURE;
  }
  const auto low_confidence_fallback_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          learned_positive_capture.corners, 0.41,
          "onnx_fallback_classical", 0.85);
  const stripcv::AnalysisResult low_confidence_fallback_positive =
      stripcv::Analyzer(low_confidence_fallback_locator)
          .analyze(learned_positive_capture.rgb, assay);
  if (low_confidence_fallback_positive.status != "review" ||
      !stripcv::test::hasReason(low_confidence_fallback_positive,
                                "check_detected_corners")) {
    std::cerr << "low-confidence fallback pair bypassed geometry review: "
              << stripcv::test::diagnostic(low_confidence_fallback_positive)
              << '\n';
    return EXIT_FAILURE;
  }

  // Being visibly two-line is not enough to waive weak geometry. The replayed
  // gains all cleared the existing eight-times-T-SNR margin; a pair below that
  // independent proof boundary must remain review even in fallback mode.
  stripcv::AssayProfile moderate_fallback_assay = assay;
  moderate_fallback_assay.quality.min_test_snr =
      classical_fallback_positive.test_peak.snr / 6.0;
  const stripcv::AnalysisResult moderate_fallback_positive =
      stripcv::Analyzer(classical_fallback_locator)
          .analyze(learned_positive_capture.rgb, moderate_fallback_assay);
  if (moderate_fallback_positive.status != "review" ||
      !stripcv::test::hasReason(moderate_fallback_positive,
                                "check_detected_corners")) {
    std::cerr << "moderate fallback pair bypassed geometry review: "
              << stripcv::test::diagnostic(moderate_fallback_positive)
              << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions negative_options;
  negative_options.test_line = false;
  const stripcv::test::Capture negative_capture =
      stripcv::test::makeCapture(negative_options);
  const stripcv::AnalysisResult negative =
      analyzer.analyze(negative_capture.rgb, assay);
  if (!stripcv::test::reportableOneLine(negative)) {
    std::cerr
        << "automatic pipeline did not report the synthetic one-line strip\n";
    return EXIT_FAILURE;
  }
  const auto learned_negative_locator =
      std::make_shared<FixedLearnedRescueLocator>(negative_capture.corners,
                                                  0.41);
  const stripcv::AnalysisResult learned_negative =
      stripcv::Analyzer(learned_negative_locator)
          .analyze(negative_capture.rgb, assay);
  if (learned_negative.status != "review" ||
      !stripcv::test::hasReason(learned_negative,
                                "check_detected_corners")) {
    std::cerr << "learned-rescue edge waiver leaked into one-line output: "
              << stripcv::test::diagnostic(learned_negative) << '\n';
    return EXIT_FAILURE;
  }

  // A clean one-line capture may use the narrow 0.48--0.55 rail-support
  // interval only when C is independently strong and no T/extra-line warning
  // exists. Freeze both sides of the new boundary; this is not a general
  // one-line geometry waiver.
  const auto strong_negative_edge_locator =
      std::make_shared<FixedLearnedRescueLocator>(negative_capture.corners,
                                                  0.49, "bare", 0.99);
  const stripcv::AnalysisResult strong_negative_edge =
      stripcv::Analyzer(strong_negative_edge_locator)
          .analyze(negative_capture.rgb, assay);
  if (!stripcv::test::reportableOneLine(strong_negative_edge) ||
      !stripcv::test::hasReason(
          strong_negative_edge,
          "locator_geometry_confirmed_by_strong_control")) {
    std::cerr << "strong negative did not confirm borderline rail support: "
              << stripcv::test::diagnostic(strong_negative_edge) << '\n';
    return EXIT_FAILURE;
  }

  // A line-shaped but non-positive ripple outside T/C must not veto an
  // otherwise strong one-line capture. It remains observable, and any
  // positive/faint/coherent T evidence still takes the ordinary review path.
  cv::Mat isolated_ripple_strip =
      stripcv::test::makeCanonicalStrip(negative_options);
  stripcv::test::blendLine(isolated_ripple_strip, assay, 0.50, 0.012);
  const stripcv::test::Capture isolated_ripple_capture =
      stripcv::test::placeInScene(isolated_ripple_strip);
  const auto isolated_ripple_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          isolated_ripple_capture.corners, 0.90, "bare", 0.99);
  const stripcv::AnalysisResult isolated_ripple =
      stripcv::Analyzer(isolated_ripple_locator)
          .analyze(isolated_ripple_capture.rgb, assay);
  if (!stripcv::test::reportableOneLine(isolated_ripple) ||
      !stripcv::test::hasReason(isolated_ripple,
                                "nonpositive_assay_ripple_ignored")) {
    std::cerr << "isolated non-positive ripple remained a false review: "
              << stripcv::test::diagnostic(isolated_ripple) << '\n';
    return EXIT_FAILURE;
  }
  const auto below_negative_edge_locator =
      std::make_shared<FixedLearnedRescueLocator>(negative_capture.corners,
                                                  0.47, "bare", 0.99);
  const stripcv::AnalysisResult below_negative_edge =
      stripcv::Analyzer(below_negative_edge_locator)
          .analyze(negative_capture.rgb, assay);
  if (below_negative_edge.status != "review" ||
      !stripcv::test::hasReason(below_negative_edge,
                                "check_detected_corners")) {
    std::cerr << "one-line rail-support floor was weakened too far: "
              << stripcv::test::diagnostic(below_negative_edge) << '\n';
    return EXIT_FAILURE;
  }

  // Strong signal can cross-check only the mild 3.0--3.25 canonical-pixel
  // rectification band. The adjacent value remains review.
  const auto mild_rmse_positive_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          learned_positive_capture.corners, 0.90, "bare", 0.99, 3.20);
  const stripcv::AnalysisResult mild_rmse_positive =
      stripcv::Analyzer(mild_rmse_positive_locator)
          .analyze(learned_positive_capture.rgb, assay);
  if (!stripcv::test::reportableTwoLine(mild_rmse_positive) ||
      !stripcv::test::hasReason(
          mild_rmse_positive, "rectification_confirmed_by_strong_signal")) {
    std::cerr << "strong pair did not confirm mild rectification residual: "
              << stripcv::test::diagnostic(mild_rmse_positive) << '\n';
    return EXIT_FAILURE;
  }
  const auto excessive_rmse_positive_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          learned_positive_capture.corners, 0.90, "bare", 0.99, 3.30);
  const stripcv::AnalysisResult excessive_rmse_positive =
      stripcv::Analyzer(excessive_rmse_positive_locator)
          .analyze(learned_positive_capture.rgb, assay);
  if (excessive_rmse_positive.status != "review" ||
      !stripcv::test::hasReason(excessive_rmse_positive,
                                "check_detected_corners")) {
    std::cerr << "rectification residual above the narrow margin reported: "
              << stripcv::test::diagnostic(excessive_rmse_positive) << '\n';
    return EXIT_FAILURE;
  }
  const auto low_edge_negative_locator =
      std::make_shared<FixedLearnedRescueLocator>(negative_capture.corners,
                                                  0.26);
  const stripcv::AnalysisResult low_edge_negative =
      stripcv::Analyzer(low_edge_negative_locator)
          .analyze(negative_capture.rgb, assay);
  if (low_edge_negative.status != "invalid" ||
      !stripcv::test::hasReason(low_edge_negative,
                                "geometry_edge_support_insufficient")) {
    std::cerr << "low-edge geometry proof leaked into one-line output: "
              << stripcv::test::diagnostic(low_edge_negative) << '\n';
    return EXIT_FAILURE;
  }
  const auto fallback_negative_locator =
      std::make_shared<FixedLearnedRescueLocator>(
          negative_capture.corners, 0.41, "onnx_fallback_classical");
  const stripcv::AnalysisResult fallback_negative =
      stripcv::Analyzer(fallback_negative_locator)
          .analyze(negative_capture.rgb, assay);
  if (fallback_negative.status != "review" ||
      !stripcv::test::hasReason(fallback_negative,
                                "check_detected_corners")) {
    std::cerr << "fallback geometry waiver leaked into one-line output: "
              << stripcv::test::diagnostic(fallback_negative) << '\n';
    return EXIT_FAILURE;
  }

  // A negative call from automatic geometry needs twice the minimum control
  // SNR. A marginal C can survive a shifted homography while a genuine faint
  // T is absorbed into the fitted baseline. Scale the threshold from this
  // fixture's measured C so the regression freezes the relative safety margin
  // without depending on an absolute renderer noise level.
  stripcv::AssayProfile marginal_automatic_assay = assay;
  marginal_automatic_assay.quality.min_control_snr =
      negative.control_peak.snr / 1.5;
  const stripcv::AnalysisResult marginal_automatic_negative =
      analyzer.analyze(negative_capture.rgb, marginal_automatic_assay);
  if (marginal_automatic_negative.status != "review" ||
      !stripcv::test::hasReason(
          marginal_automatic_negative,
          "control_margin_insufficient_for_one_line")) {
    std::cerr << "weak-control automatic one-line decision remained "
                 "reportable: "
              << stripcv::test::diagnostic(marginal_automatic_negative)
              << '\n';
    return EXIT_FAILURE;
  }

  stripcv::AnalysisOptions confirmed_geometry;
  confirmed_geometry.corner_override = negative_capture.corners;
  const stripcv::AnalysisResult marginal_confirmed_negative = analyzer.analyze(
      negative_capture.rgb, marginal_automatic_assay, confirmed_geometry);
  if (!stripcv::test::reportableOneLine(marginal_confirmed_negative)) {
    std::cerr << "confirmed clean geometry lost the lower control-SNR "
                 "eligibility: "
              << stripcv::test::diagnostic(marginal_confirmed_negative)
              << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions invalid_options;
  invalid_options.control_line = false;
  const stripcv::AnalysisResult invalid =
      analyzer.analyze(stripcv::test::makeCapture(invalid_options).rgb, assay);
  if (invalid.status != "invalid" ||
      !stripcv::test::hasReason(invalid, "control_not_detected")) {
    std::cerr
        << "automatic pipeline did not reject the missing-control strip\n";
    return EXIT_FAILURE;
  }
  std::cout << "StripCV end-to-end synthetic tests passed.\n";
  return EXIT_SUCCESS;
}
