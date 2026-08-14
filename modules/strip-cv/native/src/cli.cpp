#include <cctype>
#include <cstdint>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "stripcv/c_api.h"

namespace {

using json = nlohmann::json;

int base64Value(unsigned char value) {
  if (value >= 'A' && value <= 'Z') {
    return value - 'A';
  }
  if (value >= 'a' && value <= 'z') {
    return value - 'a' + 26;
  }
  if (value >= '0' && value <= '9') {
    return value - '0' + 52;
  }
  if (value == '+') {
    return 62;
  }
  if (value == '/') {
    return 63;
  }
  return -1;
}

std::vector<std::uint8_t> decodeBase64(const std::string& encoded) {
  std::string compact;
  compact.reserve(encoded.size());
  for (const unsigned char value : encoded) {
    if (std::isspace(value) != 0) {
      throw std::runtime_error("Invalid RGB base64 payload");
    }
    compact.push_back(static_cast<char>(value));
  }
  if (compact.empty() || compact.size() % 4 != 0) {
    throw std::invalid_argument("Invalid RGB base64 payload");
  }

  std::vector<std::uint8_t> decoded;
  decoded.reserve((compact.size() / 4) * 3);
  for (std::size_t offset = 0; offset < compact.size(); offset += 4) {
    const bool final_quartet = offset + 4 == compact.size();
    const bool third_padding = compact[offset + 2] == '=';
    const bool fourth_padding = compact[offset + 3] == '=';
    if (compact[offset] == '=' || compact[offset + 1] == '=' ||
        (!final_quartet && (third_padding || fourth_padding)) ||
        (third_padding && !fourth_padding)) {
      throw std::invalid_argument("Invalid RGB base64 payload");
    }

    const int a = base64Value(static_cast<unsigned char>(compact[offset]));
    const int b = base64Value(static_cast<unsigned char>(compact[offset + 1]));
    const int c = third_padding
                      ? 0
                      : base64Value(
                            static_cast<unsigned char>(compact[offset + 2]));
    const int d = fourth_padding
                      ? 0
                      : base64Value(
                            static_cast<unsigned char>(compact[offset + 3]));
    if (a < 0 || b < 0 || c < 0 || d < 0 ||
        (third_padding && (b & 0x0f) != 0) ||
        (fourth_padding && !third_padding && (c & 0x03) != 0)) {
      throw std::invalid_argument("Invalid RGB base64 payload");
    }

    const std::uint32_t block =
        (static_cast<std::uint32_t>(a) << 18) |
        (static_cast<std::uint32_t>(b) << 12) |
        (static_cast<std::uint32_t>(c) << 6) |
        static_cast<std::uint32_t>(d);
    decoded.push_back(static_cast<std::uint8_t>((block >> 16) & 0xff));
    if (!third_padding) {
      decoded.push_back(static_cast<std::uint8_t>((block >> 8) & 0xff));
    }
    if (!fourth_padding) {
      decoded.push_back(static_cast<std::uint8_t>(block & 0xff));
    }
  }
  return decoded;
}

std::string requiredString(const json& request, const char* key) {
  if (!request.contains(key) || !request.at(key).is_string()) {
    throw std::invalid_argument(std::string("Missing string field: ") + key);
  }
  return request.at(key).get<std::string>();
}

int requiredPositiveInt(const json& request, const char* key) {
  if (!request.contains(key) || !request.at(key).is_number_integer()) {
    throw std::invalid_argument(std::string("Missing integer field: ") + key);
  }
  const int value = request.at(key).get<int>();
  if (value <= 0) {
    throw std::invalid_argument(std::string("Field must be positive: ") + key);
  }
  return value;
}

}  // namespace

int main() {
  try {
    constexpr int kMaxImageDimension = 32768;
    constexpr int kMaxRowStride = kMaxImageDimension * 4;
    constexpr std::size_t kMaxImageBytes = 128u * 1024u * 1024u;
    const std::string input((std::istreambuf_iterator<char>(std::cin)),
                            std::istreambuf_iterator<char>());
    const json request = json::parse(input);
    const int width = requiredPositiveInt(request, "width");
    const int height = requiredPositiveInt(request, "height");
    const int row_stride = requiredPositiveInt(request, "row_stride");
    if (width > kMaxImageDimension || height > kMaxImageDimension ||
        row_stride > kMaxRowStride) {
      throw std::invalid_argument("Declared image dimensions are too large");
    }
    const std::vector<std::uint8_t> rgb =
        decodeBase64(requiredString(request, "rgb_base64"));
    const std::size_t minimum_row_stride =
        static_cast<std::size_t>(width) * 3u;
    const std::size_t required_bytes =
        static_cast<std::size_t>(row_stride) * static_cast<std::size_t>(height);
    if (required_bytes > kMaxImageBytes || rgb.size() < required_bytes ||
        static_cast<std::size_t>(row_stride) < minimum_row_stride) {
      throw std::invalid_argument("RGB payload is smaller than the declared image");
    }

    const std::string assay_profile =
        request.value("assay_profile", json::object()).dump();
    const json& card_value = request.value("card_profile", json(nullptr));
    const std::string card_profile =
        card_value.is_null() ? std::string() : card_value.dump();
    const std::string options =
        request.value("options", json::object()).dump();

    char* result = nullptr;
    char* error = nullptr;
    const int status = stripcv_analyze_rgb(
        rgb.data(), width, height, static_cast<std::size_t>(row_stride), rgb.size(),
        assay_profile.c_str(), card_profile.empty() ? nullptr : card_profile.c_str(),
        options.c_str(), &result, &error);
    if (status != 0 || result == nullptr) {
      const std::string message =
          error == nullptr ? "StripCV analysis failed" : error;
      stripcv_free_string(result);
      stripcv_free_string(error);
      throw std::runtime_error(message);
    }

    std::cout << result << '\n';
    stripcv_free_string(result);
    stripcv_free_string(error);
    return 0;
  } catch (const std::exception& exception) {
    std::cerr << exception.what() << '\n';
    return 1;
  }
}
