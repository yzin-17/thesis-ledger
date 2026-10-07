import {
  backtestRunPreparationResultV3Schema,
  executionModelRunIssues,
  marketDataBarRouteKeyV3Schema,
  runConfigSchemaV3,
  type BacktestRunPreparationRequestV3,
  type BacktestRunPreparationResultV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import { marketFrozenWindowHashV3 } from '../market/market-frozen-window-v3.js';
import type { MarketControlService } from '../market/market-control.service.js';
import type { MarketBarWindowReadResultV3 } from '../market/market-bar-reader-v3.js';
import { planBacktestPriceInputs } from './backtest-dependency-price.js';
import { planSnapshotInputsV3 } from './backtest-snapshot-v3-input-plan.js';
import { createBacktestSnapshotV3Source } from './backtest-snapshot-v3-source.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import {
  mapWindowUnavailable,
  preflightBacktestExecutionWindowV3,
} from './backtest-preflight-v3-execution.js';
import {
  preparationBlocked,
  preparationDiagnostic,
  preparationRouteContext,
} from './backtest-preparation-context.js';

export async function prepareBacktestRunConfigV3(input: {
  request: BacktestRunPreparationRequestV3;
  strategy: BacktestStrategy;
  reader: Pick<MarketBarReader, 'readV3'>;
  control: Pick<MarketControlService, 'getPolicy'>;
  checkedAt: string;
}): Promise<BacktestRunPreparationResultV3> {
  const { request, strategy, reader, control, checkedAt } = input;
  const blocked = (message: string) =>
    preparationBlocked(request, checkedAt, [preparationDiagnostic(request, message)]);
  const instrument = strategy.executionInstrument;
  const pricePlan = planBacktestPriceInputs(strategy, request.runConfig);
  if (
    request.warmupBudgetSessions !== undefined &&
    pricePlan.warmup.lookbackPeriods > request.warmupBudgetSessions
  ) {
    return blocked('策略预热需求超过所选候选预算，请明确调整预算后重新准备。');
  }
  const acquisitionPlan = planBacktestPriceInputs(strategy, request.runConfig, {
    ...(request.warmupBudgetSessions !== undefined
      ? { minimumWarmupSessions: request.warmupBudgetSessions }
      : {}),
  });
  if (
    strategy.execution.mode !== 'exchange' ||
    strategy.primaryTimeframe !== '1d' ||
    instrument.assetType === 'fund' ||
    pricePlan.requiredFx.length > 0 ||
    pricePlan.blockingIssues.length > 0 ||
    pricePlan.benchmark.instrument !== pricePlan.executionInstrument ||
    pricePlan.signalSources.some(
      (source) => source.instrument !== pricePlan.executionInstrument || source.timeframe !== '1d',
    )
  )
    return blocked('配置准备当前仅支持同标的、同币种股票/ETF日线执行与信号、基准绑定。');

  const modelIssues = executionModelRunIssues(
    request.runConfig.executionModel,
    request.runConfig,
    instrument,
  );
  if (modelIssues.length)
    return preparationBlocked(request, checkedAt, [
      preparationDiagnostic(request, '所选执行模型与策略标的或运行区间不一致。', {
        category: 'incompatible-accounting',
        code: 'RULE_REJECTED',
        incompatibleRules: modelIssues.map((issue) => issue.path.join('.')),
      }),
    ]);

  const routeKey = marketDataBarRouteKeyV3Schema.parse({
    kind: 'bar',
    market: instrument.market,
    assetType: instrument.assetType === 'stock' ? 'STOCK' : 'ETF',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: request.adjustment,
  });
  let routeContext: ReturnType<typeof preparationRouteContext>;
  try {
    routeContext = preparationRouteContext(await control.getPolicy(), routeKey);
  } catch {
    return blocked('执行路由未应用、已失效或未配置，无法准备当前协议。');
  }

  const window = { start: pricePlan.warmup.startDate, end: request.runConfig.endDate };
  const requirement = {
    symbol: instrument.symbol,
    capability: 'DAILY_BAR',
    purpose: 'execution' as const,
    dateRange: { startDate: window.start, endDate: window.end },
    routeKey,
  };
  let readResult: MarketBarWindowReadResultV3;
  try {
    readResult = await reader.readV3({
      market: instrument.market,
      symbol: instrument.symbol,
      routeKey,
      window: { start: acquisitionPlan.warmup.startDate, end: window.end },
      ...(instrument.market === 'CN' && request.history.basis === 'fixed-provider-snapshot'
        ? { tradabilityMode: 'assume-untradable-no-bar' as const,
            priceResearch: request.accountingBasis === 'normalized-series' } : {}),
      warmup: {
        analysisStart: request.runConfig.startDate,
        minimumSessions: acquisitionPlan.warmup.lookbackPeriods,
      },
    });
  } catch {
    return blocked('统一行情Reader暂时不可用，配置未准备。');
  }
  if (readResult.status !== 'selected')
    return preparationBlocked(request, checkedAt, [
      mapWindowUnavailable(requirement, routeContext.targetSources, readResult),
    ]);

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
  readResult = { ...readResult, frozenWindowRef: frozenExecutionWindow };
  if (acquisitionPlan.warmup.startDate !== window.start) {
    try {
      readResult = await reader.readV3({
        market: instrument.market,
        symbol: instrument.symbol,
        routeKey,
        window,
        frozenWindowRef: frozenExecutionWindow,
        warmup: {
          analysisStart: request.runConfig.startDate,
          minimumSessions: pricePlan.warmup.lookbackPeriods,
        },
      });
    } catch {
      return blocked('冻结父窗口无法读取策略预检子窗口。');
    }
    if (readResult.status !== 'selected')
      return preparationBlocked(request, checkedAt, [
        mapWindowUnavailable(requirement, routeContext.targetSources, readResult),
      ]);
  }
  const dataAsOf =
    request.freezeTimePolicy === 'after-acquisition'
      ? new Date().toISOString()
      : request.runConfig.dataAsOf;
  const observedAt = Date.parse(selection.response.sourcePriceBasis.observedAt);
  const asOf = Date.parse(dataAsOf);
  if (
    observedAt > asOf ||
    selection.response.bars.some((bar) => Date.parse(bar.availableAt) > asOf)
  ) {
    return blocked('实际来源或行情的观察时间晚于dataAsOf；请明确更新冻结时点后重新准备。');
  }

  const configResult = runConfigSchemaV3.safeParse({
    ...request.runConfig,
    dataAsOf,
    schemaVersion: '3',
    frozenExecutionWindow,
    ...(request.warmupBudgetSessions !== undefined
      ? { frozenWarmupBudgetSessions: request.warmupBudgetSessions }
      : {}),
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      priceBasis: {
        ...selection.response.sourcePriceBasis,
        quantityBasis:
          request.accountingBasis === 'raw-events' ? 'actual-units' : 'normalized-units',
      },
      accountingBasis: request.accountingBasis,
      history: request.history,
    },
    priceInputBindings: {
      signals: pricePlan.signalSources.map((source) => ({
        sourceId: source.id,
        binding: 'execution-series',
      })),
      benchmark: { binding: 'execution-series' },
    },
  });
  if (!configResult.success) return blocked('实际来源价格事实与所选记账方式或执行模型不兼容。');
  const runConfig = configResult.data;
  if (runConfig.executionPriceProtocol.priceBasis.adjustment !== request.adjustment) {
    return blocked('实际来源口径与请求不一致，拒绝替换用户选择。');
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

  try {
    const { actualSource } = createBacktestSnapshotV3Source(
      { purpose: 'execution', symbol: instrument.symbol, routeKey, window },
      readResult,
    );
    return backtestRunPreparationResultV3Schema.parse({
      contractVersion: 3,
      requestId: request.requestId,
      checkedAt,
      scope: 'execution-window',
      status: 'prepared',
      runConfig,
      actualSource,
      executionPreflight,
    });
  } catch {
    return blocked('实际来源未通过请求、覆盖或证据关联校验，配置未准备。');
  }
}
