#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <opencv2/imgproc.hpp>
#include <string>
#include <utility>
#include <vector>

#include "stripcv/analyzer.hpp"
#include "synthetic_fixture.hpp"

namespace {

struct Variant {
  std::string name;
  stripcv::test::Capture capture;
  bool flip_orientation = false;
};

stripcv::test::Capture rotate180(const stripcv::test::Capture& source) {
  stripcv::test::Capture result;
  cv::rotate(source.rgb, result.rgb, cv::ROTATE_180);
  for (size_t index = 0; index < source.corners.size(); ++index) {
    result.corners[index] = cv::Point2f(
        static_cast<float>(source.rgb.cols - 1) - source.corners[index].x,
        static_cast<float>(source.rgb.rows - 1) - source.corners[index].y);
  }
  result.corners = stripcv::orderQuad(result.corners);
  return result;
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

stripcv::test::Capture opposedChromaticGradient(
    const stripcv::test::Capture& source) {
  stripcv::test::Capture result = source;
  result.rgb = source.rgb.clone();
  for (int column = 0; column < result.rgb.cols; ++column) {
    const double fraction =
        column / static_cast<double>(std::max(1, result.rgb.cols - 1));
    const cv::Vec3d gains(0.48 + 0.52 * fraction, 1.0,
                          1.0 - 0.52 * fraction);
    for (int row = 0; row < result.rgb.rows; ++row) {
      cv::Vec3b& pixel = result.rgb.at<cv::Vec3b>(row, column);
      for (int channel = 0; channel < 3; ++channel) {
        pixel[channel] = cv::saturate_cast<unsigned char>(
            pixel[channel] * gains[channel]);
      }
    }
  }
  return result;
}

}  // namespace

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const stripcv::test::Capture base = stripcv::test::makeCapture();
  std::vector<Variant> variants;
  variants.push_back({"baseline", base});

  stripcv::test::Capture warm = base;
  warm.rgb = stripcv::test::exposureAndCast(base.rgb, 0.92,
                                            cv::Vec3d(1.10, 1.00, 0.88));
  variants.push_back({"warm cast", warm});
  stripcv::test::Capture cool = base;
  cool.rgb = stripcv::test::exposureAndCast(base.rgb, 0.92,
                                            cv::Vec3d(0.88, 1.00, 1.10));
  variants.push_back({"cool cast", cool});
  variants.push_back(
      {"opposed color-temperature gradient", opposedChromaticGradient(base)});
  stripcv::test::Capture dim = base;
  dim.rgb =
      stripcv::test::exposureAndCast(base.rgb, 0.62, cv::Vec3d(1.0, 1.0, 1.0));
  variants.push_back({"dim exposure", dim});
  stripcv::test::Capture jpeg = base;
  jpeg.rgb = stripcv::test::jpegRoundTrip(base.rgb, 42);
  variants.push_back({"jpeg compression", jpeg});
  variants.push_back({"scale increase", resizeCapture(base, 1.25)});
  variants.push_back({"preview downsample", resizeCapture(base, 0.5)});
  variants.push_back({"low-resolution compliant", resizeCapture(base, 0.25)});
  stripcv::test::Capture soft_low_resolution = base;
  cv::GaussianBlur(base.rgb, soft_low_resolution.rgb, cv::Size(9, 9), 2.0);
  variants.push_back({"soft low-resolution two-line",
                      resizeCapture(soft_low_resolution, 0.25)});
  variants.push_back({"180 rotation", rotate180(base), true});

  const stripcv::Quad keystone = {
      cv::Point2f(210.0F, 190.0F), cv::Point2f(1100.0F, 275.0F),
      cv::Point2f(1020.0F, 455.0F), cv::Point2f(128.0F, 474.0F)};
  variants.push_back(
      {"keystone perspective", stripcv::test::makeCapture({}, keystone)});

  size_t reportable = 0;
  for (const Variant& variant : variants) {
    stripcv::AnalysisOptions options;
    options.corner_override = variant.capture.corners;
    options.flip_orientation = variant.flip_orientation;
    const stripcv::AnalysisResult result =
        stripcv::Analyzer().analyze(variant.capture.rgb, assay, options);
    if (result.status == "valid" && !stripcv::test::reportableTwoLine(result)) {
      std::cerr << variant.name << " produced a wrong reportable result\n";
      return EXIT_FAILURE;
    }
    if (!stripcv::test::reportableTwoLine(result)) {
      std::cerr << variant.name
                << " abstained: " << stripcv::test::diagnostic(result) << '\n';
    }
    reportable += stripcv::test::reportableTwoLine(result) ? 1U : 0U;
  }
  if (reportable != variants.size()) {
    std::cerr << "too many compliant metamorphic variants abstained: "
              << reportable << "/" << variants.size() << '\n';
    return EXIT_FAILURE;
  }

  // Regression: a global cool cast previously caused every neutral membrane
  // sample to be rejected by the spatial-correction estimator. Under strong
  // perspective that flattened the chromatic profile and hid a valid control
  // line. Keep this as a named one-line metamorphic case in addition to the
  // exhaustive parameter sweep.
  stripcv::test::StripOptions cool_one_line_options;
  cool_one_line_options.test_line = false;
  cool_one_line_options.control_position = 0.09;
  cool_one_line_options.control_strength = 0.32;
  cool_one_line_options.control_width_factor = 1.5;
  const stripcv::Quad strong_perspective = {
      cv::Point2f(92.0F, 294.0F), cv::Point2f(1188.0F, 178.0F),
      cv::Point2f(1164.0F, 402.0F), cv::Point2f(126.0F, 486.0F)};
  stripcv::test::Capture cool_one_line = stripcv::test::makeCapture(
      cool_one_line_options, strong_perspective);
  cool_one_line.rgb = stripcv::test::exposureAndCast(
      cool_one_line.rgb, 0.92, cv::Vec3d(0.88, 1.00, 1.10));
  stripcv::AnalysisOptions cool_one_line_analysis;
  cool_one_line_analysis.corner_override = cool_one_line.corners;
  const stripcv::AnalysisResult cool_one_line_result =
      stripcv::Analyzer().analyze(cool_one_line.rgb, assay,
                                  cool_one_line_analysis);
  if (!stripcv::test::reportableOneLine(cool_one_line_result) ||
      std::abs(cool_one_line_result.control_peak.position -
               cool_one_line_options.control_position) > 0.06) {
    std::cerr << "cool-cast perspective one-line regression failed: "
              << stripcv::test::diagnostic(cool_one_line_result) << '\n';
    return EXIT_FAILURE;
  }
  std::cout << "StripCV metamorphic tests passed with " << reportable << "/"
            << variants.size()
            << " two-line variants and the one-line color-cast regression.\n";
  return EXIT_SUCCESS;
}
