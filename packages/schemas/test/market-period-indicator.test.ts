import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalBarSeriesEncoding,
  canonicalMarketPeriodIndicatorEncoding,
  marketPeriodIndicatorRequestSchema,
  marketPeriodIndicatorCapabilitiesSchema,
  indicatorCalculateRequestSchema,
} from '../src/index.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/market-period-indicator-v1.shared.json', import.meta.url),
    'utf8',
  ),
) as {
  cases: Array<{ timeframe: string; aggregationEncoding: string; payload: unknown }>;
};
const cases = fixture.cases.map((item) => ({
  ...item,
  payload: marketPeriodIndicatorRequestSchema.parse(item.payload),
}));
describe('派生指标跨运行时合同', () => {
  it.each(cases)(
    '$timeframe 同时绑定真实聚合编码、计算点与最终输入',
    ({ aggregationEncoding, payload }) => {
      expect(digest(aggregationEncoding)).toBe(payload.periodContext.aggregationFingerprint);
      expect(digest(canonicalBarSeriesEncoding(payload.identity, payload.points))).toBe(
        payload.periodContext.pointFingerprint,
      );
      expect(digest(canonicalMarketPeriodIndicatorEncoding(payload.periodContext))).toBe(
        payload.inputFingerprint,
      );
    },
  );
  it('点相同而聚合上下文变化时，最终输入指纹仍变化', () => {
    const context = cases[0]!.payload.periodContext;
    expect(
      digest(
        canonicalMarketPeriodIndicatorEncoding({
          ...context,
          aggregationFingerprint: 'f'.repeat(64),
        }),
      ),
    ).not.toBe(cases[0]!.payload.inputFingerprint);
  });
  it.each([
    'context',
    'fund',
    'native',
    'duplicates',
    'over-limit',
    'empty',
    'nan',
    'unordered',
    'parameters',
  ])('拒绝 %s 的派生输入', (kind) => {
    const payload: Record<string, unknown> = structuredClone(cases[0]!.payload);
    if (kind === 'context') delete payload.periodContext;
    if (kind === 'fund')
      payload.identity = { ...cases[0]!.payload.identity, assetType: 'MUTUAL_FUND' };
    if (kind === 'native') payload.identity = { ...cases[0]!.payload.identity, timeframe: '1d' };
    if (kind === 'duplicates')
      payload.requests = [cases[0]!.payload.requests[0], cases[0]!.payload.requests[0]];
    if (kind === 'over-limit')
      payload.points = Array.from({ length: 3651 }, () => cases[0]!.payload.points[0]);
    if (kind === 'empty') payload.points = [];
    if (kind === 'nan') payload.points = [{ ...cases[0]!.payload.points[0], close: NaN }];
    if (kind === 'parameters') payload.requests = [{ name: 'MA', parameters: { period: 1 } }];
    if (kind === 'unordered') payload.points = [...cases[0]!.payload.points].reverse();
    expect(marketPeriodIndicatorRequestSchema.safeParse(payload).success).toBe(false);
  });
  it('旧原生请求及指纹保持独立', () => {
    const payload = cases[0]!.payload;
    const native = {
      contractVersion: 3,
      identity: { ...payload.identity, timeframe: '1d' },
      points: payload.points,
      requests: payload.requests,
      inputFingerprint: digest(
        canonicalBarSeriesEncoding({ ...payload.identity, timeframe: '1d' }, payload.points),
      ),
    };
    expect(indicatorCalculateRequestSchema.safeParse(native).success).toBe(true);
    expect(indicatorCalculateRequestSchema.safeParse(payload).success).toBe(false);
  });
  it('能力明确四周期、上限及预热，不声明来源行情', () => {
    const raw: unknown = JSON.parse(
      readFileSync(
        new URL('../fixtures/market-period-indicator-capabilities-v1.shared.json', import.meta.url),
        'utf8',
      ),
    );
    const caps = marketPeriodIndicatorCapabilitiesSchema.parse(raw);
    expect(caps.periods.map((item) => item.timeframe)).toEqual(['5d', '1w', '1mo', '1y']);
    expect(
      marketPeriodIndicatorCapabilitiesSchema.safeParse({
        ...caps,
        periods: [caps.periods[0], caps.periods[0], caps.periods[1], caps.periods[2]],
      }).success,
    ).toBe(false);
  });
});
