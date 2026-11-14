import {
  backtestRunPreparationTerminalResultV3Schema as backtestRunPreparationResultV3Schema,
  executionModelRunIssues,
  marketDataBarRouteKeyV3Schema,
  type BacktestRunPreparationRequestV3,
  type BacktestRunPreparationTerminalResultV3 as BacktestRunPreparationResultV3,
  type BacktestStrategy,
  type BacktestSnapshotActualSourceV3,
  runConfigSchemaV3,
  type RunConfigV3,
  type MarketDataBarRouteKeyV3,
  priceResearchStrategyIssues,
} from '@thesis-ledger/schemas';
import {
  resolveBacktestPreparationProtocolV3,
  preparedRunConfigV3,
  knownCashStrategyIssueV3,
  backtestPreparationPriceOptionsV3,
  type KnownCashAcquisitionPortV3,
} from './backtest-run-preparation-protocol-v3.js';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import { marketFrozenWindowHashV3 } from '../market/market-frozen-window-v3.js';
import { backtestResearchReadOptionsV3 } from './backtest-research-read-options-v3.js';
import type { MarketControlService } from '../market/market-control.service.js';
import type { MarketBarWindowReadResultV3 } from '../market/market-bar-reader-v3.js';
import type { MarketLifecycleReadPortV3 } from '../market/market-lifecycle-reader-v3.js';
import { deriveLifecyclePreparationV3 } from './backtest-lifecycle-preparation-v3.js';
import { planBacktestPriceInputs } from './backtest-dependency-price.js';
import { planSnapshotInputsV3 } from './backtest-snapshot-v3-input-plan.js';
import { createBacktestSnapshotV3Source } from './backtest-snapshot-v3-source.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { hkResearchLotForSourceV3 } from './backtest-hk-research-lot-v3.js';
import {
  mapWindowUnavailable,
  preflightBacktestExecutionWindowV3,
} from './backtest-preflight-v3-execution.js';
import {
  preparationBlocked,
  preparationDiagnostic,
  preparationRouteContext,
} from './backtest-preparation-context.js';
import { readPriceResearchReference } from './backtest-price-research-input.js';

type BacktestPreparationInput = {
  request: BacktestRunPreparationRequestV3;
  strategy: BacktestStrategy;
  reader: Pick<MarketBarReader, 'readV3'>;
  control: Pick<MarketControlService, 'getPolicy'>;
  checkedAt: string;
  lifecycle?: MarketLifecycleReadPortV3;
  knownCash?: KnownCashAcquisitionPortV3;
};

