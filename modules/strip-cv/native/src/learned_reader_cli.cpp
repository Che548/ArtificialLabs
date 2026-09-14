#include "stripcv/learned_reader.hpp"
#include <fstream>
#include <iostream>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

int main(int argc, char** argv) {
  if (argc != 3) { std::cerr << "Usage: stripcv_learned_cli MODELS IMAGE_LIST_JSON\n"; return 2; }
  try {
    cv::setNumThreads(2);
    stripcv::LearnedReader reader(argv[1]);
    std::ifstream stream(argv[2]);
    auto inputs = nlohmann::json::parse(stream);
    for (const auto& input : inputs) {
      const auto path = input.at("image").get<std::string>();
      cv::Mat bgr = cv::imread(path), rgb;
      if (bgr.empty()) throw std::runtime_error("Unable to decode evaluation image");
      cv::cvtColor(bgr, rgb, cv::COLOR_BGR2RGB);
      auto result = reader.analyze_rgb(rgb);
      result["id"] = input.at("id");
      std::cout << result.dump() << std::endl;
    }
  } catch (const std::exception& error) {
    std::cerr << error.what() << std::endl;
    return 1;
  }
  return 0;
}
