import { BadRequestException, Injectable } from '@nestjs/common';
import type { CompleteRiskContext, RiskRule } from '@thesis-ledger/domain';
import {
  requiresRiskRuleAccount,
  riskAccountContextSchema,
  riskPortfolioContextSchema,
  riskScanContextSchema,
  riskScanEnvelopeSchema,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import type {
  AccountContext,
  EvaluationCandidate,
  ParsedScan,
  PortfolioContext,
  PortfolioMode,
  PositionContext,
  SecurityContext,
} from './risk-types.js';

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
export class RiskContextService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(input: unknown, persistHoldingPeaks: boolean): Promise<ParsedScan> {
    let parsed = this.parseScanInput(input);
    parsed = await this.enrichRiskLabels(parsed);
    this.rejectStaleContexts(parsed);
    return this.enrichHoldingPeaks(parsed, persistHoldingPeaks);
  }

  candidatesForRule(rule: RiskRule, scan: ParsedScan): EvaluationCandidate[] {
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
    const accountSpecific = Boolean(rule.accountId) || requiresRiskRuleAccount(rule.kind, rule.scope);
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
      return this.latestSecurityContexts(matching).map((context) => this.securityCandidate(context));
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

  shouldSkipStaleRule(kind: string, candidate: EvaluationCandidate, scan: ParsedScan) {
    if (!scan.allowStale || !marketDataRuleKinds.has(kind)) return false;
    return Object.values(candidate.dataQuality).some((value) => value === 'stale');
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

  private riskPositionStateDelegate(): RiskPositionStateDelegate | null {
    const delegate = (this.prisma as PrismaService & { riskPositionState?: unknown }).riskPositionState;
    if (!delegate || typeof delegate !== 'object') return null;
    const candidate = delegate as { findMany?: unknown; upsert?: unknown };
    if (typeof candidate.findMany !== 'function' || typeof candidate.upsert !== 'function')
      return null;
    return candidate as unknown as RiskPositionStateDelegate;
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
      const previousPeak = firstObservation || positionChanged ? 0 : Number(state?.holdingPeak ?? 0);
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

  private async enrichRiskLabels(scan: ParsedScan): Promise<ParsedScan> {
    const symbols = [
      ...new Set(
        scan.security.filter((context) => !context.assetName).map((context) => context.symbol),
      ),
    ];
    const accountIds = [
      ...new Set([
        ...scan.security
          .filter((context) => context.accountId && !context.accountName)
          .map((context) => context.accountId!),
        ...scan.accounts
          .filter((context) => !context.accountName)
          .map((context) => context.accountId),
      ]),
    ];
    const prismaWithLabels = this.prisma as PrismaService & {
      asset?: {
        findMany?: (args: {
          where: { symbol: { in: string[] } };
          select: { symbol: true; name: true };
        }) => Promise<Array<{ symbol: string; name: string }>>;
      };
      account?: {
        findMany?: (args: {
          where: { id: { in: string[] } };
          select: { id: true; name: true };
        }) => Promise<Array<{ id: string; name: string }>>;
      };
    };
    const [assets, accounts] = await Promise.all([
      symbols.length > 0 && typeof prismaWithLabels.asset?.findMany === 'function'
        ? prismaWithLabels.asset
            .findMany({
              where: { symbol: { in: symbols } },
              select: { symbol: true, name: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      accountIds.length > 0 && typeof prismaWithLabels.account?.findMany === 'function'
        ? prismaWithLabels.account
            .findMany({
              where: { id: { in: accountIds } },
              select: { id: true, name: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);
    if (assets.length === 0 && accounts.length === 0) return scan;

    const assetNames = new Map(assets.map((asset) => [asset.symbol, asset.name]));
    const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
    return {
      ...scan,
      security: scan.security.map((context) => {
        const assetName = context.assetName || assetNames.get(context.symbol);
        const accountName =
          context.accountName ||
          (context.accountId ? accountNames.get(context.accountId) : undefined);
        return {
          ...context,
          ...(assetName ? { assetName } : {}),
          ...(accountName ? { accountName } : {}),
        };
      }),
      accounts: scan.accounts.map((context) => {
        const accountName = context.accountName || accountNames.get(context.accountId);
        return {
          ...context,
          ...(accountName ? { accountName } : {}),
        };
      }),
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
        ...(context.accountName === undefined ? {} : { accountName: context.accountName }),
        ...(context.assetName === undefined ? {} : { assetName: context.assetName }),
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
        ...(context.accountName === undefined ? {} : { accountName: context.accountName }),
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

  private globalSecurityContext(context: SecurityContext): SecurityContext {
    const globalContext = { ...context };
    delete globalContext.accountId;
    delete globalContext.accountName;
    delete globalContext.positionId;
    delete globalContext.costPrice;
    delete globalContext.quantity;
    delete globalContext.accountWeight;
    delete globalContext.positionUpdatedAt;
    delete globalContext.holdingPeak;
    return globalContext;
  }

  private positionStateKey(accountId: string, symbol: string, mode: string) {
    return `${accountId}:${symbol}:${mode}`;
  }
}
