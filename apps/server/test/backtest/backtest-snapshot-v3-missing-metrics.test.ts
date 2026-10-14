import { describe, expect, it, vi } from 'vitest';
import { buildBacktestSnapshotV3 } from '../../src/backtest/backtest-snapshot-v3-builder.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { executionBarRowsV3 } from '../../src/backtest/backtest-v3-execution-bar-rows.js';

describe('回测执行行情的量额前置', () => {
  it('volume 缺失时不生成伪造事实行', async () => {
    const { input, dsa } = await completeSnapshotFixture();
    const snapshots = { load: vi.fn().mockResolvedValue(null), finalize: vi.fn() };
    const reader = {
      readV3: vi.fn(async (request: Parameters<typeof makeReaderResult>[0]) => {
        const result = await makeReaderResult(request);
        if (result.status !== 'selected') throw new Error('测试行情未选中');
        result.selection.response.bars[0]!.volume = null;
        return result;
      }),
    };
    await expect(buildBacktestSnapshotV3(
      input, snapshots as unknown as Parameters<typeof buildBacktestSnapshotV3>[1], reader, dsa,
    )).rejects.toThrow('严格相关性校验');
    expect(snapshots.finalize).not.toHaveBeenCalled();
  });
  it('成交额缺失保持null，归一化接受且原价拒绝', async () => {
    const { input } = await completeSnapshotFixture();
    const result = await makeReaderResult({ symbol: input.strategy.executionInstrument.symbol,
      market: 'CN', routeKey: input.executionRouteKey,
      window: { start: input.runConfig.startDate, end: input.runConfig.endDate } });
    if (result.status !== 'selected') throw new Error('测试行情未选中');
    const response = result.selection.response;
    response.bars[0]!.amount = null;
    expect(executionBarRowsV3(response, response.symbol, 'normalized-series')[0]!.amount).toBeNull();
    expect(() => executionBarRowsV3(response, response.symbol, 'raw-events')).toThrow('回测执行行情缺少成交量或成交额');
  });
});