export async function prepareBacktestRunConfigV3(
  input: BacktestPreparationInput,
): Promise<BacktestRunPreparationResultV3> {
  const { request, strategy, control, checkedAt } = input;
  const blocked = (message: string) =>
    preparationBlocked(request, checkedAt, [preparationDiagnostic(request, message)]);
  const instrument = strategy.executionInstrument;
  const plans = preparationPricePlan(input);
  if (plans.status === 'blocked') return plans.result;
  const { pricePlan, acquisitionPlan } = plans;
  const routeKey = marketDataBarRouteKeyV3Schema.parse({
    kind: 'bar',
    market: instrument.market,
    assetType: instrument.assetType === 'stock' ? 'STOCK' : 'ETF',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: request.adjustment,
  });
  let routeContext: ReturnType<typeof preparationRouteContext>;
  let policy: unknown;
  try {
    policy = await control.getPolicy();
    routeContext = preparationRouteContext(policy, routeKey);
  } catch {
    return blocked('执行路由未应用、已失效或未配置，无法准备当前协议。');
  }

  const acquisition = await acquirePreparationWindow(
    input,
    routeKey,
    pricePlan,
    acquisitionPlan,
    routeContext,
  );
  if (acquisition.status === 'blocked') return acquisition.result;
  const {
    window,
    requirement,
    selection,
    readResult,
    frozenExecutionWindow,
    lifecyclePreparation,
    acquiredExecution,
  } = acquisition;
  const protocol = await resolveBacktestPreparationProtocolV3({
    request,
    response: selection.response,
    revisions: {
      desiredRevision: routeContext.desiredRevision,
      effectivePolicyRevision: selection.effectivePolicyRevision,
      catalogRevision: selection.catalogRevision,
    },
    ...(input.knownCash ? { knownCash: input.knownCash } : {}),
  });
  if (protocol.status === 'blocked') return blocked(protocol.message);
  const { executionPriceProtocol, knownCashPreparation, dataAsOf } = protocol;

  const configResult = preparedRunConfigV3(
    request,
    {
      dataAsOf,
      frozenExecutionWindow,
      lifecyclePreparation,
      executionPriceProtocol,
      knownCashPreparation,
    },
    pricePlan.signalSources.map((source) => source.id),
    strategy.signalSources
      .filter((source) => source.priceCoordinate === 'actual')
      .map((source) => source.id),
  );
  if (!configResult.success) return blocked('实际来源价格事实与所选记账方式或执行模型不兼容。');
  let runConfig = configResult.data;
  let actualPriceSource: BacktestSnapshotActualSourceV3 | undefined;
  if (request.priceResearch) {
    try {
      const reference = await preparedResearchReference(
        input,
        runConfig,
        acquiredExecution,
        request.priceResearch,
      );
      actualPriceSource = reference.actualPriceSource;
      runConfig = reference.runConfig;
    } catch (error) {
      return blocked(error instanceof Error ? error.message : '原价参考准备失败');
    }
  }
  const inputPlan = planSnapshotInputsV3({ strategy, runConfig });
  const executionPreflight = await preflightBacktestExecutionWindowV3({
    strategy,
    runConfig,
    dependencyPlan: inputPlan.plan,
    reader: { readV3: () => Promise.resolve(readResult) },
    context: {
      checkedAt,
      request: {
        contractVersion: 3,
        requestId: request.requestId,
        strategyVersionId: request.strategyVersionId,
        strategyContentHash: hashCanonicalManifest(strategy),
        runConfigChecksum: hashCanonicalManifest(runConfig),
        requirements: [requirement],
      },
      routeRevisions: {
        ...routeContext,
        effectiveRevision: selection.effectivePolicyRevision,
        catalogRevision: selection.catalogRevision,
      },
    },
  });
  if (executionPreflight.status !== 'ready')
    return preparationBlocked(request, checkedAt, executionPreflight.diagnostics);

  return preparedSourceResult(
    input,
    runConfig,
    readResult,
    { purpose: 'execution', symbol: instrument.symbol, routeKey, window },
    actualPriceSource,
    executionPreflight,
  );
}

function preparationPricePlan(input: BacktestPreparationInput) {
  const { request, strategy, checkedAt } = input;
  const instrument = strategy.executionInstrument;
  const blocked = (message: string) => ({
    status: 'blocked' as const,
    result: preparationBlocked(request, checkedAt, [preparationDiagnostic(request, message)]),
  });
  if (request.priceResearch) {
    if (strategy.schemaVersion !== '3') return blocked('请先确认并保存策略的价格研究版本');
    const issues = priceResearchStrategyIssues(strategy);
    if (issues.length)
      return {
        status: 'blocked' as const,
        result: preparationBlocked(
          request,
          checkedAt,
          issues.map((issue) =>
            preparationDiagnostic(request, `${issue.path.join('.')}: ${issue.message}`, {
              category: 'rule-incompatible',
              code: 'RULE_REJECTED',
              incompatibleRules: [issue.path.join('.')],
            }),
          ),
        ),
      };
  }
  const cashSignalIssue = knownCashStrategyIssueV3(request, strategy);
  if (cashSignalIssue) return blocked(cashSignalIssue);
  if (request.marketRuleResearch && instrument.assetType !== 'stock')
    return blocked('原价规则研究当前只支持股票。');
  if (request.cashEventResearch && (instrument.market !== 'CN' || instrument.assetType !== 'etf'))
    return blocked('现金分红研究当前只支持境内ETF。');
  const cashOptions = backtestPreparationPriceOptionsV3(request);
  const pricePlan = planBacktestPriceInputs(strategy, request.runConfig, cashOptions);
  if (
    request.warmupBudgetSessions !== undefined &&
    pricePlan.warmup.lookbackPeriods > request.warmupBudgetSessions
  ) {
    return blocked('策略预热需求超过所选候选预算，请明确调整预算后重新准备。');
  }
  const acquisitionPlan = planBacktestPriceInputs(strategy, request.runConfig, {
    ...cashOptions,
    ...(request.warmupBudgetSessions !== undefined
      ? { minimumWarmupSessions: request.warmupBudgetSessions }
      : {}),
  });
  if (!preparationPlanSupported(strategy, pricePlan))
    return blocked('配置准备当前仅支持同标的、同币种股票/ETF日线执行与信号、基准绑定。');

  const modelIssues = executionModelRunIssues(
    request.runConfig.executionModel,
    request.runConfig,
    instrument,
  );
  if (modelIssues.length)
    return {
      status: 'blocked' as const,
      result: preparationBlocked(request, checkedAt, [
        preparationDiagnostic(request, '所选执行模型与策略标的或运行区间不一致。', {
          category: 'incompatible-accounting',
          code: 'RULE_REJECTED',
          incompatibleRules: modelIssues.map((issue) => issue.path.join('.')),
        }),
      ]),
    };

  return { status: 'ready' as const, pricePlan, acquisitionPlan };
}
function preparationPlanSupported(
  strategy: BacktestStrategy,
  pricePlan: ReturnType<typeof planBacktestPriceInputs>,
) {
  const instrument = strategy.executionInstrument;
  return !(
    strategy.execution.mode !== 'exchange' ||
    strategy.primaryTimeframe !== '1d' ||
    instrument.assetType === 'fund' ||
    pricePlan.requiredFx.length > 0 ||
    pricePlan.blockingIssues.length > 0 ||
    pricePlan.benchmark.instrument !== pricePlan.executionInstrument ||
    pricePlan.signalSources.some(
      (source) => source.instrument !== pricePlan.executionInstrument || source.timeframe !== '1d',
    )
  );
}

