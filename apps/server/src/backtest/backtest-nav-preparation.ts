import { strategyRequiredLookback } from '@thesis-ledger/domain';
import {
  backtestNavPreparationRequestV3Schema,
  backtestNavRunConfigV3Schema,
  backtestNavSourceResponseV3Schema,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { MarketNavReaderV3 } from '../market/market-nav-reader-v3.js';
import { assertSupportedNavStrategy, navConfirmationBudget } from './backtest-nav-input-budget.js';
import { planNavSnapshotInputsV3 } from './backtest-nav-input-plan.js';
import { navPlanUnavailable } from './backtest-nav-planning-calendar.js';
import {
  assertNavPreparationInstant,
  validateNavPreparationProof,
} from './backtest-nav-preparation-proof.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';

/** 内部准备证据；API、证据保管及 Run 创建守卫由后续任务消费。 */
export async function prepareNavRunConfigV3(input: {
  request: unknown;
  strategy: unknown;
  reader: Pick<MarketNavReaderV3, 'read'>;
  acquisitionTimeoutMs: number;
  now?: () => string;
}) {
  const request = backtestNavPreparationRequestV3Schema.parse(input.request);
  const strategy = strategySchema.parse(input.strategy) as BacktestStrategy;
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  if (
    !Number.isInteger(input.acquisitionTimeoutMs) ||
    input.acquisitionTimeoutMs < 1 ||
    input.acquisitionTimeoutMs > 300000 ||
    !Number.isFinite(Date.parse(startedAt))
  ) {
    navPlanUnavailable('NAV 采集期限预算或 Server 时钟无效');
  }
  const deadline = new Date(Date.parse(startedAt) + input.acquisitionTimeoutMs).toISOString();
  const provisional = backtestNavRunConfigV3Schema.parse({
    ...request.runConfig,
    dataAsOf: startedAt,
    navVisibility: { mode: 'strict-publication' },
  });
  assertSupportedNavStrategy(strategy, provisional);
  const warmupPeriods = strategyRequiredLookback(strategy).required;
  const tailTradingDays = navConfirmationBudget(provisional).tailTradingDays;
  for (const raw of [request.calendarDecisionRaw, request.domesticRuleDecisionRaw]) {
    if (raw) {
      const decision = JSON.parse(raw) as { configuredAt: string };
      assertNavPreparationInstant(decision.configuredAt, startedAt);
    }
  }
  const sourceIntent = {
    contractVersion: 3 as const,
    requestId: request.requestId,
    symbol: request.runConfig.navInput.symbol,
    fundType: request.fundType,
    routeKey: {
      kind: 'data',
      market: 'CN',
      assetType: 'MUTUAL_FUND',
      capability: 'FUND_NAV_HISTORY',
    } as const,
    start: request.runConfig.startDate,
    end: request.runConfig.endDate,
    dataAsOf: deadline,
    warmupPeriods,
    tailTradingDays,
    visibilityMode: request.visibilityMode,
    calendarDecisionRaw: request.calendarDecisionRaw,
    domesticRuleDecisionRaw: request.domesticRuleDecisionRaw,
  };
  const selected = await input.reader.read(sourceIntent);
  if (
    Object.entries(sourceIntent).some(
      ([key, value]) =>
        canonicalizeManifest(value) !==
        canonicalizeManifest(selected.request[key as keyof typeof selected.request]),
    )
  ) {
    navPlanUnavailable('NAV 精确读取未绑定当前准备意图与预算');
  }
  const freezeAt = now();
  assertNavPreparationInstant(startedAt, freezeAt);
  assertNavPreparationInstant(freezeAt, deadline);
  const response = backtestNavSourceResponseV3Schema.parse(selected.response);
  const identity = [
    'requestId',
    'symbol',
    'routeKey',
    'routeTarget',
    'desiredRevision',
    'effectivePolicyRevision',
    'catalogRevision',
    'dataAsOf',
  ] as const;
  if (
    identity.some(
      (key) => canonicalizeManifest(response[key]) !== canonicalizeManifest(selected.request[key]),
    )
  ) {
    navPlanUnavailable('NAV 来源响应与准备使用的精确请求不一致');
  }
  if (
    response.navVisibility.mode !== request.visibilityMode ||
    response.navVisibility.rule.fundType !== request.fundType ||
    response.symbol !== request.runConfig.navInput.symbol ||
    response.calendarDecisionRaw !== request.calendarDecisionRaw
  ) {
    navPlanUnavailable('NAV 准备意图、来源身份或实际规则不一致');
  }
  const runConfig = backtestNavRunConfigV3Schema.parse({
    ...request.runConfig,
    dataAsOf: freezeAt,
    navVisibility: response.navVisibility,
  });
  const context = {
    strategy,
    runConfig,
    calendar: response.calendar,
    calendarRaw: response.calendarRaw,
    responseRaw: response.responseRaw,
    ruleRaw: response.ruleRaw,
    publicationRecords: response.publicationRecords,
  };
  const plan = planNavSnapshotInputsV3(context);
  validateNavPreparationProof(response, context, plan);
  const binding = {
    strategyVersionId: request.strategyVersionId,
    strategyContentHash: hashCanonicalManifest(strategy),
    intentHash: hashCanonicalManifest(request),
    runConfigChecksum: hashCanonicalManifest(runConfig),
    inputPlanHash: hashCanonicalManifest(plan),
    sourceRequestHash: hashCanonicalManifest(selected.request),
    sourceResponseHash: hashCanonicalManifest(response),
    routeStateHash: hashCanonicalManifest(selected.routeState),
    admissionHash: hashCanonicalManifest(response.admission),
    startedAt,
    checkedAt: freezeAt,
  };
  return {
    contractVersion: 3 as const,
    status: 'prepared' as const,
    scope: 'nav-input-plan' as const,
    requestId: request.requestId,
    binding: { ...binding, preparationHash: hashCanonicalManifest(binding) },
    runConfig,
    plan,
    context,
    facts: response.facts,
    selection: selected,
  };
}

export type NavRunPreparationV3 = Awaited<ReturnType<typeof prepareNavRunConfigV3>>;
