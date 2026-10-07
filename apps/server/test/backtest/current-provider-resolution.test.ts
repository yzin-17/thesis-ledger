import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BacktestProcessorModule } from '../../src/backtest/backtest-processor.module.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { BACKTEST_V3_RUNNER } from '../../src/backtest/backtest-v3-runner.js';
import { PrismaService } from '../../src/platform/prisma.service.js';

describe('现行 Run provider boundaries', () => {
  it('retains runtime DI tokens for Prisma and queue collaborators', () => {
    const declared = Reflect.getMetadata('self:paramtypes', BacktestRunService) as Array<{
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

  it('registers the run service, snapshot store and current runner in the worker module', () => {
    const providers = Reflect.getMetadata('providers', BacktestProcessorModule) as Array<
      (new (...args: never[]) => unknown) | { provide?: unknown }
    >;

    expect(providers).toContain(BacktestRunService);
    expect(
      providers.some(
        (provider) => 'provide' in provider && provider.provide === LocalSnapshotStore,
      ),
    ).toBe(true);
    expect(
      providers.some(
        (provider) => 'provide' in provider && provider.provide === BACKTEST_V3_RUNNER,
      ),
    ).toBe(true);
  });
});
