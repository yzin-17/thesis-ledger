import { describe, expect, it, vi } from 'vitest';
import { strategyOptimizationClient } from '../src/strategy-optimization-client.js';
import { researchModel } from '../../schemas/test/price-research-fixture.js';

const input = {
  target: {
    sourceMode: 'discovery' as const,
    discoveryScope: {
      executionInstrument: {
        symbol: researchModel.scope.symbol,
        market: 'CN' as const,
        assetType: 'stock' as const,
      },
      primaryTimeframe: '1d' as const,
    },
  },
  startDate: '2024-01-02',
  endDate: '2024-03-29',
  currency: 'CNY' as const,
  adjustment: 'hfq' as const,
};
describe('实验执行设置请求', () => {
  it('发送实验目标与日期，传递取消信号，不需要模型 JSON', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'available', model: researchModel });
    const signal = new AbortController().signal;
    expect(
      await strategyOptimizationClient(request).resolveExecutionModel(input, signal),
    ).toMatchObject({ status: 'available' });
    expect(request).toHaveBeenCalledWith(
      '/strategy-optimization/run-config/execution-model',
      expect.anything(),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal,
      },
    );
  });
  it.each([
    { currency: 'USD' },
    { symbol: 'OTHER.SH' },
    { market: 'HK' },
    { instrumentType: 'ETF' },
    { range: { start: '2024-02-01', end: '2024-03-29' } },
  ])('拒绝与当前探索范围不匹配的响应 %j', async (scope) => {
    const request = vi.fn().mockResolvedValue({
      status: 'available',
      model: { ...researchModel, scope: { ...researchModel.scope, ...scope } },
    });
    await expect(strategyOptimizationClient(request).resolveExecutionModel(input)).rejects.toThrow(
      '与当前标的、日期、币种或价格口径不一致',
    );
  });
  it('保留阻断说明，无效区间不发请求', async () => {
    const result = { status: 'blocked', reasonCode: 'rules-incompatible', message: '币种不匹配' };
    const request = vi.fn().mockResolvedValue(result);
    expect(await strategyOptimizationClient(request).resolveExecutionModel(input)).toEqual(result);
    request.mockClear();
    await expect(
      strategyOptimizationClient(request).resolveExecutionModel({
        ...input,
        startDate: '2025-01-01',
      }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