async function preparedResearchReference(
  input: BacktestPreparationInput,
  runConfig: RunConfigV3,
  acquiredExecution: Extract<MarketBarWindowReadResultV3, { status: 'selected' }>,
  protocolVersion: NonNullable<BacktestRunPreparationRequestV3['priceResearch']>,
) {
  const { request } = input;
  const reference = await readPriceResearchReference({
    strategy: input.strategy,
    runConfig,
    execution: acquiredExecution,
    reader: input.reader,
    forceReference: request.priceResearchReference === 'freeze',
  });
  const actualPriceSource = reference?.actualSource;
  const preparedConfig = runConfigSchemaV3.parse({
    ...runConfig,
    ...(request.freezeTimePolicy === 'after-acquisition'
      ? { dataAsOf: new Date().toISOString() }
      : {}),
    priceResearch: {
      protocolVersion,
      ...(reference ? { actualPriceWindow: reference.frozenWindowRef } : {}),
    },
  });
  return { actualPriceSource, runConfig: preparedConfig };
}

function preparedSourceResult(
  input: BacktestPreparationInput,
  runConfig: RunConfigV3,
  readResult: MarketBarWindowReadResultV3,
  sourceInput: Parameters<typeof createBacktestSnapshotV3Source>[0],
  actualPriceSource: BacktestSnapshotActualSourceV3 | undefined,
  executionPreflight: Awaited<ReturnType<typeof preflightBacktestExecutionWindowV3>>,
) {
  const { request, checkedAt } = input;
  const blocked = (message: string) =>
    preparationBlocked(request, checkedAt, [preparationDiagnostic(request, message)]);
  try {
    const { actualSource } = createBacktestSnapshotV3Source(sourceInput, readResult);
    try {
      hkResearchLotForSourceV3(actualSource, runConfig);
    } catch (error) {
      return blocked(error instanceof Error ? error.message : '港股每手研究配置无效。');
    }
    return backtestRunPreparationResultV3Schema.parse({
      contractVersion: 3,
      requestId: request.requestId,
      checkedAt,
      scope: 'execution-window',
      status: 'prepared',
      runConfig,
      actualSource,
      ...(actualPriceSource ? { actualPriceSource } : {}),
      executionPreflight,
    });
  } catch {
    return blocked('实际来源未通过请求、覆盖或证据关联校验，配置未准备。');
  }
}

