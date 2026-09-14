#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface StripCvBridge : NSObject

+ (nullable NSString *)detectStripImageAtURL:(NSURL *)imageURL
                                     error:(NSError * _Nullable * _Nullable)error
    NS_SWIFT_NAME(detectStripImage(at:error:));

+ (nullable NSString *)analyzeLearnedImageAtURL:(NSURL *)imageURL
                                        error:(NSError * _Nullable * _Nullable)error
    NS_SWIFT_NAME(analyzeLearnedImage(at:error:));

+ (nullable NSString *)analyzeImageAtURL:(NSURL *)imageURL
                        assayProfileJson:(NSString *)assayProfileJson
                         cardProfileJson:(nullable NSString *)cardProfileJson
                             optionsJson:(NSString *)optionsJson
                                   error:(NSError * _Nullable * _Nullable)error
    NS_SWIFT_NAME(analyzeImage(at:assayProfileJson:cardProfileJson:optionsJson:error:));

@end

NS_ASSUME_NONNULL_END
