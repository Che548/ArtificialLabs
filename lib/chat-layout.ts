export function chatComposerInset(platform: string, bottomInset: number, keyboardVisible: boolean) {
  if (keyboardVisible) return 8;
  // Native iOS floating tabs still occupy space on devices without a home indicator.
  return platform === 'android' ? Math.max(bottomInset, 8) + 72 : Math.max(bottomInset, 12) + 72;
}

export function chatEmptyHeroFits(height: number, topInset: number, composerBottom: number, dockHeight: number, keyboardVisible: boolean, hasDraft = false) {
  return !hasDraft && !keyboardVisible && height - composerBottom - dockHeight >=
    topInset + 80 + Math.max(135 - topInset, 32) + 260;
}
