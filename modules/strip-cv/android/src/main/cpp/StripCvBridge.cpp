#include <android/bitmap.h>
#include <jni.h>

#include <stdexcept>
#include <string>

#include <opencv2/imgproc.hpp>

#include "stripcv/c_api.h"

namespace {

std::string fromJavaString(JNIEnv* env, jstring value) {
  if (value == nullptr) {
    return {};
  }
  const char* chars = env->GetStringUTFChars(value, nullptr);
  if (chars == nullptr) {
    throw std::runtime_error("Unable to read Java string");
  }
  const std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

class LockedBitmap {
 public:
  LockedBitmap(JNIEnv* env, jobject bitmap) : env_(env), bitmap_(bitmap) {
    if (AndroidBitmap_getInfo(env_, bitmap_, &info_) != ANDROID_BITMAP_RESULT_SUCCESS ||
        info_.format != ANDROID_BITMAP_FORMAT_RGBA_8888) {
      throw std::invalid_argument("StripCV requires an RGBA_8888 bitmap");
    }
    if (AndroidBitmap_lockPixels(env_, bitmap_, &pixels_) != ANDROID_BITMAP_RESULT_SUCCESS) {
      throw std::runtime_error("Unable to lock captured image pixels");
    }
  }

  ~LockedBitmap() {
    if (pixels_ != nullptr) {
      AndroidBitmap_unlockPixels(env_, bitmap_);
    }
  }

  const AndroidBitmapInfo& info() const { return info_; }
  void* pixels() const { return pixels_; }

 private:
  JNIEnv* env_;
  jobject bitmap_;
  AndroidBitmapInfo info_{};
  void* pixels_ = nullptr;
};

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_expo_modules_stripcv_StripCvNative_analyze(
    JNIEnv* env, jobject, jobject bitmap, jstring assay_profile_json,
    jstring card_profile_json, jstring options_json) {
  try {
    LockedBitmap locked(env, bitmap);
    cv::Mat rgba(static_cast<int>(locked.info().height),
                 static_cast<int>(locked.info().width), CV_8UC4,
                 locked.pixels(), locked.info().stride);
    cv::Mat rgb;
    cv::cvtColor(rgba, rgb, cv::COLOR_RGBA2RGB);

    const std::string assay = fromJavaString(env, assay_profile_json);
    const std::string card = fromJavaString(env, card_profile_json);
    const std::string options = fromJavaString(env, options_json);
    char* result = nullptr;
    char* error = nullptr;
    const int code = stripcv_analyze_rgb(
        rgb.data, rgb.cols, rgb.rows, rgb.step,
        rgb.step[0] * static_cast<size_t>(rgb.rows), assay.c_str(),
        card.empty() ? nullptr : card.c_str(), options.c_str(), &result, &error);
    if (code != 0 || result == nullptr) {
      const std::string message = error == nullptr ? "StripCV analysis failed" : error;
      stripcv_free_string(error);
      throw std::runtime_error(message);
    }
    const jstring output = env->NewStringUTF(result);
    stripcv_free_string(result);
    stripcv_free_string(error);
    return output;
  } catch (const std::exception& exception) {
    jclass error_class = env->FindClass("java/lang/IllegalStateException");
    env->ThrowNew(error_class, exception.what());
    return nullptr;
  }
}
