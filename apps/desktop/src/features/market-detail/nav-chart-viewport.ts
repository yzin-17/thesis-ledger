import type { FundNavHistory } from '@thesis-ledger/schemas';

export function navViewportChange(
  history: FundNavHistory,
  range: { from: string; to: string } | null,
): number | null {
  if (!range) return null;
  const visible = history.filter((point) => {
    const date = point.navDate.slice(0, 10);
    return date >= range.from && date <= range.to;
  });
  const first = visible[0];
  const last = visible.at(-1);
  if (!first || !last || first.unitNav === 0) return null;
  return last.unitNav / first.unitNav - 1;
}
