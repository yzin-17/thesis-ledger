import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { selectMarketEventV3 } from './market-event-selector-v3.js';
@Injectable()
export class MarketActionCoverage {
  constructor(@Inject(DsaClient) private readonly dsa: DsaClient) {}
  async read(
    i: {
      symbol: string;
      assetType: 'STOCK' | 'ETF';
      market: 'CN' | 'HK' | 'US';
      previousDay: string;
      now: Date;
    },
    day: string,
  ) {
    const [policy, catalog] = await Promise.all([
      this.dsa.effectiveControlPolicyV3(),
      this.dsa.marketRouteCatalogV3(),
    ]);
    const effective = policy.projection?.effective;
    if (!effective) return null;
    const refs: string[] = [];
    for (const capability of ['CASH_DISTRIBUTION', 'SPLIT_EVENT'] as const) {
      const scope = {
        contractVersion: 3 as const,
        requestId: randomUUID(),
        symbol: i.symbol,
        start: i.previousDay,
        end: day,
        dataAsOf: i.now.toISOString(),
        desiredRevision: effective.sourceDesiredRevision,
        effectivePolicyRevision: effective.revision,
        catalogRevision: catalog.catalogRevision,
        routeKey: { kind: 'data' as const, capability, market: i.market, assetType: i.assetType },
      };
      const read = await selectMarketEventV3({
        scope,
        effective,
        catalog,
        read: (r) => this.dsa.marketEventsV3(r),
      });
      if (
        read.status !== 'observed' ||
        !read.response.coverage.complete ||
        read.response.facts.length
      )
        return null;
      refs.push(read.response.coverage.admissionEvidenceRef);
    }
    return refs;
  }
}
