#pragma once
#include <cstdint>
#include <string>

namespace document_ocr {
struct Result { std::string text; double confidence; };
// One process-wide job prevents multiple full-resolution pages competing for memory.
bool begin();
void cancel();
void end();
Result recognize(const uint8_t* rgba, int width, int height, int stride, const std::string& models);
}
