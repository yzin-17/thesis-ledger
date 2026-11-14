import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { StrategyRiskMonitoringService } from './strategy-risk-monitoring.service.js';
import {
  MarketObservationsService,
  observationStream,
  type ObservedMarketValue,
} from '../market/market-observations.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { loadConfig } from '../platform/config.js';
import { RiskRuleService } from './risk-rule.service.js';
import { RiskService } from './risk.service.js';
import { RiskValuationContextService } from './risk-valuation-context.service.js';
import { observedDataRuleKinds, riskObservedSource } from './risk-observed-source.js';

const stateKey = redisKey('cache', 'risk-observation-consumer');
const lockKey = redisKey('lock', 'risk-observation-consumer');
type ConsumerState = { cursor: string; rules: string; rows: ObservedMarketValue[] };

@Injectable()
export class RiskMonitoringService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private retryAfter = 0;
  private readonly logger = new Logger(RiskMonitoringService.name);
  constructor(
    private readonly observations: MarketObservationsService,
    private readonly redis: RedisService,
    private readonly rules: RiskRuleService,
    private readonly risk: RiskService,
    private readonly valuation: RiskValuationContextService,
    @Optional() private readonly strategyMonitoring?: StrategyRiskMonitoringService,
  ) {}

  onModuleInit() {
    if (loadConfig().environment === 'test') return;
    // 普通规则消费已有观察流；策略应用由独立检查窗口调度。
    this.timer = setInterval(() => void this.runNow(), 1000);
    this.timer.unref();
    void this.runNow();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runNow(now?: Date) {
    const startedAt = now ?? new Date();
    const evaluationTime = () => now ?? new Date();
    if (this.running || startedAt.getTime() < this.retryAfter) return;
    this.running = true;
    const token = crypto.randomUUID();
    let locked = false;
    try {
      locked = (await this.redis.client.set(lockKey, token, 'PX', 300_000, 'NX')) === 'OK';
      if (!locked) return;
      const raw = await this.redis.client.get(stateKey);
      let state: ConsumerState;
      if (raw) state = JSON.parse(raw) as ConsumerState;
      else {
        state = await this.snapshotCheckpoint();
      }
      const first = await this.redis.client.xrange(observationStream, '-', '+', 'COUNT', 1);
      if (state.cursor !== '0-0' && first[0] && this.checkpointTrimmed(first[0][0], state.cursor)) {
        // The bounded journal no longer contains the checkpoint. Resume from
        // current snapshots and disclose that unobserved crossings cannot replay.
        state = await this.snapshotCheckpoint();
        await this.redis.client.hset(
          redisKey('cache', 'risk-monitoring-health'),
          'gapAt',
          startedAt.toISOString(),
        );
      }
      const enabled = await this.rules.listEnabledRules();
      await this.strategyMonitoring?.runNow(enabled, evaluationTime());
      const signature = enabled
        .map((r) => `${r.id}:${r.version}`)
        .sort()
        .join('|');
      const rulesChanged = state.rules !== signature;
      const events = await this.redis.client.xrange(
        observationStream,
        `(${state.cursor}`,
        '+',
        'COUNT',
        50,
      );
      for (const [cursor, fields] of events) {
        const row = JSON.parse(fields[fields.indexOf('observation') + 1]!) as ObservedMarketValue;
        const next = state.rows.filter((old) => this.identity(old) !== this.identity(row));
        const previous = state.rows.find((old) => this.identity(old) === this.identity(row));
        if (!previous || row.sourceTime >= previous.sourceTime) {
          state.rows = [...next, row];
          await this.evaluate(state.rows, enabled, evaluationTime());
        }
        state.cursor = cursor;
        await this.save(state, token, evaluationTime());
      }
      if (rulesChanged) await this.evaluate(state.rows, enabled, evaluationTime());
      state.rules = signature;
      await this.save(state, token, evaluationTime());
    } catch (error) {
      this.retryAfter = startedAt.getTime() + 30_000;
      this.logger.warn(
        `risk_monitoring_unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.redis.client
        .hset(redisKey('cache', 'risk-monitoring-health'), 'error', '监控处理失败，等待恢复')
        .catch(() => undefined);
    } finally {
      if (locked)
        await this.redis.client
          .eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
            1,
            lockKey,
            token,
          )
          .catch(() => undefined);
      this.running = false;
    }
  }

  private async snapshotCheckpoint(): Promise<ConsumerState> {
    const tail = await this.redis.client.xrevrange(observationStream, '+', '-', 'COUNT', 1);
    return {
      cursor: tail[0]?.[0] ?? '0-0',
      rules: '',
      rows: await this.observations.snapshots(),
    };
  }

  private checkpointTrimmed(first: string, cursor: string) {
    const [firstTime = 0n, firstSequence = 0n] = first.split('-').map(BigInt);
    const [lastTime = 0n, lastSequence = 0n] = cursor.split('-').map(BigInt);
    return firstTime > lastTime || (firstTime === lastTime && firstSequence > lastSequence);
  }

  private identity(row: ObservedMarketValue) {
    const { kind, value } = row.observation;
    return kind === 'fx' ? `fx:${value.baseCurrency}:${value.asOf}` : `${kind}:${value.symbol}`;
  }

  private async evaluate(
    rows: ObservedMarketValue[],
    rules: Awaited<ReturnType<RiskRuleService['listEnabledRules']>>,
    now: Date,
  ) {
    const ruleIds = rules
      .filter((r) => !r.sourcePlanId && observedDataRuleKinds.has(r.kind))
      .map((r) => r.id);
    if (!ruleIds.length) {
      await this.redis.client.hset(
        redisKey('cache', 'risk-monitoring-health'),
        'missingPrices',
        '0',
        'delayedPrices',
        '0',
        'inputUnavailable',
        '0',
        'inputReason',
        '',
      );
      return;
    }
    const source = riskObservedSource(rows, now);
    for (const mode of ['actual', 'shadow'] as const) {
      const { contexts } = await this.valuation.build(mode, now.toISOString(), source);
      let missingGlobal = 0;
      const symbols = [
        ...new Set(
          rules
            .filter(
              (r) => ruleIds.includes(r.id) && r.scope === 'security' && !r.accountId && r.symbol,
            )
            .map((r) => r.symbol!),
        ),
      ];
      for (const symbol of symbols) {
        if (contexts.some((c) => c.symbol === symbol)) continue;
        try {
          const quote = await source.getQuote(symbol);
          contexts.push({
            symbol,
            mode,
            price: quote.price,
            marketTime: quote.marketTime!,
            dataQuality: {
              marketData: quote.freshness === 'delayed' ? 'delayed' : 'fresh',
              freshness: quote.freshness,
              priceTime: quote.marketTime!,
              fetchedAt: quote.fetchedAt,
              priceProvider: quote.provider,
              priceBasis: 'quote',
              fallbackUsed: String(quote.fallbackUsed ?? false),
              ...(quote.upstreamSource ? { upstreamSource: quote.upstreamSource } : {}),
            },
          });
        } catch {
          missingGlobal += 1;
        }
      }
      if (mode === 'actual')
        await this.redis.client.hset(
          redisKey('cache', 'risk-monitoring-health'),
          'evaluatedAt',
          now.toISOString(),
          'missingPrices',
          String(missingGlobal + contexts.filter((c) => c.price === undefined).length),
          'delayedPrices',
          String(contexts.filter((c) => c.dataQuality.freshness === 'delayed').length),
        );
      const result = await this.risk.scan(contexts, {
        evaluatedAt: now,
        includeStrategyRules: false,
        ruleIds,
      });
      if (mode === 'actual') {
        const unavailable = result.results.filter((r) => r.errorCode === 'input-unavailable');
        await this.redis.client.hset(
          redisKey('cache', 'risk-monitoring-health'),
          'inputUnavailable',
          String(unavailable.length),
          'inputReason',
          unavailable[0]?.error ?? '',
        );
      }
      // Preserve the journal position when notification enqueue failed. The same
      // persistent event is reused after recovery. Failed event commits must also
      // retain the observation rather than silently losing a crossing.
      if (result.results.some((r) => r.error && r.errorCode !== 'input-unavailable'))
        throw new Error('risk_monitoring_evaluation_incomplete');
    }
  }

  private async save(state: ConsumerState, token: string, now: Date) {
    const saved = await this.redis.client.eval(
      `
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
      redis.call('PEXPIRE', KEYS[1], 300000)
      redis.call('SET', KEYS[2], ARGV[2])
      redis.call('HSET', KEYS[3], 'checkedAt', ARGV[3], 'error', '')
      return 1`,
      3,
      lockKey,
      stateKey,
      redisKey('cache', 'risk-monitoring-health'),
      token,
      JSON.stringify(state),
      now.toISOString(),
    );
    if (saved !== 1) throw new Error('risk_monitoring_lock_lost');
  }
}
