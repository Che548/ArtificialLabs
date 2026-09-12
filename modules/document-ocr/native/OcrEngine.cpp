#include "OcrEngine.hpp"
#include <tesseract/baseapi.h>
#include <tesseract/ocrclass.h>
#include <atomic>
#include <memory>
#include <mutex>
#include <stdexcept>

namespace document_ocr {
namespace {
std::atomic<bool> active{false};
std::atomic<bool> cancelled{false};
std::mutex pageMutex;
}
bool begin() {
  bool expected = false;
  if (!active.compare_exchange_strong(expected, true)) return false;
  cancelled = false;
  return true;
}
void cancel() { cancelled = true; }
void end() {
  std::lock_guard<std::mutex> lock(pageMutex);
  active = false;
}
Result recognize(const uint8_t* rgba, int width, int height, int stride, const std::string& models) {
  std::lock_guard<std::mutex> lock(pageMutex);
  if (!active || cancelled) throw std::runtime_error("DOCUMENT_CANCELLED");
  if (!rgba || width < 1 || height < 1 || width > 2800 || height > 2800 || stride < width * 4)
    throw std::runtime_error("DOCUMENT_IMAGE_SIZE");
  tesseract::TessBaseAPI api;
  // No debug images, source paths or recognized text in engine diagnostics.
  api.SetVariable("debug_file", "/dev/null");
  if (api.Init(models.c_str(), "rus+eng", tesseract::OEM_LSTM_ONLY) != 0)
    throw std::runtime_error("DOCUMENT_ENGINE_UNAVAILABLE");
  api.SetVariable("debug_file", "/dev/null");
  api.SetPageSegMode(tesseract::PSM_AUTO);
  api.SetImage(rgba, width, height, 4, stride);
  api.SetSourceResolution(200);
  tesseract::ETEXT_DESC monitor;
  monitor.cancel = [](void*, int) { return cancelled.load(); };
  monitor.set_deadline_msecs(60'000);
  const int status = api.Recognize(&monitor);
  if (cancelled) throw std::runtime_error("DOCUMENT_CANCELLED");
  if (status != 0) throw std::runtime_error("DOCUMENT_RECOGNITION_FAILED");
  std::unique_ptr<char[]> text(api.GetUTF8Text());
  if (!text) throw std::runtime_error("DOCUMENT_RECOGNITION_FAILED");
  std::string result(text.get());
  if (result.size() > 800'000) throw std::runtime_error("DOCUMENT_TEXT_SIZE");
  return {result, api.MeanTextConf() / 100.0};
}
}
