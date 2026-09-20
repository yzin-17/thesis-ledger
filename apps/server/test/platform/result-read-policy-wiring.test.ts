import { describe, expect, it } from 'vitest';
import { BacktestEventPublisher } from '../../src/backtest/backtest-event.publisher.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { BacktestV2RunService } from '../../src/backtest/backtest-v2-run.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';

describe('读取门禁生产 wiring', () => {
  it('Backtest 可选服务使用显式 token，避免联合类型退化为 Object', () => {
    const dependencies = Reflect.getMetadata('self:paramtypes', BacktestService) as Array<{
      index: number;
      param: unknown;
    }>;

    expect(dependencies).toEqual(
      expect.arrayContaining([
        { index: 1, param: BacktestQueueService },
        { index: 2, param: BacktestV2RunService },
      ]),
    );
  });

  it('Backtest、SSE 和实验读取服务不能省略授权策略', () => {
    const missing = undefined as never;
    expect(() => new BacktestService({} as never, undefined, undefined, missing)).toThrow(
      'ResultReadPolicyService is required',
    );
    expect(() => new BacktestEventPublisher({} as never, {} as never, missing)).toThrow(
      'ResultReadPolicyService is required',
    );
    expect(() => new StrategyOptimizationReadService({} as never, {} as never, missing)).toThrow(
      'ResultReadPolicyService is required',
    );
    expect(
      () =>
        new BacktestService(
          {} as never,
          undefined,
          undefined,
          new ResultReadPolicyService({} as never),
        ),
    ).not.toThrow();
  });
});
