import {
  buildBacktestAnalytics,
  DecimalValue,
  deterministicResultChecksum,
  projectBacktestTrades,
} from '@thesis-ledger/domain';
import { backtestNavResultV3Schema, type BacktestNavResultV3 } from '@thesis-ledger/schemas';
import { adaptNavDomainInputsV3 } from './backtest-nav-domain-input.js';
import type { runNavOfflineStrategyV3 } from './backtest-nav-offline-strategy.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { navOfflineExecutionDay, type NavOfflineInputs } from './backtest-nav-offline-events.js';

export const NAV_V3_RUNNER_VERSION = 'thesis-ledger-v3-nav-local-runner-v1';
type FrozenNavInput = Parameters<typeof adaptNavDomainInputsV3>[0];
type NavStrategyOutput = ReturnType<typeof runNavOfflineStrategyV3>;

const verifyNavResultPricing = (result: BacktestNavResultV3, input: NavOfflineInputs) => {
  for (const request of result.requests) {
    if (!navOfflineExecutionDay(input, request.requestAt))
      throw new Error('NAV 结果申请不在冻结执行处理日');
    if (!request.nav) continue;
    const fact = input.pricingFactAt(request.valuationDate!, request.navAvailableAt!);
    if (
      !fact ||
      fact.nav === null ||
      DecimalValue.from(request.nav).compareTo(fact.nav) !== 0 ||
      request.navOccurredAt !== fact.occurredAt ||
      request.navAvailableAt !== fact.availableAt ||
      request.navProvider !== fact.provider ||
      request.navProviderRevision !== fact.providerRevision ||
      request.navQuality !== fact.quality ||
      request.navFreshness !== fact.freshness
    )
      throw new Error('NAV 结果定价与冻结可见事实不符');
  }
};

export const projectNavResultV3 = (
  frozen: FrozenNavInput,
  offline: NavStrategyOutput,
): BacktestNavResultV3 => {
  const { manifest, context } = frozen;
  const fills = offline.fills.map((fill) => ({
    ...fill,
    charges: [...fill.charges],
    reason: offline.requestReasons[fill.orderId] ?? fill.reason,
  }));
  const trades = projectBacktestTrades(fills, {
    executionSymbol: manifest.navInput.symbol,
    currency: 'CNY',
  }).trades;
  const diagnostics = [
    ...offline.rejects,
    ...offline.sizingRejects.map((reject, index) => ({
      eventId: `${manifest.runId}:sizing:${index}`,
      code: reject.code,
      reason: reject.reason,
    })),
  ];
  const unavailableReasons = diagnostics.map((item) => `${item.code}:${item.reason}`);
  if (offline.pendingRequests.length) unavailableReasons.push('期末存在待处理净值申请');
  if (offline.benchmark.status !== 'available') unavailableReasons.push('期末基准净值不可见');
  if (offline.valuations.some((point) => point.equity === null))
    unavailableReasons.push('部分估值日缺少可见净值');
  const valuations = [
    ...offline.valuations.filter((point) => point.evaluatedAt !== offline.through),
    { evaluatedAt: offline.through, equity: offline.valuation.equity },
  ];
  const analytics = buildBacktestAnalytics({
    runId: manifest.runId,
    strategyVersionId: manifest.strategyVersionId,
    snapshotId: manifest.contentHash,
    contentHash: manifest.contentHash,
    engineVersion: NAV_V3_RUNNER_VERSION,
    schemaVersion: '2',
    marketRuleVersion: context.runConfig.executionModel.version,
    calendarVersion: manifest.calendar.version,
    aggregationVersion: 'nav-valuation-daily-v1',
    baseCurrency: 'CNY',
    periodsPerYear: 252,
    trades,
    unavailableReasons,
    equityCurve: [
      {
        occurredAt: `${manifest.dateRange.startDate}T00:00:00+08:00`,
        value: { amount: offline.valuation.initialCash, currency: 'CNY' },
      },
      ...valuations.flatMap((point) =>
        point.equity === null
          ? []
          : [
              {
                occurredAt: point.evaluatedAt,
                availableAt: point.evaluatedAt,
                value: { amount: point.equity, currency: 'CNY' as const },
              },
            ],
      ),
    ],
  });
  const benchmark =
    offline.benchmark.status === 'available'
      ? { totalReturn: { status: 'available' as const, value: offline.benchmark.totalReturn } }
      : { totalReturn: { status: 'unavailable' as const, reason: offline.benchmark.reason } };
  const position = offline.state.ledger.position;
  const payload = backtestNavResultV3Schema.parse({
    source: 'BACKTEST',
    inputKind: 'nav',
    schemaVersion: '3',
    snapshotVersion: manifest.manifestVersion,
    engineVersion: NAV_V3_RUNNER_VERSION,
    runId: manifest.runId,
    strategyVersionId: manifest.strategyVersionId,
    snapshotId: manifest.contentHash,
    contentHash: manifest.contentHash,
    comparableDataFingerprint: manifest.comparableDataFingerprint,
    dataAsOf: manifest.dataAsOf,
    evaluatedAt: offline.through,
    dateRange: { startDate: manifest.dateRange.startDate, endDate: manifest.dateRange.endDate },
    executionSymbol: manifest.navInput.symbol,
    calendarVersion: manifest.calendar.version,
    executionModelDisclosure: {
      model: context.runConfig.executionModel,
      contentHash: manifest.executionModel.contentHash,
    },
    navVisibility: manifest.navVisibility,
    visibilityDisclosure: offline.visibilityDisclosure,
    navSource: manifest.source,
    completeness:
      unavailableReasons.length && analytics.completeness === 'complete'
        ? 'partial'
        : analytics.completeness,
    warnings: [...analytics.warnings, ...unavailableReasons],
    diagnostics,
    requests: offline.state.requests,
    pendingRequestIds: offline.pendingRequests.map((request) => request.requestId),
    cash: offline.state.ledger.cash.CNY,
    position: {
      quantity: position.quantity,
      settledQuantity: position.settledQuantity,
      unsettledQuantity: position.unsettledQuantity,
      averageCost: position.averageCost,
    },
    simulationFills: fills,
    trades,
    equityCurve: analytics.equityCurve,
    drawdownCurve: analytics.drawdownCurve,
    metrics: analytics.metrics,
    benchmark,
    resultChecksum: '0000000000000000',
  });
  const { resultChecksum: placeholder, ...checksumPayload } = payload;
  void placeholder;
  return backtestNavResultV3Schema.parse({
    ...checksumPayload,
    resultChecksum: deterministicResultChecksum(checksumPayload),
  });
};

