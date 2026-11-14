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

it('策略规则已接入且返回当前版本的具体原因；停用和旧版本诊断不展示', async () => {
  const ruleId = '11111111-1111-4111-8111-111111111111';
  const appId = '22222222-2222-4222-8222-222222222222';
  const row = { id: ruleId, version: 2, kind: 'cost-stop', enabled: true, needsRepair: false,
    effectiveAt: new Date(0), sourcePlanId: appId, symbol: '00700.HK', config: { label: '成本止损' } };
  const issue = { ruleId, ruleVersion: 2, applicationId: appId, symbol: '00700.HK', ruleLabel: '成本止损',
    state: 'unavailable', reasonCode: 'position_missing', reason: '缺少实际持仓数量', checkedAt: new Date().toISOString() };
  const health = { checkedAt: new Date().toISOString(), strategyRuleIssues: JSON.stringify([issue]), strategyCheckedRules: JSON.stringify([`${ruleId}:2`]) };
  const db = { riskRule: { findMany: vi.fn(async () => [row]) } };
  const controller = new RiskMonitoringStatusController(db as never, { client: {
    hgetall: async () => health, get: async () => null } } as never,
    { resolve: async () => ({ name: () => '腾讯控股' }) } as never);
  const status = await controller.status();
  expect(status.unsupportedRules).toBe(0);
  expect(status.ruleIssues).toEqual([{ ...issue, assetName: '腾讯控股' }]);
  row.version = 3;
  expect((await controller.status()).ruleIssues[0]).toMatchObject({ reasonCode: 'evaluation_pending', ruleVersion: 3 });
  row.enabled = false;
  expect((await controller.status()).ruleIssues).toEqual([]);
});
