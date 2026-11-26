import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { freezeTradePlanFixture } from './trade-plan-snapshot.fixture.js';
import { sessionVwapInput } from './session-vwap-snapshot.fixture.js';

it.each(['missing-volume', 'zero-volume', 'unknown-label'] as const)(
  '正式冻结入口遇到 %s 保持原始事实并停止累计信号', async (kind) => {
    const root = mkdtempSync(join(tmpdir(), 'session-source-'));
    try {
      const input = await sessionVwapInput();
      const original = input.reader.readV3.getMockImplementation()!;
      input.reader.readV3.mockImplementation(async request => {
        const result = await original(request);
        if (result.status !== 'selected') return result;
        const response = result.selection.response;
        if (kind === 'unknown-label') response.timestampConvention = 'source-native';
        else for (const [index, bar] of response.bars.entries()) {
          if (kind === 'zero-volume') bar.volume = 0;
          else if (index % 240 === 0) bar.volume = null;
        }
        result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
        return result;
      });
      if (kind === 'unknown-label') {
        await expect(freezeTradePlanFixture(root, input)).rejects.toThrow('DATA_UNAVAILABLE');
        return;
      }
      const fixture = await freezeTradePlanFixture(root, input);
      expect(fixture.execute().fills).toHaveLength(0);
      const bars = [...fixture.built.artifactRefs].find(ref => ref.key.endsWith('/execution/bars.parquet'))!;
      const rows = [];
      for await (const row of await fixture.snapshots.artifacts.openRead(bars)) rows.push(row);
      expect(rows[0]!.volume).toBe(kind === 'zero-volume' ? '0' : null);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 120000,
);
