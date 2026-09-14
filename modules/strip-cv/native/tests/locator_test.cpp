#include <cstdlib>
#include <cstdint>
#include <iostream>
#include <opencv2/imgproc.hpp>
#include <string>
#include <vector>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif

#include "stripcv/locator.hpp"
#include "synthetic_fixture.hpp"

namespace {

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

cv::Mat makeMultiStripOod() {
  cv::Mat scene(720, 1280, CV_8UC3, cv::Scalar(104, 122, 108));
  cv::Mat strip = stripcv::test::makeCanonicalStrip();
  cv::resize(strip, strip, cv::Size(1040, 162), 0.0, 0.0, cv::INTER_AREA);
  for (int index = 0; index < 3; ++index) {
    strip.copyTo(scene(cv::Rect(120, 58 + index * 220, strip.cols, strip.rows)));
  }
  return scene;
}

cv::Mat makeCrowdedLaboratoryStripField() {
  cv::Mat scene(960, 960, CV_8UC3, cv::Scalar(154, 162, 156));
  cv::rectangle(scene, cv::Rect(35, 285, 890, 640),
                cv::Scalar(238, 238, 234), cv::FILLED);
  stripcv::test::StripOptions options;
  options.control_strength = 0.46;
  options.test_strength = 0.34;
  cv::Mat strip = stripcv::test::makeCanonicalStrip(options);
  cv::resize(strip, strip, cv::Size(560, 28), 0.0, 0.0, cv::INTER_AREA);
  cv::rotate(strip, strip, cv::ROTATE_90_CLOCKWISE);
  for (int group = 0; group < 2; ++group) {
    const int group_left = 170 + group * 330;
    for (int index = 0; index < 8; ++index) {
      strip.copyTo(scene(cv::Rect(group_left + index * strip.cols, 330,
                                  strip.cols, strip.rows)));
    }
  }
  // A partially isolated edge strip is deliberately easier to bound than the
  // touching arrays. The scene-level test must still win over that locally
  // convincing proposal.
  strip.copyTo(scene(cv::Rect(920, 330, strip.cols, strip.rows)));
  return scene;
}

cv::Mat makeCassetteOod() {
  cv::Mat scene(720, 1280, CV_8UC3, cv::Scalar(82, 94, 87));
  cv::rectangle(scene, cv::Rect(130, 205, 1020, 310),
                cv::Scalar(229, 231, 228), cv::FILLED);
  cv::rectangle(scene, cv::Rect(610, 285, 330, 145),
                cv::Scalar(197, 199, 190), cv::FILLED);
  cv::rectangle(scene, cv::Rect(790, 292, 13, 131),
                cv::Scalar(181, 55, 91), cv::FILLED);
  cv::rectangle(scene, cv::Rect(865, 292, 13, 131),
                cv::Scalar(181, 55, 91), cv::FILLED);
  cv::circle(scene, cv::Point(360, 360), 45, cv::Scalar(188, 190, 184),
             cv::FILLED);
  return scene;
}

cv::Mat makePlasticStickIllustrationOod() {
  cv::Mat scene(240, 960, CV_8UC3, cv::Scalar(24, 24, 24));
  cv::rectangle(scene, cv::Rect(45, 55, 820, 130),
                cv::Scalar(240, 240, 238), cv::FILLED);
  cv::ellipse(scene, cv::Point(865, 120), cv::Size(70, 65), 0.0, 0.0, 360.0,
              cv::Scalar(240, 240, 238), cv::FILLED);
  cv::rectangle(scene, cv::Rect(520, 78, 210, 84),
                cv::Scalar(211, 212, 207), cv::FILLED);
  cv::rectangle(scene, cv::Rect(655, 82, 12, 76),
                cv::Scalar(194, 48, 94), cv::FILLED);
  cv::rectangle(scene, cv::Rect(45, 55, 160, 130),
                cv::Scalar(236, 143, 184), cv::FILLED);
  return scene;
}

cv::Mat makeStackedPlasticDevicesOod() {
  cv::Mat scene(900, 600, CV_8UC3, cv::Scalar(128, 112, 92));
  for (int index = 0; index < 3; ++index) {
    const int top = 45 + index * 285;
    cv::rectangle(scene, cv::Rect(18, top, 564, 180),
                  cv::Scalar(232, 230, 220), cv::FILLED);
    cv::rectangle(scene, cv::Rect(245, top + 48, 225, 86),
                  cv::Scalar(194, 190, 176), cv::FILLED);
    cv::rectangle(scene, cv::Rect(335, top + 52, 15, 78),
                  cv::Scalar(188, 55, 91), cv::FILLED);
    cv::rectangle(scene, cv::Rect(405, top + 52, 15, 78),
                  cv::Scalar(188, 55, 91), cv::FILLED);
    cv::circle(scene, cv::Point(120, top + 90), 32,
               cv::Scalar(202, 199, 188), cv::FILLED);
  }
  return scene;
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

bool requireFalseLocalization(const char* name, const cv::Mat& image,
                              const stripcv::AssayProfile& assay,
                              const std::string& expected_reason) {
  const stripcv::LocalizationResult result =
      stripcv::ClassicalRegionLocator().locateBare(image, assay);
  if (result.found || result.failure_reason != expected_reason) {
    std::cerr << name << " produced a bare-strip localization or the wrong "
              << "rejection reason: found=" << result.found
              << " reason=" << result.failure_reason << '\n';
    return false;
  }
  return true;
}

}  // namespace

int main() {
  const stripcv::AssayProfile assay = stripcv::test::handledAssay();
  const stripcv::test::Capture capture = stripcv::test::makeCapture();
  const stripcv::ClassicalRegionLocator classical;
  const stripcv::LocalizationResult localized =
      classical.locateBare(capture.rgb, assay);
  if (!localized.found || localized.mode != "bare") {
    std::cerr << "classical locator did not find the synthetic handled strip\n";
    return EXIT_FAILURE;
  }
  if (quadIou(localized.corners, capture.corners) < 0.82) {
    std::cerr
        << "classical locator corners do not overlap the annotated strip\n";
    return EXIT_FAILURE;
  }
  if (localized.edge_support_fraction < 0.55 ||
      localized.rectification_rmse_px > 3.0) {
    std::cerr << "classical locator geometry quality is unexpectedly weak\n";
    return EXIT_FAILURE;
  }

  // A product-type dataset preview can contain a real strip compressed to
  // only a handful of source pixels. Its long rails remain easy to find, but
  // a sub-pixel source-edge residual expands into many pixels in the canonical
  // rectification. Reject that unusable proposal at the locator boundary; the
  // full analyzer must not be the first component to discover the geometry is
  // degenerate.
  cv::Mat thumbnail(200, 200, CV_8UC3, cv::Scalar(34, 34, 34));
  cv::RNG thumbnail_noise(0x51A7C0DE);
  cv::Mat noise(thumbnail.size(), thumbnail.type());
  thumbnail_noise.fill(noise, cv::RNG::NORMAL, cv::Scalar::all(0),
                       cv::Scalar::all(10));
  cv::add(thumbnail, noise, thumbnail, cv::noArray(), thumbnail.type());
  cv::Mat thin_strip;
  cv::resize(stripcv::test::makeCanonicalStrip(), thin_strip,
             cv::Size(174, 10), 0.0, 0.0, cv::INTER_AREA);
  for (int column = 0; column < thin_strip.cols; ++column) {
    const int vertical_offset = cvRound(
        1.4 * std::sin(0.19 * column) +
        0.6 * std::sin(0.53 * column + 0.7));
    thin_strip.col(column).copyTo(
        thumbnail(cv::Rect(13 + column, 95 + vertical_offset, 1,
                           thin_strip.rows)));
  }
  if (!requireFalseLocalization("low-resolution strip thumbnail", thumbnail,
                                assay, "degenerate_projective_geometry")) {
    return EXIT_FAILURE;
  }

  const cv::Mat noisy = addDeterministicSensorNoise(capture.rgb, 4.0);
  const stripcv::LocalizationResult noisy_localized =
      classical.locateBare(noisy, assay);
  const double noisy_iou = noisy_localized.found
                               ? quadIou(noisy_localized.corners,
                                         capture.corners)
                               : 0.0;
  if (!noisy_localized.found || noisy_iou < 0.82) {
    std::cerr << "sensor noise expanded the strip into a false frame-spanning "
                 "localization: found="
              << noisy_localized.found << " IoU=" << noisy_iou
              << " reason=" << noisy_localized.failure_reason << " corners=";
    for (const cv::Point2f& point : noisy_localized.corners) {
      std::cerr << '(' << point.x << ':' << point.y << ')';
    }
    std::cerr << '\n';
    return EXIT_FAILURE;
  }

  stripcv::test::StripOptions downsampled_options;
  downsampled_options.control_position = 0.0998;
  downsampled_options.test_position = 0.2264;
  downsampled_options.control_strength = 0.2756;
  downsampled_options.test_strength = 0.1779;
  downsampled_options.control_width_factor = 1.6265;
  downsampled_options.test_width_factor = 1.5709;
  downsampled_options.control_vertical_gradient = -0.1842;
  downsampled_options.test_vertical_gradient = -0.3729;
  downsampled_options.control_vertical_modulation = 0.0400;
  downsampled_options.control_vertical_phase = 0.0874;
  downsampled_options.test_vertical_modulation = 0.2199;
  downsampled_options.test_vertical_phase = 0.3619;
  downsampled_options.control_dye_rgb = cv::Vec3d(210.0, 95.0, 125.0);
  downsampled_options.test_dye_rgb = cv::Vec3d(125.0, 60.0, 110.0);
  const double downsample_scale = 0.6558;
  const stripcv::Quad downsampled_geometry = {
      cv::Point2f(122.3673F / downsample_scale,
                  150.9328F / downsample_scale),
      cv::Point2f(737.2875F / downsample_scale,
                  117.8269F / downsample_scale),
      cv::Point2f(738.1701F / downsample_scale,
                  269.6200F / downsample_scale),
      cv::Point2f(116.0509F / downsample_scale,
                  302.3907F / downsample_scale)};
  stripcv::test::Capture downsampled_capture =
      stripcv::test::makeCapture(downsampled_options, downsampled_geometry);
  downsampled_capture.rgb = stripcv::test::exposureAndCast(
      downsampled_capture.rgb, 0.9985,
      cv::Vec3d(0.9430, 0.9612, 1.0737));
  cv::GaussianBlur(downsampled_capture.rgb, downsampled_capture.rgb,
                   cv::Size(3, 3), 0.1732);
  downsampled_capture.rgb =
      stripcv::test::jpegRoundTrip(downsampled_capture.rgb, 63);
  downsampled_capture.rgb = addDeterministicSensorNoise(
      downsampled_capture.rgb, 0.9794, 15261023875410239242ULL);
  downsampled_capture = resizeCapture(downsampled_capture, downsample_scale);
  const stripcv::LocalizationResult downsampled_localized =
      classical.locateBare(downsampled_capture.rgb, assay);
  const double downsampled_iou =
      downsampled_localized.found
          ? quadIou(downsampled_localized.corners,
                    downsampled_capture.corners)
          : 0.0;
  if (!downsampled_localized.found || downsampled_iou < 0.82) {
    std::cerr << "downsampled finite strip expanded toward the frame: found="
              << downsampled_localized.found << " IoU=" << downsampled_iou
              << " reason=" << downsampled_localized.failure_reason
              << " corners=";
    for (const cv::Point2f& point : downsampled_localized.corners) {
      std::cerr << '(' << point.x << ':' << point.y << ')';
    }
    std::cerr << '\n';
    return EXIT_FAILURE;
  }

  const cv::Mat blank(capture.rgb.size(), CV_8UC3, cv::Scalar(118, 126, 121));
  if (classical.locateBare(blank, assay).found) {
    std::cerr << "uniform out-of-domain image produced a strip localization\n";
    return EXIT_FAILURE;
  }
  if (!requireFalseLocalization("multi-strip scene", makeMultiStripOod(), assay,
                                "multiple_bare_strips_detected") ||
      !requireFalseLocalization("crowded laboratory strip field",
                                makeCrowdedLaboratoryStripField(), assay,
                                "multiple_bare_strips_detected") ||
      !requireFalseLocalization("plastic cassette", makeCassetteOod(), assay,
                                "bare_strip_content_insufficient") ||
      !requireFalseLocalization("plastic-stick illustration",
                                makePlasticStickIllustrationOod(), assay,
                                "bare_strip_content_insufficient") ||
      !requireFalseLocalization("stacked plastic devices",
                                makeStackedPlasticDevicesOod(), assay,
                                "multiple_bare_strips_detected")) {
    return EXIT_FAILURE;
  }

  const stripcv::OnnxRegionLocator unavailable_onnx(
      "missing-contract-model.onnx");
  const stripcv::LocalizationResult fallback =
      unavailable_onnx.locateBare(capture.rgb, assay);
  if (!fallback.found || fallback.mode != "onnx_fallback_classical" ||
      fallback.failure_reason.empty()) {
    std::cerr
        << "unavailable ONNX backend did not fail safely to classical CV\n";
    return EXIT_FAILURE;
  }
  std::cout << "StripCV locator and ONNX fallback tests passed.\n";
  return EXIT_SUCCESS;
}
