#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <map>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif

#include "stripcv/analyzer.hpp"
#include "synthetic_fixture.hpp"

namespace {

constexpr uint64_t kSeed = 0x4843475245434F47ULL;
constexpr size_t kCases = 240;
constexpr size_t kAutomaticCases = 90;
constexpr size_t kAutomaticInvalidCases = 120;
constexpr double kMinObservableSourceResponse = 0.003;

struct CaptureCondition {
  double exposure = 1.0;
  cv::Vec3d gains{1.0, 1.0, 1.0};
  int jpeg_quality = 100;
  double scale = 1.0;
  double blur_sigma = 0.0;
  double noise_sigma = 0.0;
  uint64_t noise_seed = 0;
};

double uniform(std::mt19937_64& random, double lower, double upper) {
  return std::uniform_real_distribution<double>(lower, upper)(random);
}

void countReasons(const stripcv::AnalysisResult& result,
                  std::map<std::string, size_t>& counts) {
  for (const std::string& reason : result.reason_codes) {
    ++counts[reason];
  }
}

void printReasons(const std::map<std::string, size_t>& counts) {
  for (const auto& [reason, count] : counts) {
    std::cerr << ' ' << reason << '=' << count;
  }
}

bool diagnosticsEnabled() {
  const char* value = std::getenv("STRIPCV_RANDOMIZED_DIAGNOSTICS");
  return value != nullptr && std::string(value) != "0";
}

bool diagnosticMatches(const stripcv::AnalysisResult& result) {
  const char* value =
      std::getenv("STRIPCV_RANDOMIZED_DIAGNOSTIC_REASON");
  if (value == nullptr || *value == '\0') {
    return true;
  }
  return stripcv::test::hasReason(result, value);
}

bool exploratoryCoverageShortfallAllowed() {
  const char* value =
      std::getenv("STRIPCV_RANDOMIZED_ALLOW_COVERAGE_SHORTFALL");
  return value != nullptr && std::string(value) != "0";
}

uint64_t environmentUnsigned(const char* name, uint64_t fallback,
                             uint64_t minimum, uint64_t maximum) {
  const char* value = std::getenv(name);
  if (value == nullptr || *value == '\0') {
    return fallback;
  }
  size_t consumed = 0;
  uint64_t parsed = 0;
  try {
    parsed = std::stoull(value, &consumed, 0);
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string(name) +
                                " must be an unsigned integer");
  }
  if (consumed != std::string(value).size() || parsed < minimum ||
      parsed > maximum) {
    throw std::invalid_argument(std::string(name) +
                                " is outside the allowed range");
  }
  return parsed;
}

void printDiagnostics(const char* label,
                      const std::map<std::string, size_t>& reasons,
                      const std::vector<std::string>& diagnostics) {
  std::cerr << label << " reasons:";
  printReasons(reasons);
  std::cerr << '\n';
  for (const std::string& diagnostic : diagnostics) {
    std::cerr << ' ' << label << ": " << diagnostic << '\n';
  }
}

