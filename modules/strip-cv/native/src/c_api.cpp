#include "stripcv/c_api.h"

#include <cstdlib>
#include <cstring>
#include <exception>
#include <new>
#include <stdexcept>
#include <string>

#include <nlohmann/json.hpp>
#include <opencv2/core.hpp>

#include "stripcv/analyzer.hpp"

namespace {

char* copyString(const std::string& value) {
  char* copy = static_cast<char*>(std::malloc(value.size() + 1));
  if (copy == nullptr) {
    return nullptr;
  }
  std::memcpy(copy, value.c_str(), value.size() + 1);
  return copy;
}

std::string boundedString(const char* value, size_t maximum_length,
                          const char* label) {
  if (value == nullptr) {
    return {};
  }
  size_t length = 0;
  while (length <= maximum_length && value[length] != '\0') {
    ++length;
  }
  if (length > maximum_length) {
    throw std::invalid_argument(std::string(label) + " is too large");
  }
  return std::string(value, length);
}

}  // namespace

extern "C" {

const char* stripcv_version(void) { return STRIPCV_VERSION; }

int stripcv_analyze_rgb(const uint8_t* rgb, int width, int height,
                        size_t row_stride, size_t rgb_size,
                        const char* assay_profile_json,
                        const char* card_profile_json, const char* options_json,
                        char** result_json, char** error_message) {
  if (result_json != nullptr) {
    *result_json = nullptr;
  }
  if (error_message != nullptr) {
    *error_message = nullptr;
  }
  try {
    constexpr int kMaxImageDimension = 32768;
    constexpr size_t kMaxImageBytes = 128u * 1024u * 1024u;
    if (rgb == nullptr || width <= 0 || height <= 0 ||
        width > kMaxImageDimension || height > kMaxImageDimension ||
        assay_profile_json == nullptr || result_json == nullptr) {
      throw std::invalid_argument("Invalid image buffer or required argument");
    }
    const size_t minimum_stride = static_cast<size_t>(width) * 3u;
    if (row_stride < minimum_stride ||
        static_cast<size_t>(height) > kMaxImageBytes / row_stride) {
      throw std::invalid_argument("Invalid image dimensions or row stride");
    }
    const size_t required_size = row_stride * static_cast<size_t>(height);
    if (required_size > kMaxImageBytes || rgb_size < required_size) {
      throw std::invalid_argument("RGB buffer is smaller than declared image");
    }
    const std::string assay_json =
        boundedString(assay_profile_json, 1024u * 1024u, "Assay profile");
    const std::string card_json =
        boundedString(card_profile_json, 1024u * 1024u, "Card profile");
    const std::string options_value =
        boundedString(options_json, 64u * 1024u, "Analysis options");
    const auto assay_value = nlohmann::json::parse(assay_json);
    stripcv::AssayProfile assay = stripcv::AssayProfile::fromJson(assay_value);
    stripcv::AnalysisOptions options =
        !options_value.empty()
            ? stripcv::AnalysisOptions::fromJson(
                  nlohmann::json::parse(options_value))
            : stripcv::AnalysisOptions{};
    if (!card_json.empty()) {
      options.card_profile = stripcv::CardProfile::fromJson(
          nlohmann::json::parse(card_json));
    }
    cv::Mat image(height, width, CV_8UC3, const_cast<uint8_t*>(rgb), row_stride);
    stripcv::Analyzer analyzer;
    const stripcv::AnalysisResult result = analyzer.analyze(image, assay, options);
    *result_json = copyString(result.toJson().dump());
    if (*result_json == nullptr) {
      throw std::bad_alloc();
    }
    return 0;
  } catch (const std::exception& exception) {
    if (error_message != nullptr) {
      *error_message = copyString(exception.what());
    }
    return 1;
  } catch (...) {
    if (error_message != nullptr) {
      *error_message = copyString("Unknown stripcv failure");
    }
    return 2;
  }
}

void stripcv_free_string(char* value) { std::free(value); }

}  // extern "C"
