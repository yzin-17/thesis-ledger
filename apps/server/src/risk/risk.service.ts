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
  riskRuleUpdateSchema,
  riskScanContextSchema,
  riskScanEnvelopeSchema,
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
  symbol: string | null;
  accountId: string | null;
  sourcePlanId?: string | null;
  parameters?: unknown;
};
type ParsedScan = {
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
  domain: CompleteRiskContext;
};

const latestByMarketTime = <T extends { marketTime: string }>(values: readonly T[]) =>
  [...values].sort((left, right) => right.marketTime.localeCompare(left.marketTime))[0];

const aggregateDataQuality = (contexts: readonly SecurityContext[]) =>
  Object.assign({}, ...contexts.map((context) => context.dataQuality));

const aggregatePositions = (contexts: readonly SecurityContext[]) => {
  const explicit = latestByMarketTime(contexts.filter((context) => context.positions !== undefined));
  if (explicit?.positions) return explicit.positions;
  const bySymbol = new Map<string, NonNullable<SecurityContext['positions']>[number]>();
  for (const context of contexts) {
    if (context.weight === undefined) continue;
    bySymbol.set(context.symbol, { symbol: context.symbol, weight: context.weight });
  }
  return bySymbol.size > 0 ? [...bySymbol.values()] : undefined;
};

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
    return riskAccountContextSchema.parse({
      accountId,
      mode: latest.mode,
      marketTime: latest.marketTime,
      dataQuality: aggregateDataQuality(contexts),
      ...(aggregatePositions(contexts) === undefined
        ? {}
        : { positions: aggregatePositions(contexts) }),
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

const derivePortfolioContext = (security: readonly SecurityContext[]): PortfolioContext | undefined => {
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
    return this.prisma.$transaction(async (transaction) => {
      const stored = await transaction.riskRule.findUniqueOrThrow({ where: { id } });
      const merged = riskRuleInputSchema.parse({
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
      });
      const updated = await transaction.riskRule.update({
        where: { id },
        data: { ...this.ruleData(merged), version: { increment: 1 } },
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
    const parsed = this.parseScanInput(input);
    this.rejectStaleContexts(parsed);
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
    const parsed = this.parseScanInput(input);
    this.rejectStaleContexts(parsed);
    const rules = await this.prisma.riskRule.findMany({
      where: { enabled: true, effectiveAt: { lte: new Date() } },
    });
    const traceId = crypto.randomUUID();
    const results: Array<{ ruleId: string; eventId?: string; error?: string }> = [];
    for (const stored of rules) {
      try {
        for (const { candidate, event } of this.evaluateStoredRule(stored, parsed)) {
          if (!event.triggered) continue;
          const saved = await this.prisma.riskEvent.create({
            data: {
              ruleId: stored.id,
              ruleVersion: stored.version,
              triggered: true,
              severity: event.severity,
              message: event.message,
              mode: candidate.mode,
              ...(candidate.accountId === undefined ? {} : { accountId: candidate.accountId }),
              ...(candidate.scope === 'security' && candidate.symbol
                ? { symbol: candidate.symbol }
                : {}),
              triggerValue: event.context.value,
              threshold: Number(stored.threshold),
              marketTime: new Date(candidate.marketTime),
              context: {
                ...event.context,
                mode: candidate.mode,
                scope: candidate.scope,
                traceId,
                dataQuality: candidate.dataQuality,
              },
            },
          });
          if (candidate.mode === 'shadow') {
            results.push({ ruleId: stored.id, eventId: saved.id });
            continue;
          }
          try {
            await this.notifications.enqueue(saved.id, event.severity, {
              channels: {
                info: ['feishu'],
                warning: ['feishu'],
                error: ['feishu'],
                critical: ['feishu'],
              },
              cooldownMinutes: 30,
              maxAttempts: 3,
              criticalBypassCooldown: true,
            });
            results.push({ ruleId: stored.id, eventId: saved.id });
          } catch (notificationError) {
            results.push({
              ruleId: stored.id,
              eventId: saved.id,
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
    return { traceId, results };
  }

  history(
    mode: PortfolioMode = 'actual',
    options: { cursor?: string; limit?: number } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 200);
    return this.prisma.riskEvent.findMany({
      where: { mode },
      orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
  }

  private ruleData(rule: ReturnType<typeof riskRuleInputSchema.parse>) {
    return {
      kind: rule.kind,
      scope: rule.scope,
      severity: rule.severity,
      threshold: rule.threshold,
      enabled: rule.enabled,
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
      const parsed: ParsedScan = {
        security: envelope.security,
        accounts,
        allowStale: envelope.allowStale,
        ...(envelope.portfolio ?? derivePortfolioContext(envelope.security)
          ? { portfolio: envelope.portfolio ?? derivePortfolioContext(envelope.security) }
          : {}),
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
    if (modes.size > 1) throw new BadRequestException('单次 Risk scan 不能混合 actual 与 shadow mode');
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

  private securityCandidate(context: SecurityContext): EvaluationCandidate {
    return {
      scope: 'security',
      mode: context.mode,
      marketTime: context.marketTime,
      dataQuality: context.dataQuality,
      symbol: context.symbol,
      ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
      domain: {
        symbol: context.symbol,
        marketTime: context.marketTime,
        ...(context.price === undefined ? {} : { price: context.price }),
        ...(context.costPrice === undefined ? {} : { costPrice: context.costPrice }),
        ...(context.weight === undefined ? {} : { weight: context.weight }),
        ...(context.holdingPeak === undefined ? {} : { holdingPeak: context.holdingPeak }),
        ...(context.portfolioValues === undefined
          ? {}
          : { portfolioValues: context.portfolioValues }),
        ...(context.indicators === undefined ? {} : { indicators: context.indicators }),
        ...(context.chip === undefined ? {} : { chip: context.chip }),
        ...(context.positions === undefined ? {} : { positions: context.positions }),
        ...(context.returns === undefined ? {} : { returns: context.returns }),
        dataQuality: context.dataQuality,
      },
    };
  }

  private accountCandidate(context: AccountContext): EvaluationCandidate {
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
        ...(context.positions === undefined ? {} : { positions: context.positions }),
        ...(context.returns === undefined ? {} : { returns: context.returns }),
        dataQuality: context.dataQuality,
      },
    };
  }

  private portfolioCandidate(context: PortfolioContext): EvaluationCandidate {
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
        ...(context.positions === undefined ? {} : { positions: context.positions }),
        ...(context.returns === undefined ? {} : { returns: context.returns }),
        dataQuality: context.dataQuality,
      },
    };
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
    const latest = latestByMarketTime(matching);
    return latest ? [this.securityCandidate(latest)] : [];
  }

  private evaluateStoredRule(stored: StoredRule, scan: ParsedScan) {
    const rule = this.toRule(stored);
    return this.candidatesForRule(rule, scan)
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
}
