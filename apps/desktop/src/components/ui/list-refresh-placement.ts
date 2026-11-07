import { minBy } from 'es-toolkit';
type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
/** 保持可见区域中央优先；与文字重叠时仅沿竖向寻找最近空隙。 */
export function readableRefreshTop(region: HTMLElement, visible: Rect): number {
  const x = visible.left + visible.width / 2;
  const center = visible.top + visible.height / 2;
  const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
  const text: DOMRect[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    text.push(...Array.from(range.getClientRects()).filter((r) => r.width && r.height));
  }
  const candidates = [center, ...text.flatMap((r) => [r.top - 20, r.bottom + 20])]
    .filter((y) => y >= visible.top + 16 && y <= visible.bottom - 16)
    .filter(
      (y) =>
        !text.some(
          (r) => r.left < x + 18 && r.right > x - 18 && r.top < y + 18 && r.bottom > y - 18,
        ),
    );
  return minBy(candidates, (y) => Math.abs(y - center)) ?? center;
}
