import { observedDataRuleKinds } from './risk-observed-source.js';
import { Controller, Get, Optional } from '@nestjs/common';
import { riskMonitoringSourceSchema } from '@thesis-ledger/schemas';
import { InstrumentDisplayService } from '../market/instruments/instrument-display.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { backgroundQuoteStatusKey } from '../market/market-background-quotes.service.js';

@Controller('risk/monitoring')
export class RiskMonitoringStatusController {
  constructor(
    private readonly db: PrismaService,
    private readonly redis: RedisService,
    @Optional()
    private readonly display: InstrumentDisplayService = new InstrumentDisplayService(db),
  ) {}

  @Get()
  async status() {
    const now = new Date();
    const rows = await this.db.riskRule.findMany({ where: { archivedAt: null } });
    const eligible = rows.filter((r) => r.enabled && !r.needsRepair && r.effectiveAt <= now);
    const health = await this.redis.client.hgetall(redisKey('cache', 'risk-monitoring-health'));
    const heartbeat = health.checkedAt ? Date.parse(health.checkedAt) : NaN;
    const raw = await this.redis.client.get(backgroundQuoteStatusKey);
    const acquisition = raw ? (JSON.parse(raw) as { checkedAt: string; sources: unknown[] }) : null;
    const sources = riskMonitoringSourceSchema.array().parse(acquisition?.sources ?? []);
    const names = await this.display.resolve(sources.map((source) => source.symbol));
    return {
      mode: 'observed-data' as const,
      continuousSource: false,
      eligibleRules: eligible.length,
      futureRules: rows.filter((r) => r.enabled && !r.needsRepair && r.effectiveAt > now).length,
      unsupportedRules: eligible.filter((r) => r.sourcePlanId || !observedDataRuleKinds.has(r.kind))
        .length,
      checkedAt: health.checkedAt ?? null,
      evaluatedAt: health.evaluatedAt ?? null,
      gapAt: health.gapAt ?? null,
      missingPrices: Number(health.missingPrices ?? 0),
      inputUnavailable: Number(health.inputUnavailable ?? 0),
      inputReason: health.inputReason || null,
      delayedPrices: Number(health.delayedPrices ?? 0),
      processorAvailable:
        Number.isFinite(heartbeat) && now.getTime() - heartbeat < 15_000 && !health.error,
      error: health.error || null,
      acquisitionCheckedAt: acquisition?.checkedAt ?? null,
      acquisitionAvailable: Boolean(
        acquisition && now.getTime() - Date.parse(acquisition.checkedAt) < 15_000,
      ),
      sources: sources.map((source) => ({ ...source, assetName: names.name(source.symbol) })),
      limitation:
        '按当前来源能力自动获取并评估。腾讯中国 ETF 最短请求间隔600秒，上游更新频率未知；其他来源按下列状态处理。当前没有持续订阅，采样间和断线期间未取得的价格变化无法回溯；跨币种估值还需有效汇率。',
    };
  }
}
