import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  dailyTradingStatusResultV1Schema,
  marketLifecycleStatusEvidenceV1Schema,
  securityBasicDatesResultV1Schema,
  type MarketLifecycleStatusEvidenceV1,
  type StatusCompositionDemandV1,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { readMarketStatusCompositionV1 } from './market-status-composition-reader-v1.js';

export type LifecycleReadScopeV3 = { market: 'CN'; symbol: string; start: string; end: string };
export interface MarketLifecycleReadPortV3 {
  read(scope: LifecycleReadScopeV3): Promise<MarketLifecycleStatusEvidenceV1>;
}

@Injectable()
export class MarketLifecycleReaderV3 implements MarketLifecycleReadPortV3 {
  constructor(
    @Inject(DsaClient)
    private readonly dsa: Pick<DsaClient, 'effectiveControlPolicyV3' | 'dataCapabilities'>,
  ) {}

  readComposition(demands: readonly StatusCompositionDemandV1[]) {
    return readMarketStatusCompositionV1(demands, this.dsa.dataCapabilities,
      () => this.dsa.effectiveControlPolicyV3().then((result) => result.projection?.effective ?? null));
  }

  async read({ market, symbol, start, end }: LifecycleReadScopeV3) {
    const route = { kind: 'data', market, assetType: 'STOCK' } as const;
    const query = { contractVersion: 1, capabilityVersion: 1, consumer: 'thesis-ledger', symbol } as const;
    const range = { start, end };
    const composition = await this.readComposition([
      { requirement: 'optional', query: { ...query, requestId: randomUUID(),
        routeKey: { ...route, capability: 'DAILY_TRADING_STATUS' }, range } },
      { requirement: 'optional', query: { ...query, requestId: randomUUID(),
        routeKey: { ...route, capability: 'SECURITY_BASIC_DATES' } } },
    ]);
    const [statusEntry, datesEntry] = composition.entries;
    if (statusEntry?.status !== 'included' || datesEntry?.status !== 'included')
      throw new Error('日级交易状态或证券基础日期不可用');
    const status = dailyTradingStatusResultV1Schema.parse(statusEntry.result);
    const dates = securityBasicDatesResultV1Schema.parse(datesEntry.result);
    return marketLifecycleStatusEvidenceV1Schema.parse({
      contract: 'market-lifecycle-status-evidence-v1', symbol, range,
      basicLifecycle: dates.dates, days: status.days, composition,
    });
  }
}
