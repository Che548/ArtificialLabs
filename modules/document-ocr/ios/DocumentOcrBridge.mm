#import "DocumentOcrBridge.h"
#include "../native/OcrEngine.hpp"
#include <vector>

@implementation DocumentOcrBridge
+ (BOOL)begin { return document_ocr::begin(); }
+ (void)cancel { document_ocr::cancel(); }
+ (void)end { document_ocr::end(); }
+ (NSDictionary *)recognize:(UIImage *)image models:(NSString *)models error:(NSError **)error {
  try {
    CGImageRef source = image.CGImage;
    if (!source) throw std::runtime_error("DOCUMENT_CORRUPT");
    const size_t width = CGImageGetWidth(source), height = CGImageGetHeight(source);
    if (width < 1 || height < 1 || width > 2800 || height > 2800)
      throw std::runtime_error("DOCUMENT_IMAGE_SIZE");
    std::vector<uint8_t> pixels(width * height * 4, 255);
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(pixels.data(), width, height, 8, width * 4, space,
      kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(space);
    if (!context) throw std::runtime_error("DOCUMENT_IMAGE_SIZE");
    CGContextSetRGBFillColor(context, 1, 1, 1, 1);
    CGContextFillRect(context, CGRectMake(0, 0, width, height));
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), source);
    CGContextRelease(context);
    auto result = document_ocr::recognize(pixels.data(), (int)width, (int)height, (int)width * 4, models.UTF8String);
    NSString *text = [[NSString alloc] initWithBytes:result.text.data() length:result.text.size() encoding:NSUTF8StringEncoding];
    if (!text) throw std::runtime_error("DOCUMENT_RECOGNITION_FAILED");
    return @{ @"text": text, @"confidence": @(result.confidence) };
  } catch (const std::exception& exception) {
    if (error) *error = [NSError errorWithDomain:@"DocumentOcr" code:1
      userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithUTF8String:exception.what()]}];
    return nil;
  }
}
@end
