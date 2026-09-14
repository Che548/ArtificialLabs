#include <algorithm>
#include <array>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <memory>
#include <nlohmann/json.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry/2d.hpp>
#endif
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "stripcv/analyzer.hpp"
#include "stripcv/locator.hpp"
#include "stripcv/types.hpp"

namespace {

using json = nlohmann::json;

#ifndef STRIPCV_VERSION
#define STRIPCV_VERSION "0.4.1"
#endif

struct Arguments {
  std::filesystem::path image_path;
  std::filesystem::path profile_path;
  std::string backend = "classical";
  std::filesystem::path onnx_model_path;
  std::string mode = "analyze";
  bool flip_orientation = false;
  std::optional<std::string> corner_override;
  bool corner_override_normalized = false;
  std::optional<std::string> automatic_corner_override_normalized;
};

class FixedAutomaticEvaluationLocator final : public stripcv::IRegionLocator {
 public:
  FixedAutomaticEvaluationLocator(stripcv::Quad corners, double area_fraction)
      : corners_(std::move(corners)), area_fraction_(area_fraction) {}

  stripcv::LocalizationResult locateBare(
      const cv::Mat&, const stripcv::AssayProfile&) const override {
    stripcv::LocalizationResult result;
    result.found = true;
    result.mode = "evaluation_automatic_override";
    result.corners = corners_;
    result.confidence = 1.0;
    result.area_fraction = area_fraction_;
    result.edge_support_fraction = 1.0;
    result.rectification_rmse_px = 0.0;
    result.perspective_scale_ratio = 1.0;
    return result;
  }

  stripcv::LocalizationResult locateCard(
      const cv::Mat&, const stripcv::CardProfile&) const override {
    return {};
  }

