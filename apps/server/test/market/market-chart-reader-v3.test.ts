import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteCatalogV3Schema,
  marketDataBarSeriesResponseV3Schema,
  type MarketChartBarsRequestV3,
} from '@thesis-ledger/schemas';
import { MarketChartReaderV3 } from '../../src/market/market-chart-reader-v3.js';
import type { BarReadInput } from '../../src/market/market-bar-reader.js';
import type { MarketControlService } from '../../src/market/market-control.service.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { MarketChartProofRepository } from '../../src/market/market-chart-proof.repository.js';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const input: BarReadInput = {
  identity: { symbol: '159516.SZ', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
  acceptance: 'interactive',
  window: { start: '2026-05-18', end: '2026-05-20', limit: 2 },
};
const setup = (proofs?: MarketChartProofRepository) => {
  const desired = desiredProviderPolicyV3Schema.parse(fixture('market-route-v3.etf-qfq.json'));
  const effective = effectiveProviderPolicyV3Schema.parse(
    fixture('market-control-v3.effective.etf-qfq.json'),
  );
  const catalog = marketRouteCatalogV3Schema.parse(
    fixture('market-route-catalog-v3.complete.json'),
  );
  const { coverageProof: _proof, ...base } = marketDataBarSeriesResponseV3Schema.parse(
    fixture('market-data-v3.response.etf-qfq.json'),
  );
  void _proof;
  const response = { ...base, purpose: 'interactive-chart' as const };
  response.bars.at(-1)!.completionStatus = 'incomplete';
  response.coverage.latestCompleteTradingDate = '2026-05-19';
  const control = {
    getPolicy: vi
      .fn()
      .mockResolvedValue({ ...desired, syncState: 'applied', effectiveStale: false }),
  };
  const dsa = {
    effectiveControlPolicyV3: vi.fn().mockResolvedValue({ projection: { effective } }),
    marketRouteCatalogV3: vi.fn().mockResolvedValue(catalog),
    marketChartBarsV3: vi.fn(async (request: MarketChartBarsRequestV3) => ({
      ...response,
      requestId: request.requestId,
    })),
  };
  const reader = new MarketChartReaderV3(
    control as unknown as MarketControlService,
    dsa as unknown as DsaClient,
    proofs,
  );
  return { reader, control, dsa, response, catalog, effective, desired };
};

describe('统一行情图表 V3 读取', () => {
  it('按实际请求和当前三项修订向证明仓库查询，不用目录 ready 冒充证明', async () => {
    const proofs = { findExact: vi.fn().mockResolvedValue(null) };
    const { reader, dsa, control, catalog, effective, desired } = setup(
      proofs as unknown as MarketChartProofRepository,
    );
    const backup = { providerId: 'synthetic-backup', upstreamSource: 'synthetic-source' };
    desired.routes[0]!.targets.push(backup);
    effective.routes[0]!.targets.push({ ...backup, routeIndex: 1, eligible: true, reason: null });
    catalog.entries.push({ key: desired.routes[0]!.key, target: backup, state: 'ready' });
    control.getPolicy.mockResolvedValue({
      ...desired,
      syncState: 'applied',
      effectiveStale: false,
    });
    dsa.marketChartBarsV3.mockRejectedValue(new Error('primary failed'));
    await expect(reader.read(input)).rejects.toThrow('primary failed');
    expect(proofs.findExact).toHaveBeenCalledWith({
      routeKey: desired.routes[0]!.key,
      symbol: input.identity.symbol,
      window: { start: input.window.start, end: input.window.end },
      targets: { primary: desired.routes[0]!.targets[0], backup },
      desiredRevision: desired.revision,
      effectivePolicyRevision: effective.revision,
      catalogRevision: catalog.catalogRevision,
    });
    expect(dsa.marketChartBarsV3).toHaveBeenCalledTimes(1);
  });
  it('正常主源读取不触达证明文件', async () => {
    const proofs = { findExact: vi.fn().mockRejectedValue(new Error('unavailable')) };
    const { reader } = setup(proofs as unknown as MarketChartProofRepository);
    await reader.read(input);
    expect(proofs.findExact).not.toHaveBeenCalled();
  });
  it('精确路由并切片，保留观测、未收盘状态及完整获取身份', async () => {
    const { reader, dsa } = setup();
    const result = await reader.read(input);
    expect(result.points).toHaveLength(2);
    expect(result.points.at(-1)?.completionStatus).toBe('incomplete');
    expect(result.chartContextV3).toMatchObject({
      purpose: 'interactive-chart',
      requestedStart: '2026-05-18',
      requestedEnd: '2026-05-20',
    });
    expect(result.chartContextV3?.acquisitionFingerprint).toBe(result.provenance.providerRevision);
    expect(result.provenance.cacheStatus).toBe('miss');
    expect(dsa.marketChartBarsV3).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'interactive-chart',
        routeKey: expect.objectContaining({ adjustment: 'qfq' }),
        routeTarget: {
          providerId: 'hithink',
          upstreamSource: 'hithink-financial-api',
          routeIndex: 0,
        },
      }),
    );
  });

  it('刷新重新读取，同价格不同观测版本不能复用获取身份', async () => {
    const { reader, dsa, response } = setup();
    const first = await reader.read(input);
    response.sourcePriceBasis.observedAt = '2026-05-22T00:00:00Z';
    const second = await reader.read({ ...input, refresh: true });
    expect(dsa.marketChartBarsV3).toHaveBeenCalledTimes(2);
    expect(second.chartContextV3?.acquisitionFingerprint).not.toBe(
      first.chartContextV3?.acquisitionFingerprint,
    );
  });

  it.each(['complete', 'point-in-time'] as const)(
    '拒绝 %s 消费者误用交互入口',
    async (acceptance) => {
      const { reader, control, dsa } = setup();
      await expect(reader.read({ ...input, acceptance })).rejects.toThrow('不提供回测');
      expect(control.getPolicy).not.toHaveBeenCalled();
      expect(dsa.marketChartBarsV3).not.toHaveBeenCalled();
    },
  );

  it('不将错误日期归一化为另一个日期', async () => {
    const { reader, control } = setup();
    await expect(
      reader.read({ ...input, window: { start: '2026-02-30', end: '2026-05-20' } }),
    ).rejects.toThrow('日期无效');
    expect(control.getPolicy).not.toHaveBeenCalled();
  });

  it('目录不完整或主来源未就绪时不调用行情', async () => {
    const { reader, catalog, dsa } = setup();
    catalog.integrity = 'partial';
    await expect(reader.read(input)).rejects.toThrow('catalog_unavailable');
    expect(dsa.marketChartBarsV3).not.toHaveBeenCalled();
  });

  it('其他口径未配置时不借用 qfq 路由', async () => {
    const { reader, dsa } = setup();
    await expect(
      reader.read({ ...input, identity: { ...input.identity, adjustment: 'hfq' } }),
    ).rejects.toThrow('route_not_configured');
    expect(dsa.marketChartBarsV3).not.toHaveBeenCalled();
  });

  it('策略变化与来源失败均不静默使用旧数据或其他来源', async () => {
    const { reader, dsa, response } = setup();
    response.provenance.effectivePolicyRevision += 1;
    await expect(reader.read(input)).rejects.toThrow('修订已改变');
    dsa.marketChartBarsV3.mockRejectedValueOnce(new Error('source failed'));
    await expect(reader.read(input)).rejects.toThrow('source failed');
    expect(dsa.marketChartBarsV3).toHaveBeenCalledTimes(2);
  });
});
