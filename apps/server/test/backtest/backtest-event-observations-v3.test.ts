import { describe, expect, it, vi } from 'vitest';
import type { MarketEventRequestV3, MarketEventResponseV3 } from '@thesis-ledger/schemas';
import { readBacktestEventObservationsV3 } from '../../src/backtest/backtest-event-observations-v3.js';
import type { BacktestEventDependency } from '../../src/backtest/backtest-dependency-plan.js';
import { preflightEventDiagnosticsV3 } from '../../src/backtest/backtest-preflight-v3-events.js';

const identity = {
  symbol: '510300.SH', market: 'CN' as const, assetType: 'ETF' as const,
  desiredRevision: 2, effectivePolicyRevision: 2, catalogRevision: 3,
  dataAsOf: '2026-09-27T01:00:00Z',
};
const dependencies: BacktestEventDependency[] = [{
  instrument: 'CN:ETF:510300.SH', purpose: 'raw-accounting',
  effectiveDateWindow: { startDate: '2025-01-01', endDate: '2025-12-31' },
  eventTypes: ['CASH_DIVIDEND', 'SPLIT', 'REVERSE_SPLIT'], requiredFields: [],
  completeCoverageRequired: true, visibilityRequired: false,
}];

function fixture() {
  const keys = (['CASH_DISTRIBUTION', 'SPLIT_EVENT'] as const).map((capability) => ({
    kind: 'data' as const, market: 'CN' as const, assetType: 'ETF' as const, capability,
  }));
  const targets = keys.map((_, index) => ({ providerId: `source-${index}`, upstreamSource: `endpoint-${index}` }));
  const effective = {
    contractVersion: 3 as const, consumer: 'thesis-ledger' as const, requestId: 'policy',
    revision: 2, sourceDesiredRevision: 2, enabled: true, appliedAt: '2026-09-26T00:00:00Z',
    routes: keys.map((key, index) => ({ key, reason: null, targets: [{
      ...targets[index]!, routeIndex: 0, eligible: true, reason: null,
    }] })),
  };
  const catalog = {
    contractVersion: 3 as const, consumer: 'thesis-ledger' as const, catalogRevision: 3,
    generatedAt: '2026-09-26T00:00:00Z', integrity: 'complete' as const,
    entries: keys.map((key, index) => ({ key, target: targets[index]!, state: 'ready' as const })),
  };
  const dsa = {
    effectiveControlPolicyV3: vi.fn(async () => ({
      contractVersion: 3 as const, consumer: 'thesis-ledger' as const, projection: { effective },
    })),
    marketRouteCatalogV3: vi.fn(async () => catalog),
    marketEventsV3: vi.fn(async (request: MarketEventRequestV3): Promise<MarketEventResponseV3> => ({
      ...request, fetchedAt: '2026-09-27T00:00:00Z', providerRevision: 'r1', facts: [],
      coverage: { complete: true as const, admissionEvidenceRef: `proof-${request.routeKey.capability}` },
      admission: {
        consumer: 'thesis-ledger', routeKey: request.routeKey,
        target: { providerId: request.routeTarget.providerId, upstreamSource: request.routeTarget.upstreamSource },
        status: 'admitted', admissionState: 'admitted',
        evidenceRef: `proof-${request.routeKey.capability}`, evidenceSha256: 'a'.repeat(64),
        scopeSymbols: [request.symbol], scopeDateFrom: request.start, scopeDateTo: request.end,
        adapterRevision: 'adapter-1', sourceRevision: 'endpoint-1', credentialRevision: 'not-required',
        validFrom: '2026-09-01T00:00:00Z', validUntil: '2026-10-01T00:00:00Z',
        recordedAt: '2026-09-01T00:00:00Z', recordVersion: 1, invalidatedAt: null, invalidationReason: null,
      },
    })),
  };
  return { dsa, effective, catalog };
}

