#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif

#include "stripcv/analyzer.hpp"
#include "synthetic_fixture.hpp"

namespace {

struct LineLayout {
  double control;
  double test;
};

struct CompoundCondition {
  double exposure;
  cv::Vec3d gains;
  int jpeg_quality;
  double scale;
  double blur_sigma;
  double noise_sigma;
  uint64_t noise_seed;
};

stripcv::AnalysisResult analyzeKnownGeometry(
    const stripcv::test::Capture& capture,
    const stripcv::AssayProfile& assay) {
  stripcv::AnalysisOptions options;
  options.corner_override = capture.corners;
  return stripcv::Analyzer().analyze(capture.rgb, assay, options);
}

stripcv::test::Capture resizeCapture(const stripcv::test::Capture& source,
                                     double scale) {
  stripcv::test::Capture result;
  cv::resize(source.rgb, result.rgb, cv::Size(), scale, scale,
             cv::INTER_AREA);
  result.corners = source.corners;
  for (cv::Point2f& point : result.corners) {
    point *= static_cast<float>(scale);
  }
  return result;
}

cv::Mat addDeterministicSensorNoise(const cv::Mat& rgb, double sigma,
                                    uint64_t seed) {
  cv::Mat result = rgb.clone();
  cv::RNG random(seed);
  for (int row = 0; row < result.rows; ++row) {
    cv::Vec3b* pixels = result.ptr<cv::Vec3b>(row);
    for (int column = 0; column < result.cols; ++column) {
      for (int channel = 0; channel < 3; ++channel) {
        pixels[column][channel] = cv::saturate_cast<unsigned char>(
            pixels[column][channel] + random.gaussian(sigma));
      }
    }
  }
  return result;
}

stripcv::test::Capture applyCompoundCondition(
    stripcv::test::Capture capture, const CompoundCondition& condition) {
  capture.rgb = stripcv::test::exposureAndCast(
      capture.rgb, condition.exposure, condition.gains);
  if (condition.blur_sigma > 0.0) {
    const int radius = std::max(1, cvRound(2.5 * condition.blur_sigma));
    cv::GaussianBlur(capture.rgb, capture.rgb,
                     cv::Size(2 * radius + 1, 2 * radius + 1),
                     condition.blur_sigma);
  }
  capture.rgb =
      stripcv::test::jpegRoundTrip(capture.rgb, condition.jpeg_quality);
  capture.rgb = addDeterministicSensorNoise(
      capture.rgb, condition.noise_sigma, condition.noise_seed);
  return resizeCapture(capture, condition.scale);
}

stripcv::test::Capture applyCondition(stripcv::test::Capture capture,
                                      size_t condition) {
  switch (condition) {
    case 1:
      capture.rgb = stripcv::test::exposureAndCast(
          capture.rgb, 0.72, cv::Vec3d(1.0, 1.0, 1.0));
      break;
    case 2:
      capture.rgb = stripcv::test::exposureAndCast(
          capture.rgb, 0.88, cv::Vec3d(1.15, 1.0, 0.82));
      break;
    case 3:
      capture.rgb = stripcv::test::exposureAndCast(
          capture.rgb, 0.88, cv::Vec3d(0.84, 1.0, 1.14));
      break;
    case 4:
      capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 30);
      break;
    case 5:
      capture = resizeCapture(capture, 0.42);
      break;
    case 6:
      capture.rgb = addDeterministicSensorNoise(capture.rgb, 6.0,
                                                0xD1E00000U + condition);
      break;
    case 7:
      cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(7, 7), 1.4);
      break;
    default:
      break;
  }
  return capture;
}

bool aligned(double observed, double expected) {
  return std::abs(observed - expected) <= 0.06;
}

