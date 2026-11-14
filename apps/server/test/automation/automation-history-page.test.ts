import { describe, expect, it, vi } from 'vitest';
import type { AutomationHistoryRecord } from '@thesis-ledger/schemas';
import {
  automationHistoryPage,
  type HistorySource,
} from '../../src/automation/automation-history-page.js';

const row = (id: string, instant: string): AutomationHistoryRecord => ({
  id,
  jobId: 'job',
  startedAt: instant,
  createdAt: instant,
  status: 'succeeded',
  error: null,
});
const source = (rows: AutomationHistoryRecord[]): HistorySource => ({
  total: rows.length,
  read: vi.fn(async (offset, limit) => rows.slice(offset, offset + limit)),
});

describe('自动化多事实源历史分页', () => {
  it('跨源交错、相同时间与页尾不漏记不重复', async () => {
    const time = '2026-11-09T00:00:00.000Z';
    const a = source([row('z', '2026-11-09T00:00:03Z'), row('n', time), row('a', time)]);
    const b = source([row('x', '2026-11-09T00:00:02Z'), row('m', time), row('b', time)]);
    const result = [];
    for (let skip = 0; skip < 6; skip += 2)
      result.push(...(await automationHistoryPage(a, b, skip, 2)));
    expect(result.map((item) => item.id)).toEqual(['z', 'x', 'n', 'm', 'b', 'a']);
  });
  it('保持DSA微秒顺序，不能因截断到毫秒改用ID排序', async () => {
    const a = source([row('b', '2026-11-09T00:00:00.000Z')]);
    const b = source([row('a', '2026-11-09T00:00:00.000100+00:00')]);
    expect((await automationHistoryPage(a, b, 0, 2)).map((item) => item.id)).toEqual(['a', 'b']);
  });
  it('深页只读取小窗口，空源与单源均可分页', async () => {
    const records = Array.from({ length: 5000 }, (_, index) =>
      row(String(index), new Date(1800000000000 - index * 1000).toISOString()),
    );
    const a = source(records.filter((_, index) => index % 2 === 0));
    const b = source(records.filter((_, index) => index % 2 === 1));
    expect((await automationHistoryPage(a, b, 4000, 20)).map((item) => item.id)).toEqual(
      records.slice(4000, 4020).map((item) => item.id),
    );
    expect(vi.mocked(a.read).mock.calls.every(([, limit]) => limit <= 20)).toBe(true);
    expect(vi.mocked(a.read).mock.calls.length).toBeLessThan(20);
    expect(
      (await automationHistoryPage(source([]), source(records), 100, 2)).map((item) => item.id),
    ).toEqual(['100', '101']);
    expect(await automationHistoryPage(source([]), source([]), 0, 20)).toEqual([]);
  });
});