describe('回测事件多能力观测', () => {
  it('控制面失败逐能力定位范围且不猜测目标来源', async () => {
    const { dsa } = fixture();
    dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('private-control-detail'));
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    const diagnostics = preflightEventDiagnosticsV3(result.observations);
    expect(diagnostics.map((item) => item.capability)).toEqual(['CASH_DISTRIBUTION', 'SPLIT_EVENT']);
    expect(diagnostics.every((item) => item.symbol === identity.symbol && item.targetSources.length === 0)).toBe(true);
    expect(diagnostics[0]?.dateRange).toEqual(dependencies[0]!.effectiveDateWindow);
    expect(JSON.stringify(diagnostics)).not.toContain('private-control-detail');
    expect(dsa.marketEventsV3).not.toHaveBeenCalled();
  });

  it('部分能力失败只诊断失败能力并保留实际请求目标', async () => {
    const { dsa } = fixture();
    const read = dsa.marketEventsV3.getMockImplementation()!;
    dsa.marketEventsV3.mockImplementation(async (request) => {
      if (request.routeKey.capability === 'SPLIT_EVENT') throw new Error('private-provider-detail');
      return read(request);
    });
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    const diagnostics = preflightEventDiagnosticsV3(result.observations);
    expect(diagnostics).toMatchObject([{ capability: 'SPLIT_EVENT',
      routeKey: { capability: 'SPLIT_EVENT' },
      targetSources: [{ providerId: 'source-1', upstreamSource: 'endpoint-1', routeIndex: 0 }],
      missingFields: ['corporateActions.SPLIT_EVENT.upstream_failure'] }]);
    expect(diagnostics).toHaveLength(1);
    expect(JSON.stringify(diagnostics)).not.toContain('private-provider-detail');
    expect(dsa.marketEventsV3).toHaveBeenCalledTimes(2);
  });

  it('覆盖不完整仍披露观测目标并建议补齐覆盖', async () => {
    const { dsa } = fixture();
    const read = dsa.marketEventsV3.getMockImplementation()!;
    dsa.marketEventsV3.mockImplementation(async (request) => ({ ...await read(request),
      coverage: { complete: false, reason: 'private-coverage-detail' } }));
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    const diagnostics = preflightEventDiagnosticsV3(result.observations);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ category: 'insufficient-coverage',
      targetSources: [{ providerId: 'source-0' }],
      suggestedActions: [{ action: 'repair-data-coverage' }] });
    expect(JSON.stringify(diagnostics)).not.toContain('private-coverage-detail');
  });

  it('两能力完整覆盖均通过准入快照校验后保留独立来源与引用', async () => {
    const { dsa } = fixture();
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    expect(result.status).toBe('complete');
    expect(result.observations).toHaveLength(2);
    expect(dsa.effectiveControlPolicyV3).toHaveBeenCalledOnce();
    expect(dsa.marketRouteCatalogV3).toHaveBeenCalledOnce();
    expect(dsa.marketEventsV3).toHaveBeenCalledTimes(2);
    for (const [index, observation] of result.observations.entries()) {
      expect(observation.result).toMatchObject({ status: 'observed',
        request: { routeTarget: { providerId: `source-${index}` } },
        response: { coverage: { admissionEvidenceRef: `proof-${observation.scope.routeKey.capability}` } },
      });
    }
  });

  it('缺少拆分能力时保留现金观测，但整体不可用', async () => {
    const { dsa, catalog } = fixture();
    catalog.entries.splice(1);
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    expect(result.status).toBe('unavailable');
    expect(result.observations.map(({ result: entry }) => entry.status)).toEqual(['observed', 'unavailable']);
    expect(dsa.marketEventsV3).toHaveBeenCalledOnce();
  });

  it('任一能力覆盖不完整时整体不完整，仍保存两个响应', async () => {
    const { dsa } = fixture();
    const original = dsa.marketEventsV3.getMockImplementation()!;
    dsa.marketEventsV3.mockImplementation(async (request) => {
      const response = await original(request);
      if (request.routeKey.capability === 'SPLIT_EVENT') {
        response.coverage = { complete: false, reason: 'historical_coverage_unverified' };
      }
      return response;
    });
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    expect(result.status).toBe('incomplete');
    expect(result.observations).toHaveLength(2);
    expect(result.observations[1]!.result).toMatchObject({ status: 'observed', response: {
      coverage: { complete: false, reason: 'historical_coverage_unverified' },
    } });
    expect(dsa.marketEventsV3).toHaveBeenCalledTimes(2);
  });

  it('仅有完整覆盖引用而缺少准入快照时拒绝聚合完整性', async () => {
    const { dsa } = fixture();
    const original = dsa.marketEventsV3.getMockImplementation()!;
    dsa.marketEventsV3.mockImplementation(async (request) => {
      const response = await original(request);
      delete response.admission;
      return response;
    });
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    expect(result.status).toBe('unavailable');
    expect(result.observations.every(({ result: entry }) => entry.status === 'unavailable')).toBe(true);
  });

  it('空依赖不读取控制或数据接口', async () => {
    const { dsa } = fixture();
    expect(await readBacktestEventObservationsV3(identity, [], dsa)).toEqual({ status: 'not-required', observations: [] });
    expect(dsa.effectiveControlPolicyV3).not.toHaveBeenCalled();
    expect(dsa.marketRouteCatalogV3).not.toHaveBeenCalled();
    expect(dsa.marketEventsV3).not.toHaveBeenCalled();
  });

  it('控制接口失败收敛为不可用，禁止数据请求', async () => {
    const { dsa } = fixture();
    dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('offline'));
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    expect(result.status).toBe('unavailable');
    expect(result.observations.every(({ result: entry }) => entry.status === 'unavailable')).toBe(true);
    expect(dsa.marketEventsV3).not.toHaveBeenCalled();
  });

  it('冻结版本漂移时不读取任何新版本事件', async () => {
    const { dsa, effective } = fixture();
    effective.revision = 5;
    const result = await readBacktestEventObservationsV3(identity, dependencies, dsa);
    expect(result.status).toBe('unavailable');
    expect(dsa.marketEventsV3).not.toHaveBeenCalled();
  });
});
