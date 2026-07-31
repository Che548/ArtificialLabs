#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface StripCvBridge : NSObject

+ (nullable NSString *)analyzeImageAtURL:(NSURL *)imageURL
                        assayProfileJson:(NSString *)assayProfileJson
                         cardProfileJson:(nullable NSString *)cardProfileJson
                             optionsJson:(NSString *)optionsJson
                                   error:(NSError * _Nullable * _Nullable)error;

@end

NS_ASSUME_NONNULL_END
