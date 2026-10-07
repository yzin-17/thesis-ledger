import type { HistoricalDecisionWindowV3 } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import {
  calendarPackageInstantMicrosV1,
  recomputeXshgPackageProjectionV1,
  xshgPackageProjectionHashV1,
  XSHG_PACKAGE_NORMALIZATION_V1,
  XSHG_PACKAGE_TIMEZONE_RULES_V1,
} from '../../src/market/market-pit-calendar-package-projection-v1.js';

type Calendar = HistoricalDecisionWindowV3['calendars'][number];
const seed = (): Calendar => ({
  id: 'calendar',
  calendarContentHash: '0'.repeat(64),
  projectionHash: '0'.repeat(64),
  market: 'CN',
  exchange: 'XSHG',
  timezone: 'Asia/Shanghai',
  symbolScope: ['600000.SH'],
  venueBindingEvidenceIds: ['unverified-venue'],
  calendarArtifactId: 'artifact',
  historicalRange: { start: '2026-04-03', end: '2026-04-07' },
  knownAvailableAt: '2026-03-10T03:24:37.055242Z',
  acquiredAt: '2026-04-08T00:00:00Z',
  normalizationVersion: XSHG_PACKAGE_NORMALIZATION_V1,
  timezoneRulesIdentity: XSHG_PACKAGE_TIMEZONE_RULES_V1,
  dateStates: [],
  publicationIds: ['publication'],
});
const source = { holidays: ['2026-04-06'], minutes: [570, 690, 780, 900] };

describe('XSHG/2026投影', () => {
  it('连续日期按周末、假日和两时段固定+08复算', () => {
    const result = recomputeXshgPackageProjectionV1(seed(), source, 'publication');
    expect(result.dateStates.map((state) => [state.date, state.reason])).toEqual([
      ['2026-04-03', 'regular'],
      ['2026-04-04', 'weekend'],
      ['2026-04-05', 'weekend'],
      ['2026-04-06', 'exchange-holiday'],
      ['2026-04-07', 'regular'],
    ]);
    expect(result.dateStates[0]!.sessions).toEqual([
      {
        startMinute: 570,
        endMinute: 690,
        openedAt: '2026-04-03T01:30:00.000Z',
        closedAt: '2026-04-03T03:30:00.000Z',
      },
      {
        startMinute: 780,
        endMinute: 900,
        openedAt: '2026-04-03T05:00:00.000Z',
        closedAt: '2026-04-03T07:00:00.000Z',
      },
    ]);
    expect(result.dateStates[3]!.sessions).toEqual([]);
    // 独立Python固定数组JSON计算的受控向量，不从实现反向生成常量。
    expect(result.projectionHash).toBe(
      '7102cbac42e73362553c69e65828601b3d7d5897bb6c6ee0f835d91ac511a01e',
    );
    expect(result.projectionHash).toBe(xshgPackageProjectionHashV1(result));
  });
  it('固定数组不依赖对象插入顺序', () => {
    const result = recomputeXshgPackageProjectionV1(seed(), source, 'publication');
    const reordered = Object.fromEntries(Object.entries(result).reverse()) as Calendar;
    expect(xshgPackageProjectionHashV1(reordered)).toBe(result.projectionHash);
  });
  it.each(['reason', 'utc', 'minute', 'publication', 'date-gap'])(
    '每个投影坐标与链接进入摘要 %s',
    (field) => {
      const result = recomputeXshgPackageProjectionV1(seed(), source, 'publication');
      const old = result.projectionHash;
      if (field === 'reason') result.dateStates[3]!.reason = 'regular';
      else if (field === 'utc')
        result.dateStates[0]!.sessions[0]!.openedAt = '2026-04-03T02:30:00.000Z';
      else if (field === 'minute') result.dateStates[0]!.sessions[0]!.startMinute = 571;
      else if (field === 'publication') result.dateStates[0]!.publicationIds = ['forged'];
      else result.dateStates.splice(1, 1);
      expect(xshgPackageProjectionHashV1(result)).not.toBe(old);
    },
  );
  it.each([
    { market: 'US' },
    { exchange: 'XSHE' },
    { timezone: 'America/New_York' },
    { timezoneRulesIdentity: 'DST' },
    { normalizationVersion: 'unknown' },
    { historicalRange: { start: '2026-03-09', end: '2026-04-07' } },
    { historicalRange: { start: '2026-04-03', end: '2027-01-01' } },
    { historicalRange: { start: '2026-04-07', end: '2026-04-03' } },
    { historicalRange: { start: '2026-04-31', end: '2026-05-02' } },
  ])('拒绝非登记范围或规则 %j', (change) => {
    expect(() =>
      recomputeXshgPackageProjectionV1({ ...seed(), ...change } as Calendar, source, 'publication'),
    ).toThrow();
  });
  it('拒绝半日或跨午夜时段', () => {
    for (const minutes of [
      [570, 690, 780, 800],
      [1380, 1500],
    ])
      expect(() =>
        recomputeXshgPackageProjectionV1(seed(), { ...source, minutes }, 'publication'),
      ).toThrow();
  });
  it('微秒和时区offset比较无损', () => {
    const published = calendarPackageInstantMicrosV1('2026-03-10T03:24:37.055242Z');
    expect(calendarPackageInstantMicrosV1('2026-03-10T03:24:37.055241Z')).toBe(published - 1n);
    expect(calendarPackageInstantMicrosV1('2026-03-10T11:24:37.055242+08:00')).toBe(published);
    expect(calendarPackageInstantMicrosV1('2026-03-10T03:24:37.055Z')).toBe(published - 242n);
  });
  it.each([
    '2026-02-30T00:00:00Z',
    '2026-03-10T24:00:00Z',
    '2026-03-10T03:24:37.0552429Z',
    '2026-03-10T03:24:37',
    '2026-03-10T03:24:60Z',
    '2026-03-10T03:24:37+24:00',
  ])('拒绝歧义或无效时点 %s', (time) => {
    expect(() => calendarPackageInstantMicrosV1(time)).toThrow();
  });
});
