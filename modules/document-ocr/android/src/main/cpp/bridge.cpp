#include <jni.h>
#include <android/bitmap.h>
#include "OcrEngine.hpp"
#include <stdexcept>

extern "C" JNIEXPORT jboolean JNICALL Java_expo_modules_documentocr_OcrNative_begin(JNIEnv*, jobject) { return document_ocr::begin(); }
extern "C" JNIEXPORT void JNICALL Java_expo_modules_documentocr_OcrNative_cancel(JNIEnv*, jobject) { document_ocr::cancel(); }
extern "C" JNIEXPORT void JNICALL Java_expo_modules_documentocr_OcrNative_end(JNIEnv*, jobject) { document_ocr::end(); }
extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_documentocr_OcrNative_recognize(JNIEnv* env, jobject, jobject bitmap, jstring models) {
  void* pixels = nullptr;
  const char* path = nullptr;
  try {
    AndroidBitmapInfo info{};
    if (AndroidBitmap_getInfo(env, bitmap, &info) != 0 || info.format != ANDROID_BITMAP_FORMAT_RGBA_8888 ||
        AndroidBitmap_lockPixels(env, bitmap, &pixels) != 0) throw std::runtime_error("DOCUMENT_IMAGE_SIZE");
    path = env->GetStringUTFChars(models, nullptr);
    if (!path) throw std::runtime_error("DOCUMENT_ENGINE_UNAVAILABLE");
    auto result = document_ocr::recognize(static_cast<uint8_t*>(pixels), info.width, info.height, info.stride, path);
    env->ReleaseStringUTFChars(models, path); path = nullptr;
    AndroidBitmap_unlockPixels(env, bitmap); pixels = nullptr;
    // JSON encoding through Android's implementation handles newlines and Unicode safely.
    jclass stringClass = env->FindClass("java/lang/String");
    jbyteArray bytes = env->NewByteArray(result.text.size());
    env->SetByteArrayRegion(bytes, 0, result.text.size(), reinterpret_cast<const jbyte*>(result.text.data()));
    jstring encoding = env->NewStringUTF("UTF-8");
    jobject text = env->NewObject(stringClass, env->GetMethodID(stringClass, "<init>", "([BLjava/lang/String;)V"), bytes, encoding);
    jclass json = env->FindClass("org/json/JSONObject");
    jobject object = env->NewObject(json, env->GetMethodID(json, "<init>", "()V"));
    env->CallObjectMethod(object, env->GetMethodID(json, "put", "(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;"), env->NewStringUTF("text"), text);
    env->CallObjectMethod(object, env->GetMethodID(json, "put", "(Ljava/lang/String;D)Lorg/json/JSONObject;"), env->NewStringUTF("confidence"), result.confidence);
    return static_cast<jstring>(env->CallObjectMethod(object, env->GetMethodID(json, "toString", "()Ljava/lang/String;")));
  } catch (const std::exception& error) {
    if (path) env->ReleaseStringUTFChars(models, path);
    if (pixels) AndroidBitmap_unlockPixels(env, bitmap);
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), error.what());
    return nullptr;
  }
}
