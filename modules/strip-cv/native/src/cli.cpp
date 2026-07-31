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
  std::vector<std::uint8_t> decoded;
  decoded.reserve((encoded.size() * 3) / 4);
  int accumulator = 0;
  int bits = 0;
  for (const unsigned char value : encoded) {
    if (std::isspace(value) != 0 || value == '=') {
      continue;
    }
    const int digit = base64Value(value);
    if (digit < 0) {
      throw std::invalid_argument("Invalid RGB base64 payload");
    }
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      decoded.push_back(static_cast<std::uint8_t>((accumulator >> bits) & 0xff));
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
    const std::string input((std::istreambuf_iterator<char>(std::cin)),
                            std::istreambuf_iterator<char>());
    const json request = json::parse(input);
    const int width = requiredPositiveInt(request, "width");
    const int height = requiredPositiveInt(request, "height");
    const int row_stride = requiredPositiveInt(request, "row_stride");
    const std::vector<std::uint8_t> rgb =
        decodeBase64(requiredString(request, "rgb_base64"));
    const std::size_t required_bytes =
        static_cast<std::size_t>(row_stride) * static_cast<std::size_t>(height);
    if (rgb.size() < required_bytes || row_stride < width * 3) {
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
        rgb.data(), width, height, static_cast<std::size_t>(row_stride),
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