 private:
  stripcv::Quad corners_{};
  double area_fraction_ = 0.0;
};

std::string requiredValue(int argc, char** argv, int& index) {
  if (index + 1 >= argc) {
    throw std::invalid_argument(std::string("Missing value for ") +
                                argv[index]);
  }
  return argv[++index];
}

Arguments parseArguments(int argc, char** argv) {
  Arguments arguments;
  for (int index = 1; index < argc; ++index) {
    const std::string option = argv[index];
    if (option == "--image") {
      arguments.image_path = requiredValue(argc, argv, index);
    } else if (option == "--profile") {
      arguments.profile_path = requiredValue(argc, argv, index);
    } else if (option == "--backend") {
      arguments.backend = requiredValue(argc, argv, index);
    } else if (option == "--onnx-model") {
      arguments.onnx_model_path = requiredValue(argc, argv, index);
    } else if (option == "--mode") {
      arguments.mode = requiredValue(argc, argv, index);
    } else if (option == "--flip-orientation") {
      arguments.flip_orientation = true;
    } else if (option == "--corner-override") {
      arguments.corner_override = requiredValue(argc, argv, index);
    } else if (option == "--corner-override-normalized") {
      arguments.corner_override = requiredValue(argc, argv, index);
      arguments.corner_override_normalized = true;
    } else if (option == "--automatic-corner-override-normalized") {
      arguments.automatic_corner_override_normalized =
          requiredValue(argc, argv, index);
    } else if (option == "--help" || option == "-h") {
      std::cout << "Usage: stripcv_eval_cli --image FILE --profile FILE "
                   "[--mode analyze|locate] [--backend classical|onnx] "
                   "[--onnx-model FILE] [--flip-orientation] "
                   "[--corner-override x0,y0,x1,y1,x2,y2,x3,y3] "
                   "[--corner-override-normalized x0,y0,...,x3,y3] "
                   "[--automatic-corner-override-normalized "
                   "x0,y0,...,x3,y3]\n";
      std::exit(0);
    } else {
      throw std::invalid_argument("Unknown option: " + option);
    }
  }
  if (arguments.image_path.empty() || arguments.profile_path.empty()) {
    throw std::invalid_argument("--image and --profile are required");
  }
  if (arguments.backend != "classical" && arguments.backend != "onnx") {
    throw std::invalid_argument("--backend must be classical or onnx");
  }
  if (arguments.mode != "analyze" && arguments.mode != "locate") {
    throw std::invalid_argument("--mode must be analyze or locate");
  }
  if (arguments.corner_override &&
      arguments.automatic_corner_override_normalized) {
    throw std::invalid_argument(
        "manual and automatic corner overrides are mutually exclusive");
  }
  if (arguments.mode == "locate" &&
      (arguments.corner_override ||
       arguments.automatic_corner_override_normalized)) {
    throw std::invalid_argument(
        "corner overrides are only valid in analyze mode");
  }
  return arguments;
}

json readJson(const std::filesystem::path& path) {
  constexpr std::uintmax_t kMaximumProfileBytes = 1024 * 1024;
  if (!std::filesystem::is_regular_file(path) ||
      std::filesystem::file_size(path) > kMaximumProfileBytes) {
    throw std::invalid_argument("Profile is missing or too large: " +
                                path.string());
  }
  std::ifstream input(path);
  if (!input) {
    throw std::runtime_error("Could not open profile: " + path.string());
  }
  json value;
  input >> value;
  return value;
}

cv::Mat readRgb(const std::filesystem::path& path) {
  cv::Mat encoded = cv::imread(path.string(), cv::IMREAD_UNCHANGED);
  if (encoded.empty()) {
    throw std::invalid_argument("Could not decode image: " + path.string());
  }
  cv::Mat rgb;
  if (encoded.type() == CV_8UC3) {
    cv::cvtColor(encoded, rgb, cv::COLOR_BGR2RGB);
  } else if (encoded.type() == CV_8UC4) {
    cv::cvtColor(encoded, rgb, cv::COLOR_BGRA2RGB);
  } else if (encoded.type() == CV_8UC1) {
    cv::cvtColor(encoded, rgb, cv::COLOR_GRAY2RGB);
  } else {
    throw std::invalid_argument(
        "Only 8-bit gray, RGB, and RGBA images are supported");
  }
  return rgb;
}

stripcv::Quad parseCorners(const std::string& text, const cv::Size& image_size,
                           bool normalized) {
  std::stringstream stream(text);
  std::vector<double> values;
  std::string token;
  while (std::getline(stream, token, ',')) {
    size_t consumed = 0;
    const double value = std::stod(token, &consumed);
    if (consumed != token.size() || !std::isfinite(value)) {
      throw std::invalid_argument("Invalid --corner-override value");
    }
    values.push_back(value);
  }
  if (values.size() != 8) {
    throw std::invalid_argument(
        "--corner-override requires eight comma-separated values");
  }
  stripcv::Quad corners{};
  for (size_t index = 0; index < corners.size(); ++index) {
    const double x = normalized ? values[index * 2] * (image_size.width - 1.0)
                                : values[index * 2];
    const double y = normalized
                         ? values[index * 2 + 1] * (image_size.height - 1.0)
                         : values[index * 2 + 1];
    if (normalized &&
        (values[index * 2] < 0.0 || values[index * 2] > 1.0 ||
         values[index * 2 + 1] < 0.0 || values[index * 2 + 1] > 1.0)) {
      throw std::invalid_argument(
          "--corner-override-normalized values must be within [0, 1]");
    }
    if (x < 0.0 || y < 0.0 || x > image_size.width - 1.0 ||
        y > image_size.height - 1.0) {
      throw std::invalid_argument("--corner-override is outside the image");
    }
    corners[index] = cv::Point2f(static_cast<float>(x), static_cast<float>(y));
  }
  return stripcv::orderQuad(corners);
}

std::shared_ptr<const stripcv::IRegionLocator> makeLocator(
    const Arguments& arguments) {
  if (arguments.backend == "onnx") {
    return std::make_shared<stripcv::OnnxRegionLocator>(
        arguments.onnx_model_path.string());
  }
  return std::make_shared<stripcv::ClassicalRegionLocator>();
}

json localizationToJson(const stripcv::LocalizationResult& result,
                        const cv::Size& image_size) {
  json corners = json::array();
  if (result.found) {
    for (const cv::Point2f& point : result.corners) {
      corners.push_back({point.x, point.y});
    }
  }
  return {
      {"schema_version", "1.0"},
      {"algorithm_version", STRIPCV_VERSION},
      {"image_width", image_size.width},
      {"image_height", image_size.height},
      {"found", result.found},
      {"mode", result.mode},
      {"failure_reason", result.failure_reason.empty()
                             ? json(nullptr)
                             : json(result.failure_reason)},
      {"corners", corners},
      {"confidence", result.confidence},
      {"area_fraction", result.area_fraction},
      {"edge_support_fraction", result.edge_support_fraction},
      {"rectification_rmse_px", result.rectification_rmse_px},
      {"perspective_scale_ratio", result.perspective_scale_ratio},
  };
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const Arguments arguments = parseArguments(argc, argv);
    const stripcv::AssayProfile assay =
        stripcv::AssayProfile::fromJson(readJson(arguments.profile_path));
    const cv::Mat rgb = readRgb(arguments.image_path);
    std::shared_ptr<const stripcv::IRegionLocator> locator;
    if (arguments.automatic_corner_override_normalized) {
      const stripcv::Quad corners = parseCorners(
          *arguments.automatic_corner_override_normalized, rgb.size(), true);
      const std::vector<cv::Point2f> polygon(corners.begin(), corners.end());
      locator = std::make_shared<FixedAutomaticEvaluationLocator>(
          corners, std::abs(cv::contourArea(polygon)) /
                       static_cast<double>(rgb.total()));
    } else {
      locator = makeLocator(arguments);
    }

    if (arguments.mode == "locate") {
      std::cout << localizationToJson(locator->locateBare(rgb, assay),
                                      rgb.size())
                       .dump()
                << '\n';
      return 0;
    }

    stripcv::AnalysisOptions options;
    options.flip_orientation = arguments.flip_orientation;
    if (arguments.corner_override) {
      options.corner_override =
          parseCorners(*arguments.corner_override, rgb.size(),
                       arguments.corner_override_normalized);
    }
    const stripcv::AnalysisResult result =
        stripcv::Analyzer(locator).analyze(rgb, assay, options);
    std::cout << result.toJson().dump() << '\n';
    return 0;
  } catch (const std::exception& exception) {
    std::cerr << exception.what() << '\n';
    return 1;
  }
}
