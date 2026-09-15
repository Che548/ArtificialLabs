#include <cmath>
#include <cstdlib>
#include <iostream>
#include <map>
#include <string>
#include <utility>
#include <vector>

#include "stripcv/analyzer.hpp"
#include "synthetic_fixture.hpp"

namespace {

constexpr double kPeakPositionTolerance = 0.06;

struct LineLayout {
  double control;
  double test;
};

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
          capture.rgb, 0.72, cv::Vec3d(1.0, 1.0, 1.0));
      break;
    case 4:
      capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 52);
      break;
    case 5:
      capture.rgb = stripcv::test::exposureAndCast(
          capture.rgb, 0.82, cv::Vec3d(1.06, 1.00, 0.94));
      capture.rgb = stripcv::test::jpegRoundTrip(capture.rgb, 64);
      break;
    default:
      break;
  }
  return capture;
}

stripcv::AnalysisResult analyzeKnownGeometry(
    const stripcv::test::Capture& capture,
    const stripcv::AssayProfile& assay) {
  stripcv::AnalysisOptions options;
  options.corner_override = capture.corners;
  return stripcv::Analyzer().analyze(capture.rgb, assay, options);
}

bool policyInvariant(const std::string& name,
                     const stripcv::AnalysisResult& result) {
  if (result.classification || result.cutoff || result.cutoff_source != "none") {
    std::cerr << name << " introduced a cutoff/classification: "
              << stripcv::test::diagnostic(result) << '\n';
    return false;
  }
  return true;
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

bool verifyRepeat(const std::string& name,
                  const stripcv::test::Capture& capture,
                  const stripcv::AssayProfile& assay,
                  stripcv::AnalysisResult& result) {
  result = analyzeKnownGeometry(capture, assay);
  const double control_position_before_repeat = result.control_peak.position;
  const double test_position_before_repeat = result.test_peak.position;
  const stripcv::AnalysisResult repeated = analyzeKnownGeometry(capture, assay);
  if (result.control_peak.position != control_position_before_repeat ||
      result.test_peak.position != test_position_before_repeat) {
    std::cerr << name << " mutated after a separate repeated analysis\n";
    return false;
  }
  if (!sameDecision(result, repeated)) {
    std::cerr << name << " was nondeterministic\n";
    return false;
  }
  return policyInvariant(name, result);
}

bool aligned(double observed, double expected) {
  return std::abs(observed - expected) <= kPeakPositionTolerance;
}

void countReasons(const stripcv::AnalysisResult& result,
                  std::map<std::string, size_t>& counts) {
  for (const std::string& reason : result.reason_codes) {
    ++counts[reason];
  }
}

void printReasonCounts(const std::map<std::string, size_t>& counts) {
  for (const auto& [reason, count] : counts) {
    std::cerr << ' ' << reason << '=' << count;
  }
}

}  // namespace

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const std::vector<LineLayout> layouts = {
      {0.105, 0.205}, {0.13, 0.235}, {0.16, 0.30}, {0.17, 0.36}};
  const std::vector<double> test_strengths = {0.14, 0.18, 0.28};
  const std::vector<double> control_strengths = {0.26, 0.32, 0.40};
  const std::vector<double> width_factors = {0.75, 1.0, 1.5};
  const std::vector<stripcv::Quad> geometries = {
      stripcv::test::defaultSceneCorners(),
      {cv::Point2f(210.0F, 190.0F), cv::Point2f(1100.0F, 275.0F),
       cv::Point2f(1020.0F, 455.0F), cv::Point2f(128.0F, 474.0F)},
      {cv::Point2f(92.0F, 294.0F), cv::Point2f(1188.0F, 178.0F),
       cv::Point2f(1164.0F, 402.0F), cv::Point2f(126.0F, 486.0F)}};

  size_t case_index = 0;
  size_t valid_two_line_cases = 0;
  size_t reportable_two_line_cases = 0;
  std::map<std::string, size_t> two_line_abstention_reasons;
  std::vector<std::string> two_line_abstention_diagnostics;
  for (const LineLayout& layout : layouts) {
    for (double test_strength : test_strengths) {
      for (double control_strength : control_strengths) {
        for (bool bright_paper : {false, true}) {
          stripcv::test::StripOptions options;
          options.control_position = layout.control;
          options.test_position = layout.test;
          options.control_strength = control_strength;
          options.test_strength = test_strength;
          options.control_width_factor =
              width_factors[case_index % width_factors.size()];
          options.test_width_factor =
              width_factors[(case_index + 1) % width_factors.size()];
          options.bright_paper = bright_paper;
          stripcv::test::Capture capture = stripcv::test::makeCapture(
              options, geometries[case_index % geometries.size()]);
          capture = applyCaptureCondition(std::move(capture), case_index);
          const std::string name =
              "two-line sweep case " + std::to_string(case_index);
          stripcv::AnalysisResult result;
          if (!verifyRepeat(name, capture, assay, result)) {
            return EXIT_FAILURE;
          }
          if (result.status == "valid" &&
              (!stripcv::test::reportableTwoLine(result) ||
               !aligned(result.control_peak.position, layout.control) ||
               !aligned(result.test_peak.position, layout.test))) {
            std::cerr << name << " produced a wrong reportable result: "
                      << stripcv::test::diagnostic(result) << '\n';
            return EXIT_FAILURE;
          }
          reportable_two_line_cases +=
              stripcv::test::reportableTwoLine(result) ? 1U : 0U;
          if (!stripcv::test::reportableTwoLine(result)) {
            countReasons(result, two_line_abstention_reasons);
            two_line_abstention_diagnostics.push_back(
                name + ": " + stripcv::test::diagnostic(result));
          }
          ++case_index;
          ++valid_two_line_cases;
        }
      }
    }
  }

  size_t valid_one_line_cases = 0;
  size_t reportable_one_line_cases = 0;
  std::map<std::string, size_t> one_line_abstention_reasons;
  std::vector<std::string> one_line_abstention_diagnostics;
  for (double control_position : {0.09, 0.13, 0.17}) {
    for (double control_strength : control_strengths) {
      for (bool bright_paper : {false, true}) {
        stripcv::test::StripOptions options;
        options.test_line = false;
        options.control_position = control_position;
        options.control_strength = control_strength;
        options.control_width_factor =
            width_factors[case_index % width_factors.size()];
        options.bright_paper = bright_paper;
        stripcv::test::Capture capture = stripcv::test::makeCapture(
            options, geometries[case_index % geometries.size()]);
        capture = applyCaptureCondition(std::move(capture), case_index);
        const std::string name =
            "one-line sweep case " + std::to_string(case_index);
        stripcv::AnalysisResult result;
        if (!verifyRepeat(name, capture, assay, result)) {
          return EXIT_FAILURE;
        }
        if (result.status == "valid" &&
            (!stripcv::test::reportableOneLine(result) ||
             !aligned(result.control_peak.position, control_position))) {
          std::cerr << name << " produced a wrong reportable result: "
                    << stripcv::test::diagnostic(result) << '\n';
          return EXIT_FAILURE;
        }
        reportable_one_line_cases +=
            stripcv::test::reportableOneLine(result) ? 1U : 0U;
        if (!stripcv::test::reportableOneLine(result)) {
          countReasons(result, one_line_abstention_reasons);
          one_line_abstention_diagnostics.push_back(
              name + ": " + stripcv::test::diagnostic(result));
        }
        ++case_index;
        ++valid_one_line_cases;
      }
    }
  }

  size_t invalid_cases = 0;
  for (double test_position : {0.20, 0.30, 0.36}) {
    for (double test_strength : {0.14, 0.24}) {
      for (bool bright_paper : {false, true}) {
        stripcv::test::StripOptions options;
        options.control_line = false;
        options.test_position = test_position;
        options.test_strength = test_strength;
        options.bright_paper = bright_paper;
        stripcv::test::Capture capture = stripcv::test::makeCapture(
            options, geometries[case_index % geometries.size()]);
        capture = applyCaptureCondition(std::move(capture), case_index);
        const std::string name =
            "missing-control sweep case " + std::to_string(case_index);
        stripcv::AnalysisResult result;
        if (!verifyRepeat(name, capture, assay, result)) {
          return EXIT_FAILURE;
        }
        if (result.status == "valid") {
          std::cerr << name << " produced an unsafe reportable result: "
                    << stripcv::test::diagnostic(result) << '\n';
          return EXIT_FAILURE;
        }
        ++case_index;
        ++invalid_cases;
      }
    }
  }

  for (double vertical_fraction : {0.20, 0.30, 0.40}) {
    stripcv::test::StripOptions options;
    options.line_vertical_fraction = vertical_fraction;
    stripcv::test::Capture capture = stripcv::test::makeCapture(
        options, geometries[case_index % geometries.size()]);
    capture = applyCaptureCondition(std::move(capture), case_index);
    const std::string name =
        "partial-window sweep case " + std::to_string(case_index);
    stripcv::AnalysisResult result;
    if (!verifyRepeat(name, capture, assay, result)) {
      return EXIT_FAILURE;
    }
    if (result.status == "valid") {
      std::cerr << name << " produced an unsafe reportable result: "
                << stripcv::test::diagnostic(result) << '\n';
      return EXIT_FAILURE;
    }
    ++case_index;
    ++invalid_cases;
  }

  stripcv::test::StripOptions extra_line_options;
  extra_line_options.extra_line = true;
  const stripcv::test::Capture extra_line_capture =
      stripcv::test::makeCapture(extra_line_options);
  stripcv::AnalysisResult extra_line_result;
  if (!verifyRepeat("extra-line sweep case", extra_line_capture, assay,
                    extra_line_result) ||
      extra_line_result.status == "valid") {
    std::cerr << "extra-line sweep case remained reportable: "
              << stripcv::test::diagnostic(extra_line_result) << '\n';
    return EXIT_FAILURE;
  }
  ++invalid_cases;

  const double two_line_coverage =
      reportable_two_line_cases /
      static_cast<double>(valid_two_line_cases);
  const double one_line_coverage =
      reportable_one_line_cases /
      static_cast<double>(valid_one_line_cases);
  const double overall_coverage =
      (reportable_two_line_cases + reportable_one_line_cases) /
      static_cast<double>(valid_two_line_cases + valid_one_line_cases);
  if (reportable_two_line_cases != valid_two_line_cases ||
      reportable_one_line_cases != valid_one_line_cases) {
    std::cerr << "parameter sweep did not report every valid synthetic case: two-line="
              << two_line_coverage << " one-line=" << one_line_coverage
              << " overall=" << overall_coverage
              << "\ntwo-line abstention reasons:";
    printReasonCounts(two_line_abstention_reasons);
    for (const std::string& diagnostic : two_line_abstention_diagnostics) {
      std::cerr << "\n  " << diagnostic;
    }
    std::cerr << "\none-line abstention reasons:";
    printReasonCounts(one_line_abstention_reasons);
    for (const std::string& diagnostic : one_line_abstention_diagnostics) {
      std::cerr << "\n  " << diagnostic;
    }
    std::cerr << '\n';
    return EXIT_FAILURE;
  }

  std::cout << "StripCV deterministic parameter sweep passed "
            << reportable_two_line_cases << "/" << valid_two_line_cases
            << " two-line, " << reportable_one_line_cases << "/"
            << valid_one_line_cases << " one-line, and " << invalid_cases
            << " invalid cases.\n";
  return EXIT_SUCCESS;
}
