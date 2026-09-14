#include <cstdlib>
#include <iostream>
#include <opencv2/imgproc.hpp>
#include <string>
#include <vector>

#include "stripcv/analyzer.hpp"
#include "synthetic_fixture.hpp"

namespace {

bool requireAbstention(const std::string& name,
                       const stripcv::AnalysisResult& result) {
  if (result.status == "valid") {
    std::cerr << name << " corruption remained reportable: "
              << stripcv::test::diagnostic(result) << '\n';
    return false;
  }
  return true;
}

stripcv::AnalysisResult analyzeWithKnownCorners(
    const stripcv::test::Capture& capture, const stripcv::AssayProfile& assay) {
  stripcv::AnalysisOptions options;
  options.corner_override = capture.corners;
  return stripcv::Analyzer().analyze(capture.rgb, assay, options);
}

stripcv::test::Capture resizeCapture(const stripcv::test::Capture& source,
                                     double scale) {
  stripcv::test::Capture result;
  cv::resize(source.rgb, result.rgb, cv::Size(), scale, scale,
             scale < 1.0 ? cv::INTER_AREA : cv::INTER_LINEAR);
  result.corners = source.corners;
  for (cv::Point2f& point : result.corners) {
    point *= static_cast<float>(scale);
  }
  return result;
}

}  // namespace

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();

  stripcv::test::StripOptions missing_control_options;
  missing_control_options.control_line = false;
  if (!requireAbstention(
          "missing control",
          analyzeWithKnownCorners(
              stripcv::test::makeCapture(missing_control_options), assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions lone_test_line_options;
  lone_test_line_options.control_line = false;
  lone_test_line_options.test_position = 0.20;
  const stripcv::AnalysisResult lone_test_line = analyzeWithKnownCorners(
      stripcv::test::makeCapture(lone_test_line_options), assay);
  if (!requireAbstention("lone test-region line", lone_test_line) ||
      !stripcv::test::hasReason(lone_test_line,
                                "control_assignment_ambiguous")) {
    std::cerr << "lone test-region line did not retain its safety reason: "
              << stripcv::test::diagnostic(lone_test_line) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions glare_options;
  glare_options.control_glare = true;
  if (!requireAbstention(
          "control glare",
          analyzeWithKnownCorners(stripcv::test::makeCapture(glare_options),
                                  assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions result_window_options;
  result_window_options.line_vertical_fraction = 0.30;
  if (!requireAbstention(
          "plastic-style result window",
          analyzeWithKnownCorners(
              stripcv::test::makeCapture(result_window_options), assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions clipping_options;
  clipping_options.clipped_region = true;
  if (!requireAbstention(
          "exposure clipping",
          analyzeWithKnownCorners(stripcv::test::makeCapture(clipping_options),
                                  assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions broad_options;
  broad_options.broad_test_stain = true;
  if (!requireAbstention(
          "broad stain",
          analyzeWithKnownCorners(stripcv::test::makeCapture(broad_options),
                                  assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions dye_run_options;
  dye_run_options.dye_run = true;
  if (!requireAbstention(
          "dye run", analyzeWithKnownCorners(
                         stripcv::test::makeCapture(dye_run_options), assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions shadow_options;
  shadow_options.shadow_gradient = true;
  if (!requireAbstention(
          "broad shadow",
          analyzeWithKnownCorners(stripcv::test::makeCapture(shadow_options),
                                  assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions hard_shadow_options;
  hard_shadow_options.shadow_step = true;
  if (!requireAbstention(
          "hard neutral shadow",
          analyzeWithKnownCorners(
              stripcv::test::makeCapture(hard_shadow_options), assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions extra_options;
  extra_options.extra_line = true;
  if (!requireAbstention(
          "extra peak",
          analyzeWithKnownCorners(stripcv::test::makeCapture(extra_options),
                                  assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::Capture blurred = stripcv::test::makeCapture();
  cv::GaussianBlur(blurred.rgb, blurred.rgb, cv::Size(41, 41), 12.0);
  if (!requireAbstention("blur", analyzeWithKnownCorners(blurred, assay))) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions soft_one_line_options;
  soft_one_line_options.test_line = false;
  stripcv::test::Capture soft_one_line =
      stripcv::test::makeCapture(soft_one_line_options);
  cv::GaussianBlur(soft_one_line.rgb, soft_one_line.rgb, cv::Size(9, 9), 2.0);
  soft_one_line = resizeCapture(soft_one_line, 0.25);
  if (!requireAbstention("soft low-resolution one-line",
                         analyzeWithKnownCorners(soft_one_line, assay))) {
    return EXIT_FAILURE;
  }

  const stripcv::Quad incomplete_corners = {
      cv::Point2f(-190.0F, 260.0F), cv::Point2f(1040.0F, 220.0F),
      cv::Point2f(1060.0F, 430.0F), cv::Point2f(-205.0F, 460.0F)};
  const stripcv::test::Capture incomplete = stripcv::test::makeCapture(
      stripcv::test::StripOptions{}, incomplete_corners);
  const stripcv::AnalysisResult incomplete_result =
      stripcv::Analyzer().analyze(incomplete.rgb, assay);
  if (!requireAbstention("incomplete endpoints", incomplete_result)) {
    return EXIT_FAILURE;
  }

  std::cout << "StripCV quality and abstention matrix tests passed.\n";
  return EXIT_SUCCESS;
}
