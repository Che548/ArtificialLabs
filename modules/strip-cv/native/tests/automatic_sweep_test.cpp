#include <cmath>
#include <cstdlib>
#include <iostream>
#include <map>
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

constexpr double kPeakPositionTolerance = 0.06;

struct LineLayout {
  double control;
  double test;
};

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

stripcv::test::Capture applyCaptureCondition(
    stripcv::test::Capture capture, size_t condition) {
  switch (condition % 6) {
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
          capture.rgb, 0.75, cv::Vec3d(1.0, 1.0, 1.0));
      break;
    case 4:
      capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 55);
      break;
    case 5:
      capture = resizeCapture(capture, 0.5);
      break;
    default:
      break;
  }
  return capture;
}

bool sameDecision(const stripcv::AnalysisResult& first,
                  const stripcv::AnalysisResult& second) {
  if (first.status != second.status ||
      first.control_peak.detected != second.control_peak.detected ||
      first.test_peak.detected != second.test_peak.detected ||
      first.reason_codes != second.reason_codes ||
      first.geometry.mode != second.geometry.mode ||
      std::abs(first.control_peak.position - second.control_peak.position) >
          1.0e-12 ||
      std::abs(first.test_peak.position - second.test_peak.position) >
          1.0e-12) {
    return false;
  }
  for (size_t index = 0; index < first.geometry.corners.size(); ++index) {
    if (cv::norm(first.geometry.corners[index] -
                 second.geometry.corners[index]) > 1.0e-6) {
      return false;
    }
  }
  return true;
}

bool analyzeRepeated(const std::string& name,
                     const stripcv::test::Capture& capture,
                     const stripcv::AssayProfile& assay,
                     stripcv::AnalysisResult& result) {
  result = stripcv::Analyzer().analyze(capture.rgb, assay);
  const stripcv::AnalysisResult repeated =
      stripcv::Analyzer().analyze(capture.rgb, assay);
  if (!sameDecision(result, repeated)) {
    std::cerr << name << " was nondeterministic\n";
    return false;
  }
  if (result.classification || result.cutoff ||
      result.cutoff_source != "none" || result.geometry.manually_corrected) {
    std::cerr << name << " violated the automatic/manual policy boundary\n";
    return false;
  }
  return true;
}

bool aligned(double observed, double expected) {
  return std::abs(observed - expected) <= kPeakPositionTolerance;
}

bool validAutomaticGeometry(const stripcv::AnalysisResult& result,
                            const stripcv::test::Capture& capture) {
  return result.geometry.mode != "manual" &&
         quadIou(result.geometry.corners, capture.corners) >= 0.75;
}

void recordAbstention(
    const std::string& name, const stripcv::AnalysisResult& result,
    std::map<std::string, size_t>& reason_counts,
    std::vector<std::string>& diagnostics) {
  for (const std::string& reason : result.reason_codes) {
    ++reason_counts[reason];
  }
  diagnostics.push_back(name + ": " + stripcv::test::diagnostic(result));
}

