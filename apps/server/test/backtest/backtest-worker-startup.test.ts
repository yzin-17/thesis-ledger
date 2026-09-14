import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { assertBacktestWorkerDatabaseReady } from '../../src/backtest/backtest-worker-startup.js';

describe('backtest worker startup gate', () => {
  it('结构检查失败时断开探针并向上抛出', async () => {
    const destroy = vi.fn(async () => undefined);
    await expect(
      assertBacktestWorkerDatabaseReady(() => ({
        onModuleInit: vi.fn(async () => {
          throw new Error('Database schema version mismatch');
        }),
        onModuleDestroy: destroy,
      })),
    ).rejects.toThrow('Database schema version mismatch');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('先完成启动门禁再创建 BullMQ Worker', async () => {
    const source = await readFile(
      new URL('../../src/backtest/backtest-worker.main.ts', import.meta.url),
      'utf8',
    );
    expect(source.indexOf('await assertBacktestWorkerDatabaseReady()')).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('await assertBacktestWorkerDatabaseReady()')).toBeLessThan(
      source.indexOf('new Worker'),
    );
  });
});