bool captureNoncompliant(const stripcv::AnalysisResult& result) {
  static const std::array<const char*, 7> reasons = {
      "adjust_exposure",
      "exposure_clipping",
      "insufficient_valid_membrane_pixels",
      "image_too_blurry",
      "glare_crosses_control_line",
      "reduce_glare",
      "broad_shadow_or_illumination_gradient"};
  return std::any_of(reasons.begin(), reasons.end(), [&](const char* reason) {
    return stripcv::test::hasReason(result, reason);
  });
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

cv::Mat addNoise(const cv::Mat& rgb, double sigma, uint64_t seed) {
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

stripcv::test::Capture applyCondition(stripcv::test::Capture capture,
                                      const CaptureCondition& condition) {
  capture.rgb = stripcv::test::exposureAndCast(
      capture.rgb, condition.exposure, condition.gains);
  if (condition.blur_sigma > 0.0) {
    const int radius = std::max(1, cvRound(2.5 * condition.blur_sigma));
    const int kernel = 2 * radius + 1;
    cv::GaussianBlur(capture.rgb, capture.rgb, cv::Size(kernel, kernel),
                     condition.blur_sigma);
  }
  if (condition.jpeg_quality < 100) {
    capture.rgb =
        stripcv::test::jpegRoundTrip(capture.rgb, condition.jpeg_quality);
  }
  if (condition.noise_sigma > 0.0) {
    capture.rgb = addNoise(capture.rgb, condition.noise_sigma,
                           condition.noise_seed);
  }
  if (condition.scale != 1.0) {
    capture = resizeCapture(capture, condition.scale);
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

double peakAsymmetry(const stripcv::AnalysisResult& result,
                     double position, double radius) {
  double left = 0.0;
  double right = 0.0;
  for (size_t index = 1; index < result.x.size(); ++index) {
    const double midpoint = 0.5 * (result.x[index - 1] + result.x[index]);
    if (midpoint < position - radius || midpoint > position + radius) {
      continue;
    }
    const double area =
        0.5 * (std::max(0.0, result.corrected_profile[index - 1]) +
               std::max(0.0, result.corrected_profile[index])) *
        (result.x[index] - result.x[index - 1]);
    (midpoint < position ? left : right) += area;
  }
  return std::abs(left - right) / std::max(1.0e-9, left + right);
}

struct PeakShapeMetrics {
  double sigma = 0.0;
  double kurtosis = 0.0;
  double gaussian_l1 = 0.0;
};

PeakShapeMetrics peakShapeMetrics(const stripcv::AnalysisResult& result,
                                  double position, double radius) {
  PeakShapeMetrics metrics;
  std::vector<double> positions;
  std::vector<double> weights;
  double total = 0.0;
  double mean = 0.0;
  for (size_t index = 0; index < result.x.size(); ++index) {
    if (std::abs(result.x[index] - position) > radius) {
      continue;
    }
    const double weight = std::max(0.0, result.corrected_profile[index]);
    positions.push_back(result.x[index]);
    weights.push_back(weight);
    total += weight;
    mean += weight * result.x[index];
  }
  if (total <= 1.0e-12 || positions.size() < 3) {
    return metrics;
  }
  mean /= total;
  double second = 0.0;
  double fourth = 0.0;
  for (size_t index = 0; index < positions.size(); ++index) {
    const double delta = positions[index] - mean;
    second += weights[index] * delta * delta;
    fourth += weights[index] * delta * delta * delta * delta;
  }
  second /= total;
  fourth /= total;
  metrics.sigma = std::sqrt(std::max(0.0, second));
  metrics.kurtosis = fourth / std::max(1.0e-18, second * second);
  if (metrics.sigma <= 1.0e-9) {
    return metrics;
  }
  double gaussian_total = 0.0;
  std::vector<double> gaussian(weights.size());
  for (size_t index = 0; index < positions.size(); ++index) {
    const double z = (positions[index] - mean) / metrics.sigma;
    gaussian[index] = std::exp(-0.5 * z * z);
    gaussian_total += gaussian[index];
  }
  for (size_t index = 0; index < positions.size(); ++index) {
    metrics.gaussian_l1 +=
        std::abs(weights[index] / total - gaussian[index] / gaussian_total);
  }
  return metrics;
}

std::string peakShapeDescription(const stripcv::AnalysisResult& result,
                                 const stripcv::AssayProfile& assay) {
  const PeakShapeMetrics shape = peakShapeMetrics(
      result, result.test_peak.position, 3.0 * assay.expected_line_width);
  std::ostringstream output;
  output << " T_asymmetry="
         << peakAsymmetry(result, result.test_peak.position,
                          2.0 * assay.expected_line_width)
         << " T_shape_sigma=" << shape.sigma
         << " T_shape_kurtosis=" << shape.kurtosis
         << " T_shape_gaussian_l1=" << shape.gaussian_l1;
  return output.str();
}

stripcv::Quad randomGeometry(std::mt19937_64& random) {
  const cv::Point2f top_left(static_cast<float>(uniform(random, 80.0, 190.0)),
                             static_cast<float>(uniform(random, 155.0, 285.0)));
  const cv::Point2f top_right(
      static_cast<float>(uniform(random, 1060.0, 1200.0)),
      static_cast<float>(uniform(random, 150.0, 295.0)));
  const cv::Point2f bottom_right(
      top_right.x + static_cast<float>(uniform(random, -25.0, 25.0)),
      top_right.y + static_cast<float>(uniform(random, 165.0, 240.0)));
  const cv::Point2f bottom_left(
      top_left.x + static_cast<float>(uniform(random, -25.0, 25.0)),
      top_left.y + static_cast<float>(uniform(random, 165.0, 240.0)));
  return {top_left, top_right, bottom_right, bottom_left};
}

double sourceLineResponse(const stripcv::test::Capture& capture,
                          const stripcv::AssayProfile& assay,
                          double position) {
  const std::array<cv::Point2f, 4> destination = {
      cv::Point2f(0.0F, 0.0F),
      cv::Point2f(static_cast<float>(assay.canonical_width - 1), 0.0F),
      cv::Point2f(static_cast<float>(assay.canonical_width - 1),
                  static_cast<float>(assay.canonical_height - 1)),
      cv::Point2f(0.0F, static_cast<float>(assay.canonical_height - 1))};
  const cv::Mat homography = cv::getPerspectiveTransform(
      capture.corners.data(), destination.data());
  cv::Mat rectified;
  cv::warpPerspective(capture.rgb, rectified, homography,
                      cv::Size(assay.canonical_width, assay.canonical_height));
  const cv::Rect membrane = stripcv::test::membraneRect(assay);
  const int center = membrane.x + cvRound(position * membrane.width);
  const int half_width =
      std::max(1, cvRound(0.45 * assay.expected_line_width * membrane.width));
  const int flank_offset =
      std::max(half_width + 1,
               cvRound(1.5 * assay.expected_line_width * membrane.width));
  const auto mean = [&](int x0, int x1) {
    double sum = 0.0;
    size_t count = 0;
    for (int row = membrane.y; row < membrane.y + membrane.height; ++row) {
      for (int column = x0; column < x1; ++column) {
        const cv::Vec3b pixel = rectified.at<cv::Vec3b>(row, column);
        sum += std::log((pixel[0] + 1.0) / (pixel[1] + 1.0));
        ++count;
      }
    }
    return sum / static_cast<double>(count);
  };
  const double core = mean(center - half_width, center + half_width + 1);
  const double flanks =
      0.5 * (mean(center - flank_offset - 2 * half_width,
                  center - flank_offset) +
             mean(center + flank_offset, center + flank_offset + 2 * half_width));
  return core - flanks;
}

std::string describe(size_t index,
                     const stripcv::test::StripOptions& options,
                     const CaptureCondition& condition) {
  std::ostringstream output;
  output << std::fixed << std::setprecision(8) << "case=" << index
         << " Cpos=" << options.control_position
         << " Tpos=" << options.test_position
         << " Cstrength=" << options.control_strength
         << " Tstrength=" << options.test_strength
         << " Cwidth=" << options.control_width_factor
         << " Twidth=" << options.test_width_factor
         << " Cvertical=" << options.control_vertical_fraction << '@'
         << options.control_vertical_center
         << " Tvertical=" << options.test_vertical_fraction << '@'
         << options.test_vertical_center
         << " Cgradient=" << options.control_vertical_gradient
         << " Tgradient=" << options.test_vertical_gradient
         << " Cmodulation=" << options.control_vertical_modulation << '@'
         << options.control_vertical_phase
         << " Tmodulation=" << options.test_vertical_modulation << '@'
         << options.test_vertical_phase
         << " bright_paper=" << (options.bright_paper ? 1 : 0)
         << " Cdye=(" << options.control_dye_rgb[0] << ','
         << options.control_dye_rgb[1] << ',' << options.control_dye_rgb[2]
         << ") Tdye=(" << options.test_dye_rgb[0] << ','
         << options.test_dye_rgb[1] << ',' << options.test_dye_rgb[2] << ')'
         << " exposure=" << condition.exposure << " gains=("
         << condition.gains[0] << ',' << condition.gains[1] << ','
         << condition.gains[2] << ") jpeg=" << condition.jpeg_quality
         << " scale=" << condition.scale
         << " blur=" << condition.blur_sigma
         << " noise=" << condition.noise_sigma
         << " noise_seed=" << condition.noise_seed;
  return output.str();
}

std::string describeQuad(const stripcv::Quad& corners) {
  std::ostringstream output;
  output << std::fixed << std::setprecision(8) << " ground_truth_corners=";
  for (const cv::Point2f& point : corners) {
    output << '(' << point.x << ':' << point.y << ')';
  }
  return output.str();
}

}  // namespace

int main() {
  const uint64_t seed = environmentUnsigned(
      "STRIPCV_RANDOMIZED_SEED", kSeed, 0, UINT64_MAX);
  const size_t cases = static_cast<size_t>(environmentUnsigned(
      "STRIPCV_RANDOMIZED_CASES", kCases, 1, 10000));
  const size_t automatic_cases = static_cast<size_t>(environmentUnsigned(
      "STRIPCV_RANDOMIZED_AUTOMATIC_CASES", kAutomaticCases, 1, 5000));
  const size_t automatic_invalid_cases =
      static_cast<size_t>(environmentUnsigned(
          "STRIPCV_RANDOMIZED_INVALID_CASES", kAutomaticInvalidCases, 1,
          5000));
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const std::vector<cv::Vec3d> dyes = {
      {196.0, 52.0, 92.0}, {175.0, 65.0, 95.0},
      {150.0, 55.0, 105.0}, {125.0, 60.0, 110.0},
      {210.0, 95.0, 125.0}, {130.0, 75.0, 105.0}};
  std::mt19937_64 random(seed);
  size_t reportable_two_line = 0;
  size_t reportable_one_line = 0;
  size_t safe_missing_control = 0;
  size_t nonobservable_stress_cases = 0;
  size_t noncompliant_stress_cases = 0;
  std::map<std::string, size_t> two_line_abstention_reasons;
  std::map<std::string, size_t> one_line_abstention_reasons;
  std::vector<std::string> two_line_abstention_diagnostics;
  std::vector<std::string> one_line_abstention_diagnostics;

  size_t attempts = 0;
  for (size_t index = 0; index < cases;) {
    if (++attempts > 5 * cases) {
      std::cerr << "could not generate enough observable randomized cases\n";
      return EXIT_FAILURE;
    }
    stripcv::test::StripOptions two_line;
    two_line.control_position = uniform(random, 0.09, 0.17);
    two_line.test_position =
        two_line.control_position + uniform(random, 0.085, 0.20);
    two_line.control_strength = uniform(random, 0.18, 0.42);
    // Include dye-stealer-like appearances where T is substantially darker
    // than C, as well as the weak-T boundary.
    two_line.test_strength = uniform(random, 0.02, 0.46);
    two_line.control_width_factor = uniform(random, 0.60, 1.90);
    two_line.test_width_factor = uniform(random, 0.60, 1.90);
    two_line.bright_paper = (random() & 1U) != 0;
    // C and T share the same assay chemistry, but development strength,
    // paper interaction, and camera color can shift their observed hue
    // independently. Cross the supported red/magenta palette instead of
    // assuming pixel-identical line colors.
    two_line.control_dye_rgb = dyes[random() % dyes.size()];
    two_line.test_dye_rgb = dyes[random() % dyes.size()];
    two_line.control_vertical_gradient = uniform(random, -0.55, 0.55);
    two_line.test_vertical_gradient = uniform(random, -0.55, 0.55);
    two_line.control_vertical_modulation = uniform(random, 0.0, 0.30);
    two_line.test_vertical_modulation = uniform(random, 0.0, 0.30);
    two_line.control_vertical_phase = uniform(random, 0.0, 1.0);
    two_line.test_vertical_phase = uniform(random, 0.0, 1.0);

    CaptureCondition condition;
    condition.exposure = uniform(random, 0.68, 1.0);
    condition.gains = {uniform(random, 0.86, 1.14),
                       uniform(random, 0.90, 1.08),
                       uniform(random, 0.86, 1.14)};
    condition.jpeg_quality =
        std::uniform_int_distribution<int>(35, 100)(random);
    condition.scale = uniform(random, 0.36, 1.0);
    condition.blur_sigma = uniform(random, 0.0, 1.35);
    condition.noise_sigma = uniform(random, 0.0, 3.5);
    condition.noise_seed = random();

    const std::string case_description =
        describe(index, two_line, condition);
    const stripcv::test::Capture two_line_capture = applyCondition(
        stripcv::test::makeCapture(two_line), condition);
    const double source_test_response = sourceLineResponse(
        two_line_capture, assay, two_line.test_position);
    // Compound transformations can erase the synthetic T completely. Such a
    // frame is useful as correlated destructive stress evidence, but its
    // ground-truth two-line label is not observable in the pixels and cannot
    // be counted as a compliant recognition case. Keep searching until the
    // locked seeded inventory contains the requested number of cases with
    // positive line-scale source
    // contrast.
    if (source_test_response < kMinObservableSourceResponse) {
      ++nonobservable_stress_cases;
      continue;
    }
    const stripcv::AnalysisResult two_line_result =
        analyzeKnownGeometry(two_line_capture, assay);
    if (two_line_result.status == "valid" &&
        (!stripcv::test::reportableTwoLine(two_line_result) ||
         !aligned(two_line_result.control_peak.position,
                  two_line.control_position) ||
         !aligned(two_line_result.test_peak.position, two_line.test_position))) {
      std::cerr << "randomized two-line case produced a wrong reportable "
                   "decision: "
                << case_description << ' '
                << stripcv::test::diagnostic(two_line_result)
                << " source_line_response="
                << source_test_response
                << '\n';
      return EXIT_FAILURE;
    }
    stripcv::test::StripOptions one_line = two_line;
    one_line.test_line = false;
    const stripcv::test::Capture one_line_capture = applyCondition(
        stripcv::test::makeCapture(one_line), condition);
    const stripcv::AnalysisResult one_line_result =
        analyzeKnownGeometry(one_line_capture, assay);
    if (diagnosticsEnabled()) {
      if (stripcv::test::hasReason(
              two_line_result, "control_tail_deblended_test_peak")) {
        std::cerr << " paired two-line deblend: " << case_description << ' '
                  << stripcv::test::diagnostic(two_line_result) << '\n';
      }
      if (stripcv::test::hasReason(
              one_line_result, "control_tail_deblended_test_peak")) {
        std::cerr << " paired one-line deblend: " << case_description << ' '
                  << stripcv::test::diagnostic(one_line_result) << '\n';
      }
    }
    if (one_line_result.status == "valid" &&
        (!stripcv::test::reportableOneLine(one_line_result) ||
         !aligned(one_line_result.control_peak.position,
                  one_line.control_position))) {
      std::cerr << "paired line-free control produced a wrong reportable "
                   "decision: "
                << case_description << ' '
                << stripcv::test::diagnostic(one_line_result) << '\n';
      return EXIT_FAILURE;
    }
    stripcv::test::StripOptions missing_control = two_line;
    missing_control.control_line = false;
    const stripcv::test::Capture missing_control_capture = applyCondition(
        stripcv::test::makeCapture(missing_control), condition);
    const stripcv::AnalysisResult missing_control_result =
        analyzeKnownGeometry(missing_control_capture, assay);
    if (missing_control_result.status == "valid") {
      std::cerr << "paired missing-control case became reportable: "
                << case_description << ' '
                << stripcv::test::diagnostic(missing_control_result) << '\n';
      return EXIT_FAILURE;
    }
    // Coverage is defined over capture-compliant valid inputs. Retain
    // clipped, glare-masked, or otherwise unusable paired frames as safety
    // stress (the wrong-reportable checks above still apply), then keep
    // searching until the seeded inventory contains the requested number of
    // compliant pairs.
    if (captureNoncompliant(two_line_result) ||
        captureNoncompliant(one_line_result)) {
      ++noncompliant_stress_cases;
      continue;
    }
    reportable_two_line +=
        stripcv::test::reportableTwoLine(two_line_result) ? 1U : 0U;
    if (!stripcv::test::reportableTwoLine(two_line_result)) {
      countReasons(two_line_result, two_line_abstention_reasons);
      if (diagnosticMatches(two_line_result)) {
        two_line_abstention_diagnostics.push_back(
            case_description + " " +
            stripcv::test::diagnostic(two_line_result) +
            peakShapeDescription(two_line_result, assay) + " paired_one=" +
            stripcv::test::diagnostic(one_line_result));
      }
    }
    reportable_one_line +=
        stripcv::test::reportableOneLine(one_line_result) ? 1U : 0U;
    if (!stripcv::test::reportableOneLine(one_line_result)) {
      countReasons(one_line_result, one_line_abstention_reasons);
      if (diagnosticMatches(one_line_result)) {
        one_line_abstention_diagnostics.push_back(
            case_description + " " +
            stripcv::test::diagnostic(one_line_result));
      }
    }
    ++safe_missing_control;
    ++index;
  }

  const double two_line_coverage =
      reportable_two_line / static_cast<double>(cases);
  const double one_line_coverage =
      reportable_one_line / static_cast<double>(cases);
  if (diagnosticsEnabled()) {
    printDiagnostics("two-line abstention", two_line_abstention_reasons,
                     two_line_abstention_diagnostics);
    printDiagnostics("one-line abstention", one_line_abstention_reasons,
                     one_line_abstention_diagnostics);
  }
  const bool paired_coverage_below_policy =
      two_line_coverage < 0.95 || one_line_coverage < 0.95;
  if (paired_coverage_below_policy) {
    std::cerr << "randomized recognition coverage below policy: two-line="
              << reportable_two_line << '/' << cases << " one-line="
              << reportable_one_line << '/' << cases
              << "\n two-line abstentions:";
    printReasons(two_line_abstention_reasons);
    std::cerr << "\n one-line abstentions:";
    printReasons(one_line_abstention_reasons);
    std::cerr << '\n';
    if (!exploratoryCoverageShortfallAllowed()) {
      return EXIT_FAILURE;
    }
    std::cerr << "continuing to later randomized phases because "
                 "STRIPCV_RANDOMIZED_ALLOW_COVERAGE_SHORTFALL is enabled; "
                 "this exploratory run does not pass coverage policy\n";
  }

  std::cout << "StripCV randomized paired recognition passed "
            << reportable_two_line << '/' << cases << " two-line, "
            << reportable_one_line << '/' << cases << " one-line, and "
            << safe_missing_control << '/' << cases
            << " safely abstained missing-control cases; "
            << nonobservable_stress_cases
            << " destructively transformed labels and "
            << noncompliant_stress_cases
            << " noncompliant captures were excluded (seed="
            << seed << ").\n";

  // Repeat the paired safety design through automatic localization with a
  // separate locked seed and continuously varied projective geometry. Keep
  // capture degradation inside a somewhat narrower range than the signal-only
  // boundary search so this layer measures end-to-end recognition rather than
  // mostly destructive resampling.
  std::mt19937_64 automatic_random(seed ^ 0x4155544F4D415449ULL);
  size_t automatic_reportable_two_line = 0;
  size_t automatic_reportable_one_line = 0;
  size_t automatic_safe_missing_control = 0;
  size_t automatic_nonobservable = 0;
  size_t automatic_noncompliant = 0;
  size_t automatic_attempts = 0;
  std::map<std::string, size_t> automatic_two_line_abstention_reasons;
  std::map<std::string, size_t> automatic_one_line_abstention_reasons;
  std::vector<std::string> automatic_two_line_abstention_diagnostics;
  std::vector<std::string> automatic_one_line_abstention_diagnostics;
  for (size_t index = 0; index < automatic_cases;) {
    if (++automatic_attempts > 5 * automatic_cases) {
      std::cerr << "could not generate enough observable automatic cases\n";
      return EXIT_FAILURE;
    }
    stripcv::test::StripOptions two_line;
    two_line.control_position = uniform(automatic_random, 0.095, 0.165);
    two_line.test_position =
        two_line.control_position + uniform(automatic_random, 0.09, 0.17);
    two_line.control_strength = uniform(automatic_random, 0.20, 0.42);
    two_line.test_strength = uniform(automatic_random, 0.03, 0.46);
    two_line.control_width_factor = uniform(automatic_random, 0.65, 1.70);
    two_line.test_width_factor = uniform(automatic_random, 0.65, 1.70);
    two_line.bright_paper = (automatic_random() & 1U) != 0;
    two_line.control_dye_rgb = dyes[automatic_random() % dyes.size()];
    two_line.test_dye_rgb = dyes[automatic_random() % dyes.size()];
    two_line.control_vertical_gradient =
        uniform(automatic_random, -0.45, 0.45);
    two_line.test_vertical_gradient =
        uniform(automatic_random, -0.45, 0.45);
    two_line.control_vertical_modulation =
        uniform(automatic_random, 0.0, 0.25);
    two_line.test_vertical_modulation =
        uniform(automatic_random, 0.0, 0.25);
    two_line.control_vertical_phase = uniform(automatic_random, 0.0, 1.0);
    two_line.test_vertical_phase = uniform(automatic_random, 0.0, 1.0);

    CaptureCondition condition;
    condition.exposure = uniform(automatic_random, 0.75, 1.0);
    condition.gains = {uniform(automatic_random, 0.90, 1.10),
                       uniform(automatic_random, 0.93, 1.07),
                       uniform(automatic_random, 0.90, 1.10)};
    condition.jpeg_quality =
        std::uniform_int_distribution<int>(45, 100)(automatic_random);
    condition.scale = uniform(automatic_random, 0.55, 1.0);
    condition.blur_sigma = uniform(automatic_random, 0.0, 1.0);
    condition.noise_sigma = uniform(automatic_random, 0.0, 2.0);
    condition.noise_seed = automatic_random();
    const stripcv::Quad geometry = randomGeometry(automatic_random);
    const std::string case_description =
        describe(index, two_line, condition);

    const stripcv::test::Capture two_line_capture = applyCondition(
        stripcv::test::makeCapture(two_line, geometry), condition);
    const double source_test_response = sourceLineResponse(
        two_line_capture, assay, two_line.test_position);
    if (source_test_response < kMinObservableSourceResponse) {
      ++automatic_nonobservable;
      continue;
    }
    const stripcv::AnalysisResult two_line_result =
        stripcv::Analyzer().analyze(two_line_capture.rgb, assay);
    if (diagnosticsEnabled() &&
        stripcv::test::hasReason(
            two_line_result, "inner_measurement_region_peak_pair_recovered")) {
      std::cerr << " recovered automatic two-line: " << case_description
                << " T_area_ratio="
                << two_line_result.test_peak.area /
                       std::max(1.0e-12, two_line_result.control_peak.area)
                << " T_width_ratio="
                << two_line_result.test_peak.fwhm /
                       assay.expected_line_width
                << " T_asymmetry="
                << peakAsymmetry(two_line_result,
                                 two_line_result.test_peak.position,
                                 2.0 * assay.expected_line_width)
                << ' ' << stripcv::test::diagnostic(two_line_result) << '\n';
    }
    if (two_line_result.status == "valid" &&
        (!stripcv::test::reportableTwoLine(two_line_result) ||
         !aligned(two_line_result.control_peak.position,
                  two_line.control_position) ||
         !aligned(two_line_result.test_peak.position, two_line.test_position) ||
         quadIou(two_line_result.geometry.corners,
                 two_line_capture.corners) < 0.75)) {
      const stripcv::AnalysisResult known_geometry_result =
          analyzeKnownGeometry(two_line_capture, assay);
      std::cerr << "randomized automatic two-line case produced a wrong "
                   "reportable decision: "
                << case_description << describeQuad(two_line_capture.corners)
                << " source_test_response=" << source_test_response
                << " localized_iou="
                << quadIou(two_line_result.geometry.corners,
                           two_line_capture.corners)
                << " automatic=" << stripcv::test::diagnostic(two_line_result)
                << " known_geometry="
                << stripcv::test::diagnostic(known_geometry_result) << '\n';
      return EXIT_FAILURE;
    }
    stripcv::test::StripOptions one_line = two_line;
    one_line.test_line = false;
    const stripcv::test::Capture one_line_capture = applyCondition(
        stripcv::test::makeCapture(one_line, geometry), condition);
    const stripcv::AnalysisResult one_line_result =
        stripcv::Analyzer().analyze(one_line_capture.rgb, assay);
    if (one_line_result.status == "valid" &&
        (!stripcv::test::reportableOneLine(one_line_result) ||
         !aligned(one_line_result.control_peak.position,
                  one_line.control_position) ||
         quadIou(one_line_result.geometry.corners,
                 one_line_capture.corners) < 0.75)) {
      std::cerr << "paired automatic line-free control produced a wrong "
                   "reportable decision: "
                << case_description << describeQuad(one_line_capture.corners)
                << ' '
                << stripcv::test::diagnostic(one_line_result) << '\n';
      return EXIT_FAILURE;
    }
    stripcv::test::StripOptions missing_control = two_line;
    missing_control.control_line = false;
    const stripcv::test::Capture missing_control_capture = applyCondition(
        stripcv::test::makeCapture(missing_control, geometry), condition);
    const stripcv::AnalysisResult missing_control_result =
        stripcv::Analyzer().analyze(missing_control_capture.rgb, assay);
    if (missing_control_result.status == "valid") {
      std::cerr << "paired automatic missing-control case became reportable: "
                << case_description << ' '
                << stripcv::test::diagnostic(missing_control_result) << '\n';
      return EXIT_FAILURE;
    }
    if (captureNoncompliant(two_line_result) ||
        captureNoncompliant(one_line_result)) {
      ++automatic_noncompliant;
      continue;
    }
    automatic_reportable_two_line +=
        stripcv::test::reportableTwoLine(two_line_result) ? 1U : 0U;
    if (!stripcv::test::reportableTwoLine(two_line_result)) {
      countReasons(two_line_result, automatic_two_line_abstention_reasons);
      automatic_two_line_abstention_diagnostics.push_back(
          case_description + describeQuad(two_line_capture.corners) + " " +
          stripcv::test::diagnostic(two_line_result) +
          peakShapeDescription(two_line_result, assay));
    }
    automatic_reportable_one_line +=
        stripcv::test::reportableOneLine(one_line_result) ? 1U : 0U;
    if (!stripcv::test::reportableOneLine(one_line_result)) {
      countReasons(one_line_result, automatic_one_line_abstention_reasons);
      automatic_one_line_abstention_diagnostics.push_back(
          case_description + describeQuad(one_line_capture.corners) + " " +
          stripcv::test::diagnostic(one_line_result));
    }
    ++automatic_safe_missing_control;
    ++index;
  }

  const double automatic_two_line_coverage =
      automatic_reportable_two_line / static_cast<double>(automatic_cases);
  const double automatic_one_line_coverage =
      automatic_reportable_one_line / static_cast<double>(automatic_cases);
  if (diagnosticsEnabled()) {
    printDiagnostics("automatic two-line abstention",
                     automatic_two_line_abstention_reasons,
                     automatic_two_line_abstention_diagnostics);
    printDiagnostics("automatic one-line abstention",
                     automatic_one_line_abstention_reasons,
                     automatic_one_line_abstention_diagnostics);
  }
  const bool automatic_coverage_below_policy =
      automatic_two_line_coverage < 0.95 ||
      automatic_one_line_coverage < 0.95;
  if (automatic_coverage_below_policy) {
    std::cerr << "randomized automatic recognition coverage below policy: "
              << "two-line=" << automatic_reportable_two_line << '/'
              << automatic_cases << " one-line="
              << automatic_reportable_one_line << '/' << automatic_cases
              << "\n two-line abstentions:";
    printReasons(automatic_two_line_abstention_reasons);
    std::cerr << "\n one-line abstentions:";
    printReasons(automatic_one_line_abstention_reasons);
    std::cerr << '\n';
    if (diagnosticsEnabled()) {
      for (const std::string& diagnostic :
           automatic_two_line_abstention_diagnostics) {
        std::cerr << " automatic two-line abstention: " << diagnostic << '\n';
      }
      for (const std::string& diagnostic :
           automatic_one_line_abstention_diagnostics) {
        std::cerr << " automatic one-line abstention: " << diagnostic << '\n';
      }
    }
    if (!exploratoryCoverageShortfallAllowed()) {
      return EXIT_FAILURE;
    }
    std::cerr << "continuing to invalid-artifact search because "
                 "STRIPCV_RANDOMIZED_ALLOW_COVERAGE_SHORTFALL is enabled; "
                 "this exploratory run does not pass coverage policy\n";
  }

  std::cout << "StripCV randomized automatic recognition passed "
            << automatic_reportable_two_line << '/' << automatic_cases
            << " two-line, " << automatic_reportable_one_line << '/'
            << automatic_cases << " one-line, and "
            << automatic_safe_missing_control << '/' << automatic_cases
            << " safely abstained missing-control cases; "
            << automatic_nonobservable
            << " destructively transformed labels and "
            << automatic_noncompliant
            << " noncompliant captures were excluded.\n";

  std::mt19937_64 invalid_random(seed ^ 0x494E56414C494453ULL);
  size_t safely_abstained_invalid = 0;
  size_t invalid_nonobservable = 0;
  size_t invalid_attempts = 0;
  for (size_t index = 0; index < automatic_invalid_cases;) {
    if (++invalid_attempts > 5 * automatic_invalid_cases) {
      std::cerr << "could not generate enough observable automatic invalid "
                   "cases\n";
      return EXIT_FAILURE;
    }
    stripcv::test::StripOptions options;
    options.control_position = uniform(invalid_random, 0.10, 0.16);
    options.test_position =
        options.control_position + uniform(invalid_random, 0.09, 0.16);
    options.control_strength = uniform(invalid_random, 0.24, 0.42);
    options.test_strength = uniform(invalid_random, 0.08, 0.40);
    options.control_width_factor = uniform(invalid_random, 0.70, 1.55);
    options.test_width_factor = uniform(invalid_random, 0.70, 1.55);
    options.bright_paper = (invalid_random() & 1U) != 0;
    const cv::Vec3d base_dye = dyes[invalid_random() % dyes.size()];
    options.control_dye_rgb = base_dye;
    options.test_dye_rgb = base_dye;

    std::string corruption;
    switch (index % 6) {
      case 0: {
        corruption = "vertically displaced partial T";
        // Search below the ordinary reportable T range as well. The source
        // observability gate below prevents transformed-away marks from being
        // mislabeled as invalid evidence.
        options.test_strength = uniform(invalid_random, 0.03, 0.40);
        options.test_vertical_fraction = uniform(invalid_random, 0.15, 0.40);
        options.test_vertical_center = uniform(
            invalid_random, 0.5 * options.test_vertical_fraction,
            1.0 - 0.5 * options.test_vertical_fraction);
        break;
      }
      case 1: {
        corruption = "vertically displaced partial C";
        options.control_strength = uniform(invalid_random, 0.08, 0.42);
        options.control_vertical_fraction =
            uniform(invalid_random, 0.15, 0.45);
        options.control_vertical_center = uniform(
            invalid_random, 0.5 * options.control_vertical_fraction,
            1.0 - 0.5 * options.control_vertical_fraction);
        break;
      }
      case 2: {
        corruption = "two displaced partial lines";
        options.test_strength = uniform(invalid_random, 0.03, 0.40);
        options.control_strength = uniform(invalid_random, 0.08, 0.42);
        options.test_vertical_fraction = uniform(invalid_random, 0.18, 0.42);
        options.control_vertical_fraction =
            uniform(invalid_random, 0.18, 0.45);
        options.test_vertical_center = uniform(
            invalid_random, 0.5 * options.test_vertical_fraction,
            1.0 - 0.5 * options.test_vertical_fraction);
        options.control_vertical_center = uniform(
            invalid_random, 0.5 * options.control_vertical_fraction,
            1.0 - 0.5 * options.control_vertical_fraction);
        break;
      }
      case 3:
        corruption = "extra result line";
        options.extra_line = true;
        break;
      case 4:
        corruption = "broad test stain";
        options.broad_test_stain = true;
        break;
      default:
        corruption = "dye run";
        options.dye_run = true;
        break;
    }

    CaptureCondition condition;
    condition.exposure = uniform(invalid_random, 0.80, 1.0);
    condition.gains = {uniform(invalid_random, 0.92, 1.08),
                       uniform(invalid_random, 0.95, 1.05),
                       uniform(invalid_random, 0.92, 1.08)};
    condition.jpeg_quality =
        std::uniform_int_distribution<int>(55, 100)(invalid_random);
    condition.scale = uniform(invalid_random, 0.65, 1.0);
    condition.blur_sigma = uniform(invalid_random, 0.0, 0.8);
    condition.noise_sigma = uniform(invalid_random, 0.0, 1.5);
    condition.noise_seed = invalid_random();
    const stripcv::Quad geometry = randomGeometry(invalid_random);
    const stripcv::test::Capture capture = applyCondition(
        stripcv::test::makeCapture(options, geometry), condition);
    bool observable = true;
    if (index % 6 == 0 || index % 6 == 2) {
      observable = observable &&
                   sourceLineResponse(capture, assay, options.test_position) >=
                       kMinObservableSourceResponse;
    }
    if (index % 6 == 1 || index % 6 == 2) {
      observable =
          observable &&
          sourceLineResponse(capture, assay, options.control_position) >=
              kMinObservableSourceResponse;
    }
    if (!observable) {
      ++invalid_nonobservable;
      continue;
    }
    const stripcv::AnalysisResult result =
        stripcv::Analyzer().analyze(capture.rgb, assay);
    if (diagnosticsEnabled() && (index % 6 == 3 || index % 6 == 4)) {
      const PeakShapeMetrics shape = peakShapeMetrics(
          result, result.test_peak.position,
          3.0 * assay.expected_line_width);
      std::cerr << " invalid-shape: " << corruption << ' '
                << describe(index, options, condition)
                << describeQuad(capture.corners) << ' '
                << stripcv::test::diagnostic(result)
                << " T_asymmetry="
                << peakAsymmetry(result, result.test_peak.position,
                                 2.0 * assay.expected_line_width)
                << " T_shape_sigma=" << shape.sigma
                << " T_shape_kurtosis=" << shape.kurtosis
                << " T_shape_gaussian_l1=" << shape.gaussian_l1 << '\n';
    }
    if (result.status == "valid") {
      std::cerr << "randomized automatic invalid case became reportable: "
                << corruption << ' ' << describe(index, options, condition)
                << describeQuad(capture.corners) << ' '
                << stripcv::test::diagnostic(result)
                << " T_asymmetry="
                << peakAsymmetry(result, result.test_peak.position,
                                 2.0 * assay.expected_line_width)
                << '\n';
      return EXIT_FAILURE;
    }
    ++safely_abstained_invalid;
    ++index;
  }
  std::cout << "StripCV randomized automatic quality search safely abstained "
            << safely_abstained_invalid << '/' << automatic_invalid_cases
            << " displaced-partial-line and artifact cases; "
            << invalid_nonobservable
            << " transformed-away partial-line labels were excluded.\n";
  return EXIT_SUCCESS;
}
