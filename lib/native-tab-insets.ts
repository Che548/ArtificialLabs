/** SDK 54 native tabs float at the top on regular-width iPads (iPadOS 18+). */
export function nativeTabTopInset(insetTop: number, width: number, isModernIPad: boolean) {
  return isModernIPad && width >= 600 ? Math.max(insetTop, 88) : insetTop;
}
