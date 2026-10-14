import { describe, expect, it } from 'vitest';
import {
  marketDisplayDetailResponseSchema,
  marketDetailResponseSchema,
  marketPeriodOptionsSchema,
} from '../src/index.js';
import { marketDisplayDetailFixture } from './fixtures/market-display-detail.js';

describe('派生详情展示与能力合同', () => {
  it('派生根/分段与指标共享显示指纹，计算指纹独立，原生合同仍拒绝派生', () => {
    const raw = marketDisplayDetailFixture();
    expect(marketDisplayDetailResponseSchema.parse(raw).barSeries?.identity.timeframe).toBe('1w');
    expect(marketDetailResponseSchema.safeParse(raw).success).toBe(false);
  });
  it('拒绝根与 bars 分段不同指纹', () => {
    const raw = marketDisplayDetailFixture();
    raw.sections.bars.data = { ...raw.barSeries, inputFingerprint: 'c'.repeat(64) };
    expect(marketDisplayDetailResponseSchema.safeParse(raw).success).toBe(false);
  });
  it('重复指纹不能掩盖根与分段内容不同', () => {
    const raw = marketDisplayDetailFixture();
    raw.sections.bars.data = {
      ...raw.barSeries,
      points: raw.barSeries.points.map((point) => ({ ...point, close: 10 })),
    };
    expect(marketDisplayDetailResponseSchema.safeParse(raw).success).toBe(false);
  });
  it('拒绝指标错显示指纹，不能用计算指纹冒充显示绑定', () => {
    const raw = marketDisplayDetailFixture();
    raw.sections['indicator:MA'].data.inputFingerprint = 'b'.repeat(64);
    expect(marketDisplayDetailResponseSchema.safeParse(raw).success).toBe(false);
  });
  it('指标独立 unavailable 时 bars 保留', () => {
    const raw = marketDisplayDetailFixture();
    const response = {
      ...raw,
      sections: {
        ...raw.sections,
        'indicator:MA': {
          capability: 'indicator:MA',
          status: 'unavailable',
          error: { code: 'calendar_input_limit', message: '预热预算不足', diagnosticId: 'budget' },
        },
      },
    };
    expect(marketDisplayDetailResponseSchema.safeParse(response).success).toBe(true);
  });
  it('能力不能用无窗口的 available 或重复周期冒充四周期声明', () => {
    const option = {
      timeframe: '1w',
      kind: 'derived',
      limit: 2,
      available: true,
      reason: null,
      indicators: ['MA', 'MACD', 'RSI'].map((name) => ({
        name,
        parameters: {},
        available: false,
        reason: 'budget',
      })),
    };
    const response = {
      version: 'market-period-options-v1',
      symbol: '159516.SZ',
      assetType: 'ETF',
      adjustment: 'qfq',
      evaluationAsOf: '2026-10-04T00:00:00Z',
      options: Array(4).fill(option),
    };
    expect(marketPeriodOptionsSchema.safeParse(response).success).toBe(false);
    expect(
      marketPeriodOptionsSchema.safeParse({
        ...response,
        options: Array(4).fill({ ...option, available: false, reason: 'unavailable' }),
      }).success,
    ).toBe(false);
  });
});
