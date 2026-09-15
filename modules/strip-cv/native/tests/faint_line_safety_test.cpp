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

stripcv::AnalysisResult analyzeKnownGeometry(
    const stripcv::test::Capture& capture,
    const stripcv::AssayProfile& assay) {
  stripcv::AnalysisOptions options;
  options.corner_override = capture.corners;
  return stripcv::Analyzer().analyze(capture.rgb, assay, options);
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

bool sameDecision(const stripcv::AnalysisResult& first,
                  const stripcv::AnalysisResult& second) {
  return first.status == second.status &&
         first.control_peak.detected == second.control_peak.detected &&
         first.test_peak.detected == second.test_peak.detected &&
         first.reason_codes == second.reason_codes &&
         std::abs(first.control_peak.position - second.control_peak.position) <
             1.0e-12 &&
         std::abs(first.test_peak.position - second.test_peak.position) <
             1.0e-12;
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
                                    uint64_t seed = 0x5A17C0DEU) {
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

stripcv::test::Capture applyCaptureCondition(
    stripcv::test::Capture capture, size_t condition) {
  switch (condition) {
    case 1:
      capture.rgb = stripcv::test::exposureAndCast(
          capture.rgb, 0.92, cv::Vec3d(1.10, 1.00, 0.88));
      break;
    case 2:
      capture.rgb = stripcv::test::exposureAndCast(
          capture.rgb, 0.92, cv::Vec3d(0.88, 1.00, 1.10));
      break;
    case 3:
      capture.rgb = stripcv::test::exposureAndCast(
          capture.rgb, 0.70, cv::Vec3d(1.0, 1.0, 1.0));
      break;
    case 4:
      capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 42);
      break;
    case 5:
      capture = resizeCapture(capture, 0.5);
      break;
    case 6:
      capture.rgb = addDeterministicSensorNoise(capture.rgb, 4.0);
      break;
    case 7:
      cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 1.0);
      break;
    default:
      break;
  }
  return capture;
}

}  // namespace

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const std::vector<double> strengths = {
      0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08,
      0.09, 0.10, 0.11, 0.12, 0.13, 0.14};
  const std::vector<double> width_factors = {0.75, 1.0, 1.5};
  const std::vector<LineLayout> shifted_layouts = {
      {0.105, 0.205}, {0.13, 0.235}, {0.16, 0.30}, {0.17, 0.36}};
  const std::vector<stripcv::Quad> geometries = {
      stripcv::test::defaultSceneCorners(),
      {cv::Point2f(210.0F, 190.0F), cv::Point2f(1100.0F, 275.0F),
       cv::Point2f(1020.0F, 455.0F), cv::Point2f(128.0F, 474.0F)},
      {cv::Point2f(92.0F, 294.0F), cv::Point2f(1188.0F, 178.0F),
       cv::Point2f(1164.0F, 402.0F), cv::Point2f(126.0F, 486.0F)}};
  constexpr size_t kCaptureConditions = 8;

  size_t faint_cases = 0;
  for (double strength : strengths) {
    for (double width_factor : width_factors) {
      for (size_t condition = 0; condition < kCaptureConditions; ++condition) {
        stripcv::test::StripOptions options;
        options.test_strength = strength;
        options.control_strength = 0.32;
        options.test_width_factor = width_factor;
        options.bright_paper = condition % 2 == 1;
        stripcv::test::Capture capture = stripcv::test::makeCapture(options);
        capture = applyCaptureCondition(std::move(capture), condition);

        const stripcv::AnalysisResult first =
            analyzeKnownGeometry(capture, assay);
        const stripcv::AnalysisResult second =
            analyzeKnownGeometry(capture, assay);
        if (!sameDecision(first, second)) {
          std::cerr << "faint-line sweep was nondeterministic: "
                    << stripcv::test::diagnostic(first) << '\n';
          return EXIT_FAILURE;
        }
        if (!stripcv::test::reportableTwoLine(first) ||
            std::abs(first.control_peak.position - 0.1225) > 0.06 ||
            std::abs(first.test_peak.position - 0.22) > 0.06) {
          std::cerr << "full-height faint test line was not reportable "
                       "two-line at strength="
                    << strength << " width_factor=" << width_factor
                    << " condition=" << condition << ": "
                    << stripcv::test::diagnostic(first) << '\n';
          return EXIT_FAILURE;
        }
        ++faint_cases;
      }
    }
  }

  for (size_t condition = 0; condition < kCaptureConditions; ++condition) {
    stripcv::test::StripOptions options;
    options.test_line = false;
    options.control_strength = 0.32;
    options.bright_paper = condition % 2 == 1;
    stripcv::test::Capture capture = stripcv::test::makeCapture(options);
    capture = applyCaptureCondition(std::move(capture), condition);
    const stripcv::AnalysisResult result = analyzeKnownGeometry(capture, assay);
    if (!stripcv::test::reportableOneLine(result)) {
      std::cerr << "line-free control did not remain reportable one-line: "
                << stripcv::test::diagnostic(result) << '\n';
      return EXIT_FAILURE;
    }
  }

  size_t shifted_faint_cases = 0;
  for (const LineLayout& layout : shifted_layouts) {
    for (size_t condition = 0; condition < kCaptureConditions; ++condition) {
      stripcv::test::StripOptions options;
      options.control_position = layout.control;
      options.test_position = layout.test;
      options.test_strength = 0.02;
      options.control_strength = 0.32;
      stripcv::test::Capture capture = stripcv::test::makeCapture(options);
      capture = applyCaptureCondition(std::move(capture), condition);
      const stripcv::AnalysisResult result = analyzeKnownGeometry(capture, assay);
      if (!stripcv::test::reportableTwoLine(result) ||
          std::abs(result.control_peak.position - layout.control) > 0.06 ||
          std::abs(result.test_peak.position - layout.test) > 0.06) {
        std::cerr << "shifted faint-line recognition failed at control="
                  << layout.control << " test=" << layout.test
                  << " condition=" << condition << ": "
                  << stripcv::test::diagnostic(result) << '\n';
        return EXIT_FAILURE;
      }
      ++shifted_faint_cases;
    }
  }

  size_t automatic_two_line_cases = 0;
  for (size_t geometry = 0; geometry < geometries.size(); ++geometry) {
    for (double strength : {0.02, 0.04}) {
      for (double width_factor : {0.75, 1.5}) {
        for (size_t condition = 0; condition < kCaptureConditions;
             ++condition) {
          stripcv::test::StripOptions options;
          options.test_strength = strength;
          options.control_strength = 0.32;
          options.test_width_factor = width_factor;
          options.bright_paper = condition % 2 == 1;
          stripcv::test::Capture capture =
              stripcv::test::makeCapture(options, geometries[geometry]);
          capture = applyCaptureCondition(std::move(capture), condition);
          const stripcv::AnalysisResult result =
              stripcv::Analyzer().analyze(capture.rgb, assay);
          if (!stripcv::test::reportableTwoLine(result) ||
              std::abs(result.control_peak.position - 0.1225) > 0.06 ||
              std::abs(result.test_peak.position - 0.22) > 0.06 ||
              quadIou(result.geometry.corners, capture.corners) < 0.75) {
            std::cerr << "automatic faint two-line recognition failed at "
                      << "geometry=" << geometry
                      << " strength=" << strength
                      << " width_factor=" << width_factor
                      << " condition=" << condition << ": "
                      << stripcv::test::diagnostic(result) << '\n';
            return EXIT_FAILURE;
          }
          ++automatic_two_line_cases;
        }
      }
    }
  }

  size_t automatic_one_line_cases = 0;
  for (size_t geometry = 0; geometry < geometries.size(); ++geometry) {
    for (size_t condition = 0; condition < kCaptureConditions; ++condition) {
      stripcv::test::StripOptions options;
      options.test_line = false;
      options.control_strength = 0.32;
      options.bright_paper = condition % 2 == 1;
      stripcv::test::Capture capture =
          stripcv::test::makeCapture(options, geometries[geometry]);
      capture = applyCaptureCondition(std::move(capture), condition);
      const stripcv::AnalysisResult result =
          stripcv::Analyzer().analyze(capture.rgb, assay);
      if (!stripcv::test::reportableOneLine(result) ||
          quadIou(result.geometry.corners, capture.corners) < 0.75) {
        std::cerr << "automatic line-free control failed at geometry="
                  << geometry << " condition=" << condition << ": "
                  << stripcv::test::diagnostic(result) << '\n';
        return EXIT_FAILURE;
      }
      ++automatic_one_line_cases;
    }
  }

  size_t automatic_shifted_cases = 0;
  for (size_t geometry = 0; geometry < geometries.size(); ++geometry) {
    for (const LineLayout& layout : shifted_layouts) {
      for (size_t condition = 0; condition < kCaptureConditions; ++condition) {
        stripcv::test::StripOptions options;
        options.control_position = layout.control;
        options.test_position = layout.test;
        options.test_strength = 0.02;
        options.control_strength = 0.32;
        options.bright_paper = condition % 2 == 1;
        stripcv::test::Capture capture =
            stripcv::test::makeCapture(options, geometries[geometry]);
        capture = applyCaptureCondition(std::move(capture), condition);
        const stripcv::AnalysisResult result =
            stripcv::Analyzer().analyze(capture.rgb, assay);
        if (!stripcv::test::reportableTwoLine(result) ||
            std::abs(result.control_peak.position - layout.control) > 0.06 ||
            std::abs(result.test_peak.position - layout.test) > 0.06 ||
            quadIou(result.geometry.corners, capture.corners) < 0.75) {
          std::cerr << "automatic shifted faint-line recognition failed at "
                    << "geometry=" << geometry
                    << " control=" << layout.control
                    << " test=" << layout.test
                    << " condition=" << condition << ": "
                    << stripcv::test::diagnostic(result) << '\n';
          return EXIT_FAILURE;
        }
        ++automatic_shifted_cases;
      }
    }
  }

  size_t automatic_shifted_one_line_cases = 0;
  for (size_t geometry = 0; geometry < geometries.size(); ++geometry) {
    for (const LineLayout& layout : shifted_layouts) {
      for (size_t condition = 0; condition < kCaptureConditions; ++condition) {
        stripcv::test::StripOptions options;
        options.test_line = false;
        options.control_position = layout.control;
        options.control_strength = 0.32;
        options.bright_paper = condition % 2 == 1;
        stripcv::test::Capture capture =
            stripcv::test::makeCapture(options, geometries[geometry]);
        capture = applyCaptureCondition(std::move(capture), condition);
        const stripcv::AnalysisResult result =
            stripcv::Analyzer().analyze(capture.rgb, assay);
        if (!stripcv::test::reportableOneLine(result) ||
            std::abs(result.control_peak.position - layout.control) > 0.06 ||
            quadIou(result.geometry.corners, capture.corners) < 0.75) {
          std::cerr << "automatic shifted one-line control failed at "
                    << "geometry=" << geometry
                    << " control=" << layout.control
                    << " condition=" << condition << ": "
                    << stripcv::test::diagnostic(result) << '\n';
          return EXIT_FAILURE;
        }
        ++automatic_shifted_one_line_cases;
      }
    }
  }

  for (double vertical_fraction : {0.20, 0.30, 0.40}) {
    stripcv::test::StripOptions options;
    options.test_strength = 0.04;
    options.control_strength = 0.32;
    options.test_vertical_fraction = vertical_fraction;
    const stripcv::AnalysisResult result =
        analyzeKnownGeometry(stripcv::test::makeCapture(options), assay);
    if (result.status == "valid") {
      std::cerr << "partial-height T line became reportable at fraction="
                << vertical_fraction << ": "
                << stripcv::test::diagnostic(result) << '\n';
      return EXIT_FAILURE;
    }
  }

  for (double vertical_fraction : {0.20, 0.30, 0.40}) {
    stripcv::test::StripOptions options;
    options.test_strength = 0.18;
    options.control_strength = 0.32;
    options.control_vertical_fraction = vertical_fraction;
    const stripcv::AnalysisResult result =
        analyzeKnownGeometry(stripcv::test::makeCapture(options), assay);
    if (result.status == "valid") {
      std::cerr << "partial-height C line became reportable at fraction="
                << vertical_fraction << ": "
                << stripcv::test::diagnostic(result) << '\n';
      return EXIT_FAILURE;
    }
  }

  // A faint full-height band with a strong edge-to-edge intensity gradient
  // can fall just below the strict row-count threshold after compression and
  // downsampling. It is still a physical continuous band when relaxed row
  // evidence reaches the overall threshold and independently appears in both
  // outer membrane segments. The paired partial variants must remain
  // abstentions; blur cannot turn a centered or edge-displaced mark into a
  // reportable test line.
  stripcv::test::StripOptions edge_challenged;
  edge_challenged.control_position = 0.1283;
  edge_challenged.test_position = 0.3011;
  edge_challenged.control_strength = 0.3900;
  edge_challenged.test_strength = 0.0481;
  edge_challenged.control_width_factor = 1.0657;
  edge_challenged.test_width_factor = 1.6124;
  edge_challenged.control_vertical_gradient = 0.1328;
  edge_challenged.test_vertical_gradient = 0.3465;
  edge_challenged.control_vertical_modulation = 0.2775;
  edge_challenged.test_vertical_modulation = 0.1173;
  edge_challenged.control_vertical_phase = 0.9959;
  edge_challenged.test_vertical_phase = 0.3513;
  edge_challenged.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  edge_challenged.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  const auto makeEdgeChallengedCapture =
      [&](const stripcv::test::StripOptions& options) {
        stripcv::test::Capture capture =
            stripcv::test::makeCapture(options);
        capture.rgb = stripcv::test::exposureAndCast(
            capture.rgb, 0.6807, cv::Vec3d(0.8947, 0.9675, 1.0036));
        cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(7, 7), 0.9398);
        capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 75);
        capture.rgb = addDeterministicSensorNoise(
            capture.rgb, 1.9889, 7919204548125652231ULL);
        return resizeCapture(capture, 0.5203);
      };
  const stripcv::AnalysisResult edge_challenged_result =
      analyzeKnownGeometry(makeEdgeChallengedCapture(edge_challenged), assay);
  if (!stripcv::test::reportableTwoLine(edge_challenged_result)) {
    std::cerr << "full-height edge-challenged T was not reportable: "
              << stripcv::test::diagnostic(edge_challenged_result) << '\n';
    return EXIT_FAILURE;
  }

  size_t edge_challenged_partial_cases = 0;
  for (double vertical_fraction : {0.25, 0.38, 0.45}) {
    for (double vertical_center : {0.24, 0.50, 0.76}) {
      stripcv::test::StripOptions partial = edge_challenged;
      partial.test_strength = 0.22;
      partial.test_vertical_fraction = vertical_fraction;
      partial.test_vertical_center = vertical_center;
      const stripcv::AnalysisResult partial_result = analyzeKnownGeometry(
          makeEdgeChallengedCapture(partial), assay);
      if (partial_result.status == "valid") {
        std::cerr << "edge-coherence fallback accepted a partial T at fraction="
                  << vertical_fraction << " center=" << vertical_center
                  << ": " << stripcv::test::diagnostic(partial_result)
                  << '\n';
        return EXIT_FAILURE;
      }
      ++edge_challenged_partial_cases;
    }
  }

  // Aggressive compression, cast, sensor noise, and downsampling can leave
  // tiny line-shaped ripples far from a genuine control. These do not veto a
  // one-line result unless they have material, strength, or full-height row
  // coherence. Keep the paired shifted-faint-T capture non-one-line so the
  // ripple filter cannot silently erase a physical deposited band.
  stripcv::test::StripOptions ripple_control;
  ripple_control.test_line = false;
  ripple_control.control_position = 0.1556;
  ripple_control.control_strength = 0.2706;
  ripple_control.control_width_factor = 1.4784;
  stripcv::test::Capture ripple_capture =
      stripcv::test::makeCapture(ripple_control);
  ripple_capture.rgb = stripcv::test::exposureAndCast(
      ripple_capture.rgb, 0.9359, cv::Vec3d(0.8755, 0.9451, 1.0016));
  cv::GaussianBlur(ripple_capture.rgb, ripple_capture.rgb,
                   cv::Size(3, 3), 0.2771);
  ripple_capture.rgb =
      stripcv::test::jpegRoundTrip(ripple_capture.rgb, 35);
  ripple_capture.rgb = addDeterministicSensorNoise(ripple_capture.rgb, 0.75);
  ripple_capture = resizeCapture(ripple_capture, 0.6661);
  const stripcv::AnalysisResult ripple_result =
      analyzeKnownGeometry(ripple_capture, assay);
  if (!stripcv::test::reportableOneLine(ripple_result)) {
    std::cerr << "compression ripple vetoed a line-free control: "
              << stripcv::test::diagnostic(ripple_result) << '\n';
    return EXIT_FAILURE;
  }

  // A wider inner-region search must not replace a strong configured control
  // with two tiny downstream compression/noise maxima. Freeze the exact
  // paired C/T, line-free, and missing-control neighborhood: the real pair is
  // reportable, the line-free strip keeps its original C assignment, and a
  // lone T never becomes a one-line result.
  stripcv::test::StripOptions remote_noise_pair;
  remote_noise_pair.control_position = 0.1329;
  remote_noise_pair.test_position = 0.2981;
  remote_noise_pair.control_strength = 0.4047;
  remote_noise_pair.test_strength = 0.3857;
  remote_noise_pair.control_width_factor = 1.4391;
  remote_noise_pair.test_width_factor = 0.9158;
  remote_noise_pair.control_vertical_gradient = 0.4466;
  remote_noise_pair.test_vertical_gradient = 0.2011;
  remote_noise_pair.control_vertical_modulation = 0.1480;
  remote_noise_pair.test_vertical_modulation = 0.0347;
  remote_noise_pair.control_vertical_phase = 0.9686;
  remote_noise_pair.test_vertical_phase = 0.0231;
  remote_noise_pair.control_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);
  remote_noise_pair.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  const auto makeRemoteNoisePairCapture =
      [&](const stripcv::test::StripOptions& options) {
        stripcv::test::Capture capture = stripcv::test::makeCapture(options);
        capture.rgb = stripcv::test::exposureAndCast(
            capture.rgb, 0.7319, cv::Vec3d(1.0529, 0.9987, 0.9433));
        cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(7, 7), 1.2381);
        capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 93);
        capture.rgb = addDeterministicSensorNoise(
            capture.rgb, 2.0626, 15467894581381792533ULL);
        return resizeCapture(capture, 0.7941);
      };

  const stripcv::AnalysisResult remote_noise_pair_two_line =
      analyzeKnownGeometry(makeRemoteNoisePairCapture(remote_noise_pair), assay);
  if (!stripcv::test::reportableTwoLine(remote_noise_pair_two_line)) {
    std::cerr << "real C/T pair lost to remote-noise-pair guard: "
              << stripcv::test::diagnostic(remote_noise_pair_two_line) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions remote_noise_pair_one_line = remote_noise_pair;
  remote_noise_pair_one_line.test_line = false;
  const stripcv::AnalysisResult remote_noise_pair_line_free =
      analyzeKnownGeometry(
          makeRemoteNoisePairCapture(remote_noise_pair_one_line), assay);
  if (!stripcv::test::reportableOneLine(remote_noise_pair_line_free) ||
      std::abs(remote_noise_pair_line_free.control_peak.position -
               remote_noise_pair.control_position) > 0.04) {
    std::cerr << "remote noise pair replaced the supported control: "
              << stripcv::test::diagnostic(remote_noise_pair_line_free) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions remote_noise_pair_missing_control =
      remote_noise_pair;
  remote_noise_pair_missing_control.control_line = false;
  const stripcv::AnalysisResult remote_noise_pair_lone_test =
      analyzeKnownGeometry(
          makeRemoteNoisePairCapture(remote_noise_pair_missing_control), assay);
  if (remote_noise_pair_lone_test.status == "valid") {
    std::cerr << "remote-noise-pair guard reported a lone T: "
              << stripcv::test::diagnostic(remote_noise_pair_lone_test) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions shifted_faint;
  shifted_faint.control_position = 0.1556;
  shifted_faint.test_position = 0.2952;
  shifted_faint.control_strength = 0.3637;
  shifted_faint.test_strength = 0.0311;
  shifted_faint.control_width_factor = 1.0532;
  shifted_faint.test_width_factor = 1.7167;
  shifted_faint.control_vertical_gradient = 0.2133;
  shifted_faint.test_vertical_gradient = -0.2897;
  shifted_faint.control_vertical_modulation = 0.0867;
  shifted_faint.control_vertical_phase = 0.4365;
  shifted_faint.test_vertical_modulation = 0.0088;
  shifted_faint.test_vertical_phase = 0.3924;
  shifted_faint.control_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  shifted_faint.test_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  stripcv::test::Capture shifted_faint_capture =
      stripcv::test::makeCapture(shifted_faint);
  shifted_faint_capture.rgb = stripcv::test::exposureAndCast(
      shifted_faint_capture.rgb, 0.8796,
      cv::Vec3d(1.1358, 0.9426, 1.0735));
  cv::GaussianBlur(shifted_faint_capture.rgb, shifted_faint_capture.rgb,
                   cv::Size(3, 3), 0.0270);
  shifted_faint_capture.rgb = stripcv::test::jpegRoundTrip(
      shifted_faint_capture.rgb, 42);
  shifted_faint_capture.rgb = addDeterministicSensorNoise(
      shifted_faint_capture.rgb, 2.0106, 16957591112825165196ULL);
  shifted_faint_capture = resizeCapture(shifted_faint_capture, 0.5280);
  const stripcv::AnalysisResult shifted_faint_result =
      analyzeKnownGeometry(shifted_faint_capture, assay);
  if (!stripcv::test::reportableTwoLine(shifted_faint_result) ||
      std::abs(shifted_faint_result.test_peak.position -
               shifted_faint.test_position) > 0.06) {
    std::cerr << "full-height shifted faint T was not recovered: "
              << stripcv::test::diagnostic(shifted_faint_result) << '\n';
    return EXIT_FAILURE;
  }

  // A single compact full-height T can shift beyond the configured test
  // window after severe exposure, noise, compression, and downsampling. This
  // seeded case exercises the guarded recovery path directly.
  stripcv::test::StripOptions unique_shifted;
  unique_shifted.control_position = 0.1112;
  unique_shifted.test_position = 0.3111;
  unique_shifted.control_strength = 0.1866;
  unique_shifted.test_strength = 0.0414;
  unique_shifted.control_width_factor = 0.7303;
  unique_shifted.test_width_factor = 1.5855;
  unique_shifted.control_vertical_gradient = 0.1955;
  unique_shifted.test_vertical_gradient = -0.0847;
  unique_shifted.control_vertical_modulation = 0.1369;
  unique_shifted.control_vertical_phase = 0.3317;
  unique_shifted.test_vertical_modulation = 0.1763;
  unique_shifted.test_vertical_phase = 0.0449;
  unique_shifted.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  unique_shifted.test_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  stripcv::test::Capture unique_shifted_capture =
      stripcv::test::makeCapture(unique_shifted);
  unique_shifted_capture.rgb = stripcv::test::exposureAndCast(
      unique_shifted_capture.rgb, 0.6910,
      cv::Vec3d(0.9967, 0.9279, 1.1043));
  cv::GaussianBlur(unique_shifted_capture.rgb, unique_shifted_capture.rgb,
                   cv::Size(3, 3), 0.2799);
  unique_shifted_capture.rgb = stripcv::test::jpegRoundTrip(
      unique_shifted_capture.rgb, 83);
  unique_shifted_capture.rgb = addDeterministicSensorNoise(
      unique_shifted_capture.rgb, 3.4564, 8168841166779717110ULL);
  unique_shifted_capture = resizeCapture(unique_shifted_capture, 0.6724);
  const stripcv::AnalysisResult unique_shifted_result =
      analyzeKnownGeometry(unique_shifted_capture, assay);
  if (!stripcv::test::reportableTwoLine(unique_shifted_result) ||
      std::abs(unique_shifted_result.test_peak.position -
               unique_shifted.test_position) > 0.06) {
    std::cerr << "unique full-height shifted T was not recovered: "
              << stripcv::test::diagnostic(unique_shifted_result) << '\n';
    return EXIT_FAILURE;
  }

  // Strong vertical fading can put a real full-height T just below the
  // ordinary supported-row fraction after blur and downsampling. The line is
  // still compact in three separated height slices and present at both outer
  // membrane bands; freeze that independent 2-D recovery here.
  stripcv::test::StripOptions faded_full_height;
  faded_full_height.control_position = 0.1515;
  faded_full_height.test_position = 0.3201;
  faded_full_height.control_strength = 0.3018;
  faded_full_height.test_strength = 0.0389;
  faded_full_height.control_width_factor = 1.2054;
  faded_full_height.test_width_factor = 0.6728;
  faded_full_height.control_vertical_gradient = 0.0319;
  faded_full_height.test_vertical_gradient = -0.3590;
  faded_full_height.control_vertical_modulation = 0.0132;
  faded_full_height.control_vertical_phase = 0.0641;
  faded_full_height.test_vertical_modulation = 0.0068;
  faded_full_height.test_vertical_phase = 0.2079;
  faded_full_height.control_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);
  faded_full_height.test_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);
  stripcv::test::Capture faded_full_height_capture =
      stripcv::test::makeCapture(faded_full_height);
  faded_full_height_capture.rgb = stripcv::test::exposureAndCast(
      faded_full_height_capture.rgb, 0.7414,
      cv::Vec3d(0.9630, 0.9492, 0.9992));
  cv::GaussianBlur(faded_full_height_capture.rgb,
                   faded_full_height_capture.rgb, cv::Size(7, 7), 1.2255);
  faded_full_height_capture.rgb = stripcv::test::jpegRoundTrip(
      faded_full_height_capture.rgb, 57);
  faded_full_height_capture.rgb = addDeterministicSensorNoise(
      faded_full_height_capture.rgb, 2.4581, 9342115269385535704ULL);
  faded_full_height_capture =
      resizeCapture(faded_full_height_capture, 0.7472);
  const stripcv::AnalysisResult faded_full_height_result =
      analyzeKnownGeometry(faded_full_height_capture, assay);
  if (!stripcv::test::reportableTwoLine(faded_full_height_result) ||
      std::abs(faded_full_height_result.test_peak.position -
               faded_full_height.test_position) > 0.06) {
    std::cerr << "three-segment faded full-height T was not recovered: "
              << stripcv::test::diagnostic(faded_full_height_result) << '\n';
    return EXIT_FAILURE;
  }

  // A high-noise line-free capture can contain a single 8-9%-height run at
  // the predicted T location. Keep it reportable one-line while preserving a
  // physically incomplete 15%-height T, its paired complete T, and a missing
  // control as explicit neighboring safety cases.
  stripcv::test::StripOptions partial_run_boundary;
  partial_run_boundary.control_position = 0.1041;
  partial_run_boundary.test_position = 0.2069;
  partial_run_boundary.control_strength = 0.3602;
  partial_run_boundary.test_strength = 0.4226;
  partial_run_boundary.control_width_factor = 0.7460;
  partial_run_boundary.test_width_factor = 1.3970;
  partial_run_boundary.bright_paper = true;
  partial_run_boundary.control_vertical_gradient = 0.0881;
  partial_run_boundary.test_vertical_gradient = 0.2865;
  partial_run_boundary.control_vertical_modulation = 0.1355;
  partial_run_boundary.control_vertical_phase = 0.5145;
  partial_run_boundary.test_vertical_modulation = 0.0070;
  partial_run_boundary.test_vertical_phase = 0.2385;
  partial_run_boundary.control_dye_rgb = cv::Vec3d(175.0, 65.0, 95.0);
  partial_run_boundary.test_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);
  const auto makePartialRunBoundaryCapture =
      [&](const stripcv::test::StripOptions& options) {
        stripcv::test::Capture capture = stripcv::test::makeCapture(options);
        capture.rgb = stripcv::test::exposureAndCast(
            capture.rgb, 0.8215, cv::Vec3d(1.0478, 0.9908, 0.9835));
        cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 0.9377);
        capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 56);
        capture.rgb = addDeterministicSensorNoise(
            capture.rgb, 2.7103, 18024601071159797894ULL);
        return resizeCapture(capture, 0.7973);
      };

  const stripcv::AnalysisResult partial_boundary_two_line =
      analyzeKnownGeometry(
          makePartialRunBoundaryCapture(partial_run_boundary), assay);
  if (!stripcv::test::reportableTwoLine(partial_boundary_two_line)) {
    std::cerr << "partial-run boundary complete T was not reportable: "
              << stripcv::test::diagnostic(partial_boundary_two_line) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions boundary_one_line = partial_run_boundary;
  boundary_one_line.test_line = false;
  const stripcv::AnalysisResult partial_boundary_one_line =
      analyzeKnownGeometry(makePartialRunBoundaryCapture(boundary_one_line),
                           assay);
  if (!stripcv::test::reportableOneLine(partial_boundary_one_line)) {
    std::cerr << "8-9% noise run vetoed a line-free control: "
              << stripcv::test::diagnostic(partial_boundary_one_line) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions boundary_partial = partial_run_boundary;
  boundary_partial.test_vertical_fraction = 0.15;
  boundary_partial.test_vertical_center = 0.50;
  const stripcv::AnalysisResult partial_boundary_incomplete =
      analyzeKnownGeometry(makePartialRunBoundaryCapture(boundary_partial),
                           assay);
  if (partial_boundary_incomplete.status == "valid") {
    std::cerr << "15% partial T crossed the partial-run boundary: "
              << stripcv::test::diagnostic(partial_boundary_incomplete)
              << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions boundary_missing_control = boundary_one_line;
  boundary_missing_control.control_line = false;
  const stripcv::AnalysisResult partial_boundary_missing_control =
      analyzeKnownGeometry(
          makePartialRunBoundaryCapture(boundary_missing_control), assay);
  if (partial_boundary_missing_control.status == "valid") {
    std::cerr << "partial-run boundary missing control became reportable: "
              << stripcv::test::diagnostic(partial_boundary_missing_control)
              << '\n';
    return EXIT_FAILURE;
  }

  // The same recovery must not turn a three-line strip into a reportable
  // C/T result. Its raw corrected profile contains both the intended weak T
  // and the extra strong result band, even when generic peak filtering keeps
  // only the latter as a recovery candidate.
  stripcv::test::StripOptions extra_shifted;
  extra_shifted.extra_line = true;
  extra_shifted.control_position = 0.1008;
  extra_shifted.test_position = 0.2444;
  extra_shifted.control_strength = 0.3289;
  extra_shifted.test_strength = 0.1149;
  extra_shifted.control_width_factor = 1.0527;
  extra_shifted.test_width_factor = 0.7698;
  extra_shifted.control_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  extra_shifted.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  const double extra_scale = 0.7492;
  const stripcv::Quad extra_geometry = {
      cv::Point2f(124.960F / extra_scale, 145.208F / extra_scale),
      cv::Point2f(870.286F / extra_scale, 128.113F / extra_scale),
      cv::Point2f(877.726F / extra_scale, 254.941F / extra_scale),
      cv::Point2f(117.890F / extra_scale, 271.139F / extra_scale)};
  stripcv::test::Capture extra_shifted_capture =
      stripcv::test::makeCapture(extra_shifted, extra_geometry);
  extra_shifted_capture.rgb = stripcv::test::exposureAndCast(
      extra_shifted_capture.rgb, 0.8572,
      cv::Vec3d(0.9888, 1.0258, 0.9476));
  cv::GaussianBlur(extra_shifted_capture.rgb, extra_shifted_capture.rgb,
                   cv::Size(3, 3), 0.2909);
  extra_shifted_capture.rgb = stripcv::test::jpegRoundTrip(
      extra_shifted_capture.rgb, 67);
  extra_shifted_capture.rgb = addDeterministicSensorNoise(
      extra_shifted_capture.rgb, 0.9754, 15384580096513200302ULL);
  extra_shifted_capture = resizeCapture(extra_shifted_capture, extra_scale);
  const stripcv::AnalysisResult extra_shifted_result =
      analyzeKnownGeometry(extra_shifted_capture, assay);
  if (extra_shifted_result.status == "valid") {
    std::cerr << "extra result line used shifted-T recovery: "
              << stripcv::test::diagnostic(extra_shifted_result) << '\n';
    return EXIT_FAILURE;
  }

  // An over-extended automatic quadrilateral once included enough tabletop to
  // suppress this full-height faint T. The nested-candidate ranking must now
  // retain the tighter physical strip and agree with annotated recognition.
  stripcv::test::StripOptions noisy_faint;
  noisy_faint.control_position = 0.14474515;
  noisy_faint.test_position = 0.25950165;
  noisy_faint.control_strength = 0.36545877;
  noisy_faint.test_strength = 0.03881941;
  noisy_faint.control_width_factor = 1.38041845;
  noisy_faint.test_width_factor = 1.35118580;
  noisy_faint.bright_paper = true;
  noisy_faint.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  noisy_faint.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  noisy_faint.control_vertical_gradient = -0.08974990;
  noisy_faint.test_vertical_gradient = -0.32651256;
  noisy_faint.control_vertical_modulation = 0.05837265;
  noisy_faint.test_vertical_modulation = 0.07144485;
  noisy_faint.control_vertical_phase = 0.72845222;
  noisy_faint.test_vertical_phase = 0.56502515;
  const double noisy_faint_scale = 0.82219487;
  const stripcv::Quad noisy_faint_geometry = {
      cv::Point2f(89.83164978F / noisy_faint_scale,
                  225.43577576F / noisy_faint_scale),
      cv::Point2f(936.63714600F / noisy_faint_scale,
                  140.90093994F / noisy_faint_scale),
      cv::Point2f(956.69110107F / noisy_faint_scale,
                  324.42794800F / noisy_faint_scale),
      cv::Point2f(83.19130707F / noisy_faint_scale,
                  386.60971069F / noisy_faint_scale)};
  stripcv::test::Capture noisy_faint_capture =
      stripcv::test::makeCapture(noisy_faint, noisy_faint_geometry);
  noisy_faint_capture.rgb = stripcv::test::exposureAndCast(
      noisy_faint_capture.rgb, 0.97985407,
      cv::Vec3d(0.99933294, 1.02270529, 1.01877310));
  cv::GaussianBlur(noisy_faint_capture.rgb, noisy_faint_capture.rgb,
                   cv::Size(3, 3), 0.29276613);
  noisy_faint_capture.rgb =
      stripcv::test::jpegRoundTrip(noisy_faint_capture.rgb, 87);
  noisy_faint_capture.rgb = addDeterministicSensorNoise(
      noisy_faint_capture.rgb, 0.68195019, 14479194247438678299ULL);
  noisy_faint_capture = resizeCapture(noisy_faint_capture, noisy_faint_scale);
  const stripcv::AnalysisResult noisy_faint_known =
      analyzeKnownGeometry(noisy_faint_capture, assay);
  const stripcv::AnalysisResult noisy_faint_automatic =
      stripcv::Analyzer().analyze(noisy_faint_capture.rgb, assay);
  if (!stripcv::test::reportableTwoLine(noisy_faint_known) ||
      !stripcv::test::reportableTwoLine(noisy_faint_automatic) ||
      quadIou(noisy_faint_automatic.geometry.corners,
              noisy_faint_capture.corners) < 0.95) {
    std::cerr << "noisy faint-line automatic crop was not safely resolved: "
              << "known=" << stripcv::test::diagnostic(noisy_faint_known)
              << " automatic="
              << stripcv::test::diagnostic(noisy_faint_automatic) << '\n';
    return EXIT_FAILURE;
  }

  // A strong extra band at 0.32 can merge with a weak shifted T into one
  // apparently line-shaped maximum. Freeze both the invalid three-line image
  // and its otherwise identical two-line control so the shape guard remains
  // selective rather than banning all shifted lines.
  stripcv::test::StripOptions merged_extra;
  merged_extra.extra_line = true;
  merged_extra.control_position = 0.14255769;
  merged_extra.test_position = 0.28670470;
  merged_extra.control_strength = 0.29382046;
  merged_extra.test_strength = 0.08453320;
  merged_extra.control_width_factor = 1.50032527;
  merged_extra.test_width_factor = 1.18906649;
  merged_extra.bright_paper = true;
  merged_extra.control_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  merged_extra.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  const double merged_extra_scale = 0.72678571;
  const stripcv::Quad merged_extra_geometry = {
      cv::Point2f(86.88649750F / merged_extra_scale,
                  127.10356903F / merged_extra_scale),
      cv::Point2f(827.73114014F / merged_extra_scale,
                  149.19441223F / merged_extra_scale),
      cv::Point2f(830.35247803F / merged_extra_scale,
                  309.42437744F / merged_extra_scale),
      cv::Point2f(94.77342987F / merged_extra_scale,
                  261.88217163F / merged_extra_scale)};
  const auto makeMergedExtraCapture = [&](bool extra_line) {
    stripcv::test::StripOptions options = merged_extra;
    options.extra_line = extra_line;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, merged_extra_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.87855060,
        cv::Vec3d(1.00131224, 0.98038452, 0.93823639));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.35661891);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 59);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.24475130, 2435054612482737770ULL);
    return resizeCapture(capture, merged_extra_scale);
  };
  const stripcv::AnalysisResult merged_extra_result =
      stripcv::Analyzer().analyze(makeMergedExtraCapture(true).rgb, assay);
  const stripcv::AnalysisResult merged_valid_result =
      stripcv::Analyzer().analyze(makeMergedExtraCapture(false).rgb, assay);
  if (merged_extra_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(merged_valid_result)) {
    std::cerr << "merged extra-line guard lost selectivity: invalid="
              << stripcv::test::diagnostic(merged_extra_result)
              << " matched_valid="
              << stripcv::test::diagnostic(merged_valid_result) << '\n';
    return EXIT_FAILURE;
  }

  // Freeze a weaker T that merges with the fixed downstream extra line after
  // automatic rectification. The resulting outward-shifted high-area peak has
  // a small but repeatable shoulder asymmetry; the matched strip without the
  // third line must remain reportable.
  stripcv::test::StripOptions subtle_merged_extra;
  subtle_merged_extra.control_position = 0.13943404;
  subtle_merged_extra.test_position = 0.26977113;
  subtle_merged_extra.control_strength = 0.32564418;
  subtle_merged_extra.test_strength = 0.08979922;
  subtle_merged_extra.control_width_factor = 1.53857299;
  subtle_merged_extra.test_width_factor = 0.84836904;
  subtle_merged_extra.bright_paper = true;
  subtle_merged_extra.control_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);
  subtle_merged_extra.test_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);
  const double subtle_merged_scale = 0.71980864;
  const stripcv::Quad subtle_merged_geometry = {
      cv::Point2f(107.22867584F / subtle_merged_scale,
                  117.62005615F / subtle_merged_scale),
      cv::Point2f(827.58502197F / subtle_merged_scale,
                  157.76982117F / subtle_merged_scale),
      cv::Point2f(810.77331543F / subtle_merged_scale,
                  287.10812378F / subtle_merged_scale),
      cv::Point2f(91.45726776F / subtle_merged_scale,
                  262.61489868F / subtle_merged_scale)};
  const auto makeSubtleMergedExtraCapture = [&](bool extra_line) {
    stripcv::test::StripOptions options = subtle_merged_extra;
    options.extra_line = extra_line;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, subtle_merged_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.89164111,
        cv::Vec3d(1.02257293, 0.99871226, 0.92589012));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.08148006);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 68);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.06388889, 15731320925762349673ULL);
    return resizeCapture(capture, subtle_merged_scale);
  };
  const stripcv::AnalysisResult subtle_merged_extra_result =
      stripcv::Analyzer().analyze(
          makeSubtleMergedExtraCapture(true).rgb, assay);
  const stripcv::AnalysisResult subtle_merged_valid_result =
      stripcv::Analyzer().analyze(
          makeSubtleMergedExtraCapture(false).rgb, assay);
  if (subtle_merged_extra_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(subtle_merged_valid_result)) {
    std::cerr << "subtle merged extra-line guard lost selectivity: invalid="
              << stripcv::test::diagnostic(subtle_merged_extra_result)
              << " matched_valid="
              << stripcv::test::diagnostic(subtle_merged_valid_result)
              << '\n';
    return EXIT_FAILURE;
  }

  // Freeze a well-separated three-line capture where the ordered-pair search
  // selected the outer peaks and skipped the strong middle peak.
  stripcv::test::StripOptions skipped_middle_extra;
  skipped_middle_extra.control_position = 0.10420146;
  skipped_middle_extra.test_position = 0.19424887;
  skipped_middle_extra.control_strength = 0.30814901;
  skipped_middle_extra.test_strength = 0.39729234;
  skipped_middle_extra.control_width_factor = 0.82469900;
  skipped_middle_extra.test_width_factor = 1.38231745;
  skipped_middle_extra.bright_paper = true;
  const double skipped_middle_scale = 0.70340054;
  const stripcv::Quad skipped_middle_geometry = {
      cv::Point2f(56.94208527F / skipped_middle_scale,
                  135.43672180F / skipped_middle_scale),
      cv::Point2f(827.62036133F / skipped_middle_scale,
                  158.18008423F / skipped_middle_scale),
      cv::Point2f(820.59735107F / skipped_middle_scale,
                  311.28341675F / skipped_middle_scale),
      cv::Point2f(64.31405640F / skipped_middle_scale,
                  296.25570679F / skipped_middle_scale)};
  const auto makeSkippedMiddleCapture = [&](bool extra_line) {
    stripcv::test::StripOptions options = skipped_middle_extra;
    options.extra_line = extra_line;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, skipped_middle_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.91449941,
        cv::Vec3d(1.05207783, 1.03370516, 0.99619401));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 0.79049221);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 88);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.22940514, 10456189739073790612ULL);
    return resizeCapture(capture, skipped_middle_scale);
  };
  const stripcv::AnalysisResult skipped_middle_extra_result =
      stripcv::Analyzer().analyze(
          makeSkippedMiddleCapture(true).rgb, assay);
  const stripcv::AnalysisResult skipped_middle_valid_result =
      stripcv::Analyzer().analyze(
          makeSkippedMiddleCapture(false).rgb, assay);
  if (skipped_middle_extra_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(skipped_middle_valid_result)) {
    std::cerr << "skipped-middle extra-line guard lost selectivity: invalid="
              << stripcv::test::diagnostic(skipped_middle_extra_result)
              << " matched_valid="
              << stripcv::test::diagnostic(skipped_middle_valid_result)
              << '\n';
    return EXIT_FAILURE;
  }

  // Freeze a far-shifted T that nearly coincides with the downstream extra
  // line. The deposits coalesce into one symmetric peak, so their excessive
  // area at an unsupported C/T separation is the remaining safety evidence.
  stripcv::test::StripOptions coalesced_extra;
  coalesced_extra.control_position = 0.15207733;
  coalesced_extra.test_position = 0.31062125;
  coalesced_extra.control_strength = 0.32654074;
  coalesced_extra.test_strength = 0.24417705;
  coalesced_extra.control_width_factor = 1.26139010;
  coalesced_extra.test_width_factor = 0.70006069;
  const double coalesced_extra_scale = 0.91755706;
  const stripcv::Quad coalesced_extra_geometry = {
      cv::Point2f(129.40699768F / coalesced_extra_scale,
                  230.95341492F / coalesced_extra_scale),
      cv::Point2f(1003.36138916F / coalesced_extra_scale,
                  168.08985901F / coalesced_extra_scale),
      cv::Point2f(1017.67907715F / coalesced_extra_scale,
                  381.03863525F / coalesced_extra_scale),
      cv::Point2f(131.24134827F / coalesced_extra_scale,
                  449.75668335F / coalesced_extra_scale)};
  const auto makeCoalescedExtraCapture = [&](bool extra_line) {
    stripcv::test::StripOptions options = coalesced_extra;
    options.extra_line = extra_line;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, coalesced_extra_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.99643300,
        cv::Vec3d(0.95163700, 1.03167811, 0.98939102));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.22783089);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 62);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.80539216, 7067940504107406111ULL);
    return resizeCapture(capture, coalesced_extra_scale);
  };
  const stripcv::AnalysisResult coalesced_extra_result =
      stripcv::Analyzer().analyze(
          makeCoalescedExtraCapture(true).rgb, assay);
  const stripcv::AnalysisResult coalesced_valid_result =
      stripcv::Analyzer().analyze(
          makeCoalescedExtraCapture(false).rgb, assay);
  if (coalesced_extra_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(coalesced_valid_result)) {
    std::cerr << "coalesced extra-line guard lost selectivity: invalid="
              << stripcv::test::diagnostic(coalesced_extra_result)
              << " matched_valid="
              << stripcv::test::diagnostic(coalesced_valid_result) << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions randomized_partial;
  randomized_partial.control_position = 0.13362079;
  randomized_partial.test_position = 0.25074359;
  randomized_partial.control_strength = 0.38890550;
  randomized_partial.test_strength = 0.18001318;
  randomized_partial.control_width_factor = 0.82111158;
  randomized_partial.test_width_factor = 0.80305430;
  randomized_partial.test_vertical_fraction = 0.34627191;
  randomized_partial.test_vertical_center = 0.62078203;
  randomized_partial.bright_paper = true;
  randomized_partial.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  randomized_partial.test_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  const double randomized_partial_scale = 0.97873461;
  const stripcv::Quad randomized_partial_geometry = {
      cv::Point2f(89.18861389F / randomized_partial_scale,
                  155.59854126F / randomized_partial_scale),
      cv::Point2f(1164.09045410F / randomized_partial_scale,
                  147.06512451F / randomized_partial_scale),
      cv::Point2f(1172.23681641F / randomized_partial_scale,
                  329.68936157F / randomized_partial_scale),
      cv::Point2f(110.42984772F / randomized_partial_scale,
                  372.84326172F / randomized_partial_scale)};
  const auto makeRandomizedPartialCapture = [&](bool partial) {
    stripcv::test::StripOptions options = randomized_partial;
    if (!partial) {
      options.test_vertical_fraction = -1.0;
      options.test_vertical_center = 0.5;
    }
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, randomized_partial_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.89414172,
        cv::Vec3d(0.97520681, 1.02985150, 1.06949158));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 0.61370064);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 89);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 1.46484667, 4811705185110355937ULL);
    return resizeCapture(capture, randomized_partial_scale);
  };
  const stripcv::AnalysisResult randomized_partial_result =
      stripcv::Analyzer().analyze(
          makeRandomizedPartialCapture(true).rgb, assay);
  const stripcv::AnalysisResult randomized_partial_full_height =
      stripcv::Analyzer().analyze(
          makeRandomizedPartialCapture(false).rgb, assay);
  if (randomized_partial_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(randomized_partial_full_height)) {
    std::cerr << "randomized partial-line continuity guard lost selectivity: "
              << "partial="
              << stripcv::test::diagnostic(randomized_partial_result)
              << " full_height="
              << stripcv::test::diagnostic(randomized_partial_full_height)
              << '\n';
    return EXIT_FAILURE;
  }

  // Freeze a strong lower-half partial T whose row-local paper offset used to
  // inflate both coverage and continuity. The matched full-height band must
  // remain reportable after robust vertical-baseline removal.
  stripcv::test::StripOptions offset_partial;
  offset_partial.control_position = 0.13311746;
  offset_partial.test_position = 0.24521882;
  offset_partial.control_strength = 0.41404557;
  offset_partial.test_strength = 0.33127813;
  offset_partial.control_width_factor = 1.34701709;
  offset_partial.test_width_factor = 1.26632804;
  offset_partial.test_vertical_fraction = 0.21946704;
  offset_partial.test_vertical_center = 0.70217402;
  const double offset_partial_scale = 0.77126838;
  const stripcv::Quad offset_partial_geometry = {
      cv::Point2f(112.45209503F / offset_partial_scale,
                  132.16999817F / offset_partial_scale),
      cv::Point2f(827.42681885F / offset_partial_scale,
                  120.34059143F / offset_partial_scale),
      cv::Point2f(820.15679932F / offset_partial_scale,
                  297.07922363F / offset_partial_scale),
      cv::Point2f(123.52513123F / offset_partial_scale,
                  292.01379395F / offset_partial_scale)};
  const auto makeOffsetPartialCapture = [&](bool partial) {
    stripcv::test::StripOptions options = offset_partial;
    if (!partial) {
      options.test_vertical_fraction = -1.0;
      options.test_vertical_center = 0.5;
    }
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, offset_partial_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.92266618,
        cv::Vec3d(1.01393636, 1.00629541, 1.06834278));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.55389787);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 86);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.78919029, 11895195476711344736ULL);
    return resizeCapture(capture, offset_partial_scale);
  };
  const stripcv::AnalysisResult offset_partial_result =
      stripcv::Analyzer().analyze(makeOffsetPartialCapture(true).rgb, assay);
  const stripcv::AnalysisResult offset_partial_full_height =
      stripcv::Analyzer().analyze(makeOffsetPartialCapture(false).rgb, assay);
  if (offset_partial_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(offset_partial_full_height)) {
    std::cerr << "offset partial-line continuity guard lost selectivity: "
              << "partial="
              << stripcv::test::diagnostic(offset_partial_result)
              << " full_height="
              << stripcv::test::diagnostic(offset_partial_full_height)
              << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions randomized_broad;
  randomized_broad.broad_test_stain = true;
  randomized_broad.control_position = 0.12152891;
  randomized_broad.test_position = 0.22316893;
  randomized_broad.control_strength = 0.34415180;
  randomized_broad.test_strength = 0.10000058;
  randomized_broad.control_width_factor = 1.35602862;
  randomized_broad.test_width_factor = 1.17264411;
  randomized_broad.control_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  randomized_broad.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  const double randomized_broad_scale = 0.73715184;
  const stripcv::Quad randomized_broad_geometry = {
      cv::Point2f(108.88909149F / randomized_broad_scale,
                  202.84437561F / randomized_broad_scale),
      cv::Point2f(788.51989746F / randomized_broad_scale,
                  204.61178589F / randomized_broad_scale),
      cv::Point2f(793.16845703F / randomized_broad_scale,
                  367.07891846F / randomized_broad_scale),
      cv::Point2f(94.02355194F / randomized_broad_scale,
                  325.14758301F / randomized_broad_scale)};
  const auto makeRandomizedBroadCapture = [&](bool broad) {
    stripcv::test::StripOptions options = randomized_broad;
    options.broad_test_stain = broad;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, randomized_broad_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.82067003,
        cv::Vec3d(0.96680675, 0.96443891, 0.99276423));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 0.49868592);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 63);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.93081580, 6302888973358863768ULL);
    return resizeCapture(capture, randomized_broad_scale);
  };
  const stripcv::AnalysisResult randomized_broad_result =
      stripcv::Analyzer().analyze(makeRandomizedBroadCapture(true).rgb,
                                  assay);
  const stripcv::AnalysisResult randomized_broad_line =
      stripcv::Analyzer().analyze(makeRandomizedBroadCapture(false).rgb,
                                  assay);
  if (randomized_broad_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(randomized_broad_line)) {
    std::cerr << "broad-stain transverse guard lost selectivity: broad="
              << stripcv::test::diagnostic(randomized_broad_result)
              << " line="
              << stripcv::test::diagnostic(randomized_broad_line) << '\n';
    return EXIT_FAILURE;
  }

  // Freeze a randomized line-free case where a broad C tail survived JPEG
  // compression as a one-sided shoulder at the expected T position. Without
  // symmetric evidence this is ambiguous, so it must abstain; the matched
  // true two-line strip must remain recognizable.
  stripcv::test::StripOptions broad_control_tail;
  broad_control_tail.control_position = 0.15718787;
  broad_control_tail.test_position = 0.25952686;
  broad_control_tail.control_strength = 0.38387097;
  broad_control_tail.test_strength = 0.20124690;
  broad_control_tail.control_width_factor = 1.66318649;
  broad_control_tail.test_width_factor = 1.43759091;
  broad_control_tail.control_vertical_gradient = 0.23820178;
  broad_control_tail.test_vertical_gradient = -0.02282140;
  broad_control_tail.control_vertical_modulation = 0.07446680;
  broad_control_tail.test_vertical_modulation = 0.01238398;
  broad_control_tail.control_vertical_phase = 0.37483499;
  broad_control_tail.test_vertical_phase = 0.34533841;
  broad_control_tail.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  broad_control_tail.test_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  const auto makeBroadControlTailCapture = [&](bool test_line,
                                                bool control_line) {
    stripcv::test::StripOptions options = broad_control_tail;
    options.test_line = test_line;
    options.control_line = control_line;
    stripcv::test::Capture capture = stripcv::test::makeCapture(options);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.98396133,
        cv::Vec3d(0.96309588, 0.97855345, 0.99270669));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.20367234);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 54);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.68298268, 14256635883583524373ULL);
    return resizeCapture(capture, 0.79979832);
  };
  const stripcv::AnalysisResult broad_control_tail_two_line =
      analyzeKnownGeometry(makeBroadControlTailCapture(true, true), assay);
  const stripcv::AnalysisResult broad_control_tail_one_line =
      analyzeKnownGeometry(makeBroadControlTailCapture(false, true), assay);
  const stripcv::AnalysisResult broad_control_tail_missing_control =
      analyzeKnownGeometry(makeBroadControlTailCapture(true, false), assay);
  if (!stripcv::test::reportableTwoLine(broad_control_tail_two_line) ||
      broad_control_tail_one_line.status == "valid" ||
      broad_control_tail_missing_control.status == "valid") {
    std::cerr << "broad-control one-sided-tail guard lost selectivity: two="
              << stripcv::test::diagnostic(broad_control_tail_two_line)
              << " one="
              << stripcv::test::diagnostic(broad_control_tail_one_line)
              << " missing_control="
              << stripcv::test::diagnostic(broad_control_tail_missing_control)
              << '\n';
    return EXIT_FAILURE;
  }

  // Freeze the automatic broad-stain case that retained a narrow-looking
  // fitted maximum on an otherwise quiet profile. Shoulder occupancy, not
  // nominal SNR alone, must force abstention while preserving the matched
  // ordinary two-line capture.
  stripcv::test::StripOptions quiet_broad_stain;
  quiet_broad_stain.broad_test_stain = true;
  quiet_broad_stain.control_position = 0.13894586;
  quiet_broad_stain.test_position = 0.25533314;
  quiet_broad_stain.control_strength = 0.25273185;
  quiet_broad_stain.test_strength = 0.19470571;
  quiet_broad_stain.control_width_factor = 1.36823230;
  quiet_broad_stain.test_width_factor = 1.18195921;
  quiet_broad_stain.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  quiet_broad_stain.test_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  const double quiet_broad_scale = 0.83371173;
  const stripcv::Quad quiet_broad_geometry = {
      cv::Point2f(132.95533752F / quiet_broad_scale,
                  233.44705200F / quiet_broad_scale),
      cv::Point2f(952.74261475F / quiet_broad_scale,
                  161.96173096F / quiet_broad_scale),
      cv::Point2f(955.51434326F / quiet_broad_scale,
                  343.29281616F / quiet_broad_scale),
      cv::Point2f(148.29876709F / quiet_broad_scale,
                  386.64822388F / quiet_broad_scale)};
  const auto makeQuietBroadCapture = [&](bool broad) {
    stripcv::test::StripOptions options = quiet_broad_stain;
    options.broad_test_stain = broad;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, quiet_broad_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.88262306,
        cv::Vec3d(0.95681962, 0.97874155, 1.05638833));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.49471549);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 68);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.43940751, 16359055528653602066ULL);
    return resizeCapture(capture, quiet_broad_scale);
  };
  const stripcv::AnalysisResult quiet_broad_result =
      stripcv::Analyzer().analyze(makeQuietBroadCapture(true).rgb, assay);
  const stripcv::AnalysisResult quiet_broad_line =
      stripcv::Analyzer().analyze(makeQuietBroadCapture(false).rgb, assay);
  if (quiet_broad_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(quiet_broad_line)) {
    std::cerr << "quiet broad-stain guard lost selectivity: broad="
              << stripcv::test::diagnostic(quiet_broad_result)
              << " line=" << stripcv::test::diagnostic(quiet_broad_line)
              << '\n';
    return EXIT_FAILURE;
  }

  // A lower-contrast broad stain may be correctly rejected as a T peak yet
  // still leave enough structured material to make a one-line report unsafe.
  // Keep that subthreshold breadth as abstention evidence.
  stripcv::test::StripOptions subthreshold_broad_stain;
  subthreshold_broad_stain.broad_test_stain = true;
  subthreshold_broad_stain.control_position = 0.13778031;
  subthreshold_broad_stain.test_position = 0.25231252;
  subthreshold_broad_stain.control_strength = 0.25864355;
  subthreshold_broad_stain.test_strength = 0.08046017;
  subthreshold_broad_stain.control_width_factor = 1.12736298;
  subthreshold_broad_stain.test_width_factor = 1.47828650;
  subthreshold_broad_stain.control_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);
  subthreshold_broad_stain.test_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);
  const double subthreshold_broad_scale = 0.66962804;
  const stripcv::Quad subthreshold_broad_geometry = {
      cv::Point2f(53.79586792F / subthreshold_broad_scale,
                  151.20124817F / subthreshold_broad_scale),
      cv::Point2f(758.42779541F / subthreshold_broad_scale,
                  187.13841248F / subthreshold_broad_scale),
      cv::Point2f(769.35266113F / subthreshold_broad_scale,
                  342.98132324F / subthreshold_broad_scale),
      cv::Point2f(43.66185379F / subthreshold_broad_scale,
                  300.44125366F / subthreshold_broad_scale)};
  const auto makeSubthresholdBroadCapture = [&](bool broad) {
    stripcv::test::StripOptions options = subthreshold_broad_stain;
    options.broad_test_stain = broad;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, subthreshold_broad_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.96390370,
        cv::Vec3d(1.05445879, 1.03779556, 1.01453965));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.44771995);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 82);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.35003256, 9632576341817427293ULL);
    return resizeCapture(capture, subthreshold_broad_scale);
  };
  const stripcv::AnalysisResult subthreshold_broad_result =
      stripcv::Analyzer().analyze(
          makeSubthresholdBroadCapture(true).rgb, assay);
  const stripcv::AnalysisResult subthreshold_broad_line =
      stripcv::Analyzer().analyze(
          makeSubthresholdBroadCapture(false).rgb, assay);
  if (subthreshold_broad_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(subthreshold_broad_line)) {
    std::cerr << "subthreshold broad-stain guard lost selectivity: broad="
              << stripcv::test::diagnostic(subthreshold_broad_result)
              << " line="
              << stripcv::test::diagnostic(subthreshold_broad_line) << '\n';
    return EXIT_FAILURE;
  }

  // A wide stain also contaminates the nominal background region and can
  // inflate the global noise estimate. The physical >3-line-width condition
  // must still veto a one-line report at a conservative local/noise ratio.
  stripcv::test::StripOptions noisy_background_broad_stain;
  noisy_background_broad_stain.broad_test_stain = true;
  noisy_background_broad_stain.control_position = 0.14784461;
  noisy_background_broad_stain.test_position = 0.28547246;
  noisy_background_broad_stain.control_strength = 0.36135785;
  noisy_background_broad_stain.test_strength = 0.17276221;
  noisy_background_broad_stain.control_width_factor = 0.96792391;
  noisy_background_broad_stain.test_width_factor = 0.88025375;
  noisy_background_broad_stain.bright_paper = true;
  noisy_background_broad_stain.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  noisy_background_broad_stain.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  const double noisy_background_broad_scale = 0.95509220;
  const stripcv::Quad noisy_background_broad_geometry = {
      cv::Point2f(154.44001770F / noisy_background_broad_scale,
                  158.35202026F / noisy_background_broad_scale),
      cv::Point2f(1120.80480957F / noisy_background_broad_scale,
                  202.96215820F / noisy_background_broad_scale),
      cv::Point2f(1143.28112793F / noisy_background_broad_scale,
                  364.26800537F / noisy_background_broad_scale),
      cv::Point2f(161.84553528F / noisy_background_broad_scale,
                  351.65679932F / noisy_background_broad_scale)};
  const auto makeNoisyBackgroundBroadCapture = [&](bool broad) {
    stripcv::test::StripOptions options = noisy_background_broad_stain;
    options.broad_test_stain = broad;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, noisy_background_broad_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.93639794,
        cv::Vec3d(0.95505636, 1.00737946, 0.97689090));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 0.75466967);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 61);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.47367084, 10092601637230217540ULL);
    return resizeCapture(capture, noisy_background_broad_scale);
  };
  const stripcv::AnalysisResult noisy_background_broad_result =
      stripcv::Analyzer().analyze(
          makeNoisyBackgroundBroadCapture(true).rgb, assay);
  const stripcv::AnalysisResult noisy_background_broad_line =
      stripcv::Analyzer().analyze(
          makeNoisyBackgroundBroadCapture(false).rgb, assay);
  if (noisy_background_broad_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(noisy_background_broad_line)) {
    std::cerr << "noisy-background broad-stain guard lost selectivity: broad="
              << stripcv::test::diagnostic(noisy_background_broad_result)
              << " line="
              << stripcv::test::diagnostic(noisy_background_broad_line)
              << '\n';
    return EXIT_FAILURE;
  }

  // A broad deposit can also fit to a deceptively narrow 1-D maximum. Its
  // asymmetric shoulders and excessive transverse width remain physical
  // evidence of a stain even when nominal T SNR is moderately high.
  stripcv::test::StripOptions narrow_fit_broad_stain;
  narrow_fit_broad_stain.broad_test_stain = true;
  narrow_fit_broad_stain.control_position = 0.11434448;
  narrow_fit_broad_stain.test_position = 0.21324003;
  narrow_fit_broad_stain.control_strength = 0.25497402;
  narrow_fit_broad_stain.test_strength = 0.08857201;
  narrow_fit_broad_stain.control_width_factor = 1.34260144;
  narrow_fit_broad_stain.test_width_factor = 0.93445343;
  narrow_fit_broad_stain.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  narrow_fit_broad_stain.test_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  const double narrow_fit_broad_scale = 0.70489498;
  const stripcv::Quad narrow_fit_broad_geometry = {
      cv::Point2f(111.29831696F / narrow_fit_broad_scale,
                  152.80419922F / narrow_fit_broad_scale),
      cv::Point2f(797.91955566F / narrow_fit_broad_scale,
                  206.55337524F / narrow_fit_broad_scale),
      cv::Point2f(802.21978760F / narrow_fit_broad_scale,
                  374.39297485F / narrow_fit_broad_scale),
      cv::Point2f(123.87393188F / narrow_fit_broad_scale,
                  297.20126343F / narrow_fit_broad_scale)};
  const auto makeNarrowFitBroadCapture = [&](bool broad) {
    stripcv::test::StripOptions options = narrow_fit_broad_stain;
    options.broad_test_stain = broad;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, narrow_fit_broad_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.90586687,
        cv::Vec3d(1.00595146, 1.04040091, 0.93995978));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 0.64877167);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 97);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.45163973, 11392136494587561486ULL);
    return resizeCapture(capture, narrow_fit_broad_scale);
  };
  const stripcv::AnalysisResult narrow_fit_broad_result =
      stripcv::Analyzer().analyze(
          makeNarrowFitBroadCapture(true).rgb, assay);
  const stripcv::AnalysisResult narrow_fit_broad_line =
      stripcv::Analyzer().analyze(
          makeNarrowFitBroadCapture(false).rgb, assay);
  if (narrow_fit_broad_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(narrow_fit_broad_line)) {
    std::cerr << "narrow-fit broad-stain guard lost selectivity: broad="
              << stripcv::test::diagnostic(narrow_fit_broad_result)
              << " line="
              << stripcv::test::diagnostic(narrow_fit_broad_line) << '\n';
    return EXIT_FAILURE;
  }

  // At the detection boundary, a broad stain may fit to a narrow, symmetric
  // 1-D peak. Preserve the independent transverse-width evidence so it cannot
  // become a reportable T merely by clearing minimum SNR.
  stripcv::test::StripOptions boundary_symmetric_broad_stain;
  boundary_symmetric_broad_stain.broad_test_stain = true;
  boundary_symmetric_broad_stain.control_position = 0.11814161;
  boundary_symmetric_broad_stain.test_position = 0.24683489;
  boundary_symmetric_broad_stain.control_strength = 0.33166058;
  boundary_symmetric_broad_stain.test_strength = 0.08784519;
  boundary_symmetric_broad_stain.control_width_factor = 0.75289479;
  boundary_symmetric_broad_stain.test_width_factor = 0.84624408;
  boundary_symmetric_broad_stain.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  boundary_symmetric_broad_stain.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  const double boundary_symmetric_broad_scale = 0.72843336;
  const stripcv::Quad boundary_symmetric_broad_geometry = {
      cv::Point2f(93.95066833F / boundary_symmetric_broad_scale,
                  164.84140015F / boundary_symmetric_broad_scale),
      cv::Point2f(816.74035645F / boundary_symmetric_broad_scale,
                  119.37271881F / boundary_symmetric_broad_scale),
      cv::Point2f(809.33892822F / boundary_symmetric_broad_scale,
                  252.52731323F / boundary_symmetric_broad_scale),
      cv::Point2f(104.61666107F / boundary_symmetric_broad_scale,
                  318.71176147F / boundary_symmetric_broad_scale)};
  const auto makeBoundarySymmetricBroadCapture = [&](bool broad) {
    stripcv::test::StripOptions options = boundary_symmetric_broad_stain;
    options.broad_test_stain = broad;
    stripcv::test::Capture capture = stripcv::test::makeCapture(
        options, boundary_symmetric_broad_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.85601288,
        cv::Vec3d(0.99890144, 1.00922452, 0.97875601));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.27013724);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 74);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.89389940, 13195132372715409713ULL);
    return resizeCapture(capture, boundary_symmetric_broad_scale);
  };
  const stripcv::AnalysisResult boundary_symmetric_broad_result =
      stripcv::Analyzer().analyze(
          makeBoundarySymmetricBroadCapture(true).rgb, assay);
  const stripcv::AnalysisResult boundary_symmetric_broad_line =
      stripcv::Analyzer().analyze(
          makeBoundarySymmetricBroadCapture(false).rgb, assay);
  if (boundary_symmetric_broad_result.status == "valid" ||
      !stripcv::test::reportableTwoLine(boundary_symmetric_broad_line)) {
    std::cerr << "boundary symmetric broad-stain guard lost selectivity: "
              << "broad="
              << stripcv::test::diagnostic(boundary_symmetric_broad_result)
              << " line="
              << stripcv::test::diagnostic(boundary_symmetric_broad_line)
              << '\n';
    return EXIT_FAILURE;
  }

  // Freeze a strongly projective broad stain whose baseline-corrected center
  // was narrow enough to clear the ordinary FWHM and SNR gates. The physical
  // stain must abstain in both automatic and annotated-corner modes, while an
  // otherwise identical ordinary T line remains reportable.
  stripcv::test::StripOptions projective_broad_stain;
  projective_broad_stain.broad_test_stain = true;
  projective_broad_stain.control_position = 0.10466216;
  projective_broad_stain.test_position = 0.20170133;
  projective_broad_stain.control_strength = 0.30279312;
  projective_broad_stain.test_strength = 0.13192016;
  projective_broad_stain.control_width_factor = 1.28776713;
  projective_broad_stain.test_width_factor = 1.51056171;
  projective_broad_stain.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  projective_broad_stain.test_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  const double projective_broad_scale = 0.90913806;
  const stripcv::Quad projective_broad_geometry = {
      cv::Point2f(187.6302006210F, 185.9113887059F),
      cv::Point2f(1088.5326534894F, 291.9305923679F),
      cv::Point2f(1101.5649365510F, 518.5212570135F),
      cv::Point2f(202.5641550635F, 395.0051962515F)};
  const auto makeProjectiveBroadCapture = [&](bool broad) {
    stripcv::test::StripOptions options = projective_broad_stain;
    options.broad_test_stain = broad;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, projective_broad_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.95793738,
        cv::Vec3d(1.06379869, 0.95286634, 0.94904132));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(3, 3), 0.50035143);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 64);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 0.09661977, 14142434510285039340ULL);
    return resizeCapture(capture, projective_broad_scale);
  };
  const stripcv::test::Capture projective_broad_capture =
      makeProjectiveBroadCapture(true);
  const stripcv::test::Capture projective_broad_line_capture =
      makeProjectiveBroadCapture(false);
  const stripcv::AnalysisResult projective_broad_automatic =
      stripcv::Analyzer().analyze(projective_broad_capture.rgb, assay);
  const stripcv::AnalysisResult projective_broad_known =
      analyzeKnownGeometry(projective_broad_capture, assay);
  const stripcv::AnalysisResult projective_broad_line_automatic =
      stripcv::Analyzer().analyze(projective_broad_line_capture.rgb, assay);
  const stripcv::AnalysisResult projective_broad_line_known =
      analyzeKnownGeometry(projective_broad_line_capture, assay);
  if (projective_broad_automatic.status == "valid" ||
      projective_broad_known.status == "valid" ||
      !stripcv::test::reportableTwoLine(projective_broad_line_automatic) ||
      !stripcv::test::reportableTwoLine(projective_broad_line_known)) {
    std::cerr << "projective broad-stain guard lost selectivity: auto_broad="
              << stripcv::test::diagnostic(projective_broad_automatic)
              << " known_broad="
              << stripcv::test::diagnostic(projective_broad_known)
              << " auto_line="
              << stripcv::test::diagnostic(projective_broad_line_automatic)
              << " known_line="
              << stripcv::test::diagnostic(projective_broad_line_known)
              << '\n';
    return EXIT_FAILURE;
  }

  // Freeze a noisy, far-shifted faint T that remains a coherent transverse
  // band in the rectified image but falls just below the 1-D peak detector's
  // global-noise threshold. It must never be reported as one-line. The paired
  // line-free control protects one-line coverage, while the missing-control
  // variant protects the validity gate under the identical capture process.
  stripcv::test::StripOptions noisy_shifted_faint;
  noisy_shifted_faint.control_position = 0.15169124;
  noisy_shifted_faint.test_position = 0.34944260;
  noisy_shifted_faint.control_strength = 0.25690160;
  noisy_shifted_faint.test_strength = 0.09234920;
  noisy_shifted_faint.control_width_factor = 1.32268437;
  noisy_shifted_faint.test_width_factor = 1.17282116;
  noisy_shifted_faint.control_vertical_gradient = -0.12582585;
  noisy_shifted_faint.test_vertical_gradient = 0.43310854;
  noisy_shifted_faint.control_vertical_modulation = 0.06203578;
  noisy_shifted_faint.test_vertical_modulation = 0.00551486;
  noisy_shifted_faint.control_vertical_phase = 0.65854835;
  noisy_shifted_faint.test_vertical_phase = 0.85549613;
  noisy_shifted_faint.bright_paper = true;
  noisy_shifted_faint.control_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  noisy_shifted_faint.test_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  const auto makeNoisyShiftedFaintCapture = [&](bool test_line,
                                                 bool control_line) {
    stripcv::test::StripOptions options = noisy_shifted_faint;
    options.test_line = test_line;
    options.control_line = control_line;
    stripcv::test::Capture capture = stripcv::test::makeCapture(options);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.75600656,
        cv::Vec3d(1.04776051, 1.07123188, 0.87292090));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 0.71721920);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 40);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 3.29725631, 17162075653124439727ULL);
    return resizeCapture(capture, 0.93639962);
  };
  const stripcv::AnalysisResult noisy_shifted_faint_two_line =
      analyzeKnownGeometry(makeNoisyShiftedFaintCapture(true, true), assay);
  const stripcv::AnalysisResult noisy_shifted_faint_one_line =
      analyzeKnownGeometry(makeNoisyShiftedFaintCapture(false, true), assay);
  const stripcv::AnalysisResult noisy_shifted_faint_missing_control =
      analyzeKnownGeometry(makeNoisyShiftedFaintCapture(true, false), assay);
  if (stripcv::test::reportableOneLine(noisy_shifted_faint_two_line) ||
      !stripcv::test::reportableOneLine(noisy_shifted_faint_one_line) ||
      noisy_shifted_faint_missing_control.status == "valid") {
    std::cerr << "noisy shifted faint-line guard lost selectivity: two="
              << stripcv::test::diagnostic(noisy_shifted_faint_two_line)
              << " one="
              << stripcv::test::diagnostic(noisy_shifted_faint_one_line)
              << " missing_control="
              << stripcv::test::diagnostic(
                     noisy_shifted_faint_missing_control)
              << '\n';
    return EXIT_FAILURE;
  }

  // Freeze a low-global-noise capture where a faint T rides on the broad
  // downstream tail of C. Its local maximum is well above background but was
  // omitted because the coherence fallback previously ran only for noisy
  // profiles. Exercise both automatic and annotated geometry, and retain the
  // paired one-line and missing-control decisions under identical pixels.
  stripcv::test::StripOptions control_tail_faint;
  control_tail_faint.control_position = 0.10529259;
  control_tail_faint.test_position = 0.26171789;
  control_tail_faint.control_strength = 0.36849513;
  control_tail_faint.test_strength = 0.03202353;
  control_tail_faint.control_width_factor = 1.64137556;
  control_tail_faint.test_width_factor = 0.75577283;
  control_tail_faint.control_vertical_gradient = -0.30522483;
  control_tail_faint.test_vertical_gradient = 0.15914483;
  control_tail_faint.control_vertical_modulation = 0.22730911;
  control_tail_faint.test_vertical_modulation = 0.23543510;
  control_tail_faint.control_vertical_phase = 0.86356877;
  control_tail_faint.test_vertical_phase = 0.43971509;
  control_tail_faint.control_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  control_tail_faint.test_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);
  const double control_tail_faint_scale = 0.76999557;
  const stripcv::Quad control_tail_faint_geometry = {
      cv::Point2f(88.8858707070F, 201.7147423459F),
      cv::Point2f(1116.0199055431F, 213.6615907933F),
      cv::Point2f(1119.6952735585F, 395.1941697665F),
      cv::Point2f(113.1652109635F, 424.4700886915F)};
  const auto makeControlTailFaintCapture = [&](bool test_line,
                                                bool control_line) {
    stripcv::test::StripOptions options = control_tail_faint;
    options.test_line = test_line;
    options.control_line = control_line;
    stripcv::test::Capture capture =
        stripcv::test::makeCapture(options, control_tail_faint_geometry);
    capture.rgb = stripcv::test::exposureAndCast(
        capture.rgb, 0.86005211,
        cv::Vec3d(0.98556052, 1.04934286, 0.90502814));
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(5, 5), 0.61714050);
    capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 88);
    capture.rgb = addDeterministicSensorNoise(
        capture.rgb, 1.38855196, 8893460133487527358ULL);
    return resizeCapture(capture, control_tail_faint_scale);
  };
  const stripcv::test::Capture control_tail_faint_two_capture =
      makeControlTailFaintCapture(true, true);
  const stripcv::test::Capture control_tail_faint_one_capture =
      makeControlTailFaintCapture(false, true);
  const stripcv::test::Capture control_tail_faint_missing_capture =
      makeControlTailFaintCapture(true, false);
  const stripcv::AnalysisResult control_tail_faint_two_automatic =
      stripcv::Analyzer().analyze(control_tail_faint_two_capture.rgb, assay);
  const stripcv::AnalysisResult control_tail_faint_two_known =
      analyzeKnownGeometry(control_tail_faint_two_capture, assay);
  const stripcv::AnalysisResult control_tail_faint_one_automatic =
      stripcv::Analyzer().analyze(control_tail_faint_one_capture.rgb, assay);
  const stripcv::AnalysisResult control_tail_faint_one_known =
      analyzeKnownGeometry(control_tail_faint_one_capture, assay);
  const stripcv::AnalysisResult control_tail_faint_missing_automatic =
      stripcv::Analyzer().analyze(control_tail_faint_missing_capture.rgb,
                                  assay);
  const stripcv::AnalysisResult control_tail_faint_missing_known =
      analyzeKnownGeometry(control_tail_faint_missing_capture, assay);
  if (stripcv::test::reportableOneLine(control_tail_faint_two_automatic) ||
      stripcv::test::reportableOneLine(control_tail_faint_two_known) ||
      !stripcv::test::reportableOneLine(control_tail_faint_one_automatic) ||
      !stripcv::test::reportableOneLine(control_tail_faint_one_known) ||
      control_tail_faint_missing_automatic.status == "valid" ||
      control_tail_faint_missing_known.status == "valid") {
    std::cerr << "control-tail faint-line guard lost selectivity: auto_two="
              << stripcv::test::diagnostic(control_tail_faint_two_automatic)
              << " known_two="
              << stripcv::test::diagnostic(control_tail_faint_two_known)
              << " auto_one="
              << stripcv::test::diagnostic(control_tail_faint_one_automatic)
              << " known_one="
              << stripcv::test::diagnostic(control_tail_faint_one_known)
              << " auto_missing="
              << stripcv::test::diagnostic(
                     control_tail_faint_missing_automatic)
              << " known_missing="
              << stripcv::test::diagnostic(control_tail_faint_missing_known)
              << '\n';
    return EXIT_FAILURE;
  }

  // Freeze paired captures from untouched randomized inventories. These
  // are recognition regressions, not locator fixtures: each uses the exact
  // annotated strip geometry and applies the same exposure, blur, JPEG,
  // sensor-noise, and downsampling sequence to two-line, one-line, and
  // missing-control twins.
  const auto applySeededCondition = [&](stripcv::test::Capture capture,
                                        double exposure,
                                        const cv::Vec3d& gains,
                                        int jpeg_quality, double scale,
                                        double blur_sigma,
                                        double noise_sigma,
                                        uint64_t noise_seed) {
    capture.rgb =
        stripcv::test::exposureAndCast(capture.rgb, exposure, gains);
    if (blur_sigma > 0.0) {
      const int radius = std::max(1, cvRound(2.5 * blur_sigma));
      cv::GaussianBlur(capture.rgb, capture.rgb,
                       cv::Size(2 * radius + 1, 2 * radius + 1), blur_sigma);
    }
    capture.rgb =
        stripcv::test::jpegRoundTrip(capture.rgb, jpeg_quality);
    capture.rgb =
        addDeterministicSensorNoise(capture.rgb, noise_sigma, noise_seed);
    return resizeCapture(capture, scale);
  };
  const auto verifySeededPair = [&](const char* label,
                                    const stripcv::test::StripOptions& base,
                                    double exposure,
                                    const cv::Vec3d& gains,
                                    int jpeg_quality, double scale,
                                    double blur_sigma,
                                    double noise_sigma,
                                    uint64_t noise_seed,
                                    bool require_two_line,
                                    bool require_one_line) {
    const auto makeCapture = [&](bool test_line, bool control_line) {
      stripcv::test::StripOptions options = base;
      options.test_line = test_line;
      options.control_line = control_line;
      return applySeededCondition(
          stripcv::test::makeCapture(options), exposure, gains, jpeg_quality,
          scale, blur_sigma, noise_sigma, noise_seed);
    };
    const stripcv::AnalysisResult two =
        analyzeKnownGeometry(makeCapture(true, true), assay);
    const stripcv::AnalysisResult one =
        analyzeKnownGeometry(makeCapture(false, true), assay);
    const stripcv::AnalysisResult missing =
        analyzeKnownGeometry(makeCapture(true, false), assay);
    const bool wrong_two = stripcv::test::reportableOneLine(two) ||
                           (require_two_line &&
                            !stripcv::test::reportableTwoLine(two));
    const bool wrong_one =
        (one.status == "valid" &&
         !stripcv::test::reportableOneLine(one)) ||
        (require_one_line && !stripcv::test::reportableOneLine(one));
    if (wrong_two || wrong_one || missing.status == "valid") {
      std::cerr << label << " paired recognition regression failed: two="
                << stripcv::test::diagnostic(two) << " one="
                << stripcv::test::diagnostic(one) << " missing="
                << stripcv::test::diagnostic(missing) << '\n';
      return false;
    }
    return true;
  };

  const auto verifySeededAutomaticOneLine =
      [&](const char* label, stripcv::test::StripOptions options,
          stripcv::Quad scaled_geometry, double exposure,
          const cv::Vec3d& gains, int jpeg_quality, double scale,
          double blur_sigma, double noise_sigma, uint64_t noise_seed) {
        options.test_line = false;
        for (cv::Point2f& point : scaled_geometry) {
          point *= static_cast<float>(1.0 / scale);
        }
        const stripcv::test::Capture capture = applySeededCondition(
            stripcv::test::makeCapture(options, scaled_geometry), exposure,
            gains, jpeg_quality, scale, blur_sigma, noise_sigma, noise_seed);
        const stripcv::AnalysisResult automatic =
            stripcv::Analyzer().analyze(capture.rgb, assay);
        const stripcv::AnalysisResult known =
            analyzeKnownGeometry(capture, assay);
        if (!stripcv::test::reportableOneLine(automatic) ||
            !stripcv::test::reportableOneLine(known)) {
          std::cerr << label << " one-line coverage regression failed: auto="
                    << stripcv::test::diagnostic(automatic) << " known="
                    << stripcv::test::diagnostic(known) << '\n';
          return false;
        }
        return true;
      };

  const auto verifySeededAutomaticPair =
      [&](const char* label, const stripcv::test::StripOptions& base,
          stripcv::Quad scaled_geometry, double exposure,
          const cv::Vec3d& gains, int jpeg_quality, double scale,
          double blur_sigma, double noise_sigma, uint64_t noise_seed,
          bool require_two_line, bool require_one_line) {
        for (cv::Point2f& point : scaled_geometry) {
          point *= static_cast<float>(1.0 / scale);
        }
        const auto makeCapture = [&](bool test_line, bool control_line) {
          stripcv::test::StripOptions options = base;
          options.test_line = test_line;
          options.control_line = control_line;
          return applySeededCondition(
              stripcv::test::makeCapture(options, scaled_geometry), exposure,
              gains, jpeg_quality, scale, blur_sigma, noise_sigma,
              noise_seed);
        };
        const auto safePair = [&](const char* mode,
                                  const stripcv::AnalysisResult& two,
                                  const stripcv::AnalysisResult& one,
                                  const stripcv::AnalysisResult& missing) {
          const bool wrong_two = stripcv::test::reportableOneLine(two) ||
                                 (require_two_line &&
                                  !stripcv::test::reportableTwoLine(two));
          const bool wrong_one = stripcv::test::reportableTwoLine(one) ||
                                 (require_one_line &&
                                  !stripcv::test::reportableOneLine(one));
          if (wrong_two || wrong_one || missing.status == "valid") {
            std::cerr << label << ' ' << mode
                      << " paired recognition regression failed: two="
                      << stripcv::test::diagnostic(two) << " one="
                      << stripcv::test::diagnostic(one) << " missing="
                      << stripcv::test::diagnostic(missing) << '\n';
            return false;
          }
          return true;
        };
        const stripcv::test::Capture two_capture = makeCapture(true, true);
        const stripcv::test::Capture one_capture = makeCapture(false, true);
        const stripcv::test::Capture missing_capture = makeCapture(true, false);
        return safePair("automatic",
                        stripcv::Analyzer().analyze(two_capture.rgb, assay),
                        stripcv::Analyzer().analyze(one_capture.rgb, assay),
                        stripcv::Analyzer().analyze(missing_capture.rgb, assay)) &&
               safePair("known", analyzeKnownGeometry(two_capture, assay),
                        analyzeKnownGeometry(one_capture, assay),
                        analyzeKnownGeometry(missing_capture, assay));
      };

  const auto verifySeededArtifact =
      [&](const char* label,
          const stripcv::test::StripOptions& artifact_options,
          const stripcv::test::StripOptions& matched_line_options,
          const stripcv::Quad& scaled_geometry, double exposure,
          const cv::Vec3d& gains, int jpeg_quality, double scale,
          double blur_sigma, double noise_sigma, uint64_t noise_seed) {
        stripcv::Quad source_geometry = scaled_geometry;
        for (cv::Point2f& point : source_geometry) {
          point *= static_cast<float>(1.0 / scale);
        }
        const auto makeCapture = [&](const stripcv::test::StripOptions& options) {
          return applySeededCondition(
              stripcv::test::makeCapture(options, source_geometry), exposure,
              gains, jpeg_quality, scale, blur_sigma, noise_sigma,
              noise_seed);
        };
        const stripcv::test::Capture artifact =
            makeCapture(artifact_options);
        const stripcv::test::Capture matched =
            makeCapture(matched_line_options);
        const stripcv::AnalysisResult artifact_automatic =
            stripcv::Analyzer().analyze(artifact.rgb, assay);
        const stripcv::AnalysisResult artifact_known =
            analyzeKnownGeometry(artifact, assay);
        const stripcv::AnalysisResult matched_automatic =
            stripcv::Analyzer().analyze(matched.rgb, assay);
        const stripcv::AnalysisResult matched_known =
            analyzeKnownGeometry(matched, assay);
        if (artifact_automatic.status == "valid" ||
            artifact_known.status == "valid" ||
            !stripcv::test::reportableTwoLine(matched_automatic) ||
            !stripcv::test::reportableTwoLine(matched_known)) {
          std::cerr << label << " artifact guard lost selectivity: auto_bad="
                    << stripcv::test::diagnostic(artifact_automatic)
                    << " known_bad="
                    << stripcv::test::diagnostic(artifact_known)
                    << " auto_line="
                    << stripcv::test::diagnostic(matched_automatic)
                    << " known_line="
                    << stripcv::test::diagnostic(matched_known) << '\n';
          return false;
        }
        return true;
      };

  // Untouched invalid inventories exposed two broad-stain boundary cases and
  // one coalesced T/extra-line case. Freeze the exact automatic and annotated
  // geometry paths alongside matched ordinary two-line captures. The guards
  // may only add an abstention; they must not erase recognizable C/T bands.
  stripcv::test::StripOptions strong_near_broad_stain_25;
  strong_near_broad_stain_25.control_position = 0.14260452;
  strong_near_broad_stain_25.test_position = 0.27599610;
  strong_near_broad_stain_25.control_strength = 0.37366801;
  strong_near_broad_stain_25.test_strength = 0.09222214;
  strong_near_broad_stain_25.control_width_factor = 0.88362109;
  strong_near_broad_stain_25.test_width_factor = 0.91027403;
  strong_near_broad_stain_25.control_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);
  strong_near_broad_stain_25.test_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);
  strong_near_broad_stain_25.broad_test_stain = true;
  stripcv::test::StripOptions strong_near_line_25 =
      strong_near_broad_stain_25;
  strong_near_line_25.broad_test_stain = false;

  stripcv::test::StripOptions coalesced_extra_25;
  coalesced_extra_25.control_position = 0.14957767;
  coalesced_extra_25.test_position = 0.30467984;
  coalesced_extra_25.control_strength = 0.40898734;
  coalesced_extra_25.test_strength = 0.11926390;
  coalesced_extra_25.control_width_factor = 1.09716168;
  coalesced_extra_25.test_width_factor = 0.81811622;
  coalesced_extra_25.control_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  coalesced_extra_25.test_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  coalesced_extra_25.extra_line = true;
  stripcv::test::StripOptions coalesced_line_25 = coalesced_extra_25;
  coalesced_line_25.extra_line = false;

  stripcv::test::StripOptions diffuse_broad_stain_26;
  diffuse_broad_stain_26.control_position = 0.10436512;
  diffuse_broad_stain_26.test_position = 0.22286640;
  diffuse_broad_stain_26.control_strength = 0.37217383;
  diffuse_broad_stain_26.test_strength = 0.11013108;
  diffuse_broad_stain_26.control_width_factor = 1.22182260;
  diffuse_broad_stain_26.test_width_factor = 1.02831417;
  diffuse_broad_stain_26.bright_paper = true;
  diffuse_broad_stain_26.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  diffuse_broad_stain_26.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  diffuse_broad_stain_26.broad_test_stain = true;
  stripcv::test::StripOptions diffuse_line_26 = diffuse_broad_stain_26;
  diffuse_line_26.broad_test_stain = false;

  stripcv::test::StripOptions noisy_broad_stain_27;
  noisy_broad_stain_27.control_position = 0.14424666;
  noisy_broad_stain_27.test_position = 0.29742179;
  noisy_broad_stain_27.control_strength = 0.25828323;
  noisy_broad_stain_27.test_strength = 0.08173228;
  noisy_broad_stain_27.control_width_factor = 1.39458978;
  noisy_broad_stain_27.test_width_factor = 0.99667244;
  noisy_broad_stain_27.bright_paper = true;
  noisy_broad_stain_27.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  noisy_broad_stain_27.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  noisy_broad_stain_27.broad_test_stain = true;
  stripcv::test::StripOptions noisy_line_27 = noisy_broad_stain_27;
  noisy_line_27.broad_test_stain = false;

  stripcv::test::StripOptions coalesced_extra_28;
  coalesced_extra_28.control_position = 0.15825004;
  coalesced_extra_28.test_position = 0.29579430;
  coalesced_extra_28.control_strength = 0.41936837;
  coalesced_extra_28.test_strength = 0.20829767;
  coalesced_extra_28.control_width_factor = 1.50406615;
  coalesced_extra_28.test_width_factor = 0.88005682;
  coalesced_extra_28.control_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  coalesced_extra_28.test_dye_rgb = cv::Vec3d(196.0, 52.0, 92.0);
  coalesced_extra_28.extra_line = true;
  stripcv::test::StripOptions coalesced_line_28 = coalesced_extra_28;

  // Seed 35 exposed an over-expanded nested envelope that hid a displaced,
  // partial-height T and produced a false one-line report. Freeze the exact
  // automatic and annotated paths against its matched full-height line.
  stripcv::test::StripOptions displaced_partial_35;
  displaced_partial_35.control_position = 0.13780830;
  displaced_partial_35.test_position = 0.24348976;
  displaced_partial_35.control_strength = 0.34480810;
  displaced_partial_35.test_strength = 0.33784014;
  displaced_partial_35.control_width_factor = 1.18361191;
  displaced_partial_35.test_width_factor = 0.80877663;
  displaced_partial_35.test_vertical_fraction = 0.20073249;
  displaced_partial_35.test_vertical_center = 0.20349252;
  displaced_partial_35.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  displaced_partial_35.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  stripcv::test::StripOptions displaced_full_35 = displaced_partial_35;
  displaced_full_35.test_vertical_fraction = -1.0;
  displaced_full_35.test_vertical_center = 0.5;

  // Seed 37 produced a very weak broad stain whose baseline-fitted center was
  // narrow despite a six-line-width transverse deposit. Keep the exact stain
  // abstaining while its ordinary line twin remains reportable.
  stripcv::test::StripOptions narrow_fit_broad_37;
  narrow_fit_broad_37.control_position = 0.13640968;
  narrow_fit_broad_37.test_position = 0.24884285;
  narrow_fit_broad_37.control_strength = 0.24270473;
  narrow_fit_broad_37.test_strength = 0.09251424;
  narrow_fit_broad_37.control_width_factor = 0.98185018;
  narrow_fit_broad_37.test_width_factor = 1.27003225;
  narrow_fit_broad_37.bright_paper = true;
  narrow_fit_broad_37.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  narrow_fit_broad_37.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  narrow_fit_broad_37.broad_test_stain = true;
  stripcv::test::StripOptions narrow_fit_line_37 = narrow_fit_broad_37;
  narrow_fit_line_37.broad_test_stain = false;

  // Seed 39 reached the relaxed row-coverage boundary with a displaced 37%
  // T. Two transverse slices are insufficient for reportability; its matched
  // full-height line must continue to pass in automatic and override modes.
  stripcv::test::StripOptions displaced_partial_39;
  displaced_partial_39.control_position = 0.11779061;
  displaced_partial_39.test_position = 0.25928690;
  displaced_partial_39.control_strength = 0.24659678;
  displaced_partial_39.test_strength = 0.06994221;
  displaced_partial_39.control_width_factor = 1.26747787;
  displaced_partial_39.test_width_factor = 0.73665961;
  displaced_partial_39.test_vertical_fraction = 0.37372871;
  displaced_partial_39.test_vertical_center = 0.63315134;
  displaced_partial_39.bright_paper = true;
  displaced_partial_39.control_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);
  displaced_partial_39.test_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);
  stripcv::test::StripOptions displaced_full_39 = displaced_partial_39;
  displaced_full_39.test_vertical_fraction = -1.0;
  displaced_full_39.test_vertical_center = 0.5;

  // Seed 42 exposed a weak, moderately broad stain that spanned the membrane
  // but measured more than two expected line widths in every independent
  // height slice. Its ordinary deposited-line twin remains compact.
  stripcv::test::StripOptions moderate_broad_stain_42;
  moderate_broad_stain_42.control_position = 0.15986962;
  moderate_broad_stain_42.test_position = 0.30834899;
  moderate_broad_stain_42.control_strength = 0.34896084;
  moderate_broad_stain_42.test_strength = 0.08757466;
  moderate_broad_stain_42.control_width_factor = 1.29845631;
  moderate_broad_stain_42.test_width_factor = 1.14395745;
  moderate_broad_stain_42.bright_paper = true;
  moderate_broad_stain_42.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  moderate_broad_stain_42.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  moderate_broad_stain_42.broad_test_stain = true;
  stripcv::test::StripOptions moderate_line_42 = moderate_broad_stain_42;
  moderate_line_42.broad_test_stain = false;

  // Seed 43 placed a weak control in only 31.5% of the membrane height. Row
  // texture lifted aggregate coverage above 0.55, but it occupied only two
  // transverse slices and lacked outer-band support. The full-height control
  // twin must remain a reportable two-line strip.
  stripcv::test::StripOptions partial_control_43;
  partial_control_43.control_position = 0.11949927;
  partial_control_43.test_position = 0.25672326;
  partial_control_43.control_strength = 0.09071396;
  partial_control_43.test_strength = 0.24087856;
  partial_control_43.control_width_factor = 0.85122922;
  partial_control_43.test_width_factor = 1.31109385;
  partial_control_43.control_vertical_fraction = 0.31547352;
  partial_control_43.control_vertical_center = 0.23103557;
  partial_control_43.control_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);
  partial_control_43.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  stripcv::test::StripOptions full_control_43 = partial_control_43;
  full_control_43.control_vertical_fraction = -1.0;
  full_control_43.control_vertical_center = 0.5;

  // Seed 44 produced a one-sided control-tail deblend over a smooth broad
  // stain. Although the synthesized 1-D candidate has expected line width,
  // the underlying deposit is six widths across in all height slices.
  stripcv::test::StripOptions deblended_broad_stain_44;
  deblended_broad_stain_44.control_position = 0.10910334;
  deblended_broad_stain_44.test_position = 0.20036675;
  deblended_broad_stain_44.control_strength = 0.26726967;
  deblended_broad_stain_44.test_strength = 0.09059774;
  deblended_broad_stain_44.control_width_factor = 1.30332145;
  deblended_broad_stain_44.test_width_factor = 0.71443054;
  deblended_broad_stain_44.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  deblended_broad_stain_44.test_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  deblended_broad_stain_44.broad_test_stain = true;
  stripcv::test::StripOptions deblended_line_44 =
      deblended_broad_stain_44;
  deblended_line_44.broad_test_stain = false;

  // Seed 46 exposed a stronger smooth stain whose fitted 1-D center looked
  // compact and symmetric. The actual deposit occupied more than seven line
  // widths in every independent height slice and left dense shoulders.
  stripcv::test::StripOptions diffuse_off_core_stain_46;
  diffuse_off_core_stain_46.control_position = 0.13171167;
  diffuse_off_core_stain_46.test_position = 0.24578456;
  diffuse_off_core_stain_46.control_strength = 0.34193926;
  diffuse_off_core_stain_46.test_strength = 0.13413120;
  diffuse_off_core_stain_46.control_width_factor = 1.05945098;
  diffuse_off_core_stain_46.test_width_factor = 1.31194225;
  diffuse_off_core_stain_46.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  diffuse_off_core_stain_46.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  diffuse_off_core_stain_46.broad_test_stain = true;
  stripcv::test::StripOptions diffuse_line_46 = diffuse_off_core_stain_46;
  diffuse_line_46.broad_test_stain = false;

  // Seed 54 also exposed an extra result line almost coincident with T. The
  // merged peak is symmetric and line-sized, so the registered downstream
  // locus plus disproportionate T/C area must retain it as invalid. Its
  // matched ordinary two-line strip remains reportable.
  stripcv::test::StripOptions coincident_extra_line_54;
  coincident_extra_line_54.control_position = 0.15809942;
  coincident_extra_line_54.test_position = 0.31435434;
  coincident_extra_line_54.control_strength = 0.34984493;
  coincident_extra_line_54.test_strength = 0.18295719;
  coincident_extra_line_54.control_width_factor = 0.95942434;
  coincident_extra_line_54.test_width_factor = 1.16540617;
  coincident_extra_line_54.control_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  coincident_extra_line_54.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  coincident_extra_line_54.extra_line = true;
  stripcv::test::StripOptions coincident_line_54 = coincident_extra_line_54;
  coincident_line_54.extra_line = false;

  // Seed 38 also exposed an automatic-crop ripple whose aggregate FWHM looked
  // line-sized although all transverse slices were physically too narrow.
  // Freeze the line-free artifact against its strong matched two-line image.
  stripcv::test::StripOptions transverse_ripple_line_38;
  transverse_ripple_line_38.control_position = 0.13171995;
  transverse_ripple_line_38.test_position = 0.27285088;
  transverse_ripple_line_38.control_strength = 0.21778984;
  transverse_ripple_line_38.test_strength = 0.18939266;
  transverse_ripple_line_38.control_width_factor = 0.91161740;
  transverse_ripple_line_38.test_width_factor = 1.62062000;
  transverse_ripple_line_38.control_vertical_gradient = -0.11632808;
  transverse_ripple_line_38.test_vertical_gradient = 0.23560413;
  transverse_ripple_line_38.control_vertical_modulation = 0.18623845;
  transverse_ripple_line_38.test_vertical_modulation = 0.10790719;
  transverse_ripple_line_38.control_vertical_phase = 0.88958181;
  transverse_ripple_line_38.test_vertical_phase = 0.04647824;
  transverse_ripple_line_38.control_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);
  transverse_ripple_line_38.test_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);
  stripcv::test::StripOptions transverse_ripple_one_38 =
      transverse_ripple_line_38;
  transverse_ripple_one_38.test_line = false;
  coalesced_line_28.extra_line = false;

  // Seed 64 exposed a six-line-width T-region stain whose compressed 1-D fit
  // looked only 1.66 lines wide. Its three transverse slices remain 2.41 to
  // 2.98 lines wide, unlike the matched ordinary deposited T.
  stripcv::test::StripOptions dense_broad_stain_64;
  dense_broad_stain_64.control_position = 0.11581805;
  dense_broad_stain_64.test_position = 0.23009216;
  dense_broad_stain_64.control_strength = 0.24403774;
  dense_broad_stain_64.test_strength = 0.08476505;
  dense_broad_stain_64.control_width_factor = 1.10363587;
  dense_broad_stain_64.test_width_factor = 0.94124417;
  dense_broad_stain_64.control_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);
  dense_broad_stain_64.test_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);
  dense_broad_stain_64.broad_test_stain = true;
  stripcv::test::StripOptions dense_line_64 = dense_broad_stain_64;
  dense_line_64.broad_test_stain = false;

  // Seed 65 exposed a projective extra result line that replaced the intended
  // T in recovered C/T assignment. Rectification moved the synthesized 0.32
  // line slightly beyond the old half-line registered tolerance; the matched
  // ordinary C/T strip must remain reportable.
  stripcv::test::StripOptions shifted_extra_line_65;
  shifted_extra_line_65.control_position = 0.15724170;
  shifted_extra_line_65.test_position = 0.26205699;
  shifted_extra_line_65.control_strength = 0.38895302;
  shifted_extra_line_65.test_strength = 0.12679866;
  shifted_extra_line_65.control_width_factor = 0.86276058;
  shifted_extra_line_65.test_width_factor = 1.49447211;
  shifted_extra_line_65.bright_paper = true;
  shifted_extra_line_65.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  shifted_extra_line_65.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  shifted_extra_line_65.extra_line = true;
  stripcv::test::StripOptions shifted_line_65 = shifted_extra_line_65;
  shifted_line_65.extra_line = false;

  // Seed 66 exposed a clearly asymmetric extra-line peak at the registered
  // downstream locus whose area was 1.29x C, just below the older 1.30x
  // ambiguity boundary. Its ordinary C/T neighbor remains reportable.
  stripcv::test::StripOptions asymmetric_extra_line_66;
  asymmetric_extra_line_66.control_position = 0.13213468;
  asymmetric_extra_line_66.test_position = 0.26722597;
  asymmetric_extra_line_66.control_strength = 0.41370591;
  asymmetric_extra_line_66.test_strength = 0.20795054;
  asymmetric_extra_line_66.control_width_factor = 1.44593006;
  asymmetric_extra_line_66.test_width_factor = 1.35764723;
  asymmetric_extra_line_66.control_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  asymmetric_extra_line_66.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  asymmetric_extra_line_66.extra_line = true;
  stripcv::test::StripOptions asymmetric_line_66 = asymmetric_extra_line_66;
  asymmetric_line_66.extra_line = false;

  // Seed 73 exposed a high-SNR six-line-width stain whose spatial correction
  // removed the diffuse tails and left a symmetric 2.22-line fitted core.
  // All three independent height slices still span 2.41 lines. The matched
  // ordinary deposited T uses the same geometry and capture degradation.
  stripcv::test::StripOptions uniform_broad_stain_73;
  uniform_broad_stain_73.control_position = 0.15118191;
  uniform_broad_stain_73.test_position = 0.25799985;
  uniform_broad_stain_73.control_strength = 0.30246416;
  uniform_broad_stain_73.test_strength = 0.09561414;
  uniform_broad_stain_73.control_width_factor = 0.91587430;
  uniform_broad_stain_73.test_width_factor = 1.18452082;
  uniform_broad_stain_73.bright_paper = true;
  uniform_broad_stain_73.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  uniform_broad_stain_73.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  uniform_broad_stain_73.broad_test_stain = true;
  stripcv::test::StripOptions uniform_line_73 = uniform_broad_stain_73;
  uniform_line_73.broad_test_stain = false;
  uniform_line_73.test_strength = 0.25;

  // Seed 79 exposed a smooth six-line-width stain whose corrected center was
  // compact in both the aggregate profile and three transverse slices. The
  // diffuse deposit remains visible as a strong off-core shoulder 1.75-2.5
  // line widths downstream; an ordinary deposited T does not.
  stripcv::test::StripOptions compact_core_stain_79;
  compact_core_stain_79.control_position = 0.11464469;
  compact_core_stain_79.test_position = 0.26548770;
  compact_core_stain_79.control_strength = 0.32580053;
  compact_core_stain_79.test_strength = 0.08512316;
  compact_core_stain_79.control_width_factor = 1.14714810;
  compact_core_stain_79.test_width_factor = 0.71000596;
  compact_core_stain_79.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  compact_core_stain_79.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  compact_core_stain_79.broad_test_stain = true;
  stripcv::test::StripOptions compact_line_79 = compact_core_stain_79;
  compact_line_79.broad_test_stain = false;
  compact_line_79.test_strength = 0.25;

  stripcv::test::StripOptions transverse_stain_83;
  transverse_stain_83.control_position = 0.14459707;
  transverse_stain_83.test_position = 0.25157833;
  transverse_stain_83.control_strength = 0.41676361;
  transverse_stain_83.test_strength = 0.08340906;
  transverse_stain_83.control_width_factor = 1.13300760;
  transverse_stain_83.test_width_factor = 1.14215415;
  transverse_stain_83.bright_paper = true;
  transverse_stain_83.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  transverse_stain_83.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  transverse_stain_83.broad_test_stain = true;
  stripcv::test::StripOptions transverse_line_83 = transverse_stain_83;
  transverse_line_83.broad_test_stain = false;
  transverse_line_83.test_strength = 0.25;

  stripcv::test::StripOptions transverse_stain_84;
  transverse_stain_84.control_position = 0.12029856;
  transverse_stain_84.test_position = 0.24317184;
  transverse_stain_84.control_strength = 0.41190439;
  transverse_stain_84.test_strength = 0.15682583;
  transverse_stain_84.control_width_factor = 0.80517327;
  transverse_stain_84.test_width_factor = 1.41215129;
  transverse_stain_84.bright_paper = true;
  transverse_stain_84.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  transverse_stain_84.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  transverse_stain_84.broad_test_stain = true;
  stripcv::test::StripOptions transverse_line_84 = transverse_stain_84;
  transverse_line_84.broad_test_stain = false;
  transverse_line_84.test_strength = 0.25;

  // Seed 94 exposed a compact-looking core inside a broad T-region stain.
  // The fitted FWHM was only 1.09 expected widths, but every transverse slice
  // and the off-core shoulder still contained diffuse material. Freeze it
  // against the same capture with an ordinary deposited T.
  stripcv::test::StripOptions compact_broad_stain_94;
  compact_broad_stain_94.control_position = 0.13067535;
  compact_broad_stain_94.test_position = 0.24225448;
  compact_broad_stain_94.control_strength = 0.38117868;
  compact_broad_stain_94.test_strength = 0.12471699;
  compact_broad_stain_94.control_width_factor = 0.77484669;
  compact_broad_stain_94.test_width_factor = 0.70389188;
  compact_broad_stain_94.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  compact_broad_stain_94.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  compact_broad_stain_94.broad_test_stain = true;
  stripcv::test::StripOptions compact_line_94 = compact_broad_stain_94;
  compact_line_94.broad_test_stain = false;

  // Seed 96 exposed a displaced mark occupying only 38% of the membrane
  // height. Three local fits existed, but one outer band lacked the support
  // seen in the exact full-height neighbor.
  stripcv::test::StripOptions displaced_partial_96;
  displaced_partial_96.control_position = 0.15494732;
  displaced_partial_96.test_position = 0.28874364;
  displaced_partial_96.control_strength = 0.25915677;
  displaced_partial_96.test_strength = 0.24872294;
  displaced_partial_96.control_width_factor = 1.04880236;
  displaced_partial_96.test_width_factor = 0.79139797;
  displaced_partial_96.test_vertical_fraction = 0.37954819;
  displaced_partial_96.test_vertical_center = 0.22421776;
  displaced_partial_96.control_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  displaced_partial_96.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  stripcv::test::StripOptions displaced_full_96 = displaced_partial_96;
  displaced_full_96.test_vertical_fraction = -1.0;
  displaced_full_96.test_vertical_center = 0.5;

  // Seed 145 exposed a shifted 23.5%-height T just outside the nominal
  // partial-run search. It must never become a reportable one-line result;
  // the otherwise identical full-height band remains a two-line control.
  stripcv::test::StripOptions shifted_partial_145;
  shifted_partial_145.control_position = 0.10490769;
  shifted_partial_145.test_position = 0.24843837;
  shifted_partial_145.control_strength = 0.39305487;
  shifted_partial_145.test_strength = 0.12917097;
  shifted_partial_145.control_width_factor = 0.85927371;
  shifted_partial_145.test_width_factor = 1.36588104;
  shifted_partial_145.test_vertical_fraction = 0.23516301;
  shifted_partial_145.test_vertical_center = 0.19629683;
  shifted_partial_145.bright_paper = true;
  shifted_partial_145.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  shifted_partial_145.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  stripcv::test::StripOptions shifted_full_145 = shifted_partial_145;
  shifted_full_145.test_vertical_fraction = -1.0;
  shifted_full_145.test_vertical_center = 0.5;

  // Seed 102 exposed a lower-material centered partial T whose row-local
  // correction inflated aggregate coverage above 60%. The physical source
  // still occupies only 37% of membrane height and lacks full outer-band
  // support; freeze it against an otherwise identical full-height T.
  stripcv::test::StripOptions weak_edge_partial_102;
  weak_edge_partial_102.control_position = 0.12596208;
  weak_edge_partial_102.test_position = 0.28511505;
  weak_edge_partial_102.control_strength = 0.33486884;
  weak_edge_partial_102.test_strength = 0.10402333;
  weak_edge_partial_102.control_width_factor = 1.51303765;
  weak_edge_partial_102.test_width_factor = 0.74965888;
  weak_edge_partial_102.test_vertical_fraction = 0.37174523;
  weak_edge_partial_102.test_vertical_center = 0.52131480;
  weak_edge_partial_102.bright_paper = true;
  weak_edge_partial_102.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  weak_edge_partial_102.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  stripcv::test::StripOptions weak_edge_full_102 = weak_edge_partial_102;
  weak_edge_full_102.test_vertical_fraction = -1.0;
  weak_edge_full_102.test_vertical_center = 0.5;

  // Seed 113 exposed a broad T-region deposit whose corrected center looked
  // line-sized. Preserve the exact diffuse deposit beside the ordinary line
  // rendered with identical geometry and degradation.
  stripcv::test::StripOptions compact_broad_stain_113;
  compact_broad_stain_113.control_position = 0.10281771;
  compact_broad_stain_113.test_position = 0.20753689;
  compact_broad_stain_113.control_strength = 0.35148550;
  compact_broad_stain_113.test_strength = 0.14521726;
  compact_broad_stain_113.control_width_factor = 0.96490040;
  compact_broad_stain_113.test_width_factor = 1.50018493;
  compact_broad_stain_113.bright_paper = true;
  compact_broad_stain_113.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  compact_broad_stain_113.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  compact_broad_stain_113.broad_test_stain = true;
  stripcv::test::StripOptions compact_line_113 = compact_broad_stain_113;
  compact_line_113.broad_test_stain = false;

  // Seed 110's later invalid inventory exposed a broad deposit close enough
  // to C for tail deblending to synthesize a narrow, high-SNR T. Freeze the
  // exact automatic/known-geometry artifact and its ordinary line control.
  stripcv::test::StripOptions deblended_broad_stain_110;
  deblended_broad_stain_110.control_position = 0.10693928;
  deblended_broad_stain_110.test_position = 0.19725802;
  deblended_broad_stain_110.control_strength = 0.33125779;
  deblended_broad_stain_110.test_strength = 0.13487697;
  deblended_broad_stain_110.control_width_factor = 1.28474948;
  deblended_broad_stain_110.test_width_factor = 0.88702283;
  deblended_broad_stain_110.bright_paper = true;
  deblended_broad_stain_110.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  deblended_broad_stain_110.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  deblended_broad_stain_110.broad_test_stain = true;
  stripcv::test::StripOptions deblended_line_110 =
      deblended_broad_stain_110;
  deblended_line_110.broad_test_stain = false;

  // Seed 128 exposed a broad deposit whose spatially corrected center looked
  // compact enough for inner-region pair recovery. Freeze both geometry paths
  // and an otherwise identical ordinary line before tightening that recovery.
  stripcv::test::StripOptions recovered_broad_stain_128;
  recovered_broad_stain_128.control_position = 0.13112064;
  recovered_broad_stain_128.test_position = 0.26768837;
  recovered_broad_stain_128.control_strength = 0.38936351;
  recovered_broad_stain_128.test_strength = 0.08155215;
  recovered_broad_stain_128.control_width_factor = 1.41774003;
  recovered_broad_stain_128.test_width_factor = 1.10986287;
  recovered_broad_stain_128.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  recovered_broad_stain_128.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  recovered_broad_stain_128.broad_test_stain = true;
  stripcv::test::StripOptions recovered_line_128 = recovered_broad_stain_128;
  recovered_line_128.broad_test_stain = false;

  // Seed 137 exposed a weak partial-height T recovered from the inner region.
  // The otherwise identical full-height deposit must remain a valid line.
  stripcv::test::StripOptions recovered_partial_137;
  recovered_partial_137.control_position = 0.15476127;
  recovered_partial_137.test_position = 0.26391240;
  recovered_partial_137.control_strength = 0.27989725;
  recovered_partial_137.test_strength = 0.03092079;
  recovered_partial_137.control_width_factor = 0.72204384;
  recovered_partial_137.test_width_factor = 1.51265299;
  recovered_partial_137.test_vertical_fraction = 0.35651948;
  recovered_partial_137.test_vertical_center = 0.81929855;
  recovered_partial_137.control_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  recovered_partial_137.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  stripcv::test::StripOptions recovered_full_137 = recovered_partial_137;
  recovered_full_137.test_vertical_fraction = -1.0;
  recovered_full_137.test_vertical_center = 0.5;

  // Seed 114 exposed an in-window partial T occupying only 30% of membrane
  // height. Ordered pair recovery must not override the physical-height gate;
  // the otherwise identical full-height band remains reportable.
  stripcv::test::StripOptions ordered_partial_114;
  ordered_partial_114.control_position = 0.10185353;
  ordered_partial_114.test_position = 0.21835955;
  ordered_partial_114.control_strength = 0.27590068;
  ordered_partial_114.test_strength = 0.08120930;
  ordered_partial_114.control_width_factor = 0.73126155;
  ordered_partial_114.test_width_factor = 0.97704196;
  ordered_partial_114.test_vertical_fraction = 0.29588068;
  ordered_partial_114.test_vertical_center = 0.59522448;
  ordered_partial_114.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  ordered_partial_114.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  stripcv::test::StripOptions ordered_full_114 = ordered_partial_114;
  ordered_full_114.test_vertical_fraction = -1.0;
  ordered_full_114.test_vertical_center = 0.5;

  if (!verifySeededArtifact(
          "seed-25 strong near-broad stain", strong_near_broad_stain_25,
          strong_near_line_25,
          {cv::Point2f(83.16078186F, 132.54151917F),
           cv::Point2f(884.37030029F, 184.80474854F),
           cv::Point2f(902.35174561F, 344.60513306F),
           cv::Point2f(64.43044281F, 317.44927979F)},
          0.89253842, cv::Vec3d(1.01712334, 1.02495288, 0.92726757),
          60, 0.78465779, 0.56988566, 0.44022291,
          16012670310851480601ULL) ||
      !verifySeededArtifact(
          "seed-25 far coalesced extra line", coalesced_extra_25,
          coalesced_line_25,
          {cv::Point2f(67.18505096F, 174.35510254F),
           cv::Point2f(857.24053955F, 158.34663391F),
           cv::Point2f(856.77691650F, 316.32870483F),
           cv::Point2f(60.56421280F, 314.78540039F)},
          0.87462433, cv::Vec3d(0.93805807, 0.98430365, 1.03837135),
          61, 0.79158709, 0.77904281, 0.26047377,
          629558285296438990ULL) ||
      !verifySeededArtifact(
          "seed-26 transversely diffuse broad stain",
          diffuse_broad_stain_26, diffuse_line_26,
          {cv::Point2f(56.08458710F, 176.51768494F),
           cv::Point2f(806.87622070F, 168.04016113F),
           cv::Point2f(816.50573730F, 286.67349243F),
           cv::Point2f(70.74382782F, 328.59939575F)},
          0.81198912, cv::Vec3d(1.03925145, 0.95126737, 0.99067094),
          99, 0.67783038, 0.66835815, 0.41739994,
          10226785528388226214ULL) ||
      !verifySeededArtifact(
          "seed-27 noise-inflating broad stain", noisy_broad_stain_27,
          noisy_line_27,
          {cv::Point2f(97.21835327F, 192.95910645F),
           cv::Point2f(952.35351562F, 181.12280273F),
           cv::Point2f(944.22570801F, 352.31784058F),
           cv::Point2f(115.10317993F, 404.47967529F)},
          0.92431820, cv::Vec3d(0.98369322, 1.00779289, 1.01973539),
          72, 0.89558318, 0.45100410, 0.05100730,
          13452786533975836709ULL) ||
      !verifySeededArtifact(
          "seed-28 compact coalesced extra line", coalesced_extra_28,
          coalesced_line_28,
          {cv::Point2f(103.50169373F, 144.53503418F),
           cv::Point2f(914.01159668F, 198.22673035F),
           cv::Point2f(931.81970215F, 351.60256958F),
           cv::Point2f(108.22037506F, 310.09643555F)},
          0.94622451, cv::Vec3d(0.96430290, 1.00634224, 1.07175077),
          87, 0.76236467, 0.03894708, 1.31588102,
          5091507660981726344ULL) ||
      !verifySeededArtifact(
          "seed-35 displaced partial line", displaced_partial_35,
          displaced_full_35,
          {cv::Point2f(70.20100403F, 160.86601257F),
           cv::Point2f(930.51397705F, 179.14888000F),
           cv::Point2f(941.88977051F, 371.95950317F),
           cv::Point2f(72.62076569F, 311.35498047F)},
          0.99542426, cv::Vec3d(0.98147479, 0.98191972, 0.95882177),
          78, 0.81235073, 0.55917973, 1.06059408,
          5502065098228193016ULL) ||
      !verifySeededArtifact(
          "seed-37 narrow-fit broad stain", narrow_fit_broad_37,
          narrow_fit_line_37,
          {cv::Point2f(103.71185303F, 189.04158020F),
           cv::Point2f(932.24761963F, 186.52714539F),
           cv::Point2f(935.99877930F, 330.91690063F),
           cv::Point2f(87.55139923F, 343.06063843F)},
          0.87945605, cv::Vec3d(1.07899705, 0.99608643, 0.94147107),
          57, 0.83148150, 0.43464462, 0.03923024,
          4624987648146404775ULL) ||
      !verifySeededArtifact(
          "seed-39 displaced partial line", displaced_partial_39,
          displaced_full_39,
          {cv::Point2f(116.81185913F, 124.26470184F),
           cv::Point2f(758.18957520F, 135.81066895F),
           cv::Point2f(757.31805420F, 279.39752197F),
           cv::Point2f(130.47921753F, 261.93148804F)},
          0.86444411, cv::Vec3d(0.97812187, 1.03055056, 0.99728341),
          65, 0.69255108, 0.01357502, 1.06115536,
          11285387152469953835ULL) ||
      !verifySeededArtifact(
          "seed-42 moderately broad stain", moderate_broad_stain_42,
          moderate_line_42,
          {cv::Point2f(121.10553741F, 254.08615112F),
           cv::Point2f(1047.88366699F, 145.49902344F),
           cv::Point2f(1069.24963379F, 327.18954468F),
           cv::Point2f(106.07012939F, 412.55145264F)},
          0.89571453, cv::Vec3d(1.06967054, 0.97800615, 0.95906432),
          65, 0.89552587, 0.09295838, 0.37721720,
          2235577434773105863ULL) ||
      !verifySeededArtifact(
          "seed-43 partial control", partial_control_43, full_control_43,
          {cv::Point2f(158.79583740F, 234.84715271F),
           cv::Point2f(1066.66503906F, 260.82095337F),
           cv::Point2f(1061.13903809F, 460.84097290F),
           cv::Point2f(146.71881104F, 405.00454712F)},
          0.83051806, cv::Vec3d(1.06440885, 0.97488122, 1.07903037),
          79, 0.98232676, 0.73964727, 0.97737148,
          2457869228500299054ULL) ||
      !verifySeededArtifact(
          "seed-44 deblended broad stain", deblended_broad_stain_44,
          deblended_line_44,
          {cv::Point2f(154.22174072F, 184.91735840F),
           cv::Point2f(1131.91589355F, 181.99024963F),
           cv::Point2f(1147.46691895F, 372.78875732F),
           cv::Point2f(171.55386353F, 421.33859253F)},
          0.89202990, cv::Vec3d(0.92281133, 1.00744571, 1.04681861),
          81, 0.98638421, 0.13791041, 0.05923496,
          14899239458036250860ULL) ||
      !verifySeededArtifact(
          "seed-46 diffuse off-core stain", diffuse_off_core_stain_46,
          diffuse_line_46,
          {cv::Point2f(88.07508850F, 164.09689331F),
           cv::Point2f(830.76983643F, 186.50379944F),
           cv::Point2f(846.03436279F, 357.43258667F),
           cv::Point2f(84.10579681F, 338.34600830F)},
          0.91997449, cv::Vec3d(0.98042868, 1.03767606, 0.98474991),
          96, 0.73071309, 0.76697129, 0.03967101,
          13762588468660455676ULL) ||
      !verifySeededArtifact(
          "seed-54 coincident extra line", coincident_extra_line_54,
          coincident_line_54,
          {cv::Point2f(106.61038971F, 132.41886902F),
           cv::Point2f(828.07080078F, 196.70700073F),
           cv::Point2f(829.86029053F, 319.08087158F),
           cv::Point2f(120.36803436F, 270.97436523F)},
          0.81746722, cv::Vec3d(0.98159442, 0.95499868, 0.93320960),
          70, 0.70781892, 0.04840664, 0.76117997,
          18310453718425868207ULL) ||
      !verifySeededArtifact(
          "seed-38 transversely narrow line-free ripple",
          transverse_ripple_one_38, transverse_ripple_line_38,
          {cv::Point2f(112.67211151F, 148.09455872F),
           cv::Point2f(878.90954590F, 138.76370239F),
           cv::Point2f(875.99414062F, 315.56030273F),
           cv::Point2f(125.10613251F, 332.48889160F)},
          0.94682281, cv::Vec3d(0.98486143, 1.00427845, 0.94530552),
          60, 0.80808350, 0.80350138, 1.38664595,
          17500593556694047688ULL) ||
      !verifySeededArtifact(
          "seed-64 dense moderately broad stain", dense_broad_stain_64,
          dense_line_64,
          {cv::Point2f(145.13719177F, 155.87884521F),
           cv::Point2f(1190.71325684F, 185.86831665F),
           cv::Point2f(1213.97277832F, 374.87951660F),
           cv::Point2f(158.29649353F, 381.89706421F)},
          0.91849526, cv::Vec3d(1.03555266, 0.98069837, 1.05973759), 63,
          0.99532919, 0.05850745, 0.93579453,
          10863745115016258422ULL) ||
      !verifySeededArtifact(
          "seed-65 projectively shifted extra line", shifted_extra_line_65,
          shifted_line_65,
          {cv::Point2f(74.56875610F, 158.87593079F),
           cv::Point2f(932.41619873F, 129.24575806F),
           cv::Point2f(942.10174561F, 264.21377563F),
           cv::Point2f(82.77558899F, 291.06301880F)},
          0.89706257, cv::Vec3d(1.00158675, 0.98572167, 1.00562937), 77,
          0.79612232, 0.57785529, 1.04369766,
          7733331802139902129ULL) ||
      !verifySeededArtifact(
          "seed-66 asymmetric registered extra line", asymmetric_extra_line_66,
          asymmetric_line_66,
          {cv::Point2f(120.89711761F, 184.43208313F),
           cv::Point2f(974.27697754F, 222.57688904F),
           cv::Point2f(967.36303711F, 393.20449829F),
           cv::Point2f(116.27823639F, 382.33184814F)},
          0.98394708, cv::Vec3d(0.99642452, 0.96070269, 1.06835906), 80,
          0.88013267, 0.78393111, 0.64393825,
          8104643697665849865ULL) ||
      !verifySeededArtifact(
          "seed-73 uniformly broad high-SNR stain", uniform_broad_stain_73,
          uniform_line_73,
          {cv::Point2f(97.00993347F, 180.66993713F),
           cv::Point2f(834.24023438F, 185.70611572F),
           cv::Point2f(842.59735107F, 346.65078735F),
           cv::Point2f(108.09288025F, 311.93591309F)},
          0.82343554, cv::Vec3d(1.01943339, 1.02903845, 0.94558910), 56,
          0.76240914, 0.66732582, 1.32719701,
          2429488536443625992ULL) ||
      !verifySeededArtifact(
          "seed-79 compact-core off-shoulder stain", compact_core_stain_79,
          compact_line_79,
          {cv::Point2f(64.68795013F, 107.03039551F),
           cv::Point2f(734.56201172F, 132.95335388F),
           cv::Point2f(734.50122070F, 257.46304321F),
           cv::Point2f(61.86740494F, 231.95901489F)},
          0.93329817, cv::Vec3d(1.05588401, 1.04459931, 0.93385398), 81,
          0.67217564, 0.46489599, 1.20224795,
          9377543012317825944ULL) ||
      !verifySeededArtifact(
          "seed-83 transversely diffuse stain", transverse_stain_83,
          transverse_line_83,
          {cv::Point2f(160.64901733F, 230.12542725F),
           cv::Point2f(1150.90222168F, 230.14875793F),
           cv::Point2f(1164.61352539F, 411.72634888F),
           cv::Point2f(157.56098938F, 403.74185181F)},
          0.90344974, cv::Vec3d(1.04839420, 0.99813127, 0.96839591), 86,
          0.96549587, 0.60394157, 0.63937681,
          11796660232453858302ULL) ||
      !verifySeededArtifact(
          "seed-84 transversely diffuse stain", transverse_stain_84,
          transverse_line_84,
          {cv::Point2f(86.22586060F, 107.11708832F),
           cv::Point2f(770.68518066F, 140.96089172F),
           cv::Point2f(765.09326172F, 281.26367188F),
           cv::Point2f(84.68096161F, 232.90934753F)},
          0.97356869, cv::Vec3d(0.93515720, 1.00769162, 1.01922990), 55,
          0.67833620, 0.46838623, 0.01880193,
          11253797359400146936ULL) ||
      !verifySeededArtifact(
          "seed-94 compact-core broad stain", compact_broad_stain_94,
          compact_line_94,
          {cv::Point2f(72.45861053F, 184.55772400F),
           cv::Point2f(875.13806152F, 117.20611572F),
           cv::Point2f(887.20507812F, 244.94377136F),
           cv::Point2f(71.66710663F, 353.22833252F)},
          0.84375897, cv::Vec3d(0.98099837, 1.01052957, 0.98568804), 95,
          0.74835733, 0.05083581, 0.52327237,
          1709285286389321561ULL) ||
      !verifySeededArtifact(
          "seed-96 displaced partial line", displaced_partial_96,
          displaced_full_96,
          {cv::Point2f(55.89784241F, 138.23532104F),
           cv::Point2f(700.07482910F, 99.53977966F),
           cv::Point2f(703.57769775F, 252.15222168F),
           cv::Point2f(48.95906067F, 291.08789062F)},
          0.80791493, cv::Vec3d(0.94553279, 1.02488334, 1.07217577), 89,
          0.65050896, 0.15157889, 0.95122633,
          6168350584885593302ULL) ||
      !verifySeededArtifact(
          "seed-102 weak-edge partial line", weak_edge_partial_102,
          weak_edge_full_102,
          {cv::Point2f(97.07418823F, 125.78010559F),
           cv::Point2f(848.51049805F, 153.20242310F),
           cv::Point2f(831.02178955F, 284.14273071F),
           cv::Point2f(109.06052399F, 254.09234619F)},
          0.98721424, cv::Vec3d(0.96758066, 0.96138647, 0.97289213), 75,
          0.77629852, 0.07898075, 0.38957885,
          13875624741120521082ULL) ||
      !verifySeededArtifact(
          "seed-145 shifted partial line", shifted_partial_145,
          shifted_full_145,
          {cv::Point2f(95.04694366F, 203.45469666F),
           cv::Point2f(885.94366455F, 239.82434082F),
           cv::Point2f(892.92999268F, 387.35363770F),
           cv::Point2f(97.48582458F, 341.15386963F)},
          0.93383423, cv::Vec3d(0.94800187, 1.01064896, 1.01929644), 68,
          0.82006346, 0.79662256, 0.78661528,
          8602957058783527059ULL) ||
      !verifySeededArtifact(
          "seed-110 control-tail deblended broad stain",
          deblended_broad_stain_110, deblended_line_110,
          {cv::Point2f(110.47150421F, 266.93228149F),
           cv::Point2f(1107.58557129F, 261.41232300F),
           cv::Point2f(1100.13293457F, 470.55868530F),
           cv::Point2f(96.38324738F, 430.64584351F)},
          0.95550131, cv::Vec3d(0.94722740, 1.04231690, 1.02562309), 56,
          0.97216554, 0.26439240, 0.41885204,
          5337237033589855791ULL) ||
      !verifySeededArtifact(
          "seed-137 inner-recovered partial T", recovered_partial_137,
          recovered_full_137,
          {cv::Point2f(136.39660645F, 151.69477844F),
           cv::Point2f(812.73492432F, 202.26367188F),
           cv::Point2f(813.52221680F, 361.51028442F),
           cv::Point2f(137.36677551F, 277.54354858F)},
          0.93848325, cv::Vec3d(0.92344168, 0.96982948, 1.04198227), 58,
          0.75179198, 0.31761572, 0.48949554,
          15159653880056623886ULL) ||
      !verifySeededArtifact(
          "seed-128 inner-recovered broad stain", recovered_broad_stain_128,
          recovered_line_128,
          {cv::Point2f(73.54811859F, 160.24209595F),
           cv::Point2f(888.86181641F, 134.05566406F),
           cv::Point2f(904.40136719F, 293.48883057F),
           cv::Point2f(59.07367706F, 338.85861206F)},
          0.80730045, cv::Vec3d(1.04151472, 0.95103443, 1.02518969), 57,
          0.74819322, 0.78731097, 0.95411083,
          2995946723562341805ULL) ||
      !verifySeededArtifact(
          "seed-113 compact-core broad stain", compact_broad_stain_113,
          compact_line_113,
          {cv::Point2f(133.77076721F, 144.90643311F),
           cv::Point2f(975.28070068F, 214.76295471F),
           cv::Point2f(972.49005127F, 412.58847046F),
           cv::Point2f(132.49043274F, 314.50244141F)},
          0.81387638, cv::Vec3d(0.95259755, 0.99102187, 0.92747246), 62,
          0.89641146, 0.37897929, 1.09877833,
          10999715996097418447ULL) ||
      !verifySeededArtifact(
          "seed-114 ordered partial line", ordered_partial_114,
          ordered_full_114,
          {cv::Point2f(98.42801666F, 257.47937012F),
           cv::Point2f(1051.38415527F, 145.91979980F),
           cv::Point2f(1043.37731934F, 337.03509521F),
           cv::Point2f(114.03207397F, 417.67007446F)},
          0.91476803, cv::Vec3d(0.99653989, 1.00707339, 1.06600114), 76,
          0.95146178, 0.08166617, 1.39476277,
          15223075454645630284ULL)) {
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions recovered_missing_control_21;
  recovered_missing_control_21.control_position = 0.09774909;
  recovered_missing_control_21.test_position = 0.26395190;
  recovered_missing_control_21.control_strength = 0.40626433;
  recovered_missing_control_21.test_strength = 0.02519400;
  recovered_missing_control_21.control_width_factor = 1.48693279;
  recovered_missing_control_21.test_width_factor = 1.73851117;
  recovered_missing_control_21.control_vertical_gradient = 0.02301775;
  recovered_missing_control_21.test_vertical_gradient = -0.25317268;
  recovered_missing_control_21.control_vertical_modulation = 0.11637676;
  recovered_missing_control_21.test_vertical_modulation = 0.11368966;
  recovered_missing_control_21.control_vertical_phase = 0.56901177;
  recovered_missing_control_21.test_vertical_phase = 0.68909478;
  recovered_missing_control_21.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  recovered_missing_control_21.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);

  stripcv::test::StripOptions broad_control_deblend_22;
  broad_control_deblend_22.control_position = 0.11713832;
  broad_control_deblend_22.test_position = 0.27413226;
  broad_control_deblend_22.control_strength = 0.29229683;
  broad_control_deblend_22.test_strength = 0.39357117;
  broad_control_deblend_22.control_width_factor = 1.62693238;
  broad_control_deblend_22.test_width_factor = 1.78543936;
  broad_control_deblend_22.control_vertical_gradient = -0.15956627;
  broad_control_deblend_22.test_vertical_gradient = 0.00229708;
  broad_control_deblend_22.control_vertical_modulation = 0.18884196;
  broad_control_deblend_22.test_vertical_modulation = 0.08712122;
  broad_control_deblend_22.control_vertical_phase = 0.43369656;
  broad_control_deblend_22.test_vertical_phase = 0.26574971;
  broad_control_deblend_22.bright_paper = true;
  broad_control_deblend_22.control_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);
  broad_control_deblend_22.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);

  stripcv::test::StripOptions quiet_shifted_faint_22;
  quiet_shifted_faint_22.control_position = 0.10297479;
  quiet_shifted_faint_22.test_position = 0.30273352;
  quiet_shifted_faint_22.control_strength = 0.37643582;
  quiet_shifted_faint_22.test_strength = 0.03330670;
  quiet_shifted_faint_22.control_width_factor = 1.30980878;
  quiet_shifted_faint_22.test_width_factor = 1.18037141;
  quiet_shifted_faint_22.control_vertical_gradient = 0.36599708;
  quiet_shifted_faint_22.test_vertical_gradient = 0.37180735;
  quiet_shifted_faint_22.control_vertical_modulation = 0.23847216;
  quiet_shifted_faint_22.test_vertical_modulation = 0.06543707;
  quiet_shifted_faint_22.control_vertical_phase = 0.45330510;
  quiet_shifted_faint_22.test_vertical_phase = 0.40862753;
  quiet_shifted_faint_22.control_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  quiet_shifted_faint_22.test_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);

  stripcv::test::StripOptions recovered_missing_control_23;
  recovered_missing_control_23.control_position = 0.10426758;
  recovered_missing_control_23.test_position = 0.26352927;
  recovered_missing_control_23.control_strength = 0.26848650;
  recovered_missing_control_23.test_strength = 0.16694838;
  recovered_missing_control_23.control_width_factor = 1.30965719;
  recovered_missing_control_23.test_width_factor = 0.61597245;
  recovered_missing_control_23.control_vertical_gradient = 0.37105236;
  recovered_missing_control_23.test_vertical_gradient = -0.04167030;
  recovered_missing_control_23.control_vertical_modulation = 0.21807299;
  recovered_missing_control_23.test_vertical_modulation = 0.27779284;
  recovered_missing_control_23.control_vertical_phase = 0.06760986;
  recovered_missing_control_23.test_vertical_phase = 0.67313267;
  recovered_missing_control_23.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  recovered_missing_control_23.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);

  stripcv::test::StripOptions quiet_shifted_faint_27;
  quiet_shifted_faint_27.control_position = 0.11429683;
  quiet_shifted_faint_27.test_position = 0.28705284;
  quiet_shifted_faint_27.control_strength = 0.36835799;
  quiet_shifted_faint_27.test_strength = 0.03273376;
  quiet_shifted_faint_27.control_width_factor = 1.54765168;
  quiet_shifted_faint_27.test_width_factor = 0.81647689;
  quiet_shifted_faint_27.control_vertical_gradient = 0.20593242;
  quiet_shifted_faint_27.test_vertical_gradient = -0.48348186;
  quiet_shifted_faint_27.control_vertical_modulation = 0.08468718;
  quiet_shifted_faint_27.test_vertical_modulation = 0.27049752;
  quiet_shifted_faint_27.control_vertical_phase = 0.94587209;
  quiet_shifted_faint_27.test_vertical_phase = 0.20472229;
  quiet_shifted_faint_27.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  quiet_shifted_faint_27.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);

  // Seed 34 is a noisy, preview-sized full-height T just below the ordinary
  // detector. It must never be silently reported as one-line, while its exact
  // line-free twin remains a reportable one-line strip.
  stripcv::test::StripOptions noisy_transverse_faint_34;
  noisy_transverse_faint_34.control_position = 0.15091260;
  noisy_transverse_faint_34.test_position = 0.29070693;
  noisy_transverse_faint_34.control_strength = 0.38597901;
  noisy_transverse_faint_34.test_strength = 0.06422387;
  noisy_transverse_faint_34.control_width_factor = 0.92540079;
  noisy_transverse_faint_34.test_width_factor = 1.26059558;
  noisy_transverse_faint_34.control_vertical_gradient = 0.48391339;
  noisy_transverse_faint_34.test_vertical_gradient = 0.45037671;
  noisy_transverse_faint_34.control_vertical_modulation = 0.00897524;
  noisy_transverse_faint_34.test_vertical_modulation = 0.16328624;
  noisy_transverse_faint_34.control_vertical_phase = 0.16360339;
  noisy_transverse_faint_34.test_vertical_phase = 0.93586424;
  noisy_transverse_faint_34.control_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);
  noisy_transverse_faint_34.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);

  // Seed 38 is a higher-noise case where the T merges into a broad 1-D mound
  // but remains coherent in three transverse slices. It must abstain rather
  // than report one-line; its exact line-free twin remains reportable.
  stripcv::test::StripOptions noisy_diffuse_faint_38;
  noisy_diffuse_faint_38.control_position = 0.11946534;
  noisy_diffuse_faint_38.test_position = 0.26844837;
  noisy_diffuse_faint_38.control_strength = 0.26411059;
  noisy_diffuse_faint_38.test_strength = 0.05897592;
  noisy_diffuse_faint_38.control_width_factor = 1.35549951;
  noisy_diffuse_faint_38.test_width_factor = 1.20804204;
  noisy_diffuse_faint_38.control_vertical_gradient = -0.53751385;
  noisy_diffuse_faint_38.test_vertical_gradient = 0.19425532;
  noisy_diffuse_faint_38.control_vertical_modulation = 0.20238767;
  noisy_diffuse_faint_38.test_vertical_modulation = 0.25480602;
  noisy_diffuse_faint_38.control_vertical_phase = 0.32065338;
  noisy_diffuse_faint_38.test_vertical_phase = 0.10628187;
  noisy_diffuse_faint_38.bright_paper = true;
  noisy_diffuse_faint_38.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  noisy_diffuse_faint_38.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);

  // Seed 54 exposed a line-free paper ripple 0.252 strip lengths from C.
  // Although compact in three height slices, it lies beyond the profile's
  // supported 2.15x C/T spacing and must never be promoted to a T.
  stripcv::test::StripOptions remote_line_free_ripple_54;
  remote_line_free_ripple_54.control_position = 0.10994736;
  remote_line_free_ripple_54.test_position = 0.27385564;
  remote_line_free_ripple_54.control_strength = 0.25163458;
  remote_line_free_ripple_54.test_strength = 0.39465366;
  remote_line_free_ripple_54.control_width_factor = 1.31655653;
  remote_line_free_ripple_54.test_width_factor = 0.88180063;
  remote_line_free_ripple_54.control_vertical_gradient = 0.41702112;
  remote_line_free_ripple_54.test_vertical_gradient = -0.16644027;
  remote_line_free_ripple_54.control_vertical_modulation = 0.29475275;
  remote_line_free_ripple_54.test_vertical_modulation = 0.09269522;
  remote_line_free_ripple_54.control_vertical_phase = 0.71642797;
  remote_line_free_ripple_54.test_vertical_phase = 0.13355271;
  remote_line_free_ripple_54.bright_paper = true;
  remote_line_free_ripple_54.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  remote_line_free_ripple_54.test_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);

  // Seed 55 is a compressed preview where a real faint T falls below the
  // 1-D detector yet remains visible at both membrane edges and across three
  // transverse slices. It may abstain but must not report one-line. The
  // matched line-free image retains one-line coverage.
  stripcv::test::StripOptions moderate_noise_diffuse_faint_55;
  moderate_noise_diffuse_faint_55.control_position = 0.10964464;
  moderate_noise_diffuse_faint_55.test_position = 0.28890207;
  moderate_noise_diffuse_faint_55.control_strength = 0.18144911;
  moderate_noise_diffuse_faint_55.test_strength = 0.09637157;
  moderate_noise_diffuse_faint_55.control_width_factor = 1.65877242;
  moderate_noise_diffuse_faint_55.test_width_factor = 0.75636274;
  moderate_noise_diffuse_faint_55.control_vertical_gradient = -0.18268424;
  moderate_noise_diffuse_faint_55.test_vertical_gradient = 0.22417124;
  moderate_noise_diffuse_faint_55.control_vertical_modulation = 0.08285944;
  moderate_noise_diffuse_faint_55.test_vertical_modulation = 0.06588785;
  moderate_noise_diffuse_faint_55.control_vertical_phase = 0.67676200;
  moderate_noise_diffuse_faint_55.test_vertical_phase = 0.19017498;
  moderate_noise_diffuse_faint_55.bright_paper = true;
  moderate_noise_diffuse_faint_55.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  moderate_noise_diffuse_faint_55.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);

  // Seed 63 exposed a full-width line-free compression/noise ripple that
  // barely cleared the T detector while carrying only 2.23% of C material
  // and less than twice the minimum T SNR. The strong matched T remains
  // reportable; the exact line-free twin must not become two-line.
  stripcv::test::StripOptions low_material_ripple_63;
  low_material_ripple_63.control_position = 0.15216242;
  low_material_ripple_63.test_position = 0.32672471;
  low_material_ripple_63.control_strength = 0.41096264;
  low_material_ripple_63.test_strength = 0.26644057;
  low_material_ripple_63.control_width_factor = 0.68672918;
  low_material_ripple_63.test_width_factor = 1.35749183;
  low_material_ripple_63.control_vertical_gradient = 0.35150074;
  low_material_ripple_63.test_vertical_gradient = -0.00893350;
  low_material_ripple_63.control_vertical_modulation = 0.13657512;
  low_material_ripple_63.test_vertical_modulation = 0.14120605;
  low_material_ripple_63.control_vertical_phase = 0.24075211;
  low_material_ripple_63.test_vertical_phase = 0.94356317;
  low_material_ripple_63.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  low_material_ripple_63.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);

  // Seed 64 placed an observable, full-height T near the supported outer C/T
  // spacing boundary. Resampling shifted its strongest profile maximum just
  // over the old hard-coded 0.20 distance, so it was silently reported as
  // one-line. Use the profile-derived 2.15x spacing for this abstention-only
  // guard; the exact line-free twin must remain reportable one-line.
  stripcv::test::StripOptions supported_spacing_faint_64;
  supported_spacing_faint_64.control_position = 0.11226411;
  supported_spacing_faint_64.test_position = 0.30672220;
  supported_spacing_faint_64.control_strength = 0.25904341;
  supported_spacing_faint_64.test_strength = 0.04170582;
  supported_spacing_faint_64.control_width_factor = 1.54974536;
  supported_spacing_faint_64.test_width_factor = 1.41588792;
  supported_spacing_faint_64.control_vertical_gradient = 0.08895904;
  supported_spacing_faint_64.test_vertical_gradient = 0.07401548;
  supported_spacing_faint_64.control_vertical_modulation = 0.17117174;
  supported_spacing_faint_64.test_vertical_modulation = 0.10647017;
  supported_spacing_faint_64.control_vertical_phase = 0.25624483;
  supported_spacing_faint_64.test_vertical_phase = 0.38322807;
  supported_spacing_faint_64.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  supported_spacing_faint_64.test_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);

  // Seed 67 exposed a high nominal-SNR line-free ripple with only 0.43% of C
  // area. Its response was fragmented (17% continuity) and appeared in only
  // two transverse slices; the matched physical T remains reportable.
  stripcv::test::StripOptions fragmented_ripple_67;
  fragmented_ripple_67.control_position = 0.11194377;
  fragmented_ripple_67.test_position = 0.23473307;
  fragmented_ripple_67.control_strength = 0.25045140;
  fragmented_ripple_67.test_strength = 0.18064812;
  fragmented_ripple_67.control_width_factor = 1.10840750;
  fragmented_ripple_67.test_width_factor = 1.11272401;
  fragmented_ripple_67.control_vertical_gradient = -0.08254607;
  fragmented_ripple_67.test_vertical_gradient = 0.30096121;
  fragmented_ripple_67.control_vertical_modulation = 0.10359056;
  fragmented_ripple_67.test_vertical_modulation = 0.05120904;
  fragmented_ripple_67.control_vertical_phase = 0.04052317;
  fragmented_ripple_67.test_vertical_phase = 0.93266367;
  fragmented_ripple_67.control_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  fragmented_ripple_67.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);

  // Seed 68 exposed a six-row (10.7%-height) periodic paper-texture run at
  // the predicted T position. It must not suppress a strong, coherent
  // line-free control in either automatic or annotated-geometry analysis.
  stripcv::test::StripOptions partial_run_texture_68;
  partial_run_texture_68.control_position = 0.15470239;
  partial_run_texture_68.test_position = 0.28139387;
  partial_run_texture_68.control_strength = 0.39871699;
  partial_run_texture_68.test_strength = 0.12382722;
  partial_run_texture_68.control_width_factor = 0.71890126;
  partial_run_texture_68.test_width_factor = 1.32005596;
  partial_run_texture_68.control_vertical_gradient = -0.35133454;
  partial_run_texture_68.test_vertical_gradient = -0.02965106;
  partial_run_texture_68.control_vertical_modulation = 0.09570636;
  partial_run_texture_68.test_vertical_modulation = 0.07191922;
  partial_run_texture_68.control_vertical_phase = 0.23581162;
  partial_run_texture_68.test_vertical_phase = 0.53452257;
  partial_run_texture_68.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  partial_run_texture_68.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);

  // Seed 72 exposed a full-height line-free resampling ripple that the
  // shifted-T recovery promoted to a reportable second line. Its aggregate
  // fit is diffuse while every transverse slice is sub-line-width and the
  // total material is below 2.5% of C. Freeze the exact two-line, line-free,
  // and missing-control neighbors.
  stripcv::test::StripOptions diffuse_shifted_ripple_72;
  diffuse_shifted_ripple_72.control_position = 0.16088714;
  diffuse_shifted_ripple_72.test_position = 0.26508684;
  diffuse_shifted_ripple_72.control_strength = 0.29800623;
  diffuse_shifted_ripple_72.test_strength = 0.04900631;
  diffuse_shifted_ripple_72.control_width_factor = 0.76058415;
  diffuse_shifted_ripple_72.test_width_factor = 1.27275306;
  diffuse_shifted_ripple_72.control_vertical_gradient = 0.42146325;
  diffuse_shifted_ripple_72.test_vertical_gradient = -0.06673048;
  diffuse_shifted_ripple_72.control_vertical_modulation = 0.06513929;
  diffuse_shifted_ripple_72.test_vertical_modulation = 0.11625922;
  diffuse_shifted_ripple_72.control_vertical_phase = 0.11909365;
  diffuse_shifted_ripple_72.test_vertical_phase = 0.39206213;
  diffuse_shifted_ripple_72.bright_paper = true;
  diffuse_shifted_ripple_72.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  diffuse_shifted_ripple_72.test_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);

  // Seeds 77 and 80 exposed faint shifted T bands that fell below the
  // noise-relative 1-D detector after preview degradation. Their remaining
  // two-dimensional support is sufficient to forbid a one-line report, while
  // each exact line-free twin remains a reportable one-line control.
  stripcv::test::StripOptions outer_subnoise_faint_77;
  outer_subnoise_faint_77.control_position = 0.09037016;
  outer_subnoise_faint_77.test_position = 0.29005565;
  outer_subnoise_faint_77.control_strength = 0.38185471;
  outer_subnoise_faint_77.test_strength = 0.04503619;
  outer_subnoise_faint_77.control_width_factor = 1.55129730;
  outer_subnoise_faint_77.test_width_factor = 1.79345382;
  outer_subnoise_faint_77.control_vertical_gradient = -0.47255183;
  outer_subnoise_faint_77.test_vertical_gradient = 0.43054942;
  outer_subnoise_faint_77.control_vertical_modulation = 0.28271554;
  outer_subnoise_faint_77.test_vertical_modulation = 0.20899165;
  outer_subnoise_faint_77.control_vertical_phase = 0.52463463;
  outer_subnoise_faint_77.test_vertical_phase = 0.23112168;
  outer_subnoise_faint_77.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  outer_subnoise_faint_77.test_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);

  stripcv::test::StripOptions outer_subnoise_faint_80;
  outer_subnoise_faint_80.control_position = 0.09848223;
  outer_subnoise_faint_80.test_position = 0.29057298;
  outer_subnoise_faint_80.control_strength = 0.39097206;
  outer_subnoise_faint_80.test_strength = 0.09914137;
  outer_subnoise_faint_80.control_width_factor = 1.87422436;
  outer_subnoise_faint_80.test_width_factor = 1.04119854;
  outer_subnoise_faint_80.control_vertical_gradient = 0.49892687;
  outer_subnoise_faint_80.test_vertical_gradient = -0.50555956;
  outer_subnoise_faint_80.control_vertical_modulation = 0.06308048;
  outer_subnoise_faint_80.test_vertical_modulation = 0.14767288;
  outer_subnoise_faint_80.control_vertical_phase = 0.70929110;
  outer_subnoise_faint_80.test_vertical_phase = 0.14450338;
  outer_subnoise_faint_80.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  outer_subnoise_faint_80.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);

  // Seed 81 exposed a line-free resampling peak with 2.88% of C material.
  // Although three isolated height slices and both edge bands contained some
  // response, only 41% of the membrane was covered and the longest coherent
  // run was 23%. Freeze the exact two-line, line-free, and missing-C twins.
  stripcv::test::StripOptions fragmented_low_material_81;
  fragmented_low_material_81.control_position = 0.14722815;
  fragmented_low_material_81.test_position = 0.29111868;
  fragmented_low_material_81.control_strength = 0.37269605;
  fragmented_low_material_81.test_strength = 0.21965819;
  fragmented_low_material_81.control_width_factor = 0.79872738;
  fragmented_low_material_81.test_width_factor = 1.10551648;
  fragmented_low_material_81.control_vertical_gradient = -0.12061923;
  fragmented_low_material_81.test_vertical_gradient = -0.06702756;
  fragmented_low_material_81.control_vertical_modulation = 0.28122232;
  fragmented_low_material_81.test_vertical_modulation = 0.10683924;
  fragmented_low_material_81.control_vertical_phase = 0.74666061;
  fragmented_low_material_81.test_vertical_phase = 0.22238071;
  fragmented_low_material_81.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  fragmented_low_material_81.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);

  // Seeds 85 and 88 exposed four full-height T bands whose aggregate
  // profile was misleading after perspective correction/downsampling. Each
  // is independently supported across the membrane height and in bounded
  // transverse slices. Freeze the exact two-line, line-free, and missing-C
  // twins so these narrow recoveries cannot expand into false reports.
  stripcv::test::StripOptions shifted_low_continuity_85;
  shifted_low_continuity_85.control_position = 0.14921002;
  shifted_low_continuity_85.test_position = 0.34727644;
  shifted_low_continuity_85.control_strength = 0.29214186;
  shifted_low_continuity_85.test_strength = 0.03895899;
  shifted_low_continuity_85.control_width_factor = 1.37775277;
  shifted_low_continuity_85.test_width_factor = 1.16511166;
  shifted_low_continuity_85.control_vertical_gradient = -0.27354312;
  shifted_low_continuity_85.test_vertical_gradient = -0.18851822;
  shifted_low_continuity_85.control_vertical_modulation = 0.00164981;
  shifted_low_continuity_85.test_vertical_modulation = 0.22928149;
  shifted_low_continuity_85.control_vertical_phase = 0.49685592;
  shifted_low_continuity_85.test_vertical_phase = 0.45479353;
  shifted_low_continuity_85.bright_paper = true;
  shifted_low_continuity_85.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  shifted_low_continuity_85.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);

  stripcv::test::StripOptions shifted_broad_aggregate_85;
  shifted_broad_aggregate_85.control_position = 0.11312389;
  shifted_broad_aggregate_85.test_position = 0.28915770;
  shifted_broad_aggregate_85.control_strength = 0.36062423;
  shifted_broad_aggregate_85.test_strength = 0.03867608;
  shifted_broad_aggregate_85.control_width_factor = 1.55631845;
  shifted_broad_aggregate_85.test_width_factor = 1.74033632;
  shifted_broad_aggregate_85.control_vertical_gradient = 0.26700128;
  shifted_broad_aggregate_85.test_vertical_gradient = 0.14857600;
  shifted_broad_aggregate_85.control_vertical_modulation = 0.22380452;
  shifted_broad_aggregate_85.test_vertical_modulation = 0.23985791;
  shifted_broad_aggregate_85.control_vertical_phase = 0.22966735;
  shifted_broad_aggregate_85.test_vertical_phase = 0.67593866;
  shifted_broad_aggregate_85.bright_paper = true;
  shifted_broad_aggregate_85.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  shifted_broad_aggregate_85.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);

  stripcv::test::StripOptions low_shoulder_wide_88;
  low_shoulder_wide_88.control_position = 0.11624068;
  low_shoulder_wide_88.test_position = 0.29738121;
  low_shoulder_wide_88.control_strength = 0.34271322;
  low_shoulder_wide_88.test_strength = 0.11324755;
  low_shoulder_wide_88.control_width_factor = 0.61381386;
  low_shoulder_wide_88.test_width_factor = 1.62562052;
  low_shoulder_wide_88.control_vertical_gradient = -0.29301774;
  low_shoulder_wide_88.test_vertical_gradient = -0.05424252;
  low_shoulder_wide_88.control_vertical_modulation = 0.21292996;
  low_shoulder_wide_88.test_vertical_modulation = 0.02701187;
  low_shoulder_wide_88.control_vertical_phase = 0.77228188;
  low_shoulder_wide_88.test_vertical_phase = 0.51664510;
  low_shoulder_wide_88.bright_paper = true;
  low_shoulder_wide_88.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  low_shoulder_wide_88.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);

  stripcv::test::StripOptions two_segment_full_height_85;
  two_segment_full_height_85.control_position = 0.11433824;
  two_segment_full_height_85.test_position = 0.29425513;
  two_segment_full_height_85.control_strength = 0.24779366;
  two_segment_full_height_85.test_strength = 0.02238223;
  two_segment_full_height_85.control_width_factor = 1.20853484;
  two_segment_full_height_85.test_width_factor = 1.69967746;
  two_segment_full_height_85.control_vertical_gradient = -0.11281403;
  two_segment_full_height_85.test_vertical_gradient = 0.21043105;
  two_segment_full_height_85.control_vertical_modulation = 0.26065304;
  two_segment_full_height_85.test_vertical_modulation = 0.05960806;
  two_segment_full_height_85.control_vertical_phase = 0.08632216;
  two_segment_full_height_85.test_vertical_phase = 0.69370767;
  two_segment_full_height_85.control_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);
  two_segment_full_height_85.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);

  // Seed 85 exposed a low-material deblend synthesized from a broad C tail.
  // The residual spans over 4.5 physical line widths in all height slices;
  // its exact true-T neighbor may also conservatively abstain but must never
  // be mislabeled one-line.
  stripcv::test::StripOptions diffuse_control_tail_85;
  diffuse_control_tail_85.control_position = 0.11667574;
  diffuse_control_tail_85.test_position = 0.20991981;
  diffuse_control_tail_85.control_strength = 0.23278038;
  diffuse_control_tail_85.test_strength = 0.08566665;
  diffuse_control_tail_85.control_width_factor = 1.85187892;
  diffuse_control_tail_85.test_width_factor = 0.84901970;
  diffuse_control_tail_85.control_vertical_gradient = 0.09123816;
  diffuse_control_tail_85.test_vertical_gradient = 0.43648570;
  diffuse_control_tail_85.control_vertical_modulation = 0.26018334;
  diffuse_control_tail_85.test_vertical_modulation = 0.04925282;
  diffuse_control_tail_85.control_vertical_phase = 0.11882110;
  diffuse_control_tail_85.test_vertical_phase = 0.40303862;
  diffuse_control_tail_85.control_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);
  diffuse_control_tail_85.test_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);

  // Seed 97 exposed a second, more compact control-tail residual. Its weak
  // synthesized T occupied three slices but only a short coherent vertical
  // run. Its exact true-T twin already conservatively abstains under the
  // broad-C/faint-T policy; neither line-free nor missing-control twins may
  // become reportable decisions.
  stripcv::test::StripOptions compact_control_tail_97;
  compact_control_tail_97.control_position = 0.10056250;
  compact_control_tail_97.test_position = 0.25141945;
  compact_control_tail_97.control_strength = 0.27879332;
  compact_control_tail_97.test_strength = 0.05840318;
  compact_control_tail_97.control_width_factor = 1.86534631;
  compact_control_tail_97.test_width_factor = 0.89010016;
  compact_control_tail_97.control_vertical_gradient = 0.12681060;
  compact_control_tail_97.test_vertical_gradient = 0.42292008;
  compact_control_tail_97.control_vertical_modulation = 0.00681513;
  compact_control_tail_97.test_vertical_modulation = 0.18187253;
  compact_control_tail_97.control_vertical_phase = 0.17727326;
  compact_control_tail_97.test_vertical_phase = 0.37307526;
  compact_control_tail_97.bright_paper = true;
  compact_control_tail_97.control_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);
  compact_control_tail_97.test_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);

  // Seed 110 exposed a full-height faint T whose 1-D response merged into a
  // high-noise diffuse mound. Freeze automatic and annotated geometry against
  // the exact line-free and missing-control twins before admitting any
  // subthreshold evidence.
  stripcv::test::StripOptions noisy_diffuse_faint_110;
  noisy_diffuse_faint_110.control_position = 0.10448043;
  noisy_diffuse_faint_110.test_position = 0.22465927;
  noisy_diffuse_faint_110.control_strength = 0.40264267;
  noisy_diffuse_faint_110.test_strength = 0.05199352;
  noisy_diffuse_faint_110.control_width_factor = 0.86024141;
  noisy_diffuse_faint_110.test_width_factor = 1.06390458;
  noisy_diffuse_faint_110.control_vertical_gradient = -0.21248804;
  noisy_diffuse_faint_110.test_vertical_gradient = -0.26391106;
  noisy_diffuse_faint_110.control_vertical_modulation = 0.02311759;
  noisy_diffuse_faint_110.test_vertical_modulation = 0.07793377;
  noisy_diffuse_faint_110.control_vertical_phase = 0.52800629;
  noisy_diffuse_faint_110.test_vertical_phase = 0.29027623;
  noisy_diffuse_faint_110.bright_paper = true;
  noisy_diffuse_faint_110.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  noisy_diffuse_faint_110.test_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);

  // Seed 115 exposed an even more aggressively downsampled T beside a broad
  // C. The aggregate correction nearly erased T, so only independent spatial
  // evidence may turn its unsafe one-line report into an abstention.
  stripcv::test::StripOptions compressed_faint_115;
  compressed_faint_115.control_position = 0.09292685;
  compressed_faint_115.test_position = 0.28901441;
  compressed_faint_115.control_strength = 0.29788686;
  compressed_faint_115.test_strength = 0.05836163;
  compressed_faint_115.control_width_factor = 1.88420110;
  compressed_faint_115.test_width_factor = 0.97943141;
  compressed_faint_115.control_vertical_gradient = -0.04164513;
  compressed_faint_115.test_vertical_gradient = 0.03716179;
  compressed_faint_115.control_vertical_modulation = 0.13588867;
  compressed_faint_115.test_vertical_modulation = 0.15403686;
  compressed_faint_115.control_vertical_phase = 0.71964436;
  compressed_faint_115.test_vertical_phase = 0.53168828;
  compressed_faint_115.control_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);
  compressed_faint_115.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);

  // Seeds 117 and 122 exposed two full-height faint bands that disappeared
  // from the aggregate profile under distinct high-noise/downsampling regimes.
  // Their exact line-free and missing-control twins constrain any ambiguity
  // recovery to evidence that is genuinely introduced by T.
  stripcv::test::StripOptions faded_faint_117;
  faded_faint_117.control_position = 0.10416395;
  faded_faint_117.test_position = 0.20802049;
  faded_faint_117.control_strength = 0.34985517;
  faded_faint_117.test_strength = 0.02692126;
  faded_faint_117.control_width_factor = 0.93474900;
  faded_faint_117.test_width_factor = 1.36389654;
  faded_faint_117.control_vertical_gradient = -0.49876165;
  faded_faint_117.test_vertical_gradient = -0.47483338;
  faded_faint_117.control_vertical_modulation = 0.26693608;
  faded_faint_117.test_vertical_modulation = 0.07221281;
  faded_faint_117.control_vertical_phase = 0.92471214;
  faded_faint_117.test_vertical_phase = 0.37733367;
  faded_faint_117.bright_paper = true;
  faded_faint_117.control_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);
  faded_faint_117.test_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);

  stripcv::test::StripOptions compressed_faint_122;
  compressed_faint_122.control_position = 0.09075663;
  compressed_faint_122.test_position = 0.28848940;
  compressed_faint_122.control_strength = 0.32123799;
  compressed_faint_122.test_strength = 0.02600828;
  compressed_faint_122.control_width_factor = 1.59210071;
  compressed_faint_122.test_width_factor = 1.13912607;
  compressed_faint_122.control_vertical_gradient = 0.41727546;
  compressed_faint_122.test_vertical_gradient = -0.23992850;
  compressed_faint_122.control_vertical_modulation = 0.18222139;
  compressed_faint_122.test_vertical_modulation = 0.05656744;
  compressed_faint_122.control_vertical_phase = 0.31494888;
  compressed_faint_122.test_vertical_phase = 0.52658472;
  compressed_faint_122.bright_paper = true;
  compressed_faint_122.control_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);
  compressed_faint_122.test_dye_rgb = cv::Vec3d(175.0, 65.0, 95.0);

  // Seed 127 exposed a very low-resolution faint T beside a broad control.
  // Preserve only evidence that differs from its exact line-free twin.
  stripcv::test::StripOptions compressed_faint_127;
  compressed_faint_127.control_position = 0.09859034;
  compressed_faint_127.test_position = 0.23360681;
  compressed_faint_127.control_strength = 0.23190079;
  compressed_faint_127.test_strength = 0.02165383;
  compressed_faint_127.control_width_factor = 1.89894277;
  compressed_faint_127.test_width_factor = 1.54480675;
  compressed_faint_127.control_vertical_gradient = -0.00486839;
  compressed_faint_127.test_vertical_gradient = -0.15946565;
  compressed_faint_127.control_vertical_modulation = 0.02750822;
  compressed_faint_127.test_vertical_modulation = 0.18319911;
  compressed_faint_127.control_vertical_phase = 0.04935622;
  compressed_faint_127.test_vertical_phase = 0.87709162;
  compressed_faint_127.control_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);
  compressed_faint_127.test_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);

  // Seed 136 exposed a missing-control strip whose single broad T was split
  // into a synthetic ordered pair. The present-control and line-free twins
  // constrain the assignment fix as well as the missing-control safety case.
  stripcv::test::StripOptions split_missing_control_136;
  split_missing_control_136.control_position = 0.10577970;
  split_missing_control_136.test_position = 0.21788485;
  split_missing_control_136.control_strength = 0.34822642;
  split_missing_control_136.test_strength = 0.11783142;
  split_missing_control_136.control_width_factor = 1.05078939;
  split_missing_control_136.test_width_factor = 1.59462113;
  split_missing_control_136.control_vertical_gradient = -0.12513271;
  split_missing_control_136.test_vertical_gradient = 0.20340537;
  split_missing_control_136.control_vertical_modulation = 0.09764379;
  split_missing_control_136.test_vertical_modulation = 0.08116763;
  split_missing_control_136.control_vertical_phase = 0.84264102;
  split_missing_control_136.test_vertical_phase = 0.46395680;
  split_missing_control_136.control_dye_rgb = cv::Vec3d(175.0, 65.0, 95.0);
  split_missing_control_136.test_dye_rgb = cv::Vec3d(130.0, 75.0, 105.0);

  stripcv::test::StripOptions faint_138;
  faint_138.control_position = 0.10625445;
  faint_138.test_position = 0.25660293;
  faint_138.control_strength = 0.32909822;
  faint_138.test_strength = 0.04154190;
  faint_138.control_width_factor = 1.76678568;
  faint_138.test_width_factor = 1.08422056;
  faint_138.control_vertical_gradient = -0.27487285;
  faint_138.test_vertical_gradient = -0.12943757;
  faint_138.control_vertical_modulation = 0.06502046;
  faint_138.test_vertical_modulation = 0.26562677;
  faint_138.control_vertical_phase = 0.62805314;
  faint_138.test_vertical_phase = 0.92027445;
  faint_138.bright_paper = true;
  faint_138.control_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  faint_138.test_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);

  stripcv::test::StripOptions faint_139;
  faint_139.control_position = 0.09204102;
  faint_139.test_position = 0.27098478;
  faint_139.control_strength = 0.36488691;
  faint_139.test_strength = 0.04362574;
  faint_139.control_width_factor = 1.20951485;
  faint_139.test_width_factor = 0.98053445;
  faint_139.control_vertical_gradient = 0.40029606;
  faint_139.test_vertical_gradient = -0.44840092;
  faint_139.control_vertical_modulation = 0.19101731;
  faint_139.test_vertical_modulation = 0.29878414;
  faint_139.control_vertical_phase = 0.24639544;
  faint_139.test_vertical_phase = 0.09258538;
  faint_139.control_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);
  faint_139.test_dye_rgb = cv::Vec3d(150.0, 55.0, 105.0);

  // Seed block 133-140: full-height T bands whose aggregate vertical mask
  // undercounted otherwise agreeing 2-D evidence, plus a clean upstream T
  // that overlapped the registered extra-line ambiguity band.
  stripcv::test::StripOptions compact_three_slice_133;
  compact_three_slice_133.control_position = 0.16614705;
  compact_three_slice_133.test_position = 0.34909566;
  compact_three_slice_133.control_strength = 0.36140264;
  compact_three_slice_133.test_strength = 0.10335406;
  compact_three_slice_133.control_width_factor = 0.99721123;
  compact_three_slice_133.test_width_factor = 1.67917161;
  compact_three_slice_133.control_vertical_gradient = 0.02879841;
  compact_three_slice_133.test_vertical_gradient = 0.44469091;
  compact_three_slice_133.control_vertical_modulation = 0.18854540;
  compact_three_slice_133.test_vertical_modulation = 0.05341366;
  compact_three_slice_133.control_vertical_phase = 0.70382590;
  compact_three_slice_133.test_vertical_phase = 0.87129216;
  compact_three_slice_133.bright_paper = true;
  compact_three_slice_133.control_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  compact_three_slice_133.test_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);

  stripcv::test::StripOptions faint_edge_three_slice_135;
  faint_edge_three_slice_135.control_position = 0.16198675;
  faint_edge_three_slice_135.test_position = 0.27358428;
  faint_edge_three_slice_135.control_strength = 0.30324820;
  faint_edge_three_slice_135.test_strength = 0.02215756;
  faint_edge_three_slice_135.control_width_factor = 0.83663224;
  faint_edge_three_slice_135.test_width_factor = 1.52386730;
  faint_edge_three_slice_135.control_vertical_gradient = -0.32269922;
  faint_edge_three_slice_135.test_vertical_gradient = 0.20851037;
  faint_edge_three_slice_135.control_vertical_modulation = 0.09488147;
  faint_edge_three_slice_135.test_vertical_modulation = 0.28829442;
  faint_edge_three_slice_135.control_vertical_phase = 0.96975879;
  faint_edge_three_slice_135.test_vertical_phase = 0.14650874;
  faint_edge_three_slice_135.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  faint_edge_three_slice_135.test_dye_rgb =
      cv::Vec3d(175.0, 65.0, 95.0);

  stripcv::test::StripOptions quantized_three_slice_136;
  quantized_three_slice_136.control_position = 0.09444153;
  quantized_three_slice_136.test_position = 0.25721993;
  quantized_three_slice_136.control_strength = 0.19779117;
  quantized_three_slice_136.test_strength = 0.03498141;
  quantized_three_slice_136.control_width_factor = 0.62230543;
  quantized_three_slice_136.test_width_factor = 0.78199200;
  quantized_three_slice_136.control_vertical_gradient = -0.33712027;
  quantized_three_slice_136.test_vertical_gradient = -0.26140449;
  quantized_three_slice_136.control_vertical_modulation = 0.18530717;
  quantized_three_slice_136.test_vertical_modulation = 0.17418076;
  quantized_three_slice_136.control_vertical_phase = 0.52544415;
  quantized_three_slice_136.test_vertical_phase = 0.33296907;
  quantized_three_slice_136.control_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);
  quantized_three_slice_136.test_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);

  stripcv::test::StripOptions clean_upstream_t_133;
  clean_upstream_t_133.control_position = 0.10621574;
  clean_upstream_t_133.test_position = 0.30481363;
  clean_upstream_t_133.control_strength = 0.32503545;
  clean_upstream_t_133.test_strength = 0.44723883;
  clean_upstream_t_133.control_width_factor = 1.14593960;
  clean_upstream_t_133.test_width_factor = 1.74098038;
  clean_upstream_t_133.control_vertical_gradient = 0.03475296;
  clean_upstream_t_133.test_vertical_gradient = 0.23161018;
  clean_upstream_t_133.control_vertical_modulation = 0.26266440;
  clean_upstream_t_133.test_vertical_modulation = 0.20898531;
  clean_upstream_t_133.control_vertical_phase = 0.04742372;
  clean_upstream_t_133.test_vertical_phase = 0.04376105;
  clean_upstream_t_133.bright_paper = true;
  clean_upstream_t_133.control_dye_rgb =
      cv::Vec3d(130.0, 75.0, 105.0);
  clean_upstream_t_133.test_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);

  // Seed block 141-148: preserve a deposited band at the upper compact-width
  // boundary and a faint full-height band whose row mask is sparse but whose
  // three transverse slices and both outer membrane bands agree.
  stripcv::test::StripOptions wide_transverse_t_141;
  wide_transverse_t_141.control_position = 0.12071774;
  wide_transverse_t_141.test_position = 0.26933300;
  wide_transverse_t_141.control_strength = 0.34341005;
  wide_transverse_t_141.test_strength = 0.15583386;
  wide_transverse_t_141.control_width_factor = 1.42181069;
  wide_transverse_t_141.test_width_factor = 1.85564160;
  wide_transverse_t_141.control_vertical_gradient = -0.49185868;
  wide_transverse_t_141.test_vertical_gradient = 0.08864940;
  wide_transverse_t_141.control_vertical_modulation = 0.25856079;
  wide_transverse_t_141.test_vertical_modulation = 0.26432175;
  wide_transverse_t_141.control_vertical_phase = 0.18435656;
  wide_transverse_t_141.test_vertical_phase = 0.54732742;
  wide_transverse_t_141.bright_paper = true;
  wide_transverse_t_141.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  wide_transverse_t_141.test_dye_rgb =
      cv::Vec3d(125.0, 60.0, 110.0);

  stripcv::test::StripOptions edge_supported_faint_142;
  edge_supported_faint_142.control_position = 0.14800243;
  edge_supported_faint_142.test_position = 0.26997299;
  edge_supported_faint_142.control_strength = 0.22037077;
  edge_supported_faint_142.test_strength = 0.05047066;
  edge_supported_faint_142.control_width_factor = 0.88712730;
  edge_supported_faint_142.test_width_factor = 1.02845428;
  edge_supported_faint_142.control_vertical_gradient = 0.05860025;
  edge_supported_faint_142.test_vertical_gradient = 0.09922633;
  edge_supported_faint_142.control_vertical_modulation = 0.22743893;
  edge_supported_faint_142.test_vertical_modulation = 0.11073174;
  edge_supported_faint_142.control_vertical_phase = 0.10429441;
  edge_supported_faint_142.test_vertical_phase = 0.84292522;
  edge_supported_faint_142.control_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);
  edge_supported_faint_142.test_dye_rgb =
      cv::Vec3d(210.0, 95.0, 125.0);

  // Seed 89 exposed a low-material automatic-crop ripple recovered as an
  // inner-region T. Its aggregate is almost twice the widest independent
  // slice, unlike the exact strongly deposited T neighbor.
  stripcv::test::StripOptions diffuse_inner_ripple_89;
  diffuse_inner_ripple_89.control_position = 0.11788635;
  diffuse_inner_ripple_89.test_position = 0.26521936;
  diffuse_inner_ripple_89.control_strength = 0.20297379;
  diffuse_inner_ripple_89.test_strength = 0.42880100;
  diffuse_inner_ripple_89.control_width_factor = 0.89312717;
  diffuse_inner_ripple_89.test_width_factor = 0.75072999;
  diffuse_inner_ripple_89.control_vertical_gradient = 0.15263658;
  diffuse_inner_ripple_89.test_vertical_gradient = -0.18545011;
  diffuse_inner_ripple_89.control_vertical_modulation = 0.04763188;
  diffuse_inner_ripple_89.test_vertical_modulation = 0.19858050;
  diffuse_inner_ripple_89.control_vertical_phase = 0.77175173;
  diffuse_inner_ripple_89.test_vertical_phase = 0.54253269;
  diffuse_inner_ripple_89.control_dye_rgb =
      cv::Vec3d(150.0, 55.0, 105.0);
  diffuse_inner_ripple_89.test_dye_rgb =
      cv::Vec3d(196.0, 52.0, 92.0);

  if (!verifySeededPair(
          "seed-21 recovered missing-control", recovered_missing_control_21,
          0.85890172, cv::Vec3d(1.12320854, 1.03873948, 1.04318547), 66,
          0.94195021, 1.31230615, 0.03891990,
          18406336781587143626ULL, true, true) ||
      !verifySeededPair(
          "seed-22 broad-control deblend", broad_control_deblend_22,
          0.69300350, cv::Vec3d(1.03041875, 0.93875858, 1.00961039), 35,
          0.96989739, 0.22916394, 0.00811941,
          17204480624321067697ULL, false, false) ||
      !verifySeededPair(
          "seed-22 quiet shifted faint line", quiet_shifted_faint_22,
          0.87602544, cv::Vec3d(0.92308003, 0.95452734, 1.05407088), 39,
          0.63524659, 0.98411450, 0.05994179,
          4869621992240770668ULL, false, true) ||
      !verifySeededPair(
          "seed-23 recovered missing-control", recovered_missing_control_23,
          0.84939691, cv::Vec3d(0.87235048, 0.92617162, 0.96865091), 78,
          0.45941424, 0.16197435, 2.78813203,
          16765659094856277931ULL, true, false) ||
      !verifySeededPair(
          "seed-27 quiet shifted faint line", quiet_shifted_faint_27,
          0.88137330, cv::Vec3d(1.02810243, 0.92592872, 1.06420581), 38,
          0.76970519, 1.18628379, 0.27335099,
          16591034993431116968ULL, false, true) ||
      !verifySeededPair(
          "seed-34 noisy transverse faint line", noisy_transverse_faint_34,
          0.68029571, cv::Vec3d(0.94670318, 0.90434246, 1.03989856), 73,
          0.37932280, 0.40896140, 1.20385703,
          4166580434082984860ULL, false, true) ||
      !verifySeededPair(
          "seed-38 noisy diffuse faint line", noisy_diffuse_faint_38,
          0.88435623, cv::Vec3d(0.94353097, 0.90489294, 0.98169598), 50,
          0.86227709, 0.77837965, 0.81775848,
          11333575162433527090ULL, false, true) ||
      !verifySeededPair(
          "seed-54 remote line-free ripple", remote_line_free_ripple_54,
          0.84144831, cv::Vec3d(0.99899972, 0.94263092, 0.89291436), 94,
          0.53011186, 0.76223277, 0.04679243,
          14473348614320135840ULL, true, false) ||
      !verifySeededPair(
          "seed-55 moderate-noise diffuse faint line",
          moderate_noise_diffuse_faint_55, 0.86045329,
          cv::Vec3d(0.99776269, 1.04611472, 0.87176989), 36, 0.57789254,
          0.88373452, 0.19634418, 8688722981067191274ULL, false, true) ||
      !verifySeededPair(
          "seed-63 low-material line-free ripple", low_material_ripple_63,
          0.68044378, cv::Vec3d(0.91668433, 0.95669223, 0.99612131), 71,
          0.76664223, 0.84178220, 3.35891501,
          9125537171226532553ULL, true, false) ||
      !verifySeededPair(
          "seed-64 supported-spacing faint line", supported_spacing_faint_64,
          0.68345072, cv::Vec3d(0.98619905, 0.93684234, 0.88903524), 51,
          0.56817539, 1.23278799, 2.39364502,
          11878429579423933183ULL, false, true) ||
      !verifySeededPair(
          "seed-67 fragmented line-free ripple", fragmented_ripple_67,
          0.89846651, cv::Vec3d(1.00257724, 0.91177946, 0.91538890), 94,
          0.39894024, 0.58891333, 0.13217379,
          13011649428480667221ULL, true, false) ||
      !verifySeededPair(
          "seed-72 diffuse shifted line-free ripple",
          diffuse_shifted_ripple_72, 0.71134327,
          cv::Vec3d(0.87103459, 0.99283463, 0.89249414), 67, 0.43043861,
          0.29310103, 1.81070987, 12399341024591678273ULL, false, false) ||
      !verifySeededPair(
          "seed-77 outer subnoise faint line", outer_subnoise_faint_77,
          0.85228792, cv::Vec3d(1.06661290, 1.02927202, 0.96904887), 44,
          0.78059972, 0.23575843, 2.89361200,
          10352136288792185750ULL, false, true) ||
      !verifySeededPair(
          "seed-80 outer subnoise faint line", outer_subnoise_faint_80,
          0.68588693, cv::Vec3d(1.02462502, 1.04537081, 1.08204754), 60,
          0.58384180, 0.48067637, 1.69561992,
          2667258722090385776ULL, false, true) ||
      !verifySeededPair(
          "seed-81 fragmented low-material line-free ripple",
          fragmented_low_material_81, 0.73589889,
          cv::Vec3d(1.07503227, 1.00160849, 1.04782973), 65, 0.50034023,
          0.77041697, 1.24787967, 1034293600348939691ULL, true, false) ||
      !verifySeededPair(
          "seed-85 shifted low-continuity T", shifted_low_continuity_85,
          0.83880573, cv::Vec3d(0.87602111, 0.90372054, 0.88402618), 68,
          0.45276983, 0.13386640, 3.25097378,
          3058692998867430734ULL, true, true) ||
      !verifySeededPair(
          "seed-85 shifted broad aggregate T", shifted_broad_aggregate_85,
          0.89790319, cv::Vec3d(0.94168501, 0.95430475, 0.89885334), 79,
          0.36209068, 0.85486968, 2.90427415,
          16207939379751352137ULL, true, true) ||
      !verifySeededPair(
          "seed-88 low-shoulder wide T", low_shoulder_wide_88, 0.69361883,
          cv::Vec3d(0.87748750, 0.93493135, 1.07257081), 47, 0.83143483,
          1.02414991, 1.13836670, 10059592931347064468ULL, true, true) ||
      !verifySeededPair(
          "seed-85 two-segment full-height T", two_segment_full_height_85,
          0.75239997, cv::Vec3d(1.10532754, 1.01130068, 1.09277658), 56,
          0.66818522, 0.01202304, 0.03044813,
          9652182563688500156ULL, true, true) ||
      !verifySeededPair(
          "seed-85 diffuse broad-control tail", diffuse_control_tail_85,
          0.86250071, cv::Vec3d(1.06240084, 0.90412534, 0.90958384), 43,
          0.59067607, 0.43172282, 1.75892916,
          5558537229504856729ULL, false, false) ||
      !verifySeededPair(
          "seed-97 compact broad-control tail", compact_control_tail_97,
          0.85338013, cv::Vec3d(0.93233673, 1.06467473, 1.04270075), 37,
          0.46783704, 0.88078099, 0.68714880,
          8355990785722529422ULL, false, false) ||
      !verifySeededAutomaticPair(
          "seed-110 noisy diffuse faint T", noisy_diffuse_faint_110,
          {cv::Point2f(91.90422821F, 175.93806458F),
           cv::Point2f(1059.77880859F, 213.12359619F),
           cv::Point2f(1071.16577148F, 405.67376709F),
           cv::Point2f(94.72348022F, 362.55090332F)},
          0.97737044, cv::Vec3d(1.01652478, 0.95343106, 0.92553637), 53,
          0.91530070, 0.54410965, 0.80160231,
          2521730863881696889ULL, false, true) ||
      !verifySeededPair(
          "seed-115 compressed faint T", compressed_faint_115, 0.79215141,
          cv::Vec3d(1.12011756, 0.98598734, 1.05919591), 39, 0.52401472,
          0.97480107, 1.41264244, 1925627614026385908ULL, false, true) ||
      !verifySeededPair(
          "seed-117 vertically faded faint T", faded_faint_117, 0.79206687,
          cv::Vec3d(1.01191583, 1.04868138, 1.07225248), 47, 0.78354884,
          0.51646057, 1.32082152, 566215252035795113ULL, false, false) ||
      !verifySeededPair(
          "seed-122 compressed faint T", compressed_faint_122, 0.87619855,
          cv::Vec3d(0.99765662, 0.95124549, 0.93872366), 84, 0.59004347,
          1.29724450, 2.42442020, 4200438312599032576ULL, false, false) ||
      !verifySeededPair(
          "seed-127 low-resolution faint T", compressed_faint_127,
          0.72903881, cv::Vec3d(0.86037053, 0.91439503, 0.91416587), 96,
          0.41191314, 0.39496355, 2.88066681,
          12200954424174349004ULL, false, false) ||
      !verifySeededPair(
          "seed-136 split missing control", split_missing_control_136,
          0.83647628, cv::Vec3d(0.94736801, 1.03373597, 1.10403053), 36,
          0.98498322, 0.70564956, 0.59567539,
          10060886100858172811ULL, false, true) ||
      !verifySeededPair(
          "seed-138 faint T", faint_138, 0.71512653,
          cv::Vec3d(1.11312295, 0.97403022, 1.12904543), 54, 0.93611309,
          0.95795832, 2.87947324, 6406716284745966241ULL, false, false) ||
      !verifySeededPair(
          "seed-139 faint T", faint_139, 0.87199561,
          cv::Vec3d(0.98645965, 0.98221285, 1.01765079), 48, 0.53453285,
          0.43726586, 3.01586283, 5904667802671596535ULL, false, false) ||
      !verifySeededPair(
          "seed-133 compact three-slice T", compact_three_slice_133,
          0.74065111, cv::Vec3d(1.08788784, 1.07163969, 1.10114458), 49,
          0.70790164, 1.15967921, 3.42091752,
          771197180788798775ULL, true, true) ||
      !verifySeededPair(
          "seed-135 faint edge-supported three-slice T",
          faint_edge_three_slice_135, 0.88035606,
          cv::Vec3d(1.01420117, 0.92896884, 1.13797341), 87, 0.90563245,
          1.16156889, 0.46797302, 2692001359665593942ULL, true, true) ||
      !verifySeededPair(
          "seed-136 quantized three-slice T", quantized_three_slice_136,
          0.94158878, cv::Vec3d(0.86429471, 0.91263136, 1.13662652), 57,
          0.60157297, 1.11697999, 1.70691613,
          11144791835868843553ULL, true, true) ||
      !verifySeededPair(
          "seed-133 clean upstream T", clean_upstream_t_133, 0.87688821,
          cv::Vec3d(1.11761372, 1.00881009, 0.90438101), 91, 0.79450640,
          0.69905107, 2.01931772, 1941323216983630140ULL, true, true) ||
      !verifySeededPair(
          "seed-141 wide transverse T", wide_transverse_t_141, 0.75098340,
          cv::Vec3d(1.01014175, 0.98731745, 0.88660844), 63, 0.98551970,
          0.53533680, 0.65401908, 5187928176814709128ULL, true, true) ||
      !verifySeededPair(
          "seed-142 edge-supported faint T", edge_supported_faint_142,
          0.91575122, cv::Vec3d(0.92846566, 1.07182334, 0.95836810), 59,
          0.73898449, 0.44541827, 3.41144540,
          1908925162034380083ULL, true, true) ||
      !verifySeededAutomaticPair(
          "seed-89 diffuse inner-region ripple", diffuse_inner_ripple_89,
          {cv::Point2f(93.74740601F, 231.65802002F),
           cv::Point2f(1010.04962158F, 213.35249329F),
           cv::Point2f(1000.54211426F, 396.46514893F),
           cv::Point2f(110.19595337F, 420.16412354F)},
          0.75283941, cv::Vec3d(0.93002366, 0.96640828, 1.01636907), 92,
          0.87786455, 0.54336503, 0.35233097,
          10036086369162819491ULL, true, false) ||
      !verifySeededAutomaticOneLine(
          "seed-68 partial-run paper texture", partial_run_texture_68,
          {cv::Point2f(99.76187897F, 173.40008545F),
           cv::Point2f(881.80468750F, 176.84963989F),
           cv::Point2f(891.18878174F, 337.80987549F),
           cv::Point2f(95.36262512F, 342.32690430F)},
          0.92417638, cv::Vec3d(1.01999935, 1.06031274, 0.92929368), 56,
          0.80554880, 0.91405727, 0.00005399,
          7218448091600840737ULL)) {
    return EXIT_FAILURE;
  }

  std::cout << "StripCV faint-line safety sweep passed " << faint_cases
            << " full-height present-line cases, " << kCaptureConditions
            << " line-free controls, " << shifted_faint_cases
            << " shifted faint-line cases, " << automatic_two_line_cases
            << " automatic faint two-line cases, " << automatic_one_line_cases
            << " automatic line-free controls, " << automatic_shifted_cases
            << " automatic shifted faint-line cases, "
            << automatic_shifted_one_line_cases
            << " automatic shifted one-line controls, 6 partial-line "
               "abstentions, "
            << edge_challenged_partial_cases
            << " edge-challenged partial-line abstentions, and the "
               "compression-ripple, unique-shifted-T, faded-full-height, "
               "remote-noise-pair, noisy-faint automatic crop, partial-run "
               "boundary, randomized/offset partial and broad artifacts, "
               "broad-control "
               "tail, quiet/subthreshold/noisy-background/narrow-fit/"
               "boundary-symmetric/projective/seeded-boundary "
               "broad-stain, and "
               "noisy-shifted/control-tail-faint and "
               "merged/subtle-merged/skipped-middle/coalesced/shifted/"
               "seeded-coalesced "
               "extra-line "
               "regressions.\n";
  return EXIT_SUCCESS;
}
