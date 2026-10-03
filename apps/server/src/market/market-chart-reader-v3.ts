import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import {
  barSeriesSchema,
  desiredProviderPolicyV3Schema,
  type BarSeries,
  type MarketDataBarRouteKeyV3,
  marketChartOptionsWindowV3Schema,
  type MarketChartOptionsWindowV3,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketControlService } from './market-control.service.js';
import {
  marketRouteContextV3,
  type MarketWindowSelectionInputV3,
} from './market-window-selector-v3.js';
import { selectChartWindowV3 } from './market-chart-selector-v3.js';
import { MarketChartProofRepository } from './market-chart-proof.repository.js';
import { resolveChartWindowOptions } from './market-chart-window-options.js';
import { planMarketChartWindow } from './market-chart-window.js';
import { sliceBarSeries } from './market-bar-window.js';
import type { BarReadInput } from './market-bar-reader.js';
import { resolveChartOptionsV3, unavailableChartOptions } from './market-chart-options-v3.js';

/** Interactive observations never enter the frozen-window repository. */
@Injectable()
export class MarketChartReaderV3 {
  constructor(
    private readonly control: MarketControlService,
    private readonly dsa: DsaClient,
    @Optional() private readonly proofs?: MarketChartProofRepository,
  ) {}

  async options(
    identity: { symbol: string; assetType: string },
    window?: MarketChartOptionsWindowV3,
  ) {
    if (window) marketChartOptionsWindowV3Schema.parse(window);
    if (
      !/\.(SH|SZ|BJ)$/.test(identity.symbol) ||
      (identity.assetType !== 'STOCK' && identity.assetType !== 'ETF')
    ) {
      return unavailableChartOptions(identity.symbol, 'legacy', 'not_adapted', window);
    }
    let policy;
    try {
      policy = await this.control.getPolicy();
    } catch {
      return unavailableChartOptions(identity.symbol, 'unknown', 'policy_not_applied', window);
    }
    if (policy.contractVersion !== 3)
      return unavailableChartOptions(identity.symbol, 'legacy', 'policy_not_applied', window);
    if (policy.syncState !== 'applied' || policy.effectiveStale !== false) {
      return unavailableChartOptions(identity.symbol, 'v3', 'policy_not_applied', window);
    }
    try {
      const [envelope, catalog] = await Promise.all([
        this.dsa.effectiveControlPolicyV3(),
        this.dsa.marketRouteCatalogV3(),
      ]);
      const desired = {
        contractVersion: policy.contractVersion,
        consumer: policy.consumer,
        requestId: policy.requestId,
        revision: policy.revision,
        enabled: policy.enabled,
        routes: policy.routes,
      };
      if (window && this.proofs)
        return await resolveChartWindowOptions({
          identity: { symbol: identity.symbol, assetType: identity.assetType },
          desired,
          effective: envelope.projection?.effective,
          catalog,
          window,
          proofs: this.proofs,
        });
      const options = resolveChartOptionsV3(
        { symbol: identity.symbol, assetType: identity.assetType },
        desired,
        envelope.projection?.effective,
        catalog,
      );
      return { ...options, ...(window ? { window } : {}) };
    } catch {
      return unavailableChartOptions(identity.symbol, 'v3', 'catalog_unavailable', window);
    }
  }

  async read(
    input: BarReadInput,
    compatibility?: MarketWindowSelectionInputV3['compatibility'],
  ): Promise<BarSeries> {
    if (
      input.acceptance !== 'interactive' ||
      input.history ||
      input.asOf ||
      input.identity.timeframe !== '1d' ||
      !/\.(SH|SZ|BJ)$/.test(input.identity.symbol)
    ) {
      throw new Error('交互 V3 只支持中国市场日线图表，不提供回测或历史可见性验收');
    }
    const { start, end } = planMarketChartWindow(input.window);
    const routeKey: MarketDataBarRouteKeyV3 = {
      kind: 'bar',
      market: 'CN',
      assetType: input.identity.assetType,
      timeframe: '1d',
      capability: 'DAILY_BAR',
      adjustment: input.identity.adjustment,
    };
    const policy = await this.control.getPolicy();
    if (policy.syncState !== 'applied' || policy.effectiveStale !== false) {
      throw new Error('图表 V3 路由策略尚未生效');
    }
    const desired = desiredProviderPolicyV3Schema.parse({
      contractVersion: policy.contractVersion,
      consumer: policy.consumer,
      requestId: policy.requestId,
      revision: policy.revision,
      enabled: policy.enabled,
      routes: policy.routes,
    });
    const [envelope, catalog] = await Promise.all([
      this.dsa.effectiveControlPolicyV3(),
      this.dsa.marketRouteCatalogV3(),
    ]);
    const result = marketRouteContextV3({
      desired,
      effective: envelope.projection?.effective,
      catalog,
      routeKey,
    });
    if (!result.ok) throw new Error(`图表 V3 路由不可用：${result.reason}`);
    const [primary, backup] = result.context.targets;
    const resolveCompatibility = async () => {
      if (!this.proofs || !primary || !backup) return null;
      return this.proofs.findExact({
        routeKey,
        symbol: input.identity.symbol,
        window: { start, end },
        targets: { primary: primary.target, backup: backup.target },
        desiredRevision: result.context.desiredRevision,
        effectivePolicyRevision: result.context.effectivePolicyRevision,
        catalogRevision: result.context.catalogRevision,
      });
    };
    const response = await selectChartWindowV3({
      request: {
        contractVersion: 3,
        purpose: 'interactive-chart',
        requestId: randomUUID(),
        symbol: input.identity.symbol,
        routeKey,
        start,
        end,
      },
      context: result.context,
      ...(compatibility ? { compatibility } : {}),
      ...(!compatibility && this.proofs ? { resolveCompatibility } : {}),
      read: (request) => this.dsa.marketChartBarsV3(request),
    });
    const fetchedAt = response.sourcePriceBasis.observedAt;
    const acquisitionFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          routeKey,
          symbol: input.identity.symbol,
          start,
          end,
          basis: response.sourcePriceBasis,
          source: response.provenance,
          fingerprint: response.inputFingerprint,
        }),
      )
      .digest('hex');
    const series = barSeriesSchema.parse({
      contractVersion: 3,
      identity: input.identity,
      points: response.bars,
      coverage: response.coverage,
      provenance: {
        ...response.provenance,
        providerRevision: acquisitionFingerprint,
        fetchedAt,
        freshUntil: fetchedAt,
        servedFromCache: false,
        cacheStatus: 'miss',
      },
      inputFingerprint: response.inputFingerprint,
      chartContextV3: {
        purpose: 'interactive-chart',
        sourcePriceBasis: response.sourcePriceBasis,
        requestedStart: start,
        requestedEnd: end,
        acquisitionFingerprint,
      },
    });
    return sliceBarSeries(series, input.window);
  }
}