/** Worker 汇合可复用此读取守卫；不执行状态提交或赋予投递能力。 */
export const verifyNavResultV3 = (value: unknown, frozen: FrozenNavInput): BacktestNavResultV3 => {
  const result = backtestNavResultV3Schema.parse(value);
  const input = adaptNavDomainInputsV3(frozen);
  const { manifest, context } = frozen;
  const same = (left: unknown, right: unknown) =>
    canonicalizeManifest(left) === canonicalizeManifest(right);
  const expectedAt = `${manifest.dateRange.endDate}T${context.runConfig.valuationPolicy.dailyValuationTime}:00+08:00`;
  if (
    result.runId !== manifest.runId ||
    result.strategyVersionId !== manifest.strategyVersionId ||
    result.snapshotId !== manifest.contentHash ||
    result.comparableDataFingerprint !== manifest.comparableDataFingerprint ||
    result.engineVersion !== NAV_V3_RUNNER_VERSION ||
    result.dataAsOf !== manifest.dataAsOf ||
    result.evaluatedAt !== expectedAt ||
    result.executionSymbol !== manifest.navInput.symbol ||
    result.calendarVersion !== manifest.calendar.version
  )
    throw new Error('NAV 结果冻结身份不符');
  if (
    !same(result.navSource, manifest.source) ||
    !same(result.navVisibility, manifest.navVisibility) ||
    !same(result.visibilityDisclosure, input.visibilityDisclosure) ||
    !same(result.dateRange, input.plan.runWindow) ||
    result.executionModelDisclosure.contentHash !== manifest.executionModel.contentHash ||
    hashCanonicalManifest(result.executionModelDisclosure.model) !==
      manifest.executionModel.contentHash
  )
    throw new Error('NAV 结果来源、可见性或模型与冻结合同不符');
  const { resultChecksum, ...payload } = result;
  if (deterministicResultChecksum(payload) !== resultChecksum)
    throw new Error('NAV 结果校验和不符');
  verifyNavResultPricing(result, input);
  return result;
};
