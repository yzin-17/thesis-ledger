import { describe, it, expect, vi } from 'vitest';
import {
  prepareEventFreeEvidence,
  EVENT_FREE_EVIDENCE_REVISION,
} from '../../src/market/market-event-free-evidence.js';
import { MarketEventFreeRepository } from '../../src/market/market-event-free.repository.js';
import { MarketEventFreeReader } from '../../src/market/market-event-free-reader.js';
import * as selector from '../../src/market/market-window-selector-v3.js';
import { parseMarketWindowEvidenceResponseV3 } from '../../src/market/market-window-response-v3.js';

import { fixture } from './market-event-free.fixture.js';

describe('无事件经济证据与固定锚点', () => {
  it('复用原派生算法、单位因子及原成交量额，冻结实际可见时间', () => {
    const value = prepareEventFreeEvidence(fixture());
    expect(value.derived.bars.map((b) => b.close)).toEqual([100, 105]);
    expect(value.derived.bars[0]!.volume).toBe(100);
    expect(value.derived.derivation.anchorFactor).toBe(1);
    expect(value.derived.derivation.basisRef).toContain('fixed-end:2026-10-30:');
    expect(value.derived.bars[0]!.availableAt).toBe('2026-11-06T14:00:00.000Z');
  });
  it.each(['event', 'count', 'anchor', 'independent', 'timestamp', 'empty'])(
    '拒绝不合格输入：%s',
    (change) => {
      const value = fixture();
      if (change === 'event') value.qualification.eventDates = ['2026-10-29'];
      if (change === 'count') value.qualification.fullEventCount = 2;
      if (change === 'anchor') value.anchorDate = '2026-10-29';
      if (change === 'independent') value.independentReturn = '0.06';
      if (change === 'timestamp') value.bars[0]!.availableAt = '2026-11-07T00:00:00Z';
      if (change === 'empty') value.qualification.eventDates = [];
      expect(() => prepareEventFreeEvidence(value)).toThrow();
    },
  );
  it('证据变更产生不同冻结引用，不能只改语义标签', () => {
    const a = fixture(),
      b = fixture();
    b.qualification.corporateActionContentHash = 'e'.repeat(64);
    expect(prepareEventFreeEvidence(a).certificateFingerprint).not.toBe(
      prepareEventFreeEvidence(b).certificateFingerprint,
    );
  });
});

describe('原子发布及只读查找', () => {
  it('相同输入幂等，两种冻结对象都不可覆盖', async () => {
    const rows = new Map<string, unknown>();
    const upsert = vi.fn(async ({ create }: { create: { inputFingerprint: string } }) => {
      if (!rows.has(create.inputFingerprint)) rows.set(create.inputFingerprint, create);
      return rows.get(create.inputFingerprint);
    });
    const prisma = {
      $transaction: (fn: (tx: unknown) => unknown) =>
        fn({
          marketDerivedSeriesSnapshotV3: { upsert },
          marketEconomicPriceCertificate: { upsert },
        }),
    };
    const repo = new MarketEventFreeRepository(prisma as never);
    expect(await repo.publish(fixture())).toEqual(await repo.publish(fixture()));
    expect(rows.size).toBe(2);
    const certificate = [...rows.values()].find(
      (r) =>
        (r as { algorithmRevision: string }).algorithmRevision === EVENT_FREE_EVIDENCE_REVISION,
    ) as { algorithmRevision: string };
    certificate.algorithmRevision = 'corrupted';
    await expect(repo.publish(fixture())).rejects.toThrow('冲突');
  });
  it('精确窗口歧义不自动选择或回退', async () => {
    const repo = new MarketEventFreeRepository({
      marketEconomicPriceCertificate: { findMany: async () => [{}, {}] },
    } as never);
    await expect(repo.exact('600519.SH', '2026-10-29', '2026-10-30')).rejects.toThrow('多份');
  });
});