void printAbstentions(const char* label,
                      const std::map<std::string, size_t>& reason_counts,
                      const std::vector<std::string>& diagnostics) {
  std::cerr << '\n' << label << " abstention reasons:";
  for (const auto& [reason, count] : reason_counts) {
    std::cerr << ' ' << reason << '=' << count;
  }
  for (const std::string& diagnostic : diagnostics) {
    std::cerr << "\n  " << diagnostic;
  }
}

}  // namespace

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const std::vector<LineLayout> layouts = {
      {0.105, 0.205}, {0.13, 0.235}, {0.16, 0.30}};
  const std::vector<stripcv::Quad> geometries = {
      stripcv::test::defaultSceneCorners(),
      {cv::Point2f(210.0F, 190.0F), cv::Point2f(1100.0F, 275.0F),
       cv::Point2f(1020.0F, 455.0F), cv::Point2f(128.0F, 474.0F)},
      {cv::Point2f(92.0F, 294.0F), cv::Point2f(1188.0F, 178.0F),
       cv::Point2f(1164.0F, 402.0F), cv::Point2f(126.0F, 486.0F)}};
  const std::vector<double> strengths = {0.14, 0.18, 0.28};
  const std::vector<double> widths = {0.75, 1.0, 1.5};

  size_t two_line_cases = 0;
  size_t reportable_two_line = 0;
  size_t one_line_cases = 0;
  size_t reportable_one_line = 0;
  std::map<std::string, size_t> two_line_reason_counts;
  std::map<std::string, size_t> one_line_reason_counts;
  std::vector<std::string> two_line_diagnostics;
  std::vector<std::string> one_line_diagnostics;
  for (size_t geometry_index = 0; geometry_index < geometries.size();
       ++geometry_index) {
    for (size_t condition = 0; condition < 6; ++condition) {
      stripcv::test::StripOptions two_line_options;
      two_line_options.control_position = layouts[geometry_index].control;
      two_line_options.test_position = layouts[geometry_index].test;
      two_line_options.control_strength =
          strengths[(condition + 1) % strengths.size()] + 0.12;
      two_line_options.test_strength = strengths[condition % strengths.size()];
      two_line_options.control_width_factor =
          widths[condition % widths.size()];
      two_line_options.test_width_factor =
          widths[(condition + 1) % widths.size()];
      two_line_options.bright_paper = condition % 2 == 1;
      stripcv::test::Capture two_line_capture = stripcv::test::makeCapture(
          two_line_options, geometries[geometry_index]);
      two_line_capture =
          applyCaptureCondition(std::move(two_line_capture), condition);
      const std::string two_line_name =
          "automatic two-line geometry " + std::to_string(geometry_index) +
          " condition " + std::to_string(condition);
      stripcv::AnalysisResult two_line_result;
      if (!analyzeRepeated(two_line_name, two_line_capture, assay,
                           two_line_result)) {
        return EXIT_FAILURE;
      }
      if (two_line_result.status == "valid" &&
          (!stripcv::test::reportableTwoLine(two_line_result) ||
           !aligned(two_line_result.control_peak.position,
                    two_line_options.control_position) ||
           !aligned(two_line_result.test_peak.position,
                    two_line_options.test_position) ||
           !validAutomaticGeometry(two_line_result, two_line_capture))) {
        std::cerr << two_line_name << " produced a wrong reportable result: "
                  << stripcv::test::diagnostic(two_line_result) << '\n';
        return EXIT_FAILURE;
      }
      reportable_two_line +=
          stripcv::test::reportableTwoLine(two_line_result) ? 1U : 0U;
      if (!stripcv::test::reportableTwoLine(two_line_result)) {
        recordAbstention(two_line_name, two_line_result,
                         two_line_reason_counts, two_line_diagnostics);
      }
      ++two_line_cases;

      stripcv::test::StripOptions one_line_options;
      one_line_options.test_line = false;
      one_line_options.control_position = layouts[geometry_index].control;
      one_line_options.control_strength =
          strengths[(condition + 2) % strengths.size()] + 0.12;
      one_line_options.control_width_factor =
          widths[(condition + 1) % widths.size()];
      one_line_options.bright_paper = condition % 2 == 1;
      stripcv::test::Capture one_line_capture = stripcv::test::makeCapture(
          one_line_options, geometries[geometry_index]);
      one_line_capture =
          applyCaptureCondition(std::move(one_line_capture), condition);
      const std::string one_line_name =
          "automatic one-line geometry " + std::to_string(geometry_index) +
          " condition " + std::to_string(condition);
      stripcv::AnalysisResult one_line_result;
      if (!analyzeRepeated(one_line_name, one_line_capture, assay,
                           one_line_result)) {
        return EXIT_FAILURE;
      }
      if (one_line_result.status == "valid" &&
          (!stripcv::test::reportableOneLine(one_line_result) ||
           !aligned(one_line_result.control_peak.position,
                    one_line_options.control_position) ||
           !validAutomaticGeometry(one_line_result, one_line_capture))) {
        std::cerr << one_line_name << " produced a wrong reportable result: "
                  << stripcv::test::diagnostic(one_line_result) << '\n';
        return EXIT_FAILURE;
      }
      reportable_one_line +=
          stripcv::test::reportableOneLine(one_line_result) ? 1U : 0U;
      if (!stripcv::test::reportableOneLine(one_line_result)) {
        recordAbstention(one_line_name, one_line_result,
                         one_line_reason_counts, one_line_diagnostics);
      }
      ++one_line_cases;
    }
  }

  size_t invalid_cases = 0;
  for (size_t geometry_index = 0; geometry_index < geometries.size();
       ++geometry_index) {
    for (size_t condition : {size_t{0}, size_t{4}, size_t{5}}) {
      stripcv::test::StripOptions options;
      options.control_line = false;
      options.test_position = layouts[geometry_index].test;
      options.test_strength = strengths[condition % strengths.size()];
      stripcv::test::Capture capture = stripcv::test::makeCapture(
          options, geometries[geometry_index]);
      capture = applyCaptureCondition(std::move(capture), condition);
      const std::string name =
          "automatic missing-control geometry " +
          std::to_string(geometry_index) + " condition " +
          std::to_string(condition);
      stripcv::AnalysisResult result;
      if (!analyzeRepeated(name, capture, assay, result)) {
        return EXIT_FAILURE;
      }
      if (result.status == "valid") {
        std::cerr << name << " produced an unsafe reportable result: "
                  << stripcv::test::diagnostic(result) << '\n';
        return EXIT_FAILURE;
      }
      ++invalid_cases;
    }

    stripcv::test::StripOptions partial_options;
    partial_options.line_vertical_fraction = 0.30;
    const stripcv::test::Capture partial_capture = stripcv::test::makeCapture(
        partial_options, geometries[geometry_index]);
    stripcv::AnalysisResult partial_result;
    const std::string partial_name =
        "automatic partial-window geometry " +
        std::to_string(geometry_index);
    if (!analyzeRepeated(partial_name, partial_capture, assay,
                         partial_result) ||
        partial_result.status == "valid") {
      std::cerr << partial_name << " remained reportable: "
                << stripcv::test::diagnostic(partial_result) << '\n';
      return EXIT_FAILURE;
    }
    ++invalid_cases;

    stripcv::test::StripOptions extra_line_options;
    extra_line_options.extra_line = true;
    const stripcv::test::Capture extra_line_capture =
        stripcv::test::makeCapture(extra_line_options,
                                   geometries[geometry_index]);
    stripcv::AnalysisResult extra_line_result;
    const std::string extra_line_name =
        "automatic extra-line geometry " + std::to_string(geometry_index);
    if (!analyzeRepeated(extra_line_name, extra_line_capture, assay,
                         extra_line_result) ||
        extra_line_result.status == "valid") {
      std::cerr << extra_line_name << " remained reportable: "
                << stripcv::test::diagnostic(extra_line_result) << '\n';
      return EXIT_FAILURE;
    }
    ++invalid_cases;
  }

  const cv::Mat blank(720, 1280, CV_8UC3, cv::Scalar(118, 126, 121));
  const stripcv::AnalysisResult blank_result =
      stripcv::Analyzer().analyze(blank, assay);
  if (blank_result.status == "valid") {
    std::cerr << "automatic blank OOD image became reportable\n";
    return EXIT_FAILURE;
  }
  ++invalid_cases;

  const double two_line_coverage =
      reportable_two_line / static_cast<double>(two_line_cases);
  const double one_line_coverage =
      reportable_one_line / static_cast<double>(one_line_cases);
  const double overall_coverage =
      (reportable_two_line + reportable_one_line) /
      static_cast<double>(two_line_cases + one_line_cases);
  if (two_line_coverage < 0.90 || one_line_coverage < 0.90 ||
      overall_coverage < 0.95) {
    std::cerr << "automatic sweep coverage below policy: two-line="
              << two_line_coverage << " one-line=" << one_line_coverage
              << " overall=" << overall_coverage;
    printAbstentions("two-line", two_line_reason_counts,
                     two_line_diagnostics);
    printAbstentions("one-line", one_line_reason_counts,
                     one_line_diagnostics);
    std::cerr << '\n';
    return EXIT_FAILURE;
  }

  std::cout << "StripCV automatic sweep passed " << reportable_two_line << "/"
            << two_line_cases << " two-line, " << reportable_one_line << "/"
            << one_line_cases << " one-line, and " << invalid_cases
            << " invalid/OOD cases.\n";
  return EXIT_SUCCESS;
}
