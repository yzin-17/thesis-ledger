import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { BacktestKnownCashGuardV3 } from '../../src/backtest/backtest-known-cash-guard-v3.service.js';
import { BacktestKnownCashPreparationRepository } from '../../src/backtest/backtest-known-cash-preparation.repository.js';
import { knownCashPreparedFixture, knownCashControlFixture } from './known-cash-test-fixtures.js';

describe('受信原包与正常当前控制复核', () => {
  it('未持久化原包不触发当前复核；正常保存后精确检查既有目标和版本', async () => {
    const root = await mkdtemp(join(tmpdir(), 'known-cash-guard-'));
    try {
      const prepared = await knownCashPreparedFixture();
      const original = new BacktestKnownCashPreparationRepository(root);
      const read = vi.fn(async () => knownCashControlFixture(prepared));
      const dsa = { dataCapabilities: { knownCashControl: read } } as unknown as DsaClient;
      const guard = new BacktestKnownCashGuardV3(original, dsa);
      await expect(guard.check(prepared)).rejects.toThrow('原始现金准备包缺失');
      expect(read).not.toHaveBeenCalled();
      await original.save(prepared);
      await guard.check(prepared);
      expect(read).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: 'known-cash-control-v1',
          routeTarget: prepared.input.source.target,
          expectedControlIdentity: prepared.input.source.controlIdentity,
        }),
      );
      read.mockRejectedValueOnce(new Error('configuration_changed'));
      await expect(guard.check(prepared)).rejects.toThrow('configuration_changed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
