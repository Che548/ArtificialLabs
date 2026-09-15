import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// react-native-screens 4.16 hardcodes white behind UIScrollEdgeEffect.
// UIKit needs a dynamic color here even when the React screen is dark.
const path = fileURLToPath(new URL('../node_modules/react-native-screens/ios/bottom-tabs/RNSBottomTabsScreenComponentView.mm', import.meta.url));
const source = readFileSync(path, 'utf8');
const original = 'self.backgroundColor = [UIColor whiteColor];';
const replacement = 'self.backgroundColor = [UIColor systemBackgroundColor];';
if (source.includes(original)) {
  writeFileSync(path, source.replace(original, replacement));
  console.log('Native tabs: use an adaptive scroll-edge background.');
} else if (!source.includes(replacement)) {
  throw new Error('Native tabs implementation changed; review the scroll-edge background patch.');
}

// This screen supplies its own themed footer. Suppress UIKit's additional wash
// only for its explicitly marked scroll view, including nested native wrappers.
const controllerPath = fileURLToPath(new URL('../node_modules/react-native-screens/ios/bottom-tabs/RNSTabsScreenViewController.mm', import.meta.url));
let controller = readFileSync(controllerPath, 'utf8');
const marker = '// Sfera pregnancy footer: own gradient instead of UIKit edge wash.';
if (!controller.includes(marker)) {
  const anchor = '@implementation RNSTabsScreenViewController';
  if (!controller.includes(anchor)) throw new Error('Native tabs controller changed; review pregnancy edge-effect patch.');
  controller = controller.replace(anchor, `${marker}
static UIScrollView *SferaFindPregnancyScroll(UIView *view, BOOL insidePregnancyScroll)
{
  BOOL marked = insidePregnancyScroll || [view.accessibilityIdentifier isEqualToString:@"pregnancy-today-scroll"];
  if (marked && [view isKindOfClass:UIScrollView.class]) return (UIScrollView *)view;
  for (UIView *child in view.subviews) {
    UIScrollView *found = SferaFindPregnancyScroll(child, marked);
    if (found != nil) return found;
  }
  return nil;
}

@interface RNSTabsScreenViewController ()
@property(nonatomic, weak) UIScrollView *sferaPregnancyScrollView;
@end

${anchor}

- (void)sferaUpdatePregnancyEdgeEffect
{
  if (@available(iOS 26.0, *)) {
    UIScrollView *scrollView = SferaFindPregnancyScroll(self.view, NO);
    if (self.sferaPregnancyScrollView != scrollView) {
      self.sferaPregnancyScrollView.bottomEdgeEffect.hidden = NO;
      self.sferaPregnancyScrollView = scrollView;
    }
    scrollView.bottomEdgeEffect.hidden = YES;
  }
}

- (void)viewDidLayoutSubviews
{
  [super viewDidLayoutSubviews];
  [self sferaUpdatePregnancyEdgeEffect];
}
`);
  const appear = '- (void)viewDidAppear:(BOOL)animated\n{';
  if (!controller.includes(appear)) throw new Error('Native tab appearance hook changed.');
  controller = controller.replace(appear, appear + '\n  [self sferaUpdatePregnancyEdgeEffect];');
  writeFileSync(controllerPath, controller);
  console.log('Pregnancy screen: suppress duplicate UIKit bottom edge effect.');
}
