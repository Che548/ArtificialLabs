#include "stripcv/learned_reader.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <mutex>
#include <numeric>
#include <stdexcept>
#include <vector>
#include <opencv2/dnn.hpp>
#include <opencv2/imgproc.hpp>
#if CV_VERSION_MAJOR >= 5
#include <opencv2/geometry.hpp>
#endif

namespace stripcv {
namespace {
using Json = nlohmann::json;
constexpr int kPointSize = 512;
constexpr int kHeatSize = 128;
constexpr int kStride = 4;
constexpr double kPresent = .9;
constexpr double kAbsent = .1;
constexpr const char* kVersion = "strip-reader-experimental-20260914";

Json decision(const char* label, const char* reason) {
  const std::string value(label);
  const bool reportable = value == "one_line" || value == "two_line";
  Json count = nullptr;
  if (reportable) count = value == "one_line" ? 1 : 2;
  return {{"observed_label", value}, {"reason", reason}, {"reportable", reportable},
          {"observed_line_count", count}, {"requires_user_confirmation", reportable}};
}

float sigmoid(float logit) {
  if (!std::isfinite(logit)) throw std::runtime_error("non_finite_model_output");
  return 1.0f / (1.0f + std::exp(-logit));
}

cv::Mat input_blob(const cv::Mat& rgb, bool normalize) {
  const int dimensions[] = {1, 3, rgb.rows, rgb.cols};
  cv::Mat blob(4, dimensions, CV_32F);
  constexpr float mean[] = {.485f, .456f, .406f};
  constexpr float deviation[] = {.229f, .224f, .225f};
  for (int y = 0; y < rgb.rows; ++y) {
    for (int x = 0; x < rgb.cols; ++x) {
      for (int c = 0; c < 3; ++c) {
        const float pixel = rgb.depth() == CV_8U
            ? rgb.at<cv::Vec3b>(y, x)[c] / 255.0f
            : rgb.at<cv::Vec3f>(y, x)[c];
        blob.ptr<float>(0, c)[y * rgb.cols + x] = normalize
            ? (pixel - mean[c]) / deviation[c] : pixel;
      }
    }
  }
  return blob;
}

cv::Mat forward(cv::dnn::Net& net, const cv::Mat& input,
                const std::vector<int>& shape) {
  net.setInput(input);
  cv::Mat output = net.forward();
  if (output.dims != static_cast<int>(shape.size()) || output.type() != CV_32F)
    throw std::runtime_error("unexpected_model_output_shape");
  for (int i = 0; i < output.dims; ++i) {
    if (output.size[i] != shape[i]) throw std::runtime_error("unexpected_model_output_shape");
  }
  if (!cv::checkRange(output)) throw std::runtime_error("non_finite_model_output");
  return output;
}

struct Box { std::array<float, 4> xyxy; float score; };

double iou(const Box& a, const Box& b) {
  const double width = std::max(0.0f, std::min(a.xyxy[2], b.xyxy[2]) - std::max(a.xyxy[0], b.xyxy[0]));
  const double height = std::max(0.0f, std::min(a.xyxy[3], b.xyxy[3]) - std::max(a.xyxy[1], b.xyxy[1]));
  const double overlap = width * height;
  const double area_a = (a.xyxy[2] - a.xyxy[0]) * (a.xyxy[3] - a.xyxy[1]);
  const double area_b = (b.xyxy[2] - b.xyxy[0]) * (b.xyxy[3] - b.xyxy[1]);
  return overlap / std::max(1e-12, area_a + area_b - overlap);
}

std::vector<Box> detect(cv::dnn::Net& detector, const cv::Mat& rgb) {
  const double gain = std::min(640.0 / rgb.rows, 640.0 / rgb.cols);
  const int width = static_cast<int>(std::nearbyint(rgb.cols * gain));
  const int height = static_cast<int>(std::nearbyint(rgb.rows * gain));
  const int left = static_cast<int>(std::round((640 - width) / 2.0 - .1));
  const int top = static_cast<int>(std::round((640 - height) / 2.0 - .1));
  cv::Mat scaled, letterbox;
  cv::resize(rgb, scaled, cv::Size(width, height), 0, 0, cv::INTER_LINEAR);
  cv::copyMakeBorder(scaled, letterbox, top, 640 - height - top,
                    left, 640 - width - left, cv::BORDER_CONSTANT, cv::Scalar(114, 114, 114));
  const cv::Mat output = forward(detector, input_blob(letterbox, false), {1, 5, 8400});
  std::vector<Box> candidates;
  for (int i = 0; i < 8400; ++i) {
    const float score = output.ptr<float>()[4 * 8400 + i];
    if (score < .05f) continue;
    const float x = output.ptr<float>()[i];
    const float y = output.ptr<float>()[8400 + i];
    const float w = output.ptr<float>()[2 * 8400 + i];
    const float h = output.ptr<float>()[3 * 8400 + i];
    if (w <= 0 || h <= 0) continue;
    candidates.push_back({{x - w / 2, y - h / 2, x + w / 2, y + h / 2}, score});
  }
  std::stable_sort(candidates.begin(), candidates.end(), [](const Box& a, const Box& b) {
    return a.score > b.score;
  });
  std::vector<Box> selected;
  for (const auto& candidate : candidates) {
    bool suppressed = false;
    for (const auto& previous : selected) {
      if (iou(candidate, previous) > .7) { suppressed = true; break; }
    }
    if (!suppressed) selected.push_back(candidate);
    if (selected.size() >= 100) break;
  }
  const float scale = static_cast<float>(gain);
  for (auto& candidate : selected) {
    for (int i = 0; i < 4; ++i) {
      candidate.xyxy[i] -= i % 2 == 0 ? left : top;
      candidate.xyxy[i] /= scale;
      candidate.xyxy[i] = std::clamp(candidate.xyxy[i], 0.0f,
                                   static_cast<float>(i % 2 == 0 ? rgb.cols : rgb.rows));
    }
  }
  return selected;
}

Json matrix_json(const cv::Matx33d& matrix) {
  return Json::array({Json::array({matrix(0, 0), matrix(0, 1), matrix(0, 2)}),
                      Json::array({matrix(1, 0), matrix(1, 1), matrix(1, 2)}),
                      Json::array({matrix(2, 0), matrix(2, 1), matrix(2, 2)})});
}

struct Peak {
  float score;
  cv::Point2d input;
  cv::Point2d source;
  Json json() const { return {{"score", score}, {"point_input", {input.x, input.y}},
                             {"point_source", {source.x, source.y}}}; }
};

Peak peak(const cv::Mat& heat, int channel, const cv::Matx33d& inverse,
          const cv::Point2d* begin = nullptr, const cv::Point2d* end = nullptr) {
  int best = 0;
  float best_score = -1;
  const auto axis = begin ? *end - *begin : cv::Point2d();
  const double length = cv::norm(axis);
  for (int i = 0; i < kHeatSize * kHeatSize; ++i) {
    const cv::Point2d p((i % kHeatSize) * kStride, (i / kHeatSize) * kStride);
    float score = sigmoid(heat.ptr<float>()[channel * kHeatSize * kHeatSize + i]);
    if (begin) {
      const auto delta = p - *begin;
      const double u = delta.dot(axis) / std::max(length * length, 1.0);
      const double distance = std::abs(delta.x * axis.y - delta.y * axis.x) / std::max(length, 1.0);
      if (u < -.05 || u > 1.05 || distance > std::max(8.0, .25 * length)) score = 0;
    }
    if (score > best_score) { best_score = score; best = i; }
  }
  const cv::Point2d input((best % kHeatSize) * kStride, (best / kHeatSize) * kStride);
  const cv::Vec3d projected = inverse * cv::Vec3d(input.x, input.y, 1);
  return {best_score, input, {projected[0] / projected[2], projected[1] / projected[2]}};
}

Json read_count(float c, float t, float q, bool length_ok) {
  if (!length_ok) return decision("invalid", "result_region_degenerate");
  if (q < kPresent) return decision("review", "window_coverage_uncertain");
  if (c <= kAbsent) return decision("invalid", "control_absent");
  if (c < kPresent) return decision("review", "control_uncertain");
  if (t >= kPresent) return decision("two_line", "ct_present");
  if (t <= kAbsent) return decision("one_line", "control_only");
  return decision("review", "test_uncertain");
}
}  // namespace

struct LearnedReader::Impl {
  cv::dnn::Net detector, points, presence, coverage, auxiliary;
  std::mutex mutex;
  std::string directory;
  cv::dnn::Net load(const char* filename) {
      auto net = cv::dnn::readNetFromONNX(directory + "/" + filename);
      if (net.empty()) throw std::runtime_error("reader_model_missing");
      net.setPreferableBackend(cv::dnn::DNN_BACKEND_OPENCV);
      net.setPreferableTarget(cv::dnn::DNN_TARGET_CPU);
      return net;
  }
  explicit Impl(const std::string& path) : directory(path) {
    detector = load("detector.onnx");
  }
  void load_readers() {
    if (!auxiliary.empty()) return;
    points = load("points.onnx");
    presence = load("presence.onnx"); coverage = load("coverage.onnx");
    auxiliary = load("auxiliary.onnx");
  }