describe('生产消费仍服从控制与日历', () => {
  const input = {
    market: 'CN' as const,
    symbol: '600519.SH',
    window: { start: '2026-10-29', end: '2026-10-30' },
    routeKey: {
      kind: 'bar' as const,
      market: 'CN' as const,
      assetType: 'STOCK' as const,
      capability: 'DAILY_BAR' as const,
      timeframe: '1d' as const,
      adjustment: 'qfq' as const,
    },
    priceResearch: true,
  };
  function setup(
    options: {
      ready?: boolean;
      shortCalendar?: boolean;
      changedAfter?: boolean;
      revokedAfter?: boolean;
    } = {},
  ) {
    const prepared = prepareEventFreeEvidence(fixture());
    const policy = {
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: 'test',
      revision: 188,
      enabled: true,
      routes: [],
      syncState: 'applied',
      effectiveStale: false,
    };
    const control = {
      getPolicy: vi
        .fn()
        .mockResolvedValueOnce(policy)
        .mockResolvedValue({ ...policy, revision: options.changedAfter ? 189 : 188 }),
    };
    const source = prepared.bundle.source;
    const context = {
      desiredRevision: 188,
      effectivePolicyRevision: 188,
      catalogRevision: 1,
      targets: [
        { target: source, routeIndex: 0, eligible: true, catalogReady: options.ready ?? true },
      ],
    };
    const spy = vi
      .spyOn(selector, 'marketRouteContextV3')
      .mockReturnValue({ ok: true, context } as never);
    if (options.revokedAfter) {
      spy
        .mockReturnValue({
          ok: true,
          context: { ...context, targets: [{ ...context.targets[0], eligible: false }] },
        } as never)
        .mockReturnValueOnce({ ok: true, context } as never)
        .mockReturnValueOnce({ ok: true, context } as never);
    }
    const dsa = {
      effectiveControlPolicyV3: async () => ({ projection: { effective: {} } }),
      marketRouteCatalogV3: async () => ({}),
    };
    const calendar = {
      read: async () => ({
        status: 'ready',
        calendar: {
          revision: 'qualified-calendar',
          availableAt: '2026-10-28T00:00:00.000Z',
          coverageStart: '2026-10-29',
          coverageEnd: '2026-10-30',
          sessions: (options.shortCalendar ? ['2026-10-29'] : prepared.dates).map(
            (tradingDate) => ({ tradingDate }),
          ),
        },
      }),
    };
    const evidence = {
      record: vi.fn(async (value) => {
        parseMarketWindowEvidenceResponseV3(value.response, value.request);
        return {
          inputFingerprint: value.response.inputFingerprint,
          sourcePriceBasis: value.response.sourcePriceBasis,
          fetchedAt: new Date(),
        };
      }),
    };
    const reader = new MarketEventFreeReader(
      { exact: async () => prepared } as never,
      control as never,
      dsa as never,
      calendar as never,
      evidence as never,
    );
    return { reader, evidence, spy };
  }
  it('生成完整V3经济价格，来源读取接口未注入且不需要额外探针', async () => {
    const { reader, spy } = setup();
    try {
      const value = await reader.read(input);
      expect(value?.status).toBe('selected');
      if (value?.status === 'selected') {
        expect(value.selection.response.sourcePriceBasis.dividendMeaning).toBe('embedded-verified');
        expect(value.selection.response.sourcePriceBasis.method).toBe('local-derived');
      }
    } finally {
      spy.mockRestore();
    }
  });
  it('原缺日模式请求绑定同份日线的逐日已成交证据', async () => {
    const { reader, spy } = setup();
    try {
      const value = await reader.read({ ...input, tradabilityMode: 'assume-untradable-no-bar' });
      expect(value?.status).toBe('selected');
      if (value?.status === 'selected') {
        const windows = value.selection.response.historicalTradabilityWindows;
        expect(windows?.[0]?.days.map((d) => d.state)).toEqual([
          'observed-traded',
          'observed-traded',
        ]);
        expect(windows?.[0]?.barSource.providerRevision).toContain('raw-times-factor');
      }
    } finally {
      spy.mockRestore();
    }
  });
  it.each([
    { ready: false },
    { shortCalendar: true },
    { changedAfter: true },
    { revokedAfter: true },
  ])('准入、覆盖或后置策略变化时失败关闭：%o', async (options) => {
    const { reader, evidence, spy } = setup(options);
    try {
      expect((await reader.read(input))?.status).toBe('unavailable');
      if (!options.changedAfter && !options.revokedAfter)
        expect(evidence.record).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