async function acquirePreparationWindow(
  input: BacktestPreparationInput,
  routeKey: MarketDataBarRouteKeyV3,
  pricePlan: ReturnType<typeof planBacktestPriceInputs>,
  acquisitionPlan: ReturnType<typeof planBacktestPriceInputs>,
  routeContext: ReturnType<typeof preparationRouteContext>,
) {
  const { request, strategy, reader, checkedAt } = input;
  const instrument = strategy.executionInstrument;
  const blocked = (message: string) => ({
    status: 'blocked' as const,
    result: preparationBlocked(request, checkedAt, [preparationDiagnostic(request, message)]),
  });
  const window = { start: pricePlan.warmup.startDate, end: request.runConfig.endDate };
  const requirement = {
    symbol: instrument.symbol,
    capability: 'DAILY_BAR',
    purpose: 'execution' as const,
    dateRange: { startDate: window.start, endDate: window.end },
    routeKey,
  };
  let lifecycleResponse;
  if (request.lifecycleResearch) {
    const acquiredLifecycle = await acquirePreparationLifecycle(input, window);
    if (acquiredLifecycle.status === 'blocked') return acquiredLifecycle;
    lifecycleResponse = acquiredLifecycle.response;
  }
  let readResult: MarketBarWindowReadResultV3;
  try {
    readResult = await reader.readV3({
      ...(request.reuseResearchData
        ? { frozenWindowRef: request.reuseResearchData.executionWindow }
        : {}),
      market: instrument.market,
      symbol: instrument.symbol,
      routeKey,
      window: { start: acquisitionPlan.warmup.startDate, end: window.end },
      ...backtestResearchReadOptionsV3(instrument.market, request),
      ...(!lifecycleResponse
        ? {
            warmup: {
              analysisStart: request.runConfig.startDate,
              minimumSessions: acquisitionPlan.warmup.lookbackPeriods,
            },
          }
        : {}),
    });
  } catch {
    return blocked('统一行情Reader暂时不可用，配置未准备。');
  }
  if (readResult.status !== 'selected')
    return {
      status: 'blocked' as const,
      result: preparationBlocked(request, checkedAt, [
        mapWindowUnavailable(requirement, routeContext.targetSources, readResult),
      ]),
    };

  const { selection } = readResult;
  const responseHash = readResult.evidence?.completeResponseHash;
  if (!responseHash || responseHash !== marketFrozenWindowHashV3(selection.response)) {
    return blocked('执行行情完整窗口尚未可靠冻结，无法生成运行配置。');
  }
  const frozenExecutionWindow = {
    version: 'market-frozen-window-v1' as const,
    identityFingerprint: readResult.evidence.identityFingerprint,
    responseHash,
  };
  let lifecyclePreparation;
  if (lifecycleResponse) {
    try {
      lifecyclePreparation = deriveLifecyclePreparationV3({
        response: lifecycleResponse,
        bars: selection.response.bars.filter((bar) => bar.timestamp.slice(0, 10) >= window.start),
        start: request.runConfig.startDate,
        end: window.end,
        required: pricePlan.warmup.lookbackPeriods,
        priceResponseHash: responseHash,
      });
    } catch (error) {
      return blocked(error instanceof Error ? error.message : '生命周期窗口实际预热不足');
    }
  }
  readResult = { ...readResult, frozenWindowRef: frozenExecutionWindow };
  const acquiredExecution = readResult;
  if (lifecyclePreparation || acquisitionPlan.warmup.startDate !== window.start) {
    try {
      readResult = await reader.readV3({
        market: instrument.market,
        symbol: instrument.symbol,
        routeKey,
        window,
        frozenWindowRef: frozenExecutionWindow,
        warmup: {
          analysisStart: lifecyclePreparation?.signalStartDate ?? request.runConfig.startDate,
          minimumSessions: pricePlan.warmup.lookbackPeriods,
        },
      });
    } catch {
      return blocked('冻结父窗口无法读取策略预检子窗口。');
    }
    if (readResult.status !== 'selected')
      return {
        status: 'blocked' as const,
        result: preparationBlocked(request, checkedAt, [
          mapWindowUnavailable(requirement, routeContext.targetSources, readResult),
        ]),
      };
  }
  return {
    status: 'ready' as const,
    window,
    requirement,
    selection,
    readResult,
    frozenExecutionWindow,
    lifecyclePreparation,
    acquiredExecution,
  };
}

async function acquirePreparationLifecycle(
  input: BacktestPreparationInput,
  window: { start: string; end: string },
) {
  const { request, strategy, checkedAt } = input;
  const blocked = (message: string) => ({
    status: 'blocked' as const,
    result: preparationBlocked(request, checkedAt, [preparationDiagnostic(request, message)]),
  });
  if (!input.lifecycle || strategy.executionInstrument.market !== 'CN')
    return blocked('生命周期读取端口不可用');
  try {
    const response = await input.lifecycle.read({
      market: 'CN',
      symbol: strategy.executionInstrument.symbol,
      start: window.start,
      end: window.end,
    });
    return { status: 'ready' as const, response };
  } catch (error) {
    return blocked(error instanceof Error ? error.message : '生命周期来源未取得');
  }
}
