#pragma once

#include <memory>
#include <string>
#include <opencv2/core.hpp>
#include <nlohmann/json.hpp>

namespace stripcv {

// Local, single-strip image inference. The instance serializes calls because
// OpenCV Net input/output buffers are mutable. No annotated geometry is accepted.
class LearnedReader {
 public:
  explicit LearnedReader(const std::string& model_directory);
  ~LearnedReader();
  LearnedReader(const LearnedReader&) = delete;
  LearnedReader& operator=(const LearnedReader&) = delete;
  nlohmann::json analyze_rgb(const cv::Mat& rgb);
  nlohmann::json detect_rgb(const cv::Mat& rgb);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace stripcv
