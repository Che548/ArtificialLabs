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

}  // namespace

extern "C" {

const char* stripcv_version(void) { return STRIPCV_VERSION; }

int stripcv_analyze_rgb(const uint8_t* rgb, int width, int height,
                        size_t row_stride, const char* assay_profile_json,
                        const char* card_profile_json, const char* options_json,
                        char** result_json, char** error_message) {
  if (result_json != nullptr) {
    *result_json = nullptr;
  }
  if (error_message != nullptr) {
    *error_message = nullptr;
  }
  try {
    if (rgb == nullptr || width <= 0 || height <= 0 ||
        row_stride < static_cast<size_t>(width) * 3 ||
        assay_profile_json == nullptr || result_json == nullptr) {
      throw std::invalid_argument("Invalid image buffer or required argument");
    }
    const auto assay_value = nlohmann::json::parse(assay_profile_json);
    stripcv::AssayProfile assay = stripcv::AssayProfile::fromJson(assay_value);
    stripcv::AnalysisOptions options =
        options_json != nullptr && std::strlen(options_json) > 0
            ? stripcv::AnalysisOptions::fromJson(
                  nlohmann::json::parse(options_json))
            : stripcv::AnalysisOptions{};
    if (card_profile_json != nullptr && std::strlen(card_profile_json) > 0) {
      options.card_profile = stripcv::CardProfile::fromJson(
          nlohmann::json::parse(card_profile_json));
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
