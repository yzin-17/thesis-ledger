import { BadRequestException, Injectable } from '@nestjs/common';
import {
  evaluateCompleteRule,
  type CompleteRiskContext,
  type RiskRule,
} from '@thesis-ledger/domain';
import {
  riskAccountContextSchema,
  riskPortfolioContextSchema,
  riskRuleInputSchema,
  riskRuleStoredSchema,
  riskRuleUpdateSchema,
  riskScanContextSchema,
  riskScanEnvelopeSchema,
  requiresRiskRuleAccount,
} from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../platform/prisma.service.js';

type SecurityContext = ReturnType<typeof riskScanContextSchema.parse>;
type AccountContext = ReturnType<typeof riskAccountContextSchema.parse>;
type PortfolioContext = ReturnType<typeof riskPortfolioContextSchema.parse>;
type PortfolioMode = 'actual' | 'shadow';
type StoredRule = {
  id: string;
  version: number;
  kind: string;
  scope: string;
  severity: string;
  threshold: unknown;
  enabled: boolean;
  needsRepair: boolean;
  repairReason: string | null;
  symbol: string | null;
  accountId: string | null;
  sourcePlanId?: string | null;
  parameters?: unknown;
};
type ParsedScan = {
  scanId?: string;
  security: SecurityContext[];
  accounts: AccountContext[];
  portfolio?: PortfolioContext;
  allowStale: boolean;
};
type EvaluationCandidate = {
  scope: RiskRule['scope'];
  mode: PortfolioMode;
  marketTime: string;
  dataQuality: Record<string, string>;
  symbol?: string;
  accountId?: string;
  affectedAccountIds?: string[];
  domain: CompleteRiskContext;
};
type PositionContext = NonNullable<SecurityContext['positions']>[number];
type RiskPositionStateRecord = {
  accountId: string;
  symbol: string;
  mode: string;
  positionId: string | null;
  holdingPeak: unknown;
  peakAt: Date;
  positionUpdatedAt: Date | null;
  lastQuantity: unknown;
  lastPrice: unknown;
};
type RiskPositionStateDelegate = {
  findMany: (args: {
    where: { accountId: { in: string[] }; symbol: { in: string[] }; mode: string };
  }) => Promise<RiskPositionStateRecord[]>;
  upsert: (args: {
    where: { accountId_symbol_mode: { accountId: string; symbol: string; mode: string } };
    create: {
      id: string;
      accountId: string;
      symbol: string;
      mode: string;
      positionId?: string;
      holdingPeak: number;
      peakAt: Date;
      positionUpdatedAt?: Date;
      lastQuantity: number;
      lastPrice: number;
    };
    update: {
      holdingPeak: number;
      peakAt: Date;
      positionUpdatedAt?: Date;
      positionId?: string;
      lastQuantity: number;
      lastPrice: number;
    };
  }) => Promise<unknown>;
};

type RiskRuleTriggerStateRecord = {
  id: string;
  ruleId: string;
  targetKey: string;
  symbol: string;
  mode: string;
  positionId: string | null;
  ruleVersion: number;
  breachActive: boolean;
  activeEventId: string | null;
  lastScanId: string | null;
  triggeredAt: Date | null;
};

type RiskRuleTriggerStateDelegate = {
  upsert: (args: {
    where: {
      ruleId_targetKey_symbol_mode: {
        ruleId: string;
        targetKey: string;
        symbol: string;
        mode: string;
      };
    };
    create: {
      id: string;
      ruleId: string;
      targetKey: string;
      symbol: string;
      mode: string;
      positionId?: string;
      ruleVersion: number;
      breachActive: boolean;
      lastScanId?: string;
    };
    update: {
      positionId?: string | null;
      ruleVersion?: number;
      breachActive?: boolean;
      activeEventId?: string | null;
      lastScanId?: string | null;
      triggeredAt?: Date | null;
    };
  }) => Promise<RiskRuleTriggerStateRecord>;
  updateMany: (args: {
    where: {
      ruleId: string;
      targetKey: string;
      symbol: string;
      mode: string;
      ruleVersion: number;
      breachActive: boolean;
    };
    data: {
      breachActive: boolean;
      lastScanId?: string | null;
      triggeredAt?: Date | null;
      activeEventId?: string | null;
    };
  }) => Promise<{ count: number }>;
  findUnique: (args: {
    where: {
      ruleId_targetKey_symbol_mode: {
        ruleId: string;
        targetKey: string;
        symbol: string;
        mode: string;
      };
    };
  }) => Promise<RiskRuleTriggerStateRecord | null>;
  update: (args: {
    where: { id: string };
    data: {
      positionId?: string | null;
      ruleVersion?: number;
      activeEventId?: string | null;
      lastScanId?: string | null;
      breachActive: boolean;
      triggeredAt?: Date | null;
    };
  }) => Promise<RiskRuleTriggerStateRecord>;
};

type RiskEventRecord = {
  id: string;
  [key: string]: unknown;
};

type RiskEventDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<RiskEventRecord>;
  findUnique?: (args: { where: { dedupeKey: string } }) => Promise<RiskEventRecord | null>;
};

type NotificationDeliveryRecord = { status: string };

type NotificationDeliveryDelegate = {
  findMany: (args: { where: { eventId: string } }) => Promise<NotificationDeliveryRecord[]>;
};

const marketDataRuleKinds: ReadonlySet<string> = new Set([
  'fixed-stop',
  'cost-stop',
  'take-profit',
  'price-above',
  'price-below',
  'trailing-stop',
  'drawdown',
  'ma',
  'rsi',
  'macd',
  'atr',
  'volume',
  'chip-peak',
  'chip-ratio',
  'chip-migration',
]);

