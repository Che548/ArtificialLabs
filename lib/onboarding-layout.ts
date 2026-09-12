/** Keep the form reachable on wide/folded windows and during Android resize. */
export function onboardingLayout(width: number, height: number, topInset: number, bottomInset: number, headerHeight: number) {
  const scale = Math.min(width / 402, 1);
  const actionBottomPadding = Math.max(bottomInset - 10, 16 * scale);
  const actionHeight = 46 + actionBottomPadding + 18 * scale;
  const progressBottom = actionHeight + 6 * scale;
  const scrollBottom = progressBottom + 20 * scale;
  const minimumBody = Math.min(220, Math.max(120, height * 0.35));
  const preferredTop = Math.max(470 * scale, height * 0.525) + 16 * scale;
  const panelHeaderTop = Math.max(topInset + 72,
    Math.min(preferredTop, height - scrollBottom - headerHeight - minimumBody));
  return { scale, panelHeaderTop, scrollTop: panelHeaderTop + headerHeight,
    actionBottomPadding, actionHeight, progressBottom, scrollBottom,
    shapeTop: panelHeaderTop - 73 * scale };
}
