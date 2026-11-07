import { expect, it, vi } from 'vitest';
import { RiskMonitoringStatusController } from '../../src/risk/risk-monitoring.controller.js';
import { riskAutomaticMonitoringStatusSchema } from '@thesis-ledger/schemas';

it('returns current local names and truthful source timing without any asset or provider request', async () => {
  const now = new Date().toISOString();
  const sources = ['510300.SH', '510300.HK', 'UNKNOWN.US'].map((symbol) => ({
    symbol,
    assetType: 'ETF',
    acquisition: 'blocked',
    reason: 'not_selected',
    provider: null,
    minIntervalSeconds: null,
    sourceUpdateIntervalSeconds: null,
    sourceTime: null,
    fetchedAt: null,
    nextAttemptAt: null,
  }));
  const db = { riskRule: { findMany: vi.fn(async () => []) } };
  const redis = {
    client: {
      get: vi.fn(async () => JSON.stringify({ checkedAt: now, sources })),
      hgetall: vi.fn(async () => ({ checkedAt: now })),
    },
  };
  const resolve = vi.fn(async () => ({
    name: (symbol: string) => (symbol === '510300.SH' ? '沪深300ETF' : symbol),
  }));
  const controller = new RiskMonitoringStatusController(
    db as never,
    redis as never,
    { resolve } as never,
  );
  const result = riskAutomaticMonitoringStatusSchema.parse(await controller.status());
  expect(result.acquisitionAvailable).toBe(true);
  expect(result.continuousSource).toBe(false);
  expect(result.sources.map((s) => s.assetName)).toEqual(['沪深300ETF', '510300.HK', 'UNKNOWN.US']);
  expect(resolve).toHaveBeenCalledOnce();
  expect(resolve).toHaveBeenCalledWith(['510300.SH', '510300.HK', 'UNKNOWN.US']);
  expect(result.sources.every((s) => s.sourceUpdateIntervalSeconds === null)).toBe(true);
});