const notificationPolicy = {
  channels: {
    info: ['feishu'],
    warning: ['feishu'],
    error: ['feishu'],
    critical: ['feishu'],
  },
  cooldownMinutes: 30,
  maxAttempts: 3,
  criticalBypassCooldown: true,
};

const latestByMarketTime = <T extends { marketTime: string }>(values: readonly T[]) =>
  [...values].sort((left, right) => right.marketTime.localeCompare(left.marketTime))[0];

const aggregateDataQuality = (contexts: readonly SecurityContext[]): Record<string, string> =>
  contexts.reduce<Record<string, string>>(
    (combined, context) => ({ ...combined, ...context.dataQuality }),
    {},
  );

const aggregatePositions = (contexts: readonly SecurityContext[]) => {
  const explicit = latestByMarketTime(
    contexts.filter((context) => context.positions !== undefined),
  );
  if (explicit?.positions) return explicit.positions;
  const bySymbol = new Map<string, PositionContext>();
  for (const context of contexts) {
    if (context.weight === undefined) continue;
    bySymbol.set(context.symbol, { symbol: context.symbol, weight: context.weight });
  }
  return bySymbol.size > 0 ? [...bySymbol.values()] : undefined;
};

const toDomainPositions = (
  positions: readonly PositionContext[] | undefined,
): CompleteRiskContext['positions'] =>
  positions?.map((position) => ({
    symbol: position.symbol,
    weight: position.weight,
    ...(position.sector === undefined ? {} : { sector: position.sector }),
    ...(position.assetType === undefined ? {} : { assetType: position.assetType }),
    ...(position.volatility === undefined ? {} : { volatility: position.volatility }),
  }));

const deriveAccountContexts = (security: readonly SecurityContext[]): AccountContext[] => {
  const grouped = new Map<string, SecurityContext[]>();
  for (const context of security) {
    if (!context.accountId) continue;
    const group = grouped.get(context.accountId) ?? [];
    group.push(context);
    grouped.set(context.accountId, group);
  }
  return [...grouped.entries()].map(([accountId, contexts]) => {
    const latest = latestByMarketTime(contexts)!;
    const aggregateSource = latestByMarketTime(
      contexts.filter(
        (context) =>
          context.portfolioValues !== undefined ||
          context.performance !== undefined ||
          context.returns !== undefined,
      ),
    );
    const positions = aggregatePositions(contexts);
    return riskAccountContextSchema.parse({
      accountId,
      mode: latest.mode,
      marketTime: latest.marketTime,
      dataQuality: aggregateDataQuality(contexts),
      ...(positions === undefined ? {} : { positions }),
      ...(aggregateSource?.portfolioValues === undefined
        ? {}
        : { portfolioValues: aggregateSource.portfolioValues }),
      ...(aggregateSource?.performance === undefined
        ? {}
        : { performance: aggregateSource.performance }),
      ...(aggregateSource?.returns === undefined ? {} : { returns: aggregateSource.returns }),
    });
  });
};

const derivePortfolioContext = (
  security: readonly SecurityContext[],
): PortfolioContext | undefined => {
  if (security.length === 0) return undefined;
  const latest = latestByMarketTime(security)!;
  const aggregateSource = latestByMarketTime(
    security.filter(
      (context) =>
        context.portfolioValues !== undefined ||
        context.performance !== undefined ||
        context.returns !== undefined,
    ),
  );
  const positions = aggregatePositions(security);
  return riskPortfolioContextSchema.parse({
    mode: latest.mode,
    marketTime: latest.marketTime,
    dataQuality: aggregateDataQuality(security),
    ...(positions === undefined ? {} : { positions }),
    ...(aggregateSource?.portfolioValues === undefined
      ? {}
      : { portfolioValues: aggregateSource.portfolioValues }),
    ...(aggregateSource?.performance === undefined
      ? {}
      : { performance: aggregateSource.performance }),
    ...(aggregateSource?.returns === undefined ? {} : { returns: aggregateSource.returns }),
  });
};

