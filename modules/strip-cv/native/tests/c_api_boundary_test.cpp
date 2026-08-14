#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "stripcv/c_api.h"

namespace {

bool rejects(const std::uint8_t* rgb, int width, int height,
             std::size_t row_stride, std::size_t rgb_size) {
  char* result = nullptr;
  char* error = nullptr;
  const int status = stripcv_analyze_rgb(
      rgb, width, height, row_stride, rgb_size, "{}", nullptr, "{}", &result,
      &error);
  stripcv_free_string(result);
  stripcv_free_string(error);
  return status != 0;
}

}  // namespace

int main() {
  const std::uint8_t one_byte[1] = {0};
  if (!rejects(one_byte, 1, 1, 3, sizeof(one_byte))) {
    std::cerr << "truncated RGB buffer was accepted\n";
    return EXIT_FAILURE;
  }
  if (!rejects(one_byte, 32769, 1, 3, sizeof(one_byte))) {
    std::cerr << "oversized width was accepted\n";
    return EXIT_FAILURE;
  }
  if (!rejects(one_byte, 1, 32769, 3, sizeof(one_byte))) {
    std::cerr << "oversized height was accepted\n";
    return EXIT_FAILURE;
  }
  std::cout << "StripCV C API boundary tests passed.\n";
  return EXIT_SUCCESS;
}
