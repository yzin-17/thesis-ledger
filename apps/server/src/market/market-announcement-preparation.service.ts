import { Inject, Injectable } from '@nestjs/common';
import {
  marketAnnouncementPreparationSchema,
  type MarketAnnouncementPreparation,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';

type AnnouncementWindow = {
  market: string;
  instrumentType: string;
  symbol: string;
  start: string;
  end: string;
  historyBasis: string;
};

@Injectable()
export class MarketAnnouncementPreparationService {
  constructor(@Inject(DsaClient) private readonly dsa: DsaClient) {}

  async prepare(window: AnnouncementWindow): Promise<MarketAnnouncementPreparation | undefined> {
    if (window.market !== 'CN' || window.instrumentType !== 'STOCK' ||
        window.historyBasis !== 'fixed-provider-snapshot') return undefined;
    try {
      const policy = (await this.dsa.effectiveControlPolicyV3()).projection?.effective;
      const selected = policy?.enabled && policy.routes.some((route) =>
        route.key.market === 'CN' && route.key.assetType === 'STOCK' &&
        route.key.capability === 'HISTORICAL_TRADING_STATUS' && route.targets.some((target) =>
          target.eligible && target.providerId === 'official-states' &&
          ['cn-stock-daily-suspension', 'cn-stock-risk-price-limits'].includes(target.upstreamSource)));
      if (!selected) return undefined;
      const result = await this.dsa.control<unknown>('/api/v3/thesis-ledger/control/announcements/prepare', {
        method: 'POST', body: JSON.stringify({ symbols: [window.symbol], start: window.start, end: window.end }),
      });
      return marketAnnouncementPreparationSchema.parse(result);
    } catch (error) {
      // 库存和未知状态仍由原有状态读取及本次研究模型处理。
      return { status: 'ready', jobIds: [], total: 0, completed: 0, failed: 0,
        matched: 0, downloaded: 0, parsed: 0,
        errors: [{ stage: 'preparation', reason: error instanceof Error ? error.message : '公告准备服务不可用' }] };
    }
  }
}
