#include <cstdlib>
#include <cmath>
#include <iostream>
#include <vector>

#include "stripcv/analyzer.hpp"
#include "synthetic_fixture.hpp"

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const stripcv::Analyzer analyzer;

  const stripcv::test::Capture positive = stripcv::test::makeCapture();
  stripcv::AnalysisOptions options;
  options.corner_override = positive.corners;
  const stripcv::AnalysisResult two_line =
      analyzer.analyze(positive.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(two_line)) {
    std::cerr << "ground-truth geometry did not produce a reportable two-line "
                 "result: "
              << stripcv::test::diagnostic(two_line) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions one_line_options;
  one_line_options.test_line = false;
  const stripcv::test::Capture negative =
      stripcv::test::makeCapture(one_line_options);
  options.corner_override = negative.corners;
  const stripcv::AnalysisResult one_line =
      analyzer.analyze(negative.rgb, assay, options);
  if (!stripcv::test::reportableOneLine(one_line)) {
    std::cerr << "ground-truth geometry did not produce a reportable one-line "
                 "result: "
              << stripcv::test::diagnostic(one_line) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions shifted_pair_options;
  shifted_pair_options.control_position = 0.17;
  shifted_pair_options.test_position = 0.36;
  const stripcv::test::Capture shifted_pair =
      stripcv::test::makeCapture(shifted_pair_options);
  options.corner_override = shifted_pair.corners;
  const stripcv::AnalysisResult shifted_two_line =
      analyzer.analyze(shifted_pair.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(shifted_two_line) ||
      !stripcv::test::hasReason(
          shifted_two_line, "inner_measurement_region_peak_pair_recovered")) {
    std::cerr << "wide but valid shifted C/T pair was not recovered: "
              << stripcv::test::diagnostic(shifted_two_line) << '\n';
    return EXIT_FAILURE;
  }

  // Inner-region recovery deliberately searches far beyond the fixed C/T
  // windows. A proposed control that only just clears the assay's control-SNR
  // threshold cannot safely anchor that permissive assignment. Scale the
  // synthetic profile's threshold to freeze the required 2x control margin
  // without coupling the regression to absolute fixture noise.
  stripcv::AssayProfile weak_inner_control_assay = assay;
  weak_inner_control_assay.quality.min_control_snr = 5000.0;
  const stripcv::AnalysisResult weak_inner_control_result =
      analyzer.analyze(shifted_pair.rgb, weak_inner_control_assay, options);
  if (weak_inner_control_result.status != "review" ||
      !stripcv::test::hasReason(weak_inner_control_result,
                                "recovered_control_support_insufficient")) {
    std::cerr << "weak inner-region control remained reportable: "
              << stripcv::test::diagnostic(weak_inner_control_result) << '\n';
    return EXIT_FAILURE;
  }

  shifted_pair_options.test_line = false;
  const stripcv::test::Capture shifted_one_line =
      stripcv::test::makeCapture(shifted_pair_options);
  options.corner_override = shifted_one_line.corners;
  const stripcv::AnalysisResult shifted_negative =
      analyzer.analyze(shifted_one_line.rgb, assay, options);
  if (!stripcv::test::reportableOneLine(shifted_negative)) {
    std::cerr << "shifted control-only strip produced an unsafe result: "
              << stripcv::test::diagnostic(shifted_negative) << '\n';
    return EXIT_FAILURE;
  }

  // A coloured paper/adhesive boundary can create a >2x global plane span
  // without being a shadow. Its RGB channels do not scale proportionally.
  // Preserve a coherent C/T pair while the matched neutral hard-shadow twin
  // in quality_matrix_test remains an abstention.
  stripcv::test::StripOptions material_step_options;
  material_step_options.control_strength = 0.70;
  material_step_options.test_strength = 0.55;
  cv::Mat material_step_strip =
      stripcv::test::makeCanonicalStrip(material_step_options);
  const cv::Rect material_membrane = stripcv::test::membraneRect(assay);
  const int material_boundary =
      material_membrane.x + material_membrane.width / 2;
  for (int column = material_boundary;
       column < material_membrane.x + material_membrane.width; ++column) {
    for (int row = material_membrane.y;
         row < material_membrane.y + material_membrane.height; ++row) {
      cv::Vec3b& pixel = material_step_strip.at<cv::Vec3b>(row, column);
      pixel[0] = cv::saturate_cast<unsigned char>(pixel[0] * 0.38);
      pixel[1] = cv::saturate_cast<unsigned char>(pixel[1] * 0.40);
      pixel[2] = cv::saturate_cast<unsigned char>(pixel[2] * 0.42);
    }
  }
  const stripcv::test::Capture material_step =
      stripcv::test::placeInScene(material_step_strip);
  options.corner_override = material_step.corners;
  const stripcv::AnalysisResult material_step_result =
      analyzer.analyze(material_step.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(material_step_result) ||
      !stripcv::test::hasReason(
          material_step_result,
          "chromatic_material_step_disambiguated")) {
    std::cerr << "chromatic material boundary was treated as a shadow: "
              << stripcv::test::diagnostic(material_step_result) << '\n';
    return EXIT_FAILURE;
  }

  // A variable handle/membrane overlap can displace both bands far beyond the
  // frozen C/T windows. The position-invariant raw dye profile must recover a
  // dominant compact pair without changing background correction or relying
  // on a guessed seam location.
  stripcv::test::StripOptions invariant_pair_options;
  invariant_pair_options.control_position = 0.32;
  invariant_pair_options.test_position = 0.41;
  invariant_pair_options.control_strength = 0.42;
  invariant_pair_options.test_strength = 0.30;
  const stripcv::test::Capture invariant_pair =
      stripcv::test::makeCapture(invariant_pair_options);
  options.corner_override = invariant_pair.corners;
  const stripcv::AnalysisResult invariant_pair_result =
      analyzer.analyze(invariant_pair.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(invariant_pair_result) ||
      !stripcv::test::hasReason(
          invariant_pair_result, "position_invariant_dye_pair_recovered")) {
    std::cerr << "position-invariant displaced C/T pair was not recovered: "
              << stripcv::test::diagnostic(invariant_pair_result) << '\n';
    return EXIT_FAILURE;
  }

  invariant_pair_options.test_line = false;
  const stripcv::test::Capture invariant_single =
      stripcv::test::makeCapture(invariant_pair_options);
  options.corner_override = invariant_single.corners;
  const stripcv::AnalysisResult invariant_single_result =
      analyzer.analyze(invariant_single.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(invariant_single_result)) {
    std::cerr << "single displaced dye band became a false C/T pair: "
              << stripcv::test::diagnostic(invariant_single_result) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions invariant_artifact_options;
  invariant_artifact_options.control_line = false;
  invariant_artifact_options.test_line = false;
  cv::Mat invariant_artifact_strip =
      stripcv::test::makeCanonicalStrip(invariant_artifact_options);
  stripcv::test::blendLine(invariant_artifact_strip, assay, 0.32, 0.65, 0.8,
                           1.0, cv::Vec3d(170.0, 165.0, 160.0));
  stripcv::test::blendLine(invariant_artifact_strip, assay, 0.41, 0.60, 0.8,
                           1.0, cv::Vec3d(170.0, 165.0, 160.0));
  const stripcv::test::Capture invariant_artifact =
      stripcv::test::placeInScene(invariant_artifact_strip);
  options.corner_override = invariant_artifact.corners;
  const stripcv::AnalysisResult invariant_artifact_result =
      analyzer.analyze(invariant_artifact.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(invariant_artifact_result)) {
    std::cerr << "neutral displaced paper rails became a false C/T pair: "
              << stripcv::test::diagnostic(invariant_artifact_result) << '\n';
    return EXIT_FAILURE;
  }

  invariant_artifact_strip =
      stripcv::test::makeCanonicalStrip(invariant_artifact_options);
  stripcv::test::blendLine(invariant_artifact_strip, assay, 0.32, 0.55, 4.0);
  stripcv::test::blendLine(invariant_artifact_strip, assay, 0.41, 0.50, 4.0);
  const stripcv::test::Capture invariant_broad_pair =
      stripcv::test::placeInScene(invariant_artifact_strip);
  options.corner_override = invariant_broad_pair.corners;
  const stripcv::AnalysisResult invariant_broad_pair_result =
      analyzer.analyze(invariant_broad_pair.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(invariant_broad_pair_result)) {
    std::cerr << "two displaced broad stains became a false C/T pair: "
              << stripcv::test::diagnostic(invariant_broad_pair_result)
              << '\n';
    return EXIT_FAILURE;
  }

  cv::Mat invariant_dye_run_strip =
      stripcv::test::makeCanonicalStrip(invariant_pair_options);
  stripcv::test::blendLine(invariant_dye_run_strip, assay, 0.43, 0.46, 9.0);
  const stripcv::test::Capture invariant_dye_run =
      stripcv::test::placeInScene(invariant_dye_run_strip);
  options.corner_override = invariant_dye_run.corners;
  const stripcv::AnalysisResult invariant_dye_run_result =
      analyzer.analyze(invariant_dye_run.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(invariant_dye_run_result)) {
    std::cerr << "compact displaced C/T inside a dye run became reportable: "
              << stripcv::test::diagnostic(invariant_dye_run_result) << '\n';
    return EXIT_FAILURE;
  }

  invariant_artifact_strip =
      stripcv::test::makeCanonicalStrip(invariant_artifact_options);
  stripcv::test::blendLine(invariant_artifact_strip, assay, 0.32, 0.42);
  stripcv::test::blendLine(invariant_artifact_strip, assay, 0.41, 0.38);
  stripcv::test::blendLine(invariant_artifact_strip, assay, 0.49, 0.36);
  const stripcv::test::Capture invariant_three_line =
      stripcv::test::placeInScene(invariant_artifact_strip);
  options.corner_override = invariant_three_line.corners;
  const stripcv::AnalysisResult invariant_three_line_result =
      analyzer.analyze(invariant_three_line.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(invariant_three_line_result)) {
    std::cerr << "three displaced same-dye lines became a reportable pair: "
              << stripcv::test::diagnostic(invariant_three_line_result)
              << '\n';
    return EXIT_FAILURE;
  }

  // A long paper overlap can place C/T near the far end of the membrane and
  // leave one band below the absolute raw-chroma threshold. The strong member
  // acts as an in-frame spectral reference for the weaker member; neither a
  // lone late band nor a neutral construction rail may satisfy that pairing.
  stripcv::test::StripOptions late_pair_options;
  late_pair_options.control_position = 0.58;
  late_pair_options.test_position = 0.72;
  late_pair_options.control_strength = 0.42;
  late_pair_options.test_strength = 0.12;
  const stripcv::test::Capture late_pair =
      stripcv::test::makeCapture(late_pair_options);
  options.corner_override = late_pair.corners;
  const stripcv::AnalysisResult late_pair_result =
      analyzer.analyze(late_pair.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(late_pair_result) ||
      !stripcv::test::hasReason(
          late_pair_result,
          "anchor_conditioned_late_dye_pair_recovered")) {
    std::cerr << "anchor-conditioned late C/T pair was not recovered: "
              << stripcv::test::diagnostic(late_pair_result) << '\n';
    return EXIT_FAILURE;
  }

  const stripcv::AnalysisResult automatic_late_pair_result =
      analyzer.analyze(late_pair.rgb, assay, {});
  if (stripcv::test::hasReason(
          automatic_late_pair_result,
          "anchor_conditioned_late_dye_pair_recovered")) {
    std::cerr << "anchor-conditioned recovery escaped its known-corner "
                 "authority boundary: "
              << stripcv::test::diagnostic(automatic_late_pair_result)
              << '\n';
    return EXIT_FAILURE;
  }

  late_pair_options.test_strength = 0.025;
  const stripcv::test::Capture late_trace =
      stripcv::test::makeCapture(late_pair_options);
  options.corner_override = late_trace.corners;
  const stripcv::AnalysisResult late_trace_result =
      analyzer.analyze(late_trace.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(late_trace_result)) {
    std::cerr << "near-vanishing late companion became reportable: "
              << stripcv::test::diagnostic(late_trace_result) << '\n';
    return EXIT_FAILURE;
  }

  // A wrong endpoint hypothesis in the manually segmented development set
  // produced a same-colour late companion with 0.786 pair confidence. Every
  // correct late-pair report in the exact and automatic-proposal replays had
  // full confidence. Preserve a synthetic intermediate companion as review
  // so the anchor-only recovery cannot report on merely probable pairing.
  late_pair_options.test_strength = 0.12;
  late_pair_options.test_vertical_fraction = 0.60;
  const stripcv::test::Capture late_probable =
      stripcv::test::makeCapture(late_pair_options);
  options.corner_override = late_probable.corners;
  const stripcv::AnalysisResult late_probable_result =
      analyzer.analyze(late_probable.rgb, assay, options);
  if (late_probable_result.status != "review" ||
      late_probable_result.quality.peak_pair_confidence < 0.70 ||
      !stripcv::test::hasReason(
          late_probable_result,
          "anchor_conditioned_companion_needs_review")) {
    std::cerr << "probable late companion bypassed confidence proof: "
              << stripcv::test::diagnostic(late_probable_result) << '\n';
    return EXIT_FAILURE;
  }

  late_pair_options.test_vertical_fraction = -1.0;
  late_pair_options.test_strength = 0.12;
  late_pair_options.test_line = false;
  const stripcv::test::Capture late_single =
      stripcv::test::makeCapture(late_pair_options);
  options.corner_override = late_single.corners;
  const stripcv::AnalysisResult late_single_result =
      analyzer.analyze(late_single.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(late_single_result)) {
    std::cerr << "single late dye band invented a spectral companion: "
              << stripcv::test::diagnostic(late_single_result) << '\n';
    return EXIT_FAILURE;
  }

  cv::Mat late_rail_strip =
      stripcv::test::makeCanonicalStrip(late_pair_options);
  stripcv::test::blendLine(late_rail_strip, assay, 0.72, 0.60, 0.8, 1.0,
                           cv::Vec3d(170.0, 165.0, 160.0));
  const stripcv::test::Capture late_rail =
      stripcv::test::placeInScene(late_rail_strip);
  options.corner_override = late_rail.corners;
  const stripcv::AnalysisResult late_rail_result =
      analyzer.analyze(late_rail.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(late_rail_result)) {
    std::cerr << "late neutral construction rail matched the dye anchor: "
              << stripcv::test::diagnostic(late_rail_result) << '\n';
    return EXIT_FAILURE;
  }

  // A same-dye coating patch can fool symmetric aggregate shoulders at its
  // downstream edge: its colour and full-height coverage match C even though
  // the alleged companion is the edge of a flat material region, not a
  // deposited Gaussian band.  Freeze the exact general failure class found
  // in the local concentration-series audit.
  stripcv::test::StripOptions late_coating_options;
  late_coating_options.test_line = false;
  late_coating_options.control_position = 0.325;
  late_coating_options.control_strength = 0.42;
  cv::Mat late_coating_strip =
      stripcv::test::makeCanonicalStrip(late_coating_options);
  const cv::Rect late_coating_membrane =
      stripcv::test::membraneRect(assay);
  for (const double coating_span : {0.035, 0.09}) {
    cv::Mat coated_variant = late_coating_strip.clone();
    const int coating_first = late_coating_membrane.x +
        cvRound((0.38 - coating_span / 2.0) * late_coating_membrane.width);
    const int coating_last = late_coating_membrane.x +
        cvRound((0.38 + coating_span / 2.0) * late_coating_membrane.width);
    for (int row = late_coating_membrane.y;
         row < late_coating_membrane.y + late_coating_membrane.height; ++row) {
      for (int column = coating_first; column < coating_last; ++column) {
        cv::Vec3b& pixel = coated_variant.at<cv::Vec3b>(row, column);
        const cv::Vec3d coating(196.0, 52.0, 92.0);
        for (int channel = 0; channel < 3; ++channel) {
          pixel[channel] = cv::saturate_cast<unsigned char>(
              0.90 * pixel[channel] + 0.10 * coating[channel]);
        }
      }
    }
    const stripcv::test::Capture late_coating =
        stripcv::test::placeInScene(coated_variant);
    options.corner_override = late_coating.corners;
    const stripcv::AnalysisResult late_coating_result =
        analyzer.analyze(late_coating.rgb, assay, options);
    if (stripcv::test::reportableTwoLine(late_coating_result)) {
      std::cerr << "same-dye coating edge became an anchor-conditioned pair "
                << "at span " << coating_span << ": "
                << stripcv::test::diagnostic(late_coating_result) << '\n';
      return EXIT_FAILURE;
    }
  }

  stripcv::test::StripOptions edge_pair_options;
  edge_pair_options.control_position = 0.025;
  edge_pair_options.test_position = 0.12;
  const stripcv::test::Capture edge_pair =
      stripcv::test::makeCapture(edge_pair_options);
  options.corner_override = edge_pair.corners;
  const stripcv::AnalysisResult edge_pair_result =
      analyzer.analyze(edge_pair.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(edge_pair_result) ||
      !stripcv::test::hasReason(edge_pair_result,
                                "edge_control_peak_pair_recovered")) {
    std::cerr << "compact C/T pair at the membrane boundary was not recovered: "
              << stripcv::test::diagnostic(edge_pair_result) << '\n';
    return EXIT_FAILURE;
  }
  std::vector<stripcv::test::Capture> edge_pair_variants;
  edge_pair_variants.push_back(edge_pair);
  edge_pair_variants.back().rgb = stripcv::test::exposureAndCast(
      edge_pair.rgb, 0.72, cv::Vec3d(1.08, 0.96, 0.91));
  for (const stripcv::test::Capture& variant : edge_pair_variants) {
    options.corner_override = variant.corners;
    const stripcv::AnalysisResult variant_result =
        analyzer.analyze(variant.rgb, assay, options);
    if (!stripcv::test::reportableTwoLine(variant_result) ||
        !stripcv::test::hasReason(variant_result,
                                  "edge_control_peak_pair_recovered")) {
      std::cerr << "edge C/T recovery was not metamorphically stable: "
                << stripcv::test::diagnostic(variant_result) << '\n';
      return EXIT_FAILURE;
    }
  }

  // A slightly skewed, narrow deposited band can occupy only one rectified
  // pixel in its transverse slices even though its aggregate FWHM, vertical
  // coverage, optical density, and strength support a real line. Preserve that
  // raster-quantized case while requiring support in all separated slices.
  stripcv::AssayProfile quantized_edge_assay = assay;
  quantized_edge_assay.expected_line_width = 0.045;
  stripcv::test::StripOptions quantized_edge_options;
  quantized_edge_options.test_line = false;
  quantized_edge_options.control_position = 0.12;
  cv::Mat quantized_edge_strip =
      stripcv::test::makeCanonicalStrip(quantized_edge_options);
  stripcv::test::blendLine(quantized_edge_strip, quantized_edge_assay, 0.023,
                           0.25, 0.05,
                           0.30, cv::Vec3d(196.0, 52.0, 92.0), 0.16);
  stripcv::test::blendLine(quantized_edge_strip, quantized_edge_assay, 0.029,
                           0.70, 0.30,
                           0.34, cv::Vec3d(196.0, 52.0, 92.0), 0.50);
  stripcv::test::blendLine(quantized_edge_strip, quantized_edge_assay, 0.035,
                           0.25, 0.05,
                           0.30, cv::Vec3d(196.0, 52.0, 92.0), 0.84);
  const stripcv::test::Capture quantized_edge =
      stripcv::test::placeInScene(quantized_edge_strip);
  options.corner_override = quantized_edge.corners;
  const stripcv::AnalysisResult quantized_edge_result =
      analyzer.analyze(quantized_edge.rgb, quantized_edge_assay, options);
  if (!stripcv::test::reportableTwoLine(quantized_edge_result) ||
      !stripcv::test::hasReason(quantized_edge_result,
                                "edge_control_peak_pair_recovered")) {
    std::cerr << "raster-quantized edge C/T pair was not recovered: "
              << stripcv::test::diagnostic(quantized_edge_result) << '\n';
    return EXIT_FAILURE;
  }
  stripcv::test::Capture compressed_edge_pair = edge_pair;
  compressed_edge_pair.rgb =
      stripcv::test::jpegRoundTrip(edge_pair.rgb, 65);
  options.corner_override = compressed_edge_pair.corners;
  const stripcv::AnalysisResult compressed_edge_pair_result =
      analyzer.analyze(compressed_edge_pair.rgb, assay, options);
  if (stripcv::test::reportableOneLine(compressed_edge_pair_result) ||
      (compressed_edge_pair_result.status != "review" &&
       !stripcv::test::reportableTwoLine(compressed_edge_pair_result))) {
    std::cerr << "JPEG edge C/T pair became an unsafe one-line result: "
              << stripcv::test::diagnostic(compressed_edge_pair_result)
              << '\n';
    return EXIT_FAILURE;
  }
  if (compressed_edge_pair_result.status == "review" &&
      !stripcv::test::hasReason(compressed_edge_pair_result,
                                "possible_edge_control_line")) {
    std::cerr << "JPEG edge abstention lacked the edge-companion reason: "
              << stripcv::test::diagnostic(compressed_edge_pair_result)
              << '\n';
    return EXIT_FAILURE;
  }

  // A small longitudinal segmentation inset can place a real upstream band
  // just inside the membrane boundary while moving the downstream band into
  // the configured control window.  The boundary band is too truncated to be
  // promoted safely, but it must prevent the downstream line from becoming a
  // reportable one-line result.  This freezes the geometry-induced assignment
  // failure found by the source-quad width/end-point stress replay.
  stripcv::test::StripOptions clipped_edge_pair_options;
  clipped_edge_pair_options.control_position = 0.012;
  clipped_edge_pair_options.test_position = 0.112;
  const stripcv::test::Capture clipped_edge_pair =
      stripcv::test::makeCapture(clipped_edge_pair_options);
  options.corner_override = clipped_edge_pair.corners;
  const stripcv::AnalysisResult clipped_edge_pair_result =
      analyzer.analyze(clipped_edge_pair.rgb, assay, options);
  if (stripcv::test::reportableOneLine(clipped_edge_pair_result) ||
      (clipped_edge_pair_result.status == "review" &&
       !stripcv::test::hasReason(clipped_edge_pair_result,
                                 "possible_edge_control_line"))) {
    std::cerr << "boundary-truncated C/T pair became an unsafe one-line "
                 "result: "
              << stripcv::test::diagnostic(clipped_edge_pair_result) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions edge_transition_options;
  edge_transition_options.test_line = false;
  edge_transition_options.control_position = 0.12;
  cv::Mat edge_transition_strip =
      stripcv::test::makeCanonicalStrip(edge_transition_options);
  stripcv::test::blendLine(edge_transition_strip, assay, 0.025, 0.30, 4.0);
  const stripcv::test::Capture edge_transition =
      stripcv::test::placeInScene(edge_transition_strip);
  options.corner_override = edge_transition.corners;
  const stripcv::AnalysisResult edge_transition_result =
      analyzer.analyze(edge_transition.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(edge_transition_result)) {
    std::cerr << "broad membrane-edge transition became a false C/T pair: "
              << stripcv::test::diagnostic(edge_transition_result) << '\n';
    return EXIT_FAILURE;
  }

  // A narrow, full-height achromatic membrane seam can satisfy the edge-pair
  // shape and row-coverage proof next to one genuine strong control line. Its
  // optical-density direction is not hCG dye and must not be promoted to C.
  stripcv::test::StripOptions neutral_edge_options;
  neutral_edge_options.test_line = false;
  neutral_edge_options.control_position = 0.12;
  neutral_edge_options.control_strength = 0.62;
  cv::Mat neutral_edge_strip =
      stripcv::test::makeCanonicalStrip(neutral_edge_options);
  stripcv::test::blendLine(neutral_edge_strip, assay, 0.026, 0.55, 0.72,
                           1.0, cv::Vec3d(135.0, 118.0, 118.0));
  const stripcv::test::Capture neutral_edge =
      stripcv::test::placeInScene(neutral_edge_strip);
  options.corner_override = neutral_edge.corners;
  const stripcv::AnalysisResult neutral_edge_result =
      analyzer.analyze(neutral_edge.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(neutral_edge_result)) {
    std::cerr << "achromatic edge seam bypassed recovered-pair dye proof: "
              << stripcv::test::diagnostic(neutral_edge_result) << '\n';
    return EXIT_FAILURE;
  }

  // The same failure can occur away from the membrane boundary when crop
  // registration places a neutral construction seam upstream of the only
  // deposited band. Freeze that distinct inner-region recovery path too.
  stripcv::test::StripOptions neutral_inner_options;
  neutral_inner_options.test_line = false;
  neutral_inner_options.control_position = 0.206;
  neutral_inner_options.control_strength = 0.62;
  cv::Mat neutral_inner_strip =
      stripcv::test::makeCanonicalStrip(neutral_inner_options);
  stripcv::test::blendLine(neutral_inner_strip, assay, 0.116, 0.55, 0.72,
                           1.0, cv::Vec3d(135.0, 118.0, 118.0));
  const stripcv::test::Capture neutral_inner =
      stripcv::test::placeInScene(neutral_inner_strip);
  options.corner_override = neutral_inner.corners;
  const stripcv::AnalysisResult neutral_inner_result =
      analyzer.analyze(neutral_inner.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(neutral_inner_result) ||
      (!stripcv::test::hasReason(neutral_inner_result,
                                 "recovered_peak_not_assay_dye") &&
       !stripcv::test::hasReason(neutral_inner_result,
                                 "recovered_peak_material_imbalance"))) {
    std::cerr << "achromatic inner seam bypassed recovered-pair dye proof: "
              << stripcv::test::diagnostic(neutral_inner_result) << '\n';
    return EXIT_FAILURE;
  }

  cv::Mat narrow_edge_seam_strip =
      stripcv::test::makeCanonicalStrip(edge_transition_options);
  stripcv::test::blendLine(narrow_edge_seam_strip, assay, 0.025, 0.62, 0.22,
                           1.0, cv::Vec3d(155.0, 150.0, 145.0));
  const stripcv::test::Capture narrow_edge_seam =
      stripcv::test::placeInScene(narrow_edge_seam_strip);
  options.corner_override = narrow_edge_seam.corners;
  const stripcv::AnalysisResult narrow_edge_seam_result =
      analyzer.analyze(narrow_edge_seam.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(narrow_edge_seam_result)) {
    std::cerr << "one-column non-dye edge seam became a false C/T pair: "
              << stripcv::test::diagnostic(narrow_edge_seam_result) << '\n';
    return EXIT_FAILURE;
  }

  // A paper rail can create a third 1-D maximum next to a valid C/T pair. It
  // is not an extra assay line unless its 2-D extent and optical-density
  // direction match deposited C/T dye.
  cv::Mat non_dye_rail_strip = stripcv::test::makeCanonicalStrip();
  stripcv::test::blendLine(non_dye_rail_strip, assay, 0.32, 0.55, 1.0, 1.0,
                           cv::Vec3d(245.0, 215.0, 245.0));
  const stripcv::test::Capture non_dye_rail =
      stripcv::test::placeInScene(non_dye_rail_strip);
  options.corner_override = non_dye_rail.corners;
  const stripcv::AnalysisResult non_dye_rail_result =
      analyzer.analyze(non_dye_rail.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(non_dye_rail_result) ||
      stripcv::test::hasReason(non_dye_rail_result,
                               "ambiguous_extra_line_peak")) {
    std::cerr << "non-dye paper rail vetoed a valid C/T pair: "
              << stripcv::test::diagnostic(non_dye_rail_result) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions same_dye_extra_options;
  same_dye_extra_options.extra_line = true;
  const stripcv::test::Capture same_dye_extra =
      stripcv::test::makeCapture(same_dye_extra_options);
  options.corner_override = same_dye_extra.corners;
  const stripcv::AnalysisResult same_dye_extra_result =
      analyzer.analyze(same_dye_extra.rgb, assay, options);
  if (same_dye_extra_result.status != "review" ||
      !stripcv::test::hasReason(same_dye_extra_result,
                                "ambiguous_extra_line_peak")) {
    std::cerr << "same-dye third result line was not kept for review: "
              << stripcv::test::diagnostic(same_dye_extra_result) << '\n';
    return EXIT_FAILURE;
  }

  cv::Mat partial_edge_strip =
      stripcv::test::makeCanonicalStrip(edge_transition_options);
  stripcv::test::blendLine(partial_edge_strip, assay, 0.025, 0.48, 1.0,
                           0.32);
  const stripcv::test::Capture partial_edge =
      stripcv::test::placeInScene(partial_edge_strip);
  options.corner_override = partial_edge.corners;
  const stripcv::AnalysisResult partial_edge_result =
      analyzer.analyze(partial_edge.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(partial_edge_result)) {
    std::cerr << "partial membrane-edge mark became a false C/T pair: "
              << stripcv::test::diagnostic(partial_edge_result) << '\n';
    return EXIT_FAILURE;
  }

  // A bright magenta paper crease can increase the legacy R/G projection
  // while being physically opposite to the absorptive control dye in RGB
  // optical-density space. It must never be promoted to a reportable T line.
  stripcv::test::StripOptions discordant_artifact_options;
  discordant_artifact_options.test_position = 0.30;
  discordant_artifact_options.test_strength = 0.16;
  discordant_artifact_options.test_dye_rgb = cv::Vec3d(245.0, 215.0, 245.0);
  const stripcv::test::Capture discordant_artifact =
      stripcv::test::makeCapture(discordant_artifact_options);
  options.corner_override = discordant_artifact.corners;
  const stripcv::AnalysisResult discordant_result =
      analyzer.analyze(discordant_artifact.rgb, assay, options);
  if (discordant_result.status != "review" ||
      !stripcv::test::hasReason(discordant_result,
                                "control_test_dye_disagreement")) {
    std::cerr << "chromatically discordant pseudo-line was reportable: "
              << stripcv::test::diagnostic(discordant_result) << '\n';
    return EXIT_FAILURE;
  }

  // A crop can assign a dominant neighboring rail/boundary as T and a tiny
  // texture maximum as C. Even when both shapes pass the one-dimensional peak
  // fit, that recovered ordering is not safe to report without review.
  stripcv::test::StripOptions imbalanced_recovery_options;
  imbalanced_recovery_options.control_strength = 0.02;
  imbalanced_recovery_options.test_strength = 0.60;
  imbalanced_recovery_options.test_position = 0.30;
  const stripcv::test::Capture imbalanced_recovery =
      stripcv::test::makeCapture(imbalanced_recovery_options);
  options.corner_override = imbalanced_recovery.corners;
  const stripcv::AnalysisResult imbalanced_result =
      analyzer.analyze(imbalanced_recovery.rgb, assay, options);
  if (imbalanced_result.status != "review" ||
      !stripcv::test::hasReason(imbalanced_result,
                                "recovered_peak_material_imbalance")) {
    std::cerr << "extreme recovered peak imbalance was reportable: "
              << stripcv::test::diagnostic(imbalanced_result) << '\n';
    return EXIT_FAILURE;
  }

  // The manually labelled raw-photo replay exposed a subtler version of the
  // same assignment error below the old 10:1 material-ratio trigger. A
  // marginal construction response can satisfy minimum control SNR while the
  // strip's actual control, roughly 7.5 times stronger, is relabelled as T.
  // Freeze the joint evidence boundary: moderate imbalance plus a control
  // below twice minimum SNR requires the existing full dye-stealer proof.
  stripcv::test::StripOptions marginal_control_relabel_options =
      imbalanced_recovery_options;
  marginal_control_relabel_options.test_strength = 0.15;
  const stripcv::test::Capture marginal_control_relabel =
      stripcv::test::makeCapture(marginal_control_relabel_options);
  options.corner_override = marginal_control_relabel.corners;
  stripcv::AssayProfile marginal_control_relabel_assay = assay;
  marginal_control_relabel_assay.quality.min_control_snr = 500.0;
  const stripcv::AnalysisResult marginal_control_relabel_result =
      analyzer.analyze(marginal_control_relabel.rgb,
                       marginal_control_relabel_assay, options);
  if (marginal_control_relabel_result.status != "review" ||
      !stripcv::test::hasReason(marginal_control_relabel_result,
                                "recovered_peak_material_imbalance")) {
    std::cerr << "marginal C and dominant lone line became a false C/T pair: "
              << stripcv::test::diagnostic(marginal_control_relabel_result)
              << '\n';
    return EXIT_FAILURE;
  }

  // A crop/registration shift can place a weak membrane construction seam
  // just before the configured control window while the strip's only real
  // deposited line remains downstream. The wide inner-region recovery must
  // not call the seam C and relabel the lone line as T merely because the two
  // one-dimensional peaks have plausible spacing. This freezes the failure
  // class found in the completed manually segmented development set.
  stripcv::test::StripOptions edge_seam_relabel_options;
  edge_seam_relabel_options.control_line = false;
  edge_seam_relabel_options.test_line = false;
  cv::Mat edge_seam_relabel_strip =
      stripcv::test::makeCanonicalStrip(edge_seam_relabel_options);
  stripcv::test::blendLine(edge_seam_relabel_strip, assay, 0.057, 0.55, 1.0,
                           1.0, cv::Vec3d(135.0, 118.0, 118.0));
  stripcv::test::blendLine(edge_seam_relabel_strip, assay, 0.140, 0.62);
  const stripcv::test::Capture edge_seam_relabel =
      stripcv::test::placeInScene(edge_seam_relabel_strip);
  options.corner_override = edge_seam_relabel.corners;
  const stripcv::AnalysisResult edge_seam_relabel_result =
      analyzer.analyze(edge_seam_relabel.rgb, assay, options);
  if (edge_seam_relabel_result.status != "review" ||
      !stripcv::test::hasReason(edge_seam_relabel_result,
                                "recovered_peak_material_imbalance")) {
    std::cerr << "edge seam and lone line became a false C/T pair: "
              << stripcv::test::diagnostic(edge_seam_relabel_result) << '\n';
    return EXIT_FAILURE;
  }

  // Extreme T/C intensity is also a real strong-positive morphology (dye
  // stealing), so ratio alone is not an invalidity proof. A compact,
  // full-height, same-dye C/T twin must remain reportable even though the
  // broad matched boundary case above remains review.
  stripcv::test::StripOptions dye_stealer_options =
      imbalanced_recovery_options;
  dye_stealer_options.test_position = 0.225;
  dye_stealer_options.control_width_factor = 0.50;
  dye_stealer_options.test_width_factor = 0.50;
  const stripcv::test::Capture dye_stealer =
      stripcv::test::makeCapture(dye_stealer_options);
  options.corner_override = dye_stealer.corners;
  const stripcv::AnalysisResult dye_stealer_result =
      analyzer.analyze(dye_stealer.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(dye_stealer_result) ||
      !stripcv::test::hasReason(dye_stealer_result,
                                "dye_stealer_pair_verified")) {
    std::cerr << "compact dye-stealer pair was not reportable: "
              << stripcv::test::diagnostic(dye_stealer_result) << '\n';
    return EXIT_FAILURE;
  }

  dye_stealer_options.test_vertical_fraction = 0.42;
  const stripcv::test::Capture partial_dye_stealer =
      stripcv::test::makeCapture(dye_stealer_options);
  options.corner_override = partial_dye_stealer.corners;
  const stripcv::AnalysisResult partial_dye_stealer_result =
      analyzer.analyze(partial_dye_stealer.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(partial_dye_stealer_result)) {
    std::cerr << "partial-height dye-stealer twin became reportable: "
              << stripcv::test::diagnostic(partial_dye_stealer_result)
              << '\n';
    return EXIT_FAILURE;
  }

  // A weak C can be absorbed into a broad illumination field while a strong
  // T remains obvious. The raw 2-D even/odd quadrature detector must recover
  // the full-height deposited companion, but not a same-colour material step
  // or an incomplete-height mark at the identical x coordinate.
  const auto make_phase_locked_capture = [&](int companion_kind) {
    stripcv::test::StripOptions phase_options;
    phase_options.control_line = false;
    phase_options.test_position = 0.235;
    phase_options.test_strength = 0.62;
    phase_options.test_width_factor = 0.62;
    cv::Mat strip = stripcv::test::makeCanonicalStrip(phase_options);
    constexpr double companion_position = 0.145;
    if (companion_kind == 1) {
      stripcv::test::blendLine(strip, assay, companion_position, 0.110, 0.62,
                               1.0);
    } else if (companion_kind == 2) {
      stripcv::test::blendLine(strip, assay, companion_position, 0.080, 0.62,
                               0.45);
    } else {
      const cv::Rect membrane = stripcv::test::membraneRect(assay);
      const int boundary = membrane.x +
          cvRound(companion_position * membrane.width);
      for (int row = membrane.y;
           row < membrane.y + membrane.height; ++row) {
        for (int column = boundary;
             column < membrane.x + membrane.width; ++column) {
          cv::Vec3b& pixel = strip.at<cv::Vec3b>(row, column);
          pixel[0] = cv::saturate_cast<unsigned char>(pixel[0] * 0.985);
          pixel[1] = cv::saturate_cast<unsigned char>(pixel[1] * 0.955);
          pixel[2] = cv::saturate_cast<unsigned char>(pixel[2] * 0.965);
        }
      }
    }
    const cv::Rect membrane = stripcv::test::membraneRect(assay);
    for (int column = membrane.x;
         column < membrane.x + membrane.width; ++column) {
      const double x = (column - membrane.x + 0.5) / membrane.width;
      const double pedestal = 0.055 * std::exp(
          -0.5 * std::pow((x - 0.16) / 0.095, 2.0));
      for (int row = membrane.y;
           row < membrane.y + membrane.height; ++row) {
        cv::Vec3b& pixel = strip.at<cv::Vec3b>(row, column);
        pixel[1] = cv::saturate_cast<unsigned char>(
            pixel[1] * (1.0 - pedestal));
        pixel[2] = cv::saturate_cast<unsigned char>(
            pixel[2] * (1.0 - 0.65 * pedestal));
      }
    }
    stripcv::test::Capture capture;
    capture.rgb = stripcv::test::jpegRoundTrip(strip, 72);
    capture.corners = {cv::Point2f(1.023F, 0.159F),
                       cv::Point2f(1021.977F, 0.159F),
                       cv::Point2f(1021.977F, 158.841F),
                       cv::Point2f(1.023F, 158.841F)};
    return capture;
  };
  stripcv::AssayProfile phase_assay = assay;
  phase_assay.quality.min_control_snr = 100.0;
  const stripcv::test::Capture phase_locked_pair =
      make_phase_locked_capture(1);
  options.corner_override = phase_locked_pair.corners;
  const stripcv::AnalysisResult phase_locked_pair_result =
      analyzer.analyze(phase_locked_pair.rgb, phase_assay, options);
  if (!stripcv::test::reportableTwoLine(phase_locked_pair_result) ||
      !stripcv::test::hasReason(
          phase_locked_pair_result,
          "phase_locked_weak_control_pair_recovered")) {
    std::cerr << "phase-locked weak control was not recovered: "
              << stripcv::test::diagnostic(phase_locked_pair_result) << '\n';
    return EXIT_FAILURE;
  }
  for (int companion_kind : {0, 2}) {
    const stripcv::test::Capture counterexample =
        make_phase_locked_capture(companion_kind);
    options.corner_override = counterexample.corners;
    const stripcv::AnalysisResult counterexample_result =
        analyzer.analyze(counterexample.rgb, phase_assay, options);
    if (stripcv::test::reportableTwoLine(counterexample_result)) {
      std::cerr << (companion_kind == 0
                        ? "same-colour material step"
                        : "partial-height weak control")
                << " became a reportable C/T pair: "
                << stripcv::test::diagnostic(counterexample_result) << '\n';
      return EXIT_FAILURE;
    }
  }

  // A real paper/coating shadow can form a slow, weakly chromatic pedestal
  // underneath a much narrower deposited T. After moderate resampling
  // softness, the ordinary transverse width follows that pedestal while a
  // wide morphological opening exposes the compact same-dye core in three
  // separated height slices. The matched no-T twin proves the pedestal alone
  // is not promoted to a second line.
  const auto make_pedestal_capture = [&](bool include_test_line) {
    stripcv::test::StripOptions pedestal_options;
    pedestal_options.control_strength = 0.45;
    pedestal_options.test_line = include_test_line;
    pedestal_options.test_strength = 0.14;
    pedestal_options.test_position = 0.198;
    pedestal_options.test_width_factor = 0.45;
    cv::Mat strip = stripcv::test::makeCanonicalStrip(pedestal_options);
    const cv::Rect membrane = stripcv::test::membraneRect(assay);
    constexpr double pedestal_center = 0.178;
    constexpr double pedestal_sigma = 0.080;
    constexpr double pedestal_amplitude = 0.040;
    for (int column = membrane.x;
         column < membrane.x + membrane.width; ++column) {
      const double position =
          (column - membrane.x + 0.5) / membrane.width;
      const double distance =
          (position - pedestal_center) / pedestal_sigma;
      const double downstream_cutoff =
          1.0 / (1.0 + std::exp((position - 0.213) / 0.005));
      const double pedestal = pedestal_amplitude *
          std::exp(-0.5 * distance * distance) * downstream_cutoff;
      for (int row = membrane.y; row < membrane.y + membrane.height; ++row) {
        cv::Vec3b& pixel = strip.at<cv::Vec3b>(row, column);
        pixel[1] = cv::saturate_cast<unsigned char>(
            pixel[1] * (1.0 - pedestal));
        pixel[2] = cv::saturate_cast<unsigned char>(
            pixel[2] * (1.0 - 0.55 * pedestal));
      }
    }
    stripcv::test::Capture capture;
    cv::resize(strip, capture.rgb, cv::Size(1024, 128), 0.0, 0.0,
               cv::INTER_AREA);
    capture.corners = {cv::Point2f(1.0F, 1.0F),
                       cv::Point2f(1022.0F, 1.0F),
                       cv::Point2f(1022.0F, 126.0F),
                       cv::Point2f(1.0F, 126.0F)};
    for (int row = 0; row < capture.rgb.rows; ++row) {
      for (int column = 0; column < capture.rgb.cols; ++column) {
        cv::Vec3b& pixel = capture.rgb.at<cv::Vec3b>(row, column);
        const int hash =
            ((column * 17 + row * 29 + (column * row) % 23) % 17) - 8;
        pixel[0] = cv::saturate_cast<unsigned char>(pixel[0] + hash / 2);
        pixel[1] = cv::saturate_cast<unsigned char>(pixel[1] - hash * 2 / 5);
        pixel[2] = cv::saturate_cast<unsigned char>(pixel[2] + hash / 3);
      }
    }
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 70);
    return capture;
  };
  const stripcv::test::Capture pedestal_pair =
      make_pedestal_capture(true);
  options.corner_override = pedestal_pair.corners;
  const stripcv::AnalysisResult pedestal_pair_result =
      analyzer.analyze(pedestal_pair.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(pedestal_pair_result) ||
      !stripcv::test::hasReason(
          pedestal_pair_result, "pedestal_removed_compact_test_verified")) {
    std::cerr << "compact T on a broad density pedestal was not verified: "
              << stripcv::test::diagnostic(pedestal_pair_result) << '\n';
    return EXIT_FAILURE;
  }
  const stripcv::test::Capture pedestal_only =
      make_pedestal_capture(false);
  options.corner_override = pedestal_only.corners;
  const stripcv::AnalysisResult pedestal_only_result =
      analyzer.analyze(pedestal_only.rgb, assay, options);
  if (stripcv::test::reportableTwoLine(pedestal_only_result) ||
      pedestal_only_result.status == "valid") {
    std::cerr << "pedestal-only adversarial twin became reportable: "
              << stripcv::test::diagnostic(pedestal_only_result) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions bright_paper_options;
  bright_paper_options.bright_paper = true;
  const stripcv::test::Capture bright_paper =
      stripcv::test::makeCapture(bright_paper_options);
  options.corner_override = bright_paper.corners;
  const stripcv::AnalysisResult bright_result =
      analyzer.analyze(bright_paper.rgb, assay, options);
  if (!stripcv::test::reportableTwoLine(bright_result) ||
      bright_result.quality.glare_fraction > assay.quality.max_glare_fraction) {
    std::cerr << "diffuse bright paper was mistaken for glare: "
              << stripcv::test::diagnostic(bright_result) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions missing_control_options;
  missing_control_options.control_line = false;
  const stripcv::test::Capture missing_control =
      stripcv::test::makeCapture(missing_control_options);
  options.corner_override = missing_control.corners;
  const stripcv::AnalysisResult invalid =
      analyzer.analyze(missing_control.rgb, assay, options);
  if (invalid.status != "invalid" ||
      !stripcv::test::hasReason(invalid, "control_not_detected")) {
    std::cerr << "missing control was not invalidated\n";
    return EXIT_FAILURE;
  }

  for (const stripcv::AnalysisResult* result :
       {&two_line, &one_line, &shifted_two_line, &shifted_negative,
        &invariant_pair_result, &invariant_single_result,
        &invariant_artifact_result, &invariant_broad_pair_result,
        &invariant_dye_run_result, &invariant_three_line_result,
        &edge_pair_result, &edge_transition_result, &partial_edge_result,
        &discordant_result, &imbalanced_result, &pedestal_pair_result,
        &pedestal_only_result, &bright_result, &invalid}) {
    if (result->classification || result->cutoff ||
        result->cutoff_source != "none") {
      std::cerr << "synthetic analysis unexpectedly introduced a "
                   "cutoff/classification\n";
      return EXIT_FAILURE;
    }
  }
  std::cout << "StripCV signal-only synthetic tests passed.\n";
  return EXIT_SUCCESS;
}