@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async createRule(input: unknown) {
    const rule = riskRuleInputSchema.parse(input);
    return this.prisma.$transaction(async (transaction) => {
      await this.assertRuleTarget(transaction, rule, true);
      const created = await transaction.riskRule.create({ data: this.ruleData(rule) });
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: created.id,
          ruleVersion: created.version,
          action: 'create',
          actor: 'local-user',
          after: this.snapshot(created),
        },
      });
      return created;
    });
  }

  listRules() {
    return this.prisma.riskRule.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async updateRule(id: string, input: unknown) {
    const patch = riskRuleUpdateSchema.parse(input);
    const enableRequested =
      input !== null &&
      typeof input === 'object' &&
      (input as Record<string, unknown>).enabled === true;
    return this.prisma.$transaction(async (transaction) => {
      const stored = await transaction.riskRule.findUniqueOrThrow({ where: { id } });
      const mergedInput = {
        kind: stored.kind,
        scope: stored.scope,
        severity: stored.severity,
        threshold: Number(stored.threshold),
        enabled: stored.enabled,
        ...(stored.symbol === null ? {} : { symbol: stored.symbol }),
        ...(stored.accountId === null ? {} : { accountId: stored.accountId }),
        ...(stored.sourcePlanId === null ? {} : { sourcePlanId: stored.sourcePlanId }),
        ...(stored.condition === null ? {} : { condition: stored.condition }),
        ...(stored.parameters === null ? {} : { parameters: stored.parameters }),
        ...(stored.config === null ? {} : { config: stored.config }),
        effectiveAt: stored.effectiveAt.toISOString(),
        ...patch,
      };
      const needsRepair =
        requiresRiskRuleAccount(String(mergedInput.kind), String(mergedInput.scope)) &&
        !mergedInput.accountId;
      if (needsRepair && enableRequested)
        throw new BadRequestException('该规则需要先补齐账户和标的后才能启用');
      const merged = needsRepair
        ? riskRuleStoredSchema.parse({ ...mergedInput, enabled: false })
        : riskRuleInputSchema.parse(mergedInput);
      const targetChanged =
        (patch.kind !== undefined && patch.kind !== stored.kind) ||
        (patch.scope !== undefined && patch.scope !== stored.scope) ||
        (patch.symbol !== undefined && patch.symbol !== stored.symbol) ||
        (patch.accountId !== undefined && patch.accountId !== stored.accountId);
      if (targetChanged && needsRepair)
        throw new BadRequestException('该规则需要同时补齐账户和标的后才能保存');
      if (!needsRepair && (targetChanged || enableRequested))
        await this.assertRuleTarget(transaction, merged, true);
      const updated = await transaction.riskRule.update({
        where: { id },
        data: {
          ...this.ruleData(merged),
          needsRepair,
          repairReason: needsRepair ? 'account-binding-required' : null,
          version: { increment: 1 },
        },
      });
      const action = patch.enabled === undefined ? 'update' : patch.enabled ? 'enable' : 'disable';
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: id,
          ruleVersion: updated.version,
          action,
          actor: 'local-user',
          before: this.snapshot(stored),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  private async assertRuleTarget(
    transaction: Prisma.TransactionClient,
    rule: {
      kind: string;
      scope: string;
      accountId?: string | undefined;
      symbol?: string | undefined;
    },
    requirePosition: boolean,
  ) {
    const accountBound = rule.scope === 'account' || requiresRiskRuleAccount(rule.kind, rule.scope);
    if (!accountBound || !rule.accountId) return;
    const account = await transaction.account.findUnique({
      where: { id: rule.accountId },
      select: { id: true, active: true },
    });
    if (!account) throw new BadRequestException('绑定账户不存在');
    if (!account.active) throw new BadRequestException('绑定账户已停用');
    if (!requiresRiskRuleAccount(rule.kind, rule.scope) || !requirePosition) return;
    if (!rule.symbol) throw new BadRequestException('价格类持仓规则必须绑定证券标的');
    const position = await transaction.position.findUnique({
      where: { accountId_symbol: { accountId: rule.accountId, symbol: rule.symbol } },
      select: { id: true, quantity: true },
    });
    if (!position || Number(position.quantity) <= 0)
      throw new BadRequestException('绑定标的不在该账户当前持仓中');
  }

  archiveRule(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const stored = await transaction.riskRule.findUniqueOrThrow({ where: { id } });
      const updated = await transaction.riskRule.update({
        where: { id },
        data: { enabled: false, version: { increment: 1 } },
      });
      await transaction.riskRuleAudit.create({
        data: {
          ruleId: id,
          ruleVersion: updated.version,
          action: 'delete',
          actor: 'local-user',
          before: this.snapshot(stored),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  async testRule(id: string, input: unknown) {
    let parsed = this.parseScanInput(input);
    this.rejectStaleContexts(parsed);
    parsed = await this.enrichHoldingPeaks(parsed, false);
    const stored = await this.prisma.riskRule.findUniqueOrThrow({ where: { id } });
    const events = this.evaluateStoredRule(stored, parsed).map(({ event }) => event);
    await this.prisma.riskRuleAudit.create({
      data: {
        ruleId: id,
        ruleVersion: stored.version,
        action: 'test',
        actor: 'local-user',
        after: { eventCount: events.length },
      },
    });
    return events;
  }

  audit(id: string) {
    return this.prisma.riskRuleAudit.findMany({
      where: { ruleId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async scan(input: unknown) {
    let parsed = this.parseScanInput(input);
    this.rejectStaleContexts(parsed);
    parsed = await this.enrichHoldingPeaks(parsed, true);
    const scanId = parsed.scanId ?? crypto.randomUUID();
    const rules = await this.prisma.riskRule.findMany({
      where: { enabled: true, needsRepair: false, effectiveAt: { lte: new Date() } },
    });
    const traceId = crypto.randomUUID();
    const results: Array<{ ruleId: string; eventId?: string; error?: string }> = [];
    for (const stored of rules) {
      try {
        for (const { candidate, event } of this.evaluateStoredRule(stored, parsed)) {
          if (stored.kind === 'trailing-stop') {
            const outcome = await this.persistTrailingEvent(
              stored,
              candidate,
              event,
              scanId,
              traceId,
            );
            if (!outcome.eventId) continue;
            try {
              await this.enqueueNotificationIfNeeded(
                outcome.eventId,
                event.severity,
                candidate.mode,
                outcome.created,
              );
              results.push({ ruleId: stored.id, eventId: outcome.eventId });
            } catch (notificationError) {
              results.push({
                ruleId: stored.id,
                eventId: outcome.eventId,
                error: `风险已记录，通知排队失败：${notificationError instanceof Error ? notificationError.message : '未知错误'}`,
              });
            }
            continue;
          }
          const outcome = await this.persistRegularEvent(stored, candidate, event, scanId, traceId);
          if (!outcome.eventId) continue;
          try {
            await this.enqueueNotificationIfNeeded(
              outcome.eventId,
              event.severity,
              candidate.mode,
              outcome.created,
            );
            results.push({ ruleId: stored.id, eventId: outcome.eventId });
          } catch (notificationError) {
            results.push({
              ruleId: stored.id,
              eventId: outcome.eventId,
              error: `风险已记录，通知排队失败：${notificationError instanceof Error ? notificationError.message : '未知错误'}`,
            });
          }
        }
      } catch (error) {
        results.push({
          ruleId: stored.id,
          error: error instanceof Error ? error.message : '规则评估失败',
        });
      }
    }
    return { traceId, scanId, results };
  }

  private riskEventDelegate(prisma: unknown = this.prisma): RiskEventDelegate | null {
    const delegate = (prisma as PrismaService & { riskEvent?: unknown }).riskEvent;
    if (!delegate || typeof delegate !== 'object') return null;
    const candidate = delegate as { create?: unknown; findUnique?: unknown };
    if (typeof candidate.create !== 'function') return null;
    return candidate as unknown as RiskEventDelegate;
  }

  private notificationDeliveryDelegate(
    prisma: unknown = this.prisma,
  ): NotificationDeliveryDelegate | null {
    const delegate = (prisma as PrismaService & { notificationDelivery?: unknown })
      .notificationDelivery;
    if (!delegate || typeof delegate !== 'object') return null;
    const candidate = delegate as { findMany?: unknown };
    if (typeof candidate.findMany !== 'function') return null;
    return candidate as unknown as NotificationDeliveryDelegate;
  }

  private eventDedupeKey(scanId: string, stored: StoredRule, candidate: EvaluationCandidate) {
    return [
      scanId,
      stored.id,
      stored.version,
      candidate.mode,
      candidate.scope,
      candidate.accountId ?? 'all',
      candidate.symbol ?? candidate.domain.symbol,
    ].join(':');
  }

  private eventData(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: NonNullable<ReturnType<typeof evaluateCompleteRule>>,
    scanId: string,
    traceId: string,
    dedupeKey: string,
  ): Record<string, unknown> {
    return {
      ruleId: stored.id,
      ruleVersion: stored.version,
      triggered: true,
      severity: event.severity,
      message: event.message,
      mode: candidate.mode,
      scanId,
      dedupeKey,
      ...(candidate.accountId === undefined ? {} : { accountId: candidate.accountId }),
      ...(candidate.scope === 'security' && candidate.symbol ? { symbol: candidate.symbol } : {}),
      triggerValue: event.context.value,
      threshold: Number(stored.threshold),
      marketTime: new Date(candidate.marketTime),
      context: {
        ...event.context,
        mode: candidate.mode,
        scope: candidate.scope,
        traceId,
        scanId,
        dataQuality: candidate.dataQuality,
        ...(candidate.affectedAccountIds === undefined
          ? {}
          : { affectedAccountIds: candidate.affectedAccountIds }),
      },
    };
  }

  private async persistRiskEvent(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: NonNullable<ReturnType<typeof evaluateCompleteRule>>,
    scanId: string,
    traceId: string,
    dedupeKey: string,
    prisma: unknown = this.prisma,
  ): Promise<{ eventId: string; created: boolean }> {
    const delegate = this.riskEventDelegate(prisma);
    if (!delegate) throw new Error('RiskEvent 数据访问不可用');
    const data = this.eventData(stored, candidate, event, scanId, traceId, dedupeKey);
    try {
      const saved = await delegate.create({ data });
      return { eventId: saved.id, created: true };
    } catch (error) {
      if (!delegate.findUnique) throw error;
      const existing = await delegate.findUnique({ where: { dedupeKey } });
      if (!existing) throw error;
      return { eventId: existing.id, created: false };
    }
  }

  private async persistRegularEvent(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: NonNullable<ReturnType<typeof evaluateCompleteRule>>,
    scanId: string,
    traceId: string,
  ): Promise<{ eventId?: string; created: boolean }> {
    const triggerState = this.riskRuleTriggerStateDelegate();
    const dedupeKey = this.eventDedupeKey(scanId, stored, candidate);
    if (!triggerState) {
      if (!event.triggered) return { created: false };
      return this.persistRiskEvent(stored, candidate, event, scanId, traceId, dedupeKey);
    }

    const targetKey = candidate.accountId ?? 'all';
    const symbol = candidate.symbol ?? candidate.domain.symbol;
    return this.withTransaction(async (client) => {
      const stateDelegate = this.riskRuleTriggerStateDelegate(client);
      if (!stateDelegate) throw new Error('RiskRuleTriggerState 数据访问不可用');
      let state = await stateDelegate.findUnique({
        where: {
          ruleId_targetKey_symbol_mode: {
            ruleId: stored.id,
            targetKey,
            symbol,
            mode: candidate.mode,
          },
        },
      });
      if (!state && !event.triggered) return { created: false };
      if (!state) {
        state = await stateDelegate.upsert({
          where: {
            ruleId_targetKey_symbol_mode: {
              ruleId: stored.id,
              targetKey,
              symbol,
              mode: candidate.mode,
            },
          },
          create: {
            id: crypto.randomUUID(),
            ruleId: stored.id,
            targetKey,
            symbol,
            mode: candidate.mode,
            ...(candidate.domain.positionId === undefined
              ? {}
              : { positionId: candidate.domain.positionId }),
            ruleVersion: stored.version,
            breachActive: false,
          },
          update: { ruleVersion: stored.version },
        });
      }

      const positionChanged =
        candidate.domain.positionId !== undefined &&
        state.positionId !== candidate.domain.positionId;
      const versionChanged = state.ruleVersion !== stored.version;
      if (positionChanged || versionChanged) {
        state = await stateDelegate.update({
          where: { id: state.id },
          data: {
            ...(candidate.domain.positionId === undefined
              ? {}
              : { positionId: candidate.domain.positionId }),
            ruleVersion: stored.version,
            breachActive: false,
            activeEventId: null,
            lastScanId: null,
            triggeredAt: null,
          },
        });
      }

      if (!event.triggered) {
        if (state.activeEventId !== null) {
          await stateDelegate.update({
            where: { id: state.id },
            data: {
              breachActive: false,
              activeEventId: null,
              lastScanId: scanId,
              triggeredAt: null,
            },
          });
        }
        return { created: false };
      }

      if (state.activeEventId && state.lastScanId === scanId)
        return { eventId: state.activeEventId, created: false };
      if (
        candidate.mode === 'actual' &&
        state.activeEventId &&
        (await this.shouldRetryNotification(state.activeEventId, client))
      ) {
        return { eventId: state.activeEventId, created: false };
      }

      const outcome = await this.persistRiskEvent(
        stored,
        candidate,
        event,
        scanId,
        traceId,
        dedupeKey,
        client,
      );
      await stateDelegate.update({
        where: { id: state.id },
        data: {
          ruleVersion: stored.version,
          breachActive: false,
          activeEventId: outcome.eventId,
          lastScanId: scanId,
          triggeredAt: new Date(),
        },
      });
      return outcome;
    });
  }

  private async persistTrailingEvent(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: NonNullable<ReturnType<typeof evaluateCompleteRule>>,
    scanId: string,
    traceId: string,
  ): Promise<{ eventId?: string; created: boolean }> {
    const triggerState = this.riskRuleTriggerStateDelegate();
    const dedupeKey = this.eventDedupeKey(scanId, stored, candidate);
    if (!triggerState) {
      if (!event.triggered) return { created: false };
      return this.persistRiskEvent(stored, candidate, event, scanId, traceId, dedupeKey);
    }

    const targetKey = candidate.accountId ?? 'all';
    const symbol = candidate.symbol ?? candidate.domain.symbol;
    return this.withTransaction(async (client) => {
      const stateDelegate = this.riskRuleTriggerStateDelegate(client);
      if (!stateDelegate) throw new Error('RiskRuleTriggerState 数据访问不可用');
      let state = await stateDelegate.findUnique({
        where: {
          ruleId_targetKey_symbol_mode: {
            ruleId: stored.id,
            targetKey,
            symbol,
            mode: candidate.mode,
          },
        },
      });
      if (!state) {
        state = await stateDelegate.upsert({
          where: {
            ruleId_targetKey_symbol_mode: {
              ruleId: stored.id,
              targetKey,
              symbol,
              mode: candidate.mode,
            },
          },
          create: {
            id: crypto.randomUUID(),
            ruleId: stored.id,
            targetKey,
            symbol,
            mode: candidate.mode,
            ...(candidate.domain.positionId === undefined
              ? {}
              : { positionId: candidate.domain.positionId }),
            ruleVersion: stored.version,
            breachActive: false,
          },
          update: { ruleVersion: stored.version },
        });
      }

      const positionChanged =
        candidate.domain.positionId !== undefined &&
        state.positionId !== candidate.domain.positionId;
      const versionChanged = state.ruleVersion !== stored.version;
      if (positionChanged || versionChanged) {
        state = await stateDelegate.update({
          where: { id: state.id },
          data: {
            positionId:
              candidate.domain.positionId === undefined
                ? state.positionId
                : candidate.domain.positionId,
            ruleVersion: stored.version,
            breachActive: false,
            activeEventId: null,
            lastScanId: null,
            triggeredAt: null,
          },
        });
      }

      if (!event.triggered) {
        if (state.breachActive || state.activeEventId !== null) {
          await stateDelegate.update({
            where: { id: state.id },
            data: {
              breachActive: false,
              activeEventId: null,
              lastScanId: scanId,
              triggeredAt: null,
            },
          });
        }
        return { created: false };
      }

      if (state.breachActive && state.activeEventId) {
        return { eventId: state.activeEventId, created: false };
      }

      const claim = await stateDelegate.updateMany({
        where: {
          ruleId: stored.id,
          targetKey,
          symbol,
          mode: candidate.mode,
          ruleVersion: stored.version,
          breachActive: false,
        },
        data: {
          breachActive: true,
          lastScanId: scanId,
          triggeredAt: new Date(),
          activeEventId: null,
        },
      });
      if (claim.count === 0) {
        const current = await stateDelegate.findUnique({
          where: {
            ruleId_targetKey_symbol_mode: {
              ruleId: stored.id,
              targetKey,
              symbol,
              mode: candidate.mode,
            },
          },
        });
        return current?.activeEventId
          ? { eventId: current.activeEventId, created: false }
          : { created: false };
      }

      const outcome = await this.persistRiskEvent(
        stored,
        candidate,
        event,
        scanId,
        traceId,
        dedupeKey,
        client,
      );
      await stateDelegate.update({
        where: { id: state.id },
        data: {
          breachActive: true,
          activeEventId: outcome.eventId,
          lastScanId: scanId,
          triggeredAt: new Date(),
        },
      });
      return outcome;
    });
  }

  private async shouldRetryNotification(eventId: string, prisma: unknown = this.prisma) {
    const delegate = this.notificationDeliveryDelegate(prisma);
    if (!delegate) return false;
    const deliveries = await delegate.findMany({ where: { eventId } });
    if (deliveries.length === 0) return true;
    return deliveries.some((delivery) => ['failed', 'error'].includes(delivery.status));
  }

  private async enqueueNotificationIfNeeded(
    eventId: string,
    severity: string,
    mode: PortfolioMode,
    created: boolean,
  ) {
    if (mode === 'shadow') return;
    if (!created && !(await this.shouldRetryNotification(eventId))) return;
    await this.notifications.enqueue(
      eventId,
      severity as Parameters<NotificationService['enqueue']>[1],
      notificationPolicy,
    );
  }

  history(mode: PortfolioMode = 'actual', options: { cursor?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 200);
    return this.prisma.riskEvent.findMany({
      where: { mode },
      orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
  }

  private ruleData(rule: ReturnType<typeof riskRuleStoredSchema.parse>) {
    return {
      kind: rule.kind,
      scope: rule.scope,
      severity: rule.severity,
      threshold: rule.threshold,
      enabled: rule.enabled,
      needsRepair: false,
      repairReason: null,
      ...(rule.symbol === undefined ? {} : { symbol: rule.symbol }),
      ...(rule.accountId === undefined ? {} : { accountId: rule.accountId }),
      ...(rule.sourcePlanId === undefined ? {} : { sourcePlanId: rule.sourcePlanId }),
      ...(rule.condition === undefined
        ? {}
        : { condition: rule.condition as Prisma.InputJsonValue }),
      ...(rule.parameters === undefined
        ? {}
        : { parameters: rule.parameters as Prisma.InputJsonValue }),
      ...(rule.config === undefined ? {} : { config: rule.config as Prisma.InputJsonValue }),
      ...(rule.effectiveAt === undefined ? {} : { effectiveAt: new Date(rule.effectiveAt) }),
    };
  }

  private parseScanInput(input: unknown): ParsedScan {
    if (Array.isArray(input)) return this.fromLegacySecurity(input, false);
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    if ('security' in raw || 'accounts' in raw || 'portfolio' in raw) {
      const envelope = riskScanEnvelopeSchema.parse(raw);
      const derivedAccounts = deriveAccountContexts(envelope.security);
      const accountIds = new Set(envelope.accounts.map((context) => context.accountId));
      const accounts = [
        ...envelope.accounts,
        ...derivedAccounts.filter((context) => !accountIds.has(context.accountId)),
      ];
      const portfolio = envelope.portfolio ?? derivePortfolioContext(envelope.security);
      const parsed: ParsedScan = {
        security: envelope.security,
        accounts,
        allowStale: envelope.allowStale,
        ...(envelope.scanId === undefined ? {} : { scanId: envelope.scanId }),
        ...(portfolio ? { portfolio } : {}),
      };
      this.assertSingleMode(parsed);
      return parsed;
    }
    return this.fromLegacySecurity(raw.contexts, raw.allowStale === true);
  }

  private fromLegacySecurity(input: unknown, allowStale: boolean): ParsedScan {
    const security = riskScanContextSchema.array().parse(input);
    const portfolio = derivePortfolioContext(security);
    const parsed: ParsedScan = {
      security,
      accounts: deriveAccountContexts(security),
      allowStale,
      ...(portfolio ? { portfolio } : {}),
    };
    this.assertSingleMode(parsed);
    return parsed;
  }

  private assertSingleMode(scan: ParsedScan) {
    const modes = new Set<PortfolioMode>([
      ...scan.security.map((context) => context.mode),
      ...scan.accounts.map((context) => context.mode),
      ...(scan.portfolio ? [scan.portfolio.mode] : []),
    ]);
    if (modes.size > 1)
      throw new BadRequestException('单次 Risk scan 不能混合 actual 与 shadow mode');
  }

  private rejectStaleContexts(scan: ParsedScan) {
    if (scan.allowStale) return;
    const qualities = [
      ...scan.security.map((context) => context.dataQuality),
      ...scan.accounts.map((context) => context.dataQuality),
      ...(scan.portfolio ? [scan.portfolio.dataQuality] : []),
    ];
    if (
      qualities.some(
        (quality) =>
          quality.freshness === 'stale' ||
          quality.marketData === 'stale' ||
          quality.status === 'stale',
      )
    )
      throw new BadRequestException('行情陈旧，Risk 默认拒绝评估；请在允许陈旧数据后重试');
  }

  private riskPositionStateDelegate(
    prisma: unknown = this.prisma,
  ): RiskPositionStateDelegate | null {
    const delegate = (prisma as PrismaService & { riskPositionState?: unknown }).riskPositionState;
    if (!delegate || typeof delegate !== 'object') return null;
    const candidate = delegate as { findMany?: unknown; upsert?: unknown };
    if (typeof candidate.findMany !== 'function' || typeof candidate.upsert !== 'function')
      return null;
    return candidate as unknown as RiskPositionStateDelegate;
  }

  private riskRuleTriggerStateDelegate(
    prisma: unknown = this.prisma,
  ): RiskRuleTriggerStateDelegate | null {
    const delegate = (prisma as PrismaService & { riskRuleTriggerState?: unknown })
      .riskRuleTriggerState;
    if (!delegate || typeof delegate !== 'object') return null;
    const candidate = delegate as {
      upsert?: unknown;
      updateMany?: unknown;
      findUnique?: unknown;
      update?: unknown;
    };
    if (
      typeof candidate.upsert !== 'function' ||
      typeof candidate.updateMany !== 'function' ||
      typeof candidate.findUnique !== 'function' ||
      typeof candidate.update !== 'function'
    )
      return null;
    return candidate as unknown as RiskRuleTriggerStateDelegate;
  }

  private async withTransaction<T>(callback: (client: PrismaService) => Promise<T>): Promise<T> {
    const transaction = this.prisma as PrismaService & {
      $transaction?: (fn: (client: PrismaService) => Promise<T>) => Promise<T>;
    };
    if (typeof transaction.$transaction !== 'function') return callback(this.prisma);
    return transaction.$transaction(callback);
  }

  private async enrichHoldingPeaks(scan: ParsedScan, persist: boolean): Promise<ParsedScan> {
    const contexts = scan.security.filter(
      (context) =>
        context.accountId &&
        context.price !== undefined &&
        context.price > 0 &&
        !Object.values(context.dataQuality).some((value) => value === 'stale'),
    );
    if (contexts.length === 0) return scan;
    const delegate = this.riskPositionStateDelegate();
    if (!delegate) return scan;

    const mode = contexts[0]!.mode;
    const accountIds = [...new Set(contexts.map((context) => context.accountId!))];
    const symbols = [...new Set(contexts.map((context) => context.symbol))];
    const states = await delegate.findMany({
      where: { accountId: { in: accountIds }, symbol: { in: symbols }, mode },
    });
    const statesByKey = new Map(
      states.map((state) => [
        this.positionStateKey(state.accountId, state.symbol, state.mode),
        state,
      ]),
    );
    const latestByKey = new Map<string, SecurityContext>();
    for (const context of contexts) {
      const key = this.positionStateKey(context.accountId!, context.symbol, context.mode);
      const current = latestByKey.get(key);
      if (!current || current.marketTime < context.marketTime) latestByKey.set(key, context);
    }

    const peaksByKey = new Map<string, number>();
    for (const [key, context] of latestByKey) {
      const state = statesByKey.get(key);
      const positionUpdatedAt = context.positionUpdatedAt
        ? new Date(context.positionUpdatedAt)
        : undefined;
      let positionChanged = false;
      if (state && context.positionId !== undefined) {
        positionChanged = state.positionId !== context.positionId;
      } else if (
        state &&
        state.positionId === null &&
        state.positionUpdatedAt !== null &&
        state.positionUpdatedAt !== undefined &&
        positionUpdatedAt !== undefined
      ) {
        positionChanged = state.positionUpdatedAt.getTime() !== positionUpdatedAt.getTime();
      }
      const currentPrice = context.price!;
      const firstObservation = state === undefined;
      const previousPeak =
        firstObservation || positionChanged ? 0 : Number(state?.holdingPeak ?? 0);
      const suppliedPeak = firstObservation || positionChanged ? 0 : (context.holdingPeak ?? 0);
      const holdingPeak = Math.max(currentPrice, previousPeak, suppliedPeak);
      const peakAt =
        state && Number(state.holdingPeak) >= holdingPeak
          ? state.peakAt
          : new Date(context.marketTime);
      peaksByKey.set(key, holdingPeak);

      if (persist) {
        await delegate.upsert({
          where: {
            accountId_symbol_mode: {
              accountId: context.accountId!,
              symbol: context.symbol,
              mode: context.mode,
            },
          },
          create: {
            id: crypto.randomUUID(),
            accountId: context.accountId!,
            symbol: context.symbol,
            mode: context.mode,
            ...(context.positionId === undefined ? {} : { positionId: context.positionId }),
            holdingPeak,
            peakAt,
            ...(positionUpdatedAt ? { positionUpdatedAt } : {}),
            lastQuantity: context.quantity ?? 0,
            lastPrice: currentPrice,
          },
          update: {
            holdingPeak,
            peakAt,
            ...(positionUpdatedAt ? { positionUpdatedAt } : {}),
            ...(context.positionId === undefined ? {} : { positionId: context.positionId }),
            lastQuantity: context.quantity ?? Number(state?.lastQuantity ?? 0),
            lastPrice: currentPrice,
          },
        });
      }
    }

    return {
      ...scan,
      security: scan.security.map((context) => {
        if (!context.accountId || context.price === undefined) return context;
        const key = this.positionStateKey(context.accountId, context.symbol, context.mode);
        const holdingPeak = peaksByKey.get(key);
        return holdingPeak === undefined ? context : { ...context, holdingPeak };
      }),
    };
  }

  private positionStateKey(accountId: string, symbol: string, mode: string) {
    return `${accountId}:${symbol}:${mode}`;
  }

  private snapshot(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private toRule(stored: StoredRule): RiskRule {
    return {
      id: stored.id,
      version: stored.version,
      kind: stored.kind as RiskRule['kind'],
      scope: stored.scope as RiskRule['scope'],
      severity: stored.severity as RiskRule['severity'],
      threshold: Number(stored.threshold),
      enabled: stored.enabled,
      ...(stored.symbol === null ? {} : { symbol: stored.symbol }),
      ...(stored.accountId === null ? {} : { accountId: stored.accountId }),
      ...(stored.parameters && typeof stored.parameters === 'object'
        ? { parameters: stored.parameters as Record<string, unknown> }
        : {}),
    };
  }

  private securityCandidate(
    context: SecurityContext,
    weight = context.weight,
    affectedAccountIds?: string[],
  ): EvaluationCandidate {
    const positions = toDomainPositions(context.positions);
    const chip =
      context.chip === undefined
        ? undefined
        : {
            profitRatio: context.chip.profitRatio,
            concentration: context.chip.concentration,
            engineVersion: context.chip.engineVersion,
            calculatedAt: context.chip.calculatedAt,
            ...(context.chip.mainPeak === undefined ? {} : { mainPeak: context.chip.mainPeak }),
            ...(context.chip.previousMainPeaks === undefined
              ? {}
              : { previousMainPeaks: context.chip.previousMainPeaks }),
          };
    return {
      scope: 'security',
      mode: context.mode,
      marketTime: context.marketTime,
      dataQuality: context.dataQuality,
      symbol: context.symbol,
      ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
      ...(affectedAccountIds === undefined ? {} : { affectedAccountIds }),
      domain: {
        symbol: context.symbol,
        ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
        ...(context.positionId === undefined ? {} : { positionId: context.positionId }),
        ...(context.quantity === undefined ? {} : { quantity: context.quantity }),
        ...(context.positionUpdatedAt === undefined
          ? {}
          : { positionUpdatedAt: context.positionUpdatedAt }),
        marketTime: context.marketTime,
        ...(context.price === undefined ? {} : { price: context.price }),
        ...(context.costPrice === undefined ? {} : { costPrice: context.costPrice }),
        ...(weight === undefined ? {} : { weight }),
        ...(context.accountWeight === undefined ? {} : { accountWeight: context.accountWeight }),
        ...(context.holdingPeak === undefined ? {} : { holdingPeak: context.holdingPeak }),
        ...(context.portfolioValues === undefined
          ? {}
          : { portfolioValues: context.portfolioValues }),
        ...(context.indicators === undefined ? {} : { indicators: context.indicators }),
        ...(chip === undefined ? {} : { chip }),
        ...(positions === undefined ? {} : { positions }),
        ...(context.returns === undefined ? {} : { returns: context.returns }),
        dataQuality: context.dataQuality,
      },
    };
  }

  private accountCandidate(context: AccountContext): EvaluationCandidate {
    const positions = toDomainPositions(context.positions);
    return {
      scope: 'account',
      mode: context.mode,
      marketTime: context.marketTime,
      dataQuality: context.dataQuality,
      accountId: context.accountId,
      domain: {
        symbol: `@account:${context.accountId}`,
        marketTime: context.marketTime,
        ...(context.portfolioValues === undefined
          ? {}
          : { portfolioValues: context.portfolioValues }),
        ...(positions === undefined ? {} : { positions }),
        ...(context.returns === undefined ? {} : { returns: context.returns }),
        dataQuality: context.dataQuality,
      },
    };
  }

  private portfolioCandidate(context: PortfolioContext): EvaluationCandidate {
    const positions = toDomainPositions(context.positions);
    return {
      scope: 'portfolio',
      mode: context.mode,
      marketTime: context.marketTime,
      dataQuality: context.dataQuality,
      domain: {
        symbol: '@portfolio',
        marketTime: context.marketTime,
        ...(context.portfolioValues === undefined
          ? {}
          : { portfolioValues: context.portfolioValues }),
        ...(positions === undefined ? {} : { positions }),
        ...(context.returns === undefined ? {} : { returns: context.returns }),
        dataQuality: context.dataQuality,
      },
    };
  }

  private latestSecurityContexts(contexts: readonly SecurityContext[]) {
    const latest = new Map<string, SecurityContext>();
    for (const context of contexts) {
      const key = this.positionStateKey(context.accountId ?? 'all', context.symbol, context.mode);
      const current = latest.get(key);
      if (!current || current.marketTime < context.marketTime) latest.set(key, context);
    }
    return [...latest.values()];
  }

  private latestSecurityContextsBySymbol(contexts: readonly SecurityContext[]) {
    const latest = new Map<string, SecurityContext>();
    for (const context of contexts) {
      const current = latest.get(context.symbol);
      if (!current || current.marketTime < context.marketTime) latest.set(context.symbol, context);
    }
    return [...latest.values()];
  }

  private candidatesForRule(rule: RiskRule, scan: ParsedScan): EvaluationCandidate[] {
    if (rule.scope === 'portfolio') {
      return scan.portfolio ? [this.portfolioCandidate(scan.portfolio)] : [];
    }
    if (rule.scope === 'account') {
      const context = scan.accounts.find((candidate) => candidate.accountId === rule.accountId);
      return context ? [this.accountCandidate(context)] : [];
    }
    const matching = scan.security.filter(
      (context) =>
        (!rule.symbol || context.symbol === rule.symbol) &&
        (!rule.accountId || context.accountId === rule.accountId),
    );
    const accountSpecific =
      Boolean(rule.accountId) || requiresRiskRuleAccount(rule.kind, rule.scope);
    if (rule.kind === 'position-concentration' && !accountSpecific) {
      const grouped = new Map<string, { context: SecurityContext; weight: number }>();
      for (const context of this.latestSecurityContexts(matching)) {
        const current = grouped.get(context.symbol);
        const weight = context.weight ?? 0;
        if (!current) grouped.set(context.symbol, { context, weight });
        else current.weight += weight;
      }
      return [...grouped.values()].map(({ context, weight }) => {
        const affectedAccountIds = [
          ...new Set(
            matching
              .filter((candidate) => candidate.symbol === context.symbol && candidate.accountId)
              .map((candidate) => candidate.accountId!),
          ),
        ].sort();
        return this.securityCandidate(
          this.globalSecurityContext(context),
          weight,
          affectedAccountIds,
        );
      });
    }
    if (accountSpecific)
      return this.latestSecurityContexts(matching).map((context) =>
        this.securityCandidate(context),
      );
    return this.latestSecurityContextsBySymbol(matching).map((context) => {
      const affectedAccountIds = [
        ...new Set(
          matching
            .filter((candidate) => candidate.symbol === context.symbol && candidate.accountId)
            .map((candidate) => candidate.accountId!),
        ),
      ].sort();
      return this.securityCandidate(
        this.globalSecurityContext(context),
        context.weight,
        affectedAccountIds,
      );
    });
  }

  private globalSecurityContext(context: SecurityContext): SecurityContext {
    const globalContext = { ...context };
    delete globalContext.accountId;
    delete globalContext.positionId;
    delete globalContext.costPrice;
    delete globalContext.quantity;
    delete globalContext.accountWeight;
    delete globalContext.positionUpdatedAt;
    delete globalContext.holdingPeak;
    return globalContext;
  }

  private evaluateStoredRule(stored: StoredRule, scan: ParsedScan) {
    const rule = this.toRule(stored);
    return this.candidatesForRule(rule, scan)
      .filter((candidate) => !this.shouldSkipStaleRule(rule.kind, candidate, scan))
      .map((candidate) => ({ candidate, event: evaluateCompleteRule(rule, candidate.domain) }))
      .filter(
        (
          result,
        ): result is {
          candidate: EvaluationCandidate;
          event: NonNullable<typeof result.event>;
        } => result.event !== null,
      );
  }

  private shouldSkipStaleRule(kind: string, candidate: EvaluationCandidate, scan: ParsedScan) {
    if (!scan.allowStale || !marketDataRuleKinds.has(kind)) return false;
    return Object.values(candidate.dataQuality).some((value) => value === 'stale');
  }
}