double quadIou(const stripcv::Quad& first, const stripcv::Quad& second) {
  std::vector<cv::Point2f> first_polygon(first.begin(), first.end());
  std::vector<cv::Point2f> second_polygon(second.begin(), second.end());
  std::vector<cv::Point2f> intersection;
  const double intersection_area =
      cv::intersectConvexConvex(first_polygon, second_polygon, intersection);
  const double first_area = std::abs(cv::contourArea(first_polygon));
  const double second_area = std::abs(cv::contourArea(second_polygon));
  return intersection_area /
         std::max(1.0, first_area + second_area - intersection_area);
}

}  // namespace

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const std::vector<cv::Vec3d> dyes = {
      {196.0, 52.0, 92.0}, {175.0, 65.0, 95.0},
      {150.0, 55.0, 105.0}, {125.0, 60.0, 110.0},
      {210.0, 95.0, 125.0}, {130.0, 75.0, 105.0}};
  const std::vector<LineLayout> layouts = {
      {0.105, 0.205}, {0.13, 0.235}, {0.16, 0.30}, {0.17, 0.36}};
  constexpr size_t kConditions = 8;

  size_t two_line_cases = 0;
  size_t reportable_two_line_cases = 0;
  size_t one_line_cases = 0;
  size_t reportable_one_line_cases = 0;
  size_t missing_control_cases = 0;
  for (size_t dye_index = 0; dye_index < dyes.size(); ++dye_index) {
    for (size_t layout_index = 0; layout_index < layouts.size();
         ++layout_index) {
      for (size_t condition = 0; condition < kConditions; ++condition) {
        const LineLayout layout = layouts[layout_index];
        const double width =
            std::vector<double>{0.70, 1.0, 1.65}[
                (dye_index + layout_index + condition) % 3];

        stripcv::test::StripOptions two_line;
        two_line.control_position = layout.control;
        two_line.test_position = layout.test;
        two_line.control_strength = 0.28;
        two_line.test_strength =
            std::vector<double>{0.02, 0.04, 0.08}[
                (2 * dye_index + layout_index + condition) % 3];
        two_line.control_width_factor = width;
        two_line.test_width_factor = width;
        two_line.control_dye_rgb = dyes[dye_index];
        two_line.test_dye_rgb = dyes[dye_index];
        stripcv::test::Capture two_line_capture =
            applyCondition(stripcv::test::makeCapture(two_line), condition);
        const stripcv::AnalysisResult two_line_result =
            analyzeKnownGeometry(two_line_capture, assay);
        if (two_line_result.status == "valid" &&
            (!stripcv::test::reportableTwoLine(two_line_result) ||
             !aligned(two_line_result.control_peak.position, layout.control) ||
             !aligned(two_line_result.test_peak.position, layout.test))) {
          std::cerr << "dye two-line case produced a wrong reportable result: dye="
                    << dye_index << " layout=" << layout_index
                    << " condition=" << condition << ' '
                    << stripcv::test::diagnostic(two_line_result) << '\n';
          return EXIT_FAILURE;
        }
        reportable_two_line_cases +=
            stripcv::test::reportableTwoLine(two_line_result) ? 1U : 0U;
        ++two_line_cases;

        stripcv::test::StripOptions one_line = two_line;
        one_line.test_line = false;
        stripcv::test::Capture one_line_capture =
            applyCondition(stripcv::test::makeCapture(one_line), condition);
        const stripcv::AnalysisResult one_line_result =
            analyzeKnownGeometry(one_line_capture, assay);
        if (one_line_result.status == "valid" &&
            (!stripcv::test::reportableOneLine(one_line_result) ||
             !aligned(one_line_result.control_peak.position, layout.control))) {
          std::cerr << "dye one-line case produced a wrong reportable result: dye="
                    << dye_index << " layout=" << layout_index
                    << " condition=" << condition << ' '
                    << stripcv::test::diagnostic(one_line_result) << '\n';
          return EXIT_FAILURE;
        }
        reportable_one_line_cases +=
            stripcv::test::reportableOneLine(one_line_result) ? 1U : 0U;
        ++one_line_cases;

        stripcv::test::StripOptions missing_control = two_line;
        missing_control.control_line = false;
        missing_control.test_position =
            std::vector<double>{0.20, 0.30, 0.45, 0.65}[layout_index];
        missing_control.test_strength =
            std::vector<double>{0.06, 0.16, 0.32}[
                (dye_index + condition) % 3];
        stripcv::test::Capture missing_control_capture = applyCondition(
            stripcv::test::makeCapture(missing_control), condition);
        const stripcv::AnalysisResult missing_control_result =
            analyzeKnownGeometry(missing_control_capture, assay);
        if (missing_control_result.status == "valid") {
          std::cerr << "dye missing-control case became reportable: dye="
                    << dye_index << " position="
                    << missing_control.test_position
                    << " condition=" << condition << ' '
                    << stripcv::test::diagnostic(missing_control_result) << '\n';
          return EXIT_FAILURE;
        }
        ++missing_control_cases;
      }
    }
  }

  const std::vector<stripcv::Quad> geometries = {
      stripcv::test::defaultSceneCorners(),
      {cv::Point2f(210.0F, 190.0F), cv::Point2f(1100.0F, 275.0F),
       cv::Point2f(1020.0F, 455.0F), cv::Point2f(128.0F, 474.0F)},
      {cv::Point2f(92.0F, 294.0F), cv::Point2f(1188.0F, 178.0F),
       cv::Point2f(1164.0F, 402.0F), cv::Point2f(126.0F, 486.0F)}};
  size_t automatic_two_line_cases = 0;
  size_t reportable_automatic_two_line_cases = 0;
  size_t automatic_one_line_cases = 0;
  size_t reportable_automatic_one_line_cases = 0;
  size_t automatic_missing_control_cases = 0;
  for (size_t geometry = 0; geometry < geometries.size(); ++geometry) {
    for (size_t dye_index = 0; dye_index < dyes.size(); ++dye_index) {
      const size_t condition = (3 * geometry + dye_index) % kConditions;
      const LineLayout layout = layouts[(geometry + dye_index) % layouts.size()];
      stripcv::test::StripOptions options;
      options.control_position = layout.control;
      options.test_position = layout.test;
      options.control_strength = 0.28;
      options.test_strength = 0.02;
      options.control_width_factor =
          std::vector<double>{0.70, 1.0, 1.65}[(geometry + dye_index) % 3];
      options.test_width_factor = options.control_width_factor;
      options.control_dye_rgb = dyes[dye_index];
      options.test_dye_rgb = dyes[dye_index];
      stripcv::test::Capture two_line_capture = applyCondition(
          stripcv::test::makeCapture(options, geometries[geometry]), condition);
      const stripcv::AnalysisResult two_line_result =
          stripcv::Analyzer().analyze(two_line_capture.rgb, assay);
      if (two_line_result.status == "valid" &&
          (!stripcv::test::reportableTwoLine(two_line_result) ||
           !aligned(two_line_result.control_peak.position, layout.control) ||
           !aligned(two_line_result.test_peak.position, layout.test) ||
           quadIou(two_line_result.geometry.corners,
                   two_line_capture.corners) < 0.75)) {
        std::cerr << "automatic dye two-line case produced a wrong reportable "
                     "result: geometry="
                  << geometry << " dye=" << dye_index
                  << " condition=" << condition << ' '
                  << stripcv::test::diagnostic(two_line_result) << '\n';
        return EXIT_FAILURE;
      }
      reportable_automatic_two_line_cases +=
          stripcv::test::reportableTwoLine(two_line_result) ? 1U : 0U;
      ++automatic_two_line_cases;

      options.test_line = false;
      stripcv::test::Capture one_line_capture = applyCondition(
          stripcv::test::makeCapture(options, geometries[geometry]), condition);
      const stripcv::AnalysisResult one_line_result =
          stripcv::Analyzer().analyze(one_line_capture.rgb, assay);
      if (one_line_result.status == "valid" &&
          (!stripcv::test::reportableOneLine(one_line_result) ||
           !aligned(one_line_result.control_peak.position, layout.control) ||
           quadIou(one_line_result.geometry.corners,
                   one_line_capture.corners) < 0.75)) {
        std::cerr << "automatic dye one-line case produced a wrong reportable "
                     "result: geometry="
                  << geometry << " dye=" << dye_index
                  << " condition=" << condition << ' '
                  << stripcv::test::diagnostic(one_line_result) << '\n';
        return EXIT_FAILURE;
      }
      reportable_automatic_one_line_cases +=
          stripcv::test::reportableOneLine(one_line_result) ? 1U : 0U;
      ++automatic_one_line_cases;

      options.test_line = true;
      options.control_line = false;
      options.test_position =
          std::vector<double>{0.20, 0.30, 0.45, 0.65}[
              (geometry + dye_index) % 4];
      options.test_strength = 0.16;
      stripcv::test::Capture missing_control_capture = applyCondition(
          stripcv::test::makeCapture(options, geometries[geometry]), condition);
      const stripcv::AnalysisResult missing_control_result =
          stripcv::Analyzer().analyze(missing_control_capture.rgb, assay);
      if (missing_control_result.status == "valid") {
        std::cerr << "automatic dye missing-control case became reportable: "
                  << "geometry=" << geometry << " dye=" << dye_index
                  << " condition=" << condition << ' '
                  << stripcv::test::diagnostic(missing_control_result) << '\n';
        return EXIT_FAILURE;
      }
      ++automatic_missing_control_cases;
    }
  }

  // Compression can make two close, ordinary-width C/T bands elevate most
  // samples outside the fixed integration cores. The aggregate profile then
  // resembles a broad dye run even though row-segment measurements show a
  // bounded T throughout the membrane. Lock independently colored compact and
  // moderately wide cases that exercise the transverse-width recovery, and
  // pair each with broad stain and dye-run variants that must remain
  // non-reportable.
  std::vector<std::pair<stripcv::test::StripOptions, CompoundCondition>>
      transverse_width_regressions;
  {
    stripcv::test::StripOptions options;
    options.control_position = 0.1034;
    options.test_position = 0.2312;
    options.control_strength = 0.3016;
    options.test_strength = 0.2453;
    options.control_width_factor = 0.9223;
    options.test_width_factor = 1.4403;
    options.control_vertical_gradient = -0.2840;
    options.test_vertical_gradient = 0.0897;
    options.control_vertical_modulation = 0.2395;
    options.test_vertical_modulation = 0.0976;
    options.control_vertical_phase = 0.5723;
    options.test_vertical_phase = 0.1894;
    options.control_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);
    options.test_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
    transverse_width_regressions.push_back(
        {options,
         {0.6992, cv::Vec3d(0.9568, 1.0432, 1.0371), 53, 0.4188,
          0.5018, 2.0745, 11660320118487858036ULL}});
  }
  {
    stripcv::test::StripOptions options;
    options.control_position = 0.1041;
    options.test_position = 0.2069;
    options.control_strength = 0.3602;
    options.test_strength = 0.4226;
    options.control_width_factor = 0.7460;
    options.test_width_factor = 1.3970;
    options.control_vertical_gradient = 0.0881;
    options.test_vertical_gradient = 0.2865;
    options.control_vertical_modulation = 0.1355;
    options.test_vertical_modulation = 0.0070;
    options.control_vertical_phase = 0.5145;
    options.test_vertical_phase = 0.2385;
    options.control_dye_rgb = cv::Vec3d(175.0, 65.0, 95.0);
    options.test_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);
    transverse_width_regressions.push_back(
        {options,
         {0.8215, cv::Vec3d(1.0478, 0.9908, 0.9835), 56, 0.7973,
          0.9377, 2.7103, 18024601071159797894ULL}});
  }
  {
    // A physically wide, faint T is broadened further by downsampling. Its
    // three transverse slices remain bounded and its off-core shoulders stay
    // clean, unlike the matched stain and dye-run variants below.
    stripcv::test::StripOptions options;
    options.control_position = 0.1157;
    options.test_position = 0.2804;
    options.control_strength = 0.4058;
    options.test_strength = 0.0411;
    options.control_width_factor = 0.8011;
    options.test_width_factor = 1.7338;
    options.bright_paper = true;
    options.control_vertical_gradient = 0.4992;
    options.test_vertical_gradient = -0.2281;
    options.control_vertical_modulation = 0.2795;
    options.test_vertical_modulation = 0.0990;
    options.control_vertical_phase = 0.1014;
    options.test_vertical_phase = 0.0322;
    options.control_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);
    options.test_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
    transverse_width_regressions.push_back(
        {options,
         {0.7374, cv::Vec3d(0.8912, 1.0381, 1.1055), 68, 0.8135,
          0.2917, 0.7153, 7279099825901088565ULL}});
  }
  size_t transverse_width_valid_cases = 0;
  size_t transverse_width_artifact_cases = 0;
  for (const auto& [options, condition] : transverse_width_regressions) {
    const stripcv::AnalysisResult valid_result = analyzeKnownGeometry(
        applyCompoundCondition(stripcv::test::makeCapture(options), condition),
        assay);
    if (!stripcv::test::reportableTwoLine(valid_result)) {
      std::cerr << "bounded transverse-width C/T pair was not reportable: "
                << stripcv::test::diagnostic(valid_result) << '\n';
      return EXIT_FAILURE;
    }
    ++transverse_width_valid_cases;

    for (bool broad_stain : {true, false}) {
      stripcv::test::StripOptions artifact = options;
      artifact.broad_test_stain = broad_stain;
      artifact.dye_run = !broad_stain;
      const stripcv::AnalysisResult artifact_result = analyzeKnownGeometry(
          applyCompoundCondition(stripcv::test::makeCapture(artifact),
                                 condition),
          assay);
      if (artifact_result.status == "valid") {
        std::cerr << "transverse-width recovery accepted a "
                  << (broad_stain ? "broad stain" : "dye run") << ": "
                  << stripcv::test::diagnostic(artifact_result) << '\n';
        return EXIT_FAILURE;
      }
      ++transverse_width_artifact_cases;
    }
  }

  // Strong-positive dye stealing is a shape-and-spectrum problem, not an
  // intensity-ratio problem. Exercise several dye hues, physical widths, and
  // capture degradations. Full-height pairs may report or safely abstain, but
  // every report must remain correctly aligned; matched partial-height and
  // broad-stain twins must always abstain.
  size_t dye_stealer_reportable_cases = 0;
  size_t dye_stealer_full_cases = 0;
  size_t dye_stealer_artifact_cases = 0;
  for (size_t dye_index : {size_t{0}, size_t{2}, size_t{5}}) {
    for (double width : {0.45, 0.60, 0.75}) {
      for (size_t condition : {size_t{0}, size_t{2}, size_t{4}, size_t{5}}) {
        stripcv::test::StripOptions options;
        options.control_position = 0.12;
        options.test_position = 0.225;
        options.control_strength = 0.02;
        options.test_strength = 0.60;
        options.control_width_factor = width;
        options.test_width_factor = width;
        options.control_dye_rgb = dyes[dye_index];
        options.test_dye_rgb = dyes[dye_index];
        const stripcv::AnalysisResult full_result = analyzeKnownGeometry(
            applyCondition(stripcv::test::makeCapture(options), condition),
            assay);
        if (full_result.status == "valid" &&
            (!stripcv::test::reportableTwoLine(full_result) ||
             !aligned(full_result.control_peak.position,
                      options.control_position) ||
             !aligned(full_result.test_peak.position,
                      options.test_position))) {
          std::cerr << "dye-stealer case produced a wrong reportable result: "
                    << "dye=" << dye_index << " width=" << width
                    << " condition=" << condition << ' '
                    << stripcv::test::diagnostic(full_result) << '\n';
          return EXIT_FAILURE;
        }
        dye_stealer_reportable_cases +=
            stripcv::test::reportableTwoLine(full_result) ? 1U : 0U;
        ++dye_stealer_full_cases;

        stripcv::test::StripOptions partial = options;
        partial.test_vertical_fraction = 0.42;
        const stripcv::AnalysisResult partial_result = analyzeKnownGeometry(
            applyCondition(stripcv::test::makeCapture(partial), condition),
            assay);
        if (stripcv::test::reportableTwoLine(partial_result)) {
          std::cerr << "partial-height dye-stealer twin became reportable: "
                    << "dye=" << dye_index << " width=" << width
                    << " condition=" << condition << ' '
                    << stripcv::test::diagnostic(partial_result) << '\n';
          return EXIT_FAILURE;
        }
        ++dye_stealer_artifact_cases;

        stripcv::test::StripOptions stain = options;
        stain.broad_test_stain = true;
        const stripcv::AnalysisResult stain_result = analyzeKnownGeometry(
            applyCondition(stripcv::test::makeCapture(stain), condition),
            assay);
        if (stripcv::test::reportableTwoLine(stain_result)) {
          std::cerr << "broad-stain dye-stealer twin became reportable: "
                    << "dye=" << dye_index << " width=" << width
                    << " condition=" << condition << ' '
                    << stripcv::test::diagnostic(stain_result) << '\n';
          return EXIT_FAILURE;
        }
        ++dye_stealer_artifact_cases;
      }
    }
  }
  if (dye_stealer_reportable_cases < dye_stealer_full_cases / 2) {
    std::cerr << "dye-stealer morphology coverage below stress boundary: "
              << dye_stealer_reportable_cases << '/'
              << dye_stealer_full_cases << '\n';
    return EXIT_FAILURE;
  }

  const double signal_two_line_coverage =
      reportable_two_line_cases / static_cast<double>(two_line_cases);
  const double signal_one_line_coverage =
      reportable_one_line_cases / static_cast<double>(one_line_cases);
  const double automatic_two_line_coverage =
      reportable_automatic_two_line_cases /
      static_cast<double>(automatic_two_line_cases);
  const double automatic_one_line_coverage =
      reportable_automatic_one_line_cases /
      static_cast<double>(automatic_one_line_cases);
  // This is a deliberately correlated boundary stress matrix, not the
  // compliant-capture qualification inventory. Preserve high signal-only
  // coverage while allowing the automatic layer to abstain when broad C-tail
  // evidence cannot safely distinguish a buried T from compression structure.
  if (signal_two_line_coverage < 0.90 || signal_one_line_coverage < 0.95 ||
      automatic_two_line_coverage < 0.75 ||
      automatic_one_line_coverage < 0.75) {
    std::cerr << "dye robustness coverage below policy: signal two-line="
              << signal_two_line_coverage
              << " signal one-line=" << signal_one_line_coverage
              << " automatic two-line=" << automatic_two_line_coverage
              << " automatic one-line=" << automatic_one_line_coverage
              << '\n';
    return EXIT_FAILURE;
  }

  std::cout << "StripCV dye robustness search passed "
            << reportable_two_line_cases << '/' << two_line_cases
            << " reportable two-line, " << reportable_one_line_cases << '/'
            << one_line_cases << " reportable one-line, and "
            << missing_control_cases << " safely abstained missing-control "
               "signal cases; automatic coverage was "
            << reportable_automatic_two_line_cases << '/'
            << automatic_two_line_cases << " two-line and "
            << reportable_automatic_one_line_cases << '/'
            << automatic_one_line_cases << " one-line, with "
            << automatic_missing_control_cases
            << " safely abstained missing-control cases; transverse-width "
            << "regressions reported " << transverse_width_valid_cases
            << " bounded pairs and safely abstained "
            << transverse_width_artifact_cases
            << " matched stain/dye-run cases; dye-stealer stress reported "
            << dye_stealer_reportable_cases << '/' << dye_stealer_full_cases
            << " full-height pairs and safely abstained "
            << dye_stealer_artifact_cases << " matched artifact twins.\n";
  return EXIT_SUCCESS;
}
