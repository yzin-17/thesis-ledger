export function chartViewportHeight(screenHeight: number, indicatorPanes: number) {
  const base = Math.min(220, Math.max(120, Math.round(screenHeight * 0.35)));
  const requested = base + indicatorPanes * 90;
  const viewportLimit = Math.max(120, Math.floor(screenHeight * 0.45));
  return Math.min(requested, viewportLimit);
}
