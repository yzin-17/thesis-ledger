import { expect, it, vi } from 'vitest';
import { multitimeframeFixture } from './expression-multitimeframe.fixture.js';
import { readAdditionalSignalPricesV3 } from '../../src/backtest/backtest-signal-price-inputs-v3.js';
import { classifyBacktestRunFailure } from '../../src/backtest/backtest-run-failure.js';

it('生产Reader明确返回冻结额外周期不可用时不自动重算，基础设施异常仍保持原异常', async () => {
  const f = await multitimeframeFixture();
  const readV3 = vi.fn(async () => ({ status: 'unavailable' as const,
    selection: { status: 'unavailable' as const, reason: 'primary_unavailable' as const, primaryFailure: 'invalid_response' as const } }));
  const input = { strategy: f.input.strategy, runConfig: f.input.runConfig, warmupStart: f.input.runConfig.startDate,
    requireFrozen: true, reader: { readV3 } };
  const failure = await readAdditionalSignalPricesV3(input).catch((error: unknown) => error);
  expect(classifyBacktestRunFailure(failure, { attempt: 1, maxAttempts: 3 })).toMatchObject({ code: 'DATA_UNAVAILABLE', retryable: false });
  expect(readV3).toHaveBeenCalledTimes(1);
  const infrastructure = new Error('storage connection interrupted');
  readV3.mockRejectedValueOnce(infrastructure);
  await expect(readAdditionalSignalPricesV3(input)).rejects.toBe(infrastructure);
  expect(classifyBacktestRunFailure(infrastructure, { attempt: 1, maxAttempts: 3 }).retryable).toBe(true);
});
