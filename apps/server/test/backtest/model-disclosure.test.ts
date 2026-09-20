import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { withBacktestModelDisclosure } from '../../src/backtest/backtest-model-disclosure.js';
import { toBacktestJobSummary } from '../../src/backtest/backtest-summary.js';
import { BacktestController } from '../../src/backtest/backtest.controller.js';
const model = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
describe('回测模型响应与摘要', () => {
  const record = {
    id: 'run',
    mode: 'V2',
    status: 'failed',
    errorCode: 'DATA_UNAVAILABLE',
    errorSummary: 'historical trading status unavailable: 600519.SH',
    diagnostics: { code: 'MARKET_RULES_UNAVAILABLE' },
    input: { runConfig: { executionModel: model } },
  };
  it('摘要保留选择和原始失败，去掉大输入且不声称已冻结', () => {
    const summary = toBacktestJobSummary(record as never);
    expect(summary).toMatchObject({
      executionModelDisclosure: { model },
      errorSummary: record.errorSummary,
      diagnostics: record.diagnostics,
    });
    expect(summary).not.toHaveProperty('input');
    expect(summary.executionModelDisclosure).not.toHaveProperty('contentHash');
  });
  it('摘要只提取结果指标，不返回完整结果', () => {
    const summary = toBacktestJobSummary({
      ...record,
      result: {
        metrics: { cumulativeReturn: 0.12, maxDrawdown: -0.05 },
        equityCurve: [{ date: '2026-01-01', value: 100 }],
        trades: [{ id: 'trade-1' }],
      },
    } as never);
    expect(summary.resultMetrics).toEqual({ cumulativeReturn: 0.12, maxDrawdown: -0.05 });
    expect(summary).not.toHaveProperty('result');
  });
  it('旧任务和没有模型的输入保持原样', () => {
    expect(withBacktestModelDisclosure(null)).toBeNull();
    for (const input of [null, {}, { runConfig: {} }]) {
      const old = { id: 'old', input };
      expect(withBacktestModelDisclosure(old)).toEqual(old);
    }
  });
  it('创建和两条详情路由返回同一披露契约', async () => {
    const controller = new BacktestController(
      {
        createRun: vi.fn(async () => record),
        statusForRead: vi.fn(async () => record),
      } as never,
      {} as never,
    );
    for (const response of [
      await controller.createRun({}),
      await controller.status('run'),
      await controller.runStatus('run'),
    ]) {
      expect(response).toMatchObject({
        status: 'failed',
        executionModelDisclosure: { model },
        errorSummary: record.errorSummary,
      });
    }
  });
});
