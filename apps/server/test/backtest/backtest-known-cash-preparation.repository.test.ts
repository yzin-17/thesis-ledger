import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BacktestKnownCashPreparationRepository } from '../../src/backtest/backtest-known-cash-preparation.repository.js';
import { knownCashPreparedFixture } from './known-cash-test-fixtures.js';

describe('Server原始现金准备包缓存', () => {
  it('并发同包保存幂等，重建Repository后仍能验证原包', async () => {
    const root = await mkdtemp(join(tmpdir(), 'known-cash-cache-'));
    try {
      const prepared = await knownCashPreparedFixture();
      const repository = new BacktestKnownCashPreparationRepository(root);
      await Promise.all([repository.save(prepared), repository.save(prepared)]);
      expect(
        await new BacktestKnownCashPreparationRepository(root).assertOriginal(prepared),
      ).toEqual(prepared);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('客户端自洽包没有Server原始取得记录时拒绝，缓存损坏也拒绝', async () => {
    const root = await mkdtemp(join(tmpdir(), 'known-cash-cache-'));
    try {
      const prepared = await knownCashPreparedFixture();
      const repository = new BacktestKnownCashPreparationRepository(root);
      await expect(repository.assertOriginal(prepared)).rejects.toThrow('原始现金准备包缺失');
      await repository.save(prepared);
      await writeFile(
        join(root, 'preparations', 'known-cash', `${prepared.contentHash}.json`),
        '{}',
      );
      await expect(repository.assertOriginal(prepared)).rejects.toThrow('原始现金准备包缺失');
      await expect(repository.save(prepared)).rejects.toThrow('原始现金准备包缺失');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
