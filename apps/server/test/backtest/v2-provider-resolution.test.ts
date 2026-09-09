import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BacktestProcessorModule } from '../../src/backtest/backtest-processor.module.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { BACKTEST_V2_RUNNER, BacktestV2RunService } from '../../src/backtest/backtest-v2-run.js';
import { PrismaService } from '../../src/platform/prisma.service.js';

describe('V2 provider boundaries', () => {
  it('retains runtime DI tokens for Prisma and queue collaborators', () => {
    const declared = Reflect.getMetadata('self:paramtypes', BacktestV2RunService) as Array<{
      index: number;
      param: unknown;
    }>;
    expect(declared).toEqual(
      expect.arrayContaining([
        { index: 0, param: PrismaService },
        { index: 1, param: BacktestQueueService },
      ]),
    );
  });

  it('registers the V2 run service, snapshot store and runner in the worker module', () => {
    const providers = Reflect.getMetadata('providers', BacktestProcessorModule) as Array<
      (new (...args: never[]) => unknown) | { provide?: unknown }
    >;

    expect(providers).toContain(BacktestV2RunService);
    expect(
      providers.some(
        (provider) => 'provide' in provider && provider.provide === LocalSnapshotStore,
      ),
    ).toBe(true);
    expect(
      providers.some(
        (provider) => 'provide' in provider && provider.provide === BACKTEST_V2_RUNNER,
      ),
    ).toBe(true);
  });
});