  Json detect_only(const cv::Mat& rgb) {
    if (rgb.empty() || rgb.type() != CV_8UC3 || rgb.cols < 2 || rgb.rows < 2)
      throw std::invalid_argument("reader_requires_rgb888_image");
    std::lock_guard<std::mutex> lock(mutex);
    Json output = {{"schema_version", "1.0"}, {"algorithm_version", kVersion},
                   {"width", rgb.cols}, {"height", rgb.rows},
                   {"detector_proposals", Json::array()}};
    for (const auto& box : detect(detector, rgb))
      output["detector_proposals"].push_back({{"bbox", box.xyxy}, {"confidence", box.score}});
    return output;
  }

  Json analyze(const cv::Mat& rgb) {
    if (rgb.empty() || rgb.type() != CV_8UC3 || rgb.cols < 2 || rgb.rows < 2)
      throw std::invalid_argument("reader_requires_rgb888_image");
    std::lock_guard<std::mutex> lock(mutex);
    const auto started = std::chrono::steady_clock::now();
    load_readers();
    Json output = {{"schema_version", "1.0"}, {"algorithm_version", kVersion},
                   {"experimental", true}, {"width", rgb.cols}, {"height", rgb.rows},
                   {"detector_proposals", Json::array()}};
    Json result = decision("invalid", "detector_no_proposal");
    const auto boxes = detect(detector, rgb);
    for (const auto& box : boxes)
      output["detector_proposals"].push_back({{"bbox", box.xyxy}, {"confidence", box.score}});
    if (!boxes.empty()) {
      const auto& box = boxes.front().xyxy;
      const double dx = .25 * (static_cast<double>(box[2]) - box[0]);
      const double dy = .25 * (static_cast<double>(box[3]) - box[1]);
      const int x0 = std::max(0, static_cast<int>(std::floor(box[0] - dx)));
      const int y0 = std::max(0, static_cast<int>(std::floor(box[1] - dy)));
      const int x1 = std::min(rgb.cols, static_cast<int>(std::ceil(box[2] + dx)));
      const int y1 = std::min(rgb.rows, static_cast<int>(std::ceil(box[3] + dy)));
      result = decision("invalid", "result_region_degenerate");
      if (x1 > x0 && y1 > y0) {
        const cv::Mat crop = rgb(cv::Rect(x0, y0, x1 - x0, y1 - y0));
        const double scale = kPointSize * .96 / std::max(crop.cols, crop.rows);
        cv::Mat local = cv::getRotationMatrix2D(cv::Point2f((crop.cols - 1) / 2.f,
                                                         (crop.rows - 1) / 2.f), 0, scale);
        local.at<double>(0, 2) += (kPointSize - 1) / 2.0 - (crop.cols - 1) / 2.0;
        local.at<double>(1, 2) += (kPointSize - 1) / 2.0 - (crop.rows - 1) / 2.0;
        cv::Matx33d transform = cv::Matx33d::eye();
        for (int y = 0; y < 2; ++y) for (int x = 0; x < 3; ++x) transform(y, x) = local.at<double>(y, x);
        transform = transform * cv::Matx33d(1, 0, -x0, 0, 1, -y0, 0, 0, 1);
        cv::Mat point_image;
        cv::warpAffine(crop, point_image, local, cv::Size(kPointSize, kPointSize),
                       cv::INTER_LINEAR, cv::BORDER_CONSTANT, cv::Scalar(114, 114, 114));
        const auto heat = forward(points, input_blob(point_image, true), {1, 4, 128, 128});
        const auto inverse = transform.inv();
        const Peak begin = peak(heat, 2, inverse), end = peak(heat, 3, inverse);
        const Peak control = peak(heat, 0, inverse, &begin.input, &end.input);
        const Peak test = peak(heat, 1, inverse, &begin.input, &end.input);
        const double input_length = cv::norm(end.input - begin.input);
        output["geometry"] = {{"anchors", {begin.json(), end.json()}},
                              {"bands", {control.json(), test.json()}},
                              {"result_region", {{"length_input_px", input_length}}},
                              {"source_to_input", matrix_json(transform)},
                              {"roi", {x0, y0, x1, y1}}};
        const cv::Point2d direction = end.source - begin.source;
        const double length = cv::norm(direction);
        if (std::isfinite(length) && length > 2) {
          const cv::Point2d along = direction / length, across(-along.y, along.x);
          const cv::Point2d center = (begin.source + end.source) / 2;
          const double window_scale = 384 / (1.2 * length);
          cv::Matx23d affine(along.x * window_scale, along.y * window_scale,
                            383 / 2.0 - center.dot(along) * window_scale,
                            across.x * window_scale, across.y * window_scale,
                            127 / 2.0 - center.dot(across) * window_scale);
          cv::Mat floating(rgb.size(), CV_32FC3);
          for (int y = 0; y < rgb.rows; ++y) for (int x = 0; x < rgb.cols; ++x)
            for (int c = 0; c < 3; ++c) floating.at<cv::Vec3f>(y, x)[c] = rgb.at<cv::Vec3b>(y, x)[c] / 255.0f;
          cv::Mat window;
          cv::warpAffine(floating, window, affine, cv::Size(384, 128), cv::INTER_LINEAR,
                         cv::BORDER_CONSTANT, cv::Scalar(.447, .447, .447));
          const auto input = input_blob(window, true);
          const auto presence_logits = forward(presence, input, {1, 2});
          const auto coverage_logits = forward(coverage, input, {1, 3});
          const auto auxiliary_logits = forward(auxiliary, input, {1, 2});
          const float c = sigmoid(presence_logits.ptr<float>()[0]);
          const float t = sigmoid(presence_logits.ptr<float>()[1]);
          const float q = sigmoid(coverage_logits.ptr<float>()[2]);
          const float ac = sigmoid(auxiliary_logits.ptr<float>()[0]);
          const float at = sigmoid(auxiliary_logits.ptr<float>()[1]);
          const auto primary = read_count(c, t, q, input_length >= 16);
          const auto secondary = read_count(ac, at, q, input_length >= 16);
          result = primary;
          if (primary["reportable"].get<bool>()) {
            if (!secondary["reportable"].get<bool>() || primary["observed_label"] != secondary["observed_label"])
              result = decision("review", "readers_do_not_confidently_agree");
            else if (primary["observed_label"] == "one_line" && test.score > kAbsent)
              result = decision("review", "spatial_test_absence_not_confirmed");
            else result = decision(primary["observed_label"].get<std::string>().c_str(),
                                   primary["observed_label"] == "one_line"
                                       ? "window_readers_and_spatial_absence_agree" : "readers_agree");
          }
          output["presence_scores"] = {c, t};
          output["auxiliary_presence_scores"] = {ac, at};
          output["window_coverage_score"] = q;
          output["evidence"] = {{"detectorFound", true}, {"resultLength", input_length},
                                {"coverage", q}, {"primary", {c, t}}, {"auxiliary", {ac, at}},
                                {"spatialTest", test.score}};
          output["window_source_to_input"] = {{affine(0, 0), affine(0, 1), affine(0, 2)},
                                              {affine(1, 0), affine(1, 1), affine(1, 2)}};
        }
      }
    }
    output["result"] = result;
    output["elapsed_ms"] = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
    return output;
  }
};

LearnedReader::LearnedReader(const std::string& directory) : impl_(std::make_unique<Impl>(directory)) {}
LearnedReader::~LearnedReader() = default;
Json LearnedReader::analyze_rgb(const cv::Mat& rgb) { return impl_->analyze(rgb); }
Json LearnedReader::detect_rgb(const cv::Mat& rgb) { return impl_->detect_only(rgb); }
}  // namespace stripcv
