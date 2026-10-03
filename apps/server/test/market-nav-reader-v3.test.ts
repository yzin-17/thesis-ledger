import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketNavReaderV3 } from '../src/market/market-nav-reader-v3.js';
import type { MarketControlService } from '../src/market/market-control.service.js';
import type { DsaClient } from '../src/integration/dsa/dsa.client.js';
import type { DsaNavClient } from '../src/integration/dsa/dsa-nav-client.js';
import { navSourceFixture } from './integration/dsa-nav.fixtures.js';

function fixture() {
  const { request, response } = navSourceFixture();
  const target = { providerId: 'efinance', upstreamSource: 'eastmoney' };
  const desired = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'policy',
    revision: 1,
    enabled: true,
    routes: [{ key: request.routeKey, targets: [target] }],
    syncState: 'applied',
    effectiveStale: false,
  };
  const effective = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'policy',
    revision: 1,
    sourceDesiredRevision: 1,
    enabled: true,
    appliedAt: '2026-09-01T00:00:00Z',
    routes: [
      {
        key: request.routeKey,
        reason: null,
        targets: [{ ...target, routeIndex: 0, eligible: true, reason: null }],
      },
    ],
  };
  const catalog = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    catalogRevision: 2,
    generatedAt: '2026-10-01T00:00:00Z',
    integrity: 'complete',
    entries: [{ key: request.routeKey, target, state: 'ready' }],
  };
  const getPolicy = vi.fn(async () => desired);
  const effectiveControlPolicyV3 = vi.fn(async () => ({ projection: { effective } }));
  const marketRouteCatalogV3 = vi.fn(async () => catalog);
  const read = vi.fn(async () => response);
  const reader = new MarketNavReaderV3(
    { getPolicy } as unknown as MarketControlService,
    { effectiveControlPolicyV3, marketRouteCatalogV3 } as unknown as DsaClient,
    { read } as unknown as DsaNavClient,
  );
  const input = {
    contractVersion: request.contractVersion,
    requestId: request.requestId,
    symbol: request.symbol,
    fundType: request.fundType,
    routeKey: request.routeKey,
    start: request.start,
    end: request.end,
    dataAsOf: request.dataAsOf,
    warmupPeriods: request.warmupPeriods,
    tailTradingDays: request.tailTradingDays,
    visibilityMode: request.visibilityMode,
    calendarDecisionRaw: request.calendarDecisionRaw,
    domesticRuleDecisionRaw: request.domesticRuleDecisionRaw,
  };
  return {
    reader,
    input,
    request,
    response,
    desired,
    effective,
    catalog,
    read,
    getPolicy,
    marketRouteCatalogV3,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-10-01T00:00:00Z');
});
afterEach(() => vi.useRealTimers());
describe('Market 精确净值 Reader', () => {
  it('创建复核两次当前路由，不再次读取净值', async () => {
    const f = fixture();
    const prepared = await f.reader.read(f.input);
    f.read.mockClear();
    f.getPolicy.mockClear();
    expect(await f.reader.currentRouteState(f.input.routeKey)).toEqual(prepared.routeState);
    expect(f.getPolicy).toHaveBeenCalledTimes(2);
    expect(f.read).not.toHaveBeenCalled();
  });

  it('创建复核期间路由变化拒绝，且不读取净值', async () => {
    const f = fixture();
    f.marketRouteCatalogV3.mockResolvedValueOnce(f.catalog).mockResolvedValueOnce({
      ...f.catalog,
      catalogRevision: f.catalog.catalogRevision + 1,
    });
    await expect(f.reader.currentRouteState(f.input.routeKey)).rejects.toMatchObject({
      code: 'stale-revision',
    });
    expect(f.read).not.toHaveBeenCalled();
  });

  it('固定请求、完整来源和准入，只读一次；目录生成时间不影响状态', async () => {
    const f = fixture();
    let generation = 0;
    f.marketRouteCatalogV3.mockImplementation(async () => ({
      ...f.catalog,
      generatedAt: new Date(Date.now() + generation++).toISOString(),
    }));
    const result = await f.reader.read(f.input);
    expect(result.request).toEqual(f.request);
    expect(result.response).toEqual(f.response);
    expect(f.read).toHaveBeenCalledExactlyOnceWith(f.request);
    expect(f.getPolicy).toHaveBeenCalledTimes(2);
  });
  it.each([
    'disabled',
    'pending',
    'stale',
    'missing',
    'revision',
    'partial',
    'not-admitted',
    'order',
  ])('读取前拒绝 %s', async (mode) => {
    const f = fixture();
    if (mode === 'disabled') f.desired.enabled = false;
    if (mode === 'pending') f.desired.syncState = 'pending';
    if (mode === 'stale') f.desired.effectiveStale = true;
    if (mode === 'missing') f.desired.routes = [];
    if (mode === 'revision') f.effective.sourceDesiredRevision = 2;
    if (mode === 'partial') f.catalog.integrity = 'partial';
    if (mode === 'not-admitted') f.catalog.entries[0]!.state = 'not_admitted';
    if (mode === 'order') f.effective.routes[0]!.targets[0]!.upstreamSource = 'other';
    await expect(f.reader.read(f.input)).rejects.toBeDefined();
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(['revision', 'revocation', 'desired', 'eligibility'])(
    '读取中 %s 改变后拒绝，不重读来源',
    async (mode) => {
      const f = fixture();
      f.read.mockImplementation(async () => {
        if (mode === 'revision') f.catalog.catalogRevision++;
        if (mode === 'revocation') f.catalog.entries[0]!.state = 'not_admitted';
        if (mode === 'desired') f.desired.revision++;
        if (mode === 'eligibility') {
          f.effective.routes[0]!.targets[0]!.eligible = false;
          f.effective.routes[0]!.targets[0]!.reason = 'not_admitted' as unknown as null;
        }
        return f.response;
      });
      await expect(f.reader.read(f.input)).rejects.toBeDefined();
      expect(f.read).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['request', 'source', 'scope', 'dates', 'expired', 'future', 'adapter'])(
    '拒绝响应 %s 错配',
    async (mode) => {
      const f = fixture();
      if (mode === 'request') f.response.requestId = 'other';
      if (mode === 'source')
        f.response.admission.target = {
          ...f.response.admission.target,
          upstreamSource: 'other' as 'eastmoney',
        };
      if (mode === 'scope') f.response.admission.scopeSymbols = ['000001.OF'];
      if (mode === 'dates') f.response.admission.scopeDateFrom = '2026-09-08';
      if (mode === 'expired') {
        vi.useFakeTimers();
        vi.setSystemTime('2026-10-02T00:00:00Z');
      }
      if (mode === 'future') f.response.admission.validFrom = '2026-10-01T23:59:00Z';
      if (mode === 'adapter') f.response.admission.adapterRevision = 'other';
      await expect(f.reader.read(f.input)).rejects.toBeDefined();
      expect(f.read).toHaveBeenCalledTimes(1);
    },
  );
  it('不越过首个就绪但无原文适配器的来源', async () => {
    const f = fixture();
    const first = { providerId: 'akshare', upstreamSource: 'eastmoney' };
    f.desired.routes[0]!.targets.unshift(first);
    f.effective.routes[0]!.targets[0]!.routeIndex = 1;
    f.effective.routes[0]!.targets.unshift({
      ...first,
      routeIndex: 0,
      eligible: true,
      reason: null,
    });
    f.catalog.entries.unshift({ key: f.request.routeKey, target: first, state: 'ready' });
    await expect(f.reader.read(f.input)).rejects.toMatchObject({ code: 'unsupported-capability' });
    expect(f.read).not.toHaveBeenCalled();
  });
  it('主源无资格时固定已准入的第二目标，失败后不再换源', async () => {
    const f = fixture();
    const first = { providerId: 'akshare', upstreamSource: 'eastmoney' };
    f.desired.routes[0]!.targets.unshift(first);
    f.effective.routes[0]!.targets[0]!.routeIndex = 1;
    f.effective.routes[0]!.targets.unshift({
      ...first,
      routeIndex: 0,
      eligible: false,
      reason: 'not_admitted' as unknown as null,
    });
    f.catalog.entries.unshift({ key: f.request.routeKey, target: first, state: 'not_admitted' });
    f.response.routeTarget.routeIndex = 1;
    const result = await f.reader.read(f.input);
    expect(result.request.routeTarget.routeIndex).toBe(1);
    f.read.mockRejectedValueOnce(new Error('来源失败'));
    await expect(f.reader.read(f.input)).rejects.toThrow('来源失败');
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it('无效输入在控制查询前拒绝', async () => {
    const f = fixture();
    await expect(f.reader.read({ ...f.input, symbol: 'invalid' })).rejects.toBeDefined();
    expect(f.getPolicy).not.toHaveBeenCalled();
  });
});
