import type { AutomationHistoryRecord } from '@thesis-ledger/schemas';

export type HistorySource = {
  total: number;
  read: (offset: number, limit: number) => Promise<AutomationHistoryRecord[]>;
};

function timestamp(row: AutomationHistoryRecord) {
  const value = row.createdAt ?? row.startedAt ?? '';
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '';
  return new Date(value).toISOString().slice(0, 19) + '.' + fraction.padEnd(6, '0') + 'Z';
}
const compare = (left: AutomationHistoryRecord, right: AutomationHistoryRecord) =>
  timestamp(right).localeCompare(timestamp(left)) || right.id.localeCompare(left.id);

/** 以有界窗口二分定位两种事实源的分页边界，不读取全部历史。 */
async function partition(left: HistorySource, right: HistorySource, skip: number) {
  let low = Math.max(0, skip - right.total);
  let high = Math.min(skip, left.total);
  while (low <= high) {
    const i = Math.floor((low + high) / 2),
      j = skip - i;
    const [a, b] = await Promise.all([
      left.read(Math.max(0, i - 1), i > 0 ? 2 : 1),
      right.read(Math.max(0, j - 1), j > 0 ? 2 : 1),
    ]);
    const beforeA = i > 0 ? a[0] : undefined;
    const afterA = i > 0 ? a[1] : a[0];
    const beforeB = j > 0 ? b[0] : undefined;
    const afterB = j > 0 ? b[1] : b[0];
    if (beforeA && afterB && compare(beforeA, afterB) > 0) high = i - 1;
    else if (beforeB && afterA && compare(beforeB, afterA) > 0) low = i + 1;
    else return [i, j] as const;
  }
  throw new Error('自动化历史在读取期间变化，请重新读取');
}

export async function automationHistoryPage(
  left: HistorySource,
  right: HistorySource,
  skip: number,
  take: number,
) {
  const [a, b] = await partition(left, right, skip);
  const windows = await Promise.all([left.read(a, take), right.read(b, take)]);
  return windows.flat().sort(compare).slice(0, take);
}
