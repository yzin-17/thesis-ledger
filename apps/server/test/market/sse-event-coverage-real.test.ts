import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { marketEventExchangeV3Schema } from '@thesis-ledger/schemas';
import { MarketActionCoverage } from '../../src/market/market-action-coverage.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const disabled = !process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT || !process.env.ARENA_RANGE_ARTIFACTS;

describe('官方目录重建的真实事件覆盖消费', () => {
  it.skipIf(disabled)('真实原文经实际 DSA、TS 合同进入 22 个持仓窗口，未知覆盖继续拒绝', async () => {
    const dsaRoot = process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT!;
    const packet = JSON.parse(execFileSync(resolve(dsaRoot, '.venv/bin/python'), [
      resolve('test/market/fixtures/sse-event-coverage-offline.py'),
      resolve(process.env.ARENA_RANGE_ARTIFACTS!, 'arena-event-coverage-20261116'),
    ], { cwd: dsaRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000,
      env: { ...process.env, PYTHONPATH: dsaRoot, PYTHONDONTWRITEBYTECODE: '1' } }));
    expect(packet.deniedAttempts).toEqual([]);
    expect(packet.exchanges).toHaveLength(44);
    for (const exchange of packet.exchanges) marketEventExchangeV3Schema.parse(exchange);
    const calls: unknown[] = [];
    let incomplete = false;
    const dsa = {
      effectiveControlPolicyV3: async () => packet.policy,
      marketRouteCatalogV3: async () => packet.catalog,
      marketEventsV3: async (request: Record<string, unknown>) => {
        calls.push(request);
        const entry = packet.exchanges.find((item: { request: Record<string, unknown> }) =>
          item.request.symbol === request.symbol && item.request.end === request.end &&
          JSON.stringify(item.request.routeKey) === JSON.stringify(request.routeKey));
        expect(entry).toBeDefined();
        expect({ ...request, requestId: entry.request.requestId }).toEqual(entry.request);
        // 只适配请求关联 ID；经济事实、准入、日期及覆盖全部来自实际 DSA 输出。
        return { ...entry.response, requestId: request.requestId,
          ...(incomplete ? { coverage: { complete: false, reason: 'historical_coverage_unverified' } } : {}) };
      },
    } as unknown as DsaClient;
    const reader = new MarketActionCoverage(dsa);
    const days = [...new Set<string>(packet.exchanges.map((x: { request: { end: string } }) => x.request.end))];
    for (const day of days) for (const symbol of ['588000.SH', '510300.SH']) {
      const result = await reader.read({ symbol, assetType: 'ETF', market: 'CN', previousDay: '2026-11-02',
        now: new Date(day + 'T05:01:00.000Z') }, day);
      expect(result).toHaveLength(2);
      expect(result!.every(ref => ref === 'sha256:4a3023187b35ae99719c8132ad227877894c80615890a60ad54d979641715987')).toBe(true);
    }
    expect(calls).toHaveLength(44);
    incomplete = true;
    expect(await reader.read({ symbol: '588000.SH', assetType: 'ETF', market: 'CN', previousDay: '2026-11-02',
      now: new Date('2026-11-16T05:01:00.000Z') }, '2026-11-16')).toBeNull();
  }, 30000);
});
