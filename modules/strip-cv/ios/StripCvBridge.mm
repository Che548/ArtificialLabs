#import "StripCvBridge.h"

#import <UIKit/UIKit.h>

#include <vector>

#include <opencv2/imgproc.hpp>

#include "stripcv/c_api.h"

namespace {

NSError *makeError(NSString *message) {
  return [NSError errorWithDomain:@"expo.modules.stripcv"
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey: message}];
}

UIImage *normalizeImage(UIImage *image) {
  const CGSize pixelSize = CGSizeMake(image.size.width * image.scale,
                                      image.size.height * image.scale);
  UIGraphicsBeginImageContextWithOptions(pixelSize, YES, 1.0);
  [image drawInRect:CGRectMake(0, 0, pixelSize.width, pixelSize.height)];
  UIImage *normalized = UIGraphicsGetImageFromCurrentImageContext();
  UIGraphicsEndImageContext();
  return normalized;
}

}  // namespace

@implementation StripCvBridge

+ (nullable NSString *)analyzeImageAtURL:(NSURL *)imageURL
                        assayProfileJson:(NSString *)assayProfileJson
                         cardProfileJson:(nullable NSString *)cardProfileJson
                             optionsJson:(NSString *)optionsJson
                                   error:(NSError * _Nullable * _Nullable)error {
  @autoreleasepool {
    UIImage *source = [UIImage imageWithContentsOfFile:imageURL.path];
    UIImage *image = source == nil ? nil : normalizeImage(source);
    CGImageRef cgImage = image.CGImage;
    if (cgImage == nil) {
      if (error != nil) {
        *error = makeError(@"Unable to decode captured image URI.");
      }
      return nil;
    }

    const size_t width = CGImageGetWidth(cgImage);
    const size_t height = CGImageGetHeight(cgImage);
    const size_t bytesPerRow = width * 4;
    std::vector<unsigned char> rgba(height * bytesPerRow);
    CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef context = CGBitmapContextCreate(
        rgba.data(), width, height, 8, bytesPerRow, colorSpace,
        kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(colorSpace);
    if (context == nil) {
      if (error != nil) {
        *error = makeError(@"Unable to allocate an sRGB image buffer.");
      }
      return nil;
    }
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), cgImage);
    CGContextRelease(context);

    cv::Mat rgbaMat(static_cast<int>(height), static_cast<int>(width), CV_8UC4,
                    rgba.data(), bytesPerRow);
    cv::Mat rgb;
    cv::cvtColor(rgbaMat, rgb, cv::COLOR_RGBA2RGB);
    char *result = nullptr;
    char *nativeError = nullptr;
    const int status = stripcv_analyze_rgb(
        rgb.data, rgb.cols, rgb.rows, rgb.step,
        assayProfileJson.UTF8String,
        cardProfileJson == nil ? nullptr : cardProfileJson.UTF8String,
        optionsJson.UTF8String, &result, &nativeError);
    if (status != 0 || result == nullptr) {
      NSString *message = nativeError == nullptr
          ? @"StripCV analysis failed."
          : [NSString stringWithUTF8String:nativeError];
      stripcv_free_string(nativeError);
      if (error != nil) {
        *error = makeError(message);
      }
      return nil;
    }
    NSString *output = [NSString stringWithUTF8String:result];
    stripcv_free_string(result);
    stripcv_free_string(nativeError);
    return output;
  }
}

@end
