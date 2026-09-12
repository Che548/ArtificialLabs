#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
@interface DocumentOcrBridge : NSObject
+ (BOOL)begin;
+ (void)cancel;
+ (void)end;
+ (nullable NSDictionary *)recognize:(UIImage *)image models:(NSString *)models error:(NSError **)error;
@end
NS_ASSUME_NONNULL_END
