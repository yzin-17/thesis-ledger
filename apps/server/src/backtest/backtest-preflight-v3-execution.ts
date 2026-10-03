import { isDeepStrictEqual } from 'node:util';
import { hasExecutableBacktestWindowV3 } from './backtest-snapshot-v3-tradability.js';
import { z } from 'zod';
import {
  backtestPreflightDiagnosticV3Schema,
  backtestPreflightRequestV3Schema,
  backtestPreflightRequirementV3Schema,
  backtestPreflightResultV3Schema,
  backtestPreflightRevisionStampV3Schema,
  marketDataBarSeriesRequestResponseV3Schema,
  marketDataBarRouteKeyV3Schema,
  runConfigSchemaV3,
  strategySchema,
  type BacktestPreflightDiagnosticV3,
  type BacktestPreflightRequirementV3,
  type BacktestPreflightResultV3,
  type BacktestPreflightRequestV3,
  type BacktestPreflightTargetSourceV3,
  type MarketDataBarSeriesResponseV3,
  type MarketDataBarRouteKeyV3,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import type {
  MarketBarWindowReadInputV3,
  MarketBarWindowReadResultV3,
} from '../market/market-bar-reader-v3.js';
import {
  mapBacktestDependencyIssueToPreflightDiagnosticV3,
  type BacktestPreflightDiagnosticContext,
} from './backtest-preflight-diagnostics.js';
import type { BacktestDependencyPlan } from './backtest-dependency-plan.js';
import { deriveRunConfigChecksum, hashCanonicalManifest } from './backtest-snapshot.js';
import {
  backtestHistoricalExecutionPreflightFailureV3,
  type BacktestReconstructionPreflightPortV3,
} from './backtest-reconstruction-preflight-v3.js';

const isoDateTime = z.iso.datetime({ offset: true });

export type ExecutionRouteRevisionContextV3 = {
  desiredRevision: number | null;
  effectiveRevision: number | null;
  catalogRevision: number | null;
  targetSources: readonly BacktestPreflightTargetSourceV3[];
};

export type BacktestExecutionPreflightContextV3 = {
  request: BacktestPreflightRequestV3;
  checkedAt: string;
  routeRevisions: ExecutionRouteRevisionContextV3;
  compatibility?: MarketBarWindowReadInputV3['compatibility'];
};

export type BacktestExecutionWindowPreflightInputV3 = {
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  dependencyPlan: BacktestDependencyPlan;
  context: BacktestExecutionPreflightContextV3;
  reader: Pick<MarketBarReader, 'readV3'>;
  reconstruction?: BacktestReconstructionPreflightPortV3;
};

type ValidatedExecutionInputs = {
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  requirement: BacktestPreflightRequirementV3;
  routeKey: MarketDataBarRouteKeyV3;
  stamp: ReturnType<typeof backtestPreflightRevisionStampV3Schema.parse>;
  requestId: string;
  checkedAt: string;
};

type DiagnosticDetails = {
  category: BacktestPreflightDiagnosticV3['category'];
  code: BacktestPreflightDiagnosticV3['code'];
  message: string;
  action: BacktestPreflightDiagnosticV3['suggestedActions'][number]['action'];
  actionDescription: string;
  missingFields?: readonly string[];
  incompatibleRules?: readonly string[];
};

const routeAssetType = {
  stock: 'STOCK',
  etf: 'ETF',
  fund: 'MUTUAL_FUND',
} as const;

const instrumentIdentity = (strategy: BacktestStrategy) => {
  const instrument = strategy.executionInstrument;
  return `${instrument.market}:${instrument.symbol}:${instrument.assetType}`;
};

const invalidFields = (issues: readonly { path: readonly PropertyKey[] }[]) =>
  issues.map((issue) => issue.path.map(String).join('.')).filter((path) => path.length > 0);

const invalidInputResult = (
  requestId: string,
  checkedAt: string,
  missingFields: readonly string[],
): BacktestPreflightResultV3 =>
  backtestPreflightResultV3Schema.parse({
    contractVersion: 3,
    requestId,
    checkedAt: isoDateTime.safeParse(checkedAt).success ? checkedAt : new Date().toISOString(),
    status: 'invalid-input',
    revisionStamp: null,
    diagnostics: [
      backtestPreflightDiagnosticV3Schema.parse({
        severity: 'error',
        category: 'input-invalid',
        code: 'INVALID_PARAMETER',
        message: '执行行情预检输入或其 revision context 无效。',
        symbol: null,
        capability: null,
        purpose: null,
        dateRange: null,
        routeKey: null,
        missingFields: [
          ...new Set(missingFields.length > 0 ? missingFields : ['preflightContext']),
        ],
        incompatibleRules: [],
        targetSources: [],
        suggestedActions: [
          { action: 'correct-input', description: '补齐并核对 V3 策略、RunConfig 与预检上下文。' },
        ],
      }),
    ],
  });

const makeDiagnostic = (
  requirement: BacktestPreflightRequirementV3,
  targetSources: readonly BacktestPreflightTargetSourceV3[],
  details: DiagnosticDetails,
): BacktestPreflightDiagnosticV3 =>
  backtestPreflightDiagnosticV3Schema.parse({
    severity: 'error',
    category: details.category,
    code: details.code,
    message: details.message,
    symbol: requirement.symbol,
    capability: requirement.capability,
    purpose: requirement.purpose,
    dateRange: requirement.dateRange,
    routeKey: requirement.routeKey,
    missingFields: [...(details.missingFields ?? [])],
    incompatibleRules: [...(details.incompatibleRules ?? [])],
    targetSources: [...targetSources],
    suggestedActions: [{ action: details.action, description: details.actionDescription }],
  });

const finish = (
  status: 'ready' | 'blocked',
  input: ValidatedExecutionInputs,
  diagnostics: readonly BacktestPreflightDiagnosticV3[],
): BacktestPreflightResultV3 =>
  backtestPreflightResultV3Schema.parse({
    contractVersion: 3,
    requestId: input.requestId,
    checkedAt: input.checkedAt,
    status,
    revisionStamp: input.stamp,
    diagnostics: [...diagnostics],
  });

const validateInput = (
  input: BacktestExecutionWindowPreflightInputV3,
):
  | { ok: true; value: ValidatedExecutionInputs }
  | { ok: false; result: BacktestPreflightResultV3 } => {
  const parsedRequest = backtestPreflightRequestV3Schema.safeParse(input.context.request);
  const parsedStrategy = strategySchema.safeParse(input.strategy);
  const parsedRunConfig = runConfigSchemaV3.safeParse(input.runConfig);
  const requestId = parsedRequest.success ? parsedRequest.data.requestId : 'execution-preflight';
  const checkedAt = input.context.checkedAt;
  const failedFields = [
    ...(!parsedRequest.success
      ? ['context.request', ...invalidFields(parsedRequest.error.issues)]
      : []),
    ...(!parsedStrategy.success
      ? [
          'strategy',
          ...invalidFields(parsedStrategy.error.issues).map((path) => `strategy.${path}`),
        ]
      : []),
    ...(!parsedRunConfig.success
      ? [
          'runConfig',
          ...invalidFields(parsedRunConfig.error.issues).map((path) => `runConfig.${path}`),
        ]
      : []),
    ...(!isoDateTime.safeParse(checkedAt).success ? ['context.checkedAt'] : []),
  ];
  if (
    failedFields.length > 0 ||
    !parsedRequest.success ||
    !parsedStrategy.success ||
    !parsedRunConfig.success
  ) {
    return {
      ok: false,
      result: invalidInputResult(requestId, checkedAt, failedFields),
    };
  }

  const request = parsedRequest.data;
  const strategy = parsedStrategy.data as BacktestStrategy;
  const runConfig = parsedRunConfig.data;
  const identityMismatches = [
    ...(hashCanonicalManifest(strategy) !== request.strategyContentHash
      ? ['strategyContentHash']
      : []),
    ...(deriveRunConfigChecksum(runConfig) !== request.runConfigChecksum
      ? ['runConfigChecksum']
      : []),
  ];
  if (identityMismatches.length > 0) {
    return {
      ok: false,
      result: invalidInputResult(request.requestId, checkedAt, identityMismatches),
    };
  }

  const expectedInstrument = instrumentIdentity(strategy);
  if (
    input.dependencyPlan.executionInstrument !== expectedInstrument ||
    input.dependencyPlan.runWindow.startDate !== runConfig.startDate ||
    input.dependencyPlan.runWindow.endDate !== runConfig.endDate ||
    input.dependencyPlan.warmup.startDate > runConfig.startDate
  ) {
    return {
      ok: false,
      result: invalidInputResult(request.requestId, checkedAt, ['dependencyPlan.executionWindow']),
    };
  }

  const executionDatasets = input.dependencyPlan.datasets.filter(
    (candidate) => candidate.purpose === 'execution' && candidate.instrument === expectedInstrument,
  );
  const dataset = executionDatasets[0];
  if (
    executionDatasets.length !== 1 ||
    !dataset ||
    dataset.range.endDate !== runConfig.endDate ||
    dataset.range.startDate > runConfig.startDate
  ) {
    return {
      ok: false,
      result: invalidInputResult(request.requestId, checkedAt, ['dependencyPlan.executionDataset']),
    };
  }

  const routeKey = marketDataBarRouteKeyV3Schema.safeParse({
    kind: 'bar',
    market: strategy.executionInstrument.market,
    assetType: routeAssetType[strategy.executionInstrument.assetType],
    capability: dataset.baseTimeframe === '1d' ? 'DAILY_BAR' : 'MINUTE_BAR',
    timeframe: dataset.baseTimeframe,
    adjustment: runConfig.executionPriceProtocol.priceBasis.adjustment,
  });
  if (!routeKey.success) {
    return {
      ok: false,
      result: invalidInputResult(request.requestId, checkedAt, [
        'dependencyPlan.executionRouteKey',
      ]),
    };
  }
  if (routeKey.data.kind !== 'bar') {
    return {
      ok: false,
      result: invalidInputResult(request.requestId, checkedAt, [
        'dependencyPlan.executionRouteKey.kind',
      ]),
    };
  }
  const requirementResult = backtestPreflightRequirementV3Schema.safeParse({
    symbol: strategy.executionInstrument.symbol,
    capability: routeKey.data.capability,
    purpose: 'execution',
    dateRange: { startDate: dataset.range.startDate, endDate: dataset.range.endDate },
    routeKey: routeKey.data,
  });
  const executionRequirements = request.requirements.filter(
    (requirement) => requirement.purpose === 'execution',
  );
  if (
    !requirementResult.success ||
    executionRequirements.length !== 1 ||
    !isDeepStrictEqual(executionRequirements[0], requirementResult.data)
  ) {
    return {
      ok: false,
      result: invalidInputResult(request.requestId, checkedAt, [
        'context.request.requirements.execution',
      ]),
    };
  }

  const stampResult = backtestPreflightRevisionStampV3Schema.safeParse({
    strategyVersionId: request.strategyVersionId,
    strategyContentHash: request.strategyContentHash,
    runConfigChecksum: request.runConfigChecksum,
    desiredRevision: input.context.routeRevisions.desiredRevision,
    effectiveRevision: input.context.routeRevisions.effectiveRevision,
    catalogRevision: input.context.routeRevisions.catalogRevision,
    targetSequences: [
      { requirement: requirementResult.data, targets: input.context.routeRevisions.targetSources },
    ],
  });
  if (!stampResult.success) {
    return {
      ok: false,
      result: invalidInputResult(request.requestId, checkedAt, [
        'context.routeRevisions',
        ...invalidFields(stampResult.error.issues),
      ]),
    };
  }

  return {
    ok: true,
    value: {
      strategy,
      runConfig,
      requirement: requirementResult.data,
      routeKey: routeKey.data,
      stamp: stampResult.data,
      requestId: request.requestId,
      checkedAt,
    },
  };
};

const baseContextForDependencyIssue = (
  requirement: BacktestPreflightRequirementV3,
  routeTargets: readonly BacktestPreflightTargetSourceV3[],
  dependencyPlan: BacktestDependencyPlan,
): BacktestPreflightDiagnosticContext => ({
  requirement,
  targetSources: routeTargets,
  missingFields: dependencyPlan.ruleCompatibility.missingInputs,
  incompatibleRules: dependencyPlan.ruleCompatibility.issues.map((issue) => issue.code),
});

export const mapWindowUnavailable = (
  requirement: BacktestPreflightRequirementV3,
  routeTargets: readonly BacktestPreflightTargetSourceV3[],
  result: Extract<MarketBarWindowReadResultV3, { status: 'unavailable' }>,
) => {
  const selection = result.selection;
  if (selection.reason === 'incompatible_backup') {
    return makeDiagnostic(requirement, routeTargets, {
      category: 'incompatible-price-basis',
      code: 'DATA_UNAVAILABLE',
      message: `主源不可用，备用源兼容门禁未通过${selection.compatibilityReason ? `（${selection.compatibilityReason}）` : ''}。`,
      action: 'select-compatible-route',
      actionDescription: '补齐并复核针对本标的和完整窗口的来源兼容证明后重新预检。',
      incompatibleRules: ['backup-source-compatibility'],
    });
  }

  const failure = selection.primaryFailure ?? selection.backupFailure;
  if (
    failure === 'pre_listing' ||
    failure === 'missing_window' ||
    failure === 'window_mismatch' ||
    failure === 'insufficient_warmup'
  ) {
    return makeDiagnostic(requirement, routeTargets, {
      category: 'insufficient-coverage',
      code: 'DATA_UNAVAILABLE',
      message:
        failure === 'pre_listing'
          ? '执行窗口早于已证明上市日期。'
          : failure === 'insufficient_warmup'
            ? '执行行情窗口未提供依赖计划要求的完整预热交易日。'
            : '执行行情未完整覆盖依赖计划要求的同一窗口。',
      action: 'repair-data-coverage',
      actionDescription: '补齐上市后、完整且与请求窗口一致的行情后重新预检。',
      missingFields: [
        ...(failure === 'pre_listing'
          ? ['coverageProof.listing.firstTradingDate']
          : failure === 'insufficient_warmup'
            ? ['coverageProof.warmupSessions']
            : ['coverageProof.completeRequestedWindow']),
      ],
    });
  }
  if (failure === 'provenance_mismatch' || failure === 'invalid_response') {
    return makeDiagnostic(requirement, routeTargets, {
      category: 'invalid-price-series',
      code: 'DATA_UNAVAILABLE',
      message: '执行行情响应与固定 RouteTarget、RouteKey 或覆盖证明不一致。',
      action: 'repair-price-series',
      actionDescription: '修复来源响应和 provenance 关联后重新预检。',
      missingFields: ['response.provenance', 'coverageProof'],
    });
  }
  if (selection.reason === 'invalid_input') {
    return makeDiagnostic(requirement, routeTargets, {
      category: 'input-invalid',
      code: 'INVALID_PARAMETER',
      message: '执行行情窗口请求未通过 V3 Reader 输入校验。',
      action: 'correct-input',
      actionDescription: '核对执行标的、精确 RouteKey 和完整日期窗口。',
      missingFields: ['executionRouteKey', 'executionWindow'],
    });
  }
  return makeDiagnostic(requirement, routeTargets, {
    category: 'data-unavailable',
    code: 'DATA_UNAVAILABLE',
    message:
      selection.reason === 'unsupported_granularity'
        ? '统一行情 Reader 当前不支持依赖计划要求的执行行情周期。'
        : selection.reason === 'catalog_unavailable'
          ? '精确来源目录不可用或不完整。'
          : selection.reason === 'policy_mismatch'
            ? 'Desired 与 Effective 路由策略不一致或不可用。'
            : selection.reason === 'route_not_configured'
              ? '执行行情 RouteKey 未配置可用来源。'
              : '执行行情来源当前不可用。',
    action:
      selection.reason === 'catalog_unavailable' || selection.reason === 'policy_mismatch'
        ? 'retry-preflight'
        : 'select-compatible-route',
    actionDescription:
      selection.reason === 'catalog_unavailable' || selection.reason === 'policy_mismatch'
        ? '恢复一致且完整的路由状态后重新预检。'
        : '配置并准入可提供该精确执行行情能力的来源后重新预检。',
    missingFields: [
      selection.reason === 'unsupported_granularity'
        ? 'executionBarCapability'
        : 'readyExecutionRouteTarget',
    ],
  });
};

const priceBasisMismatches = (response: MarketDataBarSeriesResponseV3, runConfig: RunConfigV3) => {
  const expected = runConfig.executionPriceProtocol.priceBasis;
  const actual = response.sourcePriceBasis;
  const fields = [
    'adjustment',
    'method',
    'methodVersion',
    'basisScope',
    'anchor',
    'revision',
    'observedAt',
    'volumeBasis',
    'dividendMeaning',
    'dividendEvidenceRef',
    'conversionAvailable',
    'conversionEvidenceRef',
    'derivation',
  ] as const satisfies readonly (keyof typeof actual)[];
  return fields.filter((field) => !isDeepStrictEqual(actual[field], expected[field]));
};

const selectedResponseDiagnostic = (
  requirement: BacktestPreflightRequirementV3,
  targets: readonly BacktestPreflightTargetSourceV3[],
  message: string,
  missingFields: readonly string[],
): BacktestPreflightDiagnosticV3 =>
  makeDiagnostic(requirement, targets, {
    category: 'invalid-price-series',
    code: 'DATA_UNAVAILABLE',
    message,
    action: 'repair-price-series',
    actionDescription: '修复执行行情响应和完整覆盖证明后重新预检。',
    missingFields,
  });

/** Read-only execution-window preflight; callers must recheck the stamp before creation/freeze. */
export const preflightBacktestExecutionWindowV3 = async (
  input: BacktestExecutionWindowPreflightInputV3,
): Promise<BacktestPreflightResultV3> => {
  const validated = validateInput(input);
  if (!validated.ok) return validated.result;
  const context = validated.value;
  const targets = input.context.routeRevisions.targetSources;
  const plan = input.dependencyPlan;

  const missingRevisions = [
    ...(context.stamp.desiredRevision === null ? ['desiredRevision'] : []),
    ...(context.stamp.effectiveRevision === null ? ['effectiveRevision'] : []),
    ...(context.stamp.catalogRevision === null ? ['catalogRevision'] : []),
  ];
  if (missingRevisions.length > 0) {
    return finish('blocked', context, [
      makeDiagnostic(context.requirement, targets, {
        category: 'data-unavailable',
        code: 'DATA_UNAVAILABLE',
        message: '缺少可绑定本次读取的 Desired、Effective 或 Catalog revision。',
        action: 'retry-preflight',
        actionDescription: '读取当前完整路由 revisions 和有序目标后重新预检。',
        missingFields: missingRevisions,
      }),
    ]);
  }

  if (plan.status === 'blocked' || plan.blockingIssues.length > 0) {
    const diagnosticContext = baseContextForDependencyIssue(context.requirement, targets, plan);
    const diagnostics = plan.blockingIssues.map((issue) =>
      mapBacktestDependencyIssueToPreflightDiagnosticV3(issue, diagnosticContext),
    );
    if (diagnostics.length === 0) {
      diagnostics.push(
        makeDiagnostic(context.requirement, targets, {
          category: 'data-unavailable',
          code: 'DATA_UNAVAILABLE',
          message: '依赖计划已阻断，但未提供可映射的结构化问题。',
          action: 'retry-preflight',
          actionDescription: '重新生成完整依赖计划后再执行预检。',
          missingFields: ['dependencyPlan.blockingIssues'],
        }),
      );
    }
    return finish('blocked', context, diagnostics);
  }

  const dataset = plan.datasets.find(
    (candidate) =>
      candidate.purpose === 'execution' && candidate.instrument === plan.executionInstrument,
  );
  if (!dataset) {
    return finish('blocked', context, [
      makeDiagnostic(context.requirement, targets, {
        category: 'data-unavailable',
        code: 'DATA_UNAVAILABLE',
        message: '依赖计划缺少唯一的执行行情窗口。',
        action: 'retry-preflight',
        actionDescription: '重新生成包含执行行情窗口的完整依赖计划。',
        missingFields: ['dependencyPlan.datasets.execution'],
      }),
    ]);
  }
  const routeKey = context.routeKey;
  const readInput: MarketBarWindowReadInputV3 = {
    market: routeKey.market,
    symbol: context.requirement.symbol!,
    routeKey,
    window: { start: dataset.range.startDate, end: dataset.range.endDate },
    ...(routeKey.market === 'CN' && context.runConfig.executionPriceProtocol.history.basis === 'fixed-provider-snapshot'
      ? { tradabilityMode: 'assume-untradable-no-bar' as const,
          priceResearch: context.runConfig.executionPriceProtocol.accountingBasis === 'normalized-series' } : {}),
    ...(context.runConfig.frozenExecutionWindow
      ? { frozenWindowRef: context.runConfig.frozenExecutionWindow }
      : {}),
    ...(context.runConfig.executionPriceProtocol.history.basis === 'point-in-time' ||
    context.runConfig.frozenExecutionWindow
      ? {
          warmup: {
            analysisStart: context.runConfig.startDate,
            minimumSessions: plan.warmup.lookbackPeriods,
          },
        }
      : {}),
    ...(input.context.compatibility ? { compatibility: input.context.compatibility } : {}),
  };

  let readResult: MarketBarWindowReadResultV3;
  try {
    readResult = await input.reader.readV3(readInput);
  } catch {
    return finish('blocked', context, [
      makeDiagnostic(context.requirement, targets, {
        category: 'data-unavailable',
        code: 'DATA_UNAVAILABLE',
        message: '统一 Market Reader 未能完成执行窗口读取。',
        action: 'retry-preflight',
        actionDescription: '确认来源、路由目录和读取服务可用后重新预检。',
      }),
    ]);
  }
  if (readResult.status === 'unavailable') {
    return finish('blocked', context, [
      mapWindowUnavailable(context.requirement, targets, readResult),
    ]);
  }

  const { selection, request, seriesVersion } = readResult;
  const expectedTarget = targets.find((target) => target.routeIndex === selection.routeIndex);
  if (
    !expectedTarget ||
    (context.runConfig.frozenExecutionWindow !== undefined &&
      !isDeepStrictEqual(readResult.frozenWindowRef, context.runConfig.frozenExecutionWindow)) ||
    request.symbol !== context.requirement.symbol ||
    request.routeKey.kind !== 'bar' ||
    !isDeepStrictEqual(request.routeKey, routeKey) ||
    request.start !== dataset.range.startDate ||
    request.end !== dataset.range.endDate ||
    request.routeTarget.providerId !== expectedTarget.providerId ||
    request.routeTarget.upstreamSource !== expectedTarget.upstreamSource ||
    request.routeTarget.routeIndex !== selection.routeIndex ||
    selection.target.providerId !== expectedTarget.providerId ||
    selection.target.upstreamSource !== expectedTarget.upstreamSource ||
    selection.desiredRevision !== context.stamp.desiredRevision ||
    selection.effectivePolicyRevision !== context.stamp.effectiveRevision ||
    selection.catalogRevision !== context.stamp.catalogRevision
  ) {
    return finish('blocked', context, [
      makeDiagnostic(context.requirement, targets, {
        category: 'data-unavailable',
        code: 'DATA_UNAVAILABLE',
        message: '执行窗口读取结果与预检上下文中的 RouteKey、目标或 revisions 不一致。',
        action: 'retry-preflight',
        actionDescription: '使用同一 Desired/Effective/Catalog revision 重新预检。',
        missingFields: ['exactExecutionRouteRevisionMatch'],
      }),
    ]);
  }

  const correlated = marketDataBarSeriesRequestResponseV3Schema.safeParse({
    request,
    response: selection.response,
  });
  if (
    !correlated.success ||
    selection.response.coverage.requestedStart !== dataset.range.startDate ||
    selection.response.coverage.requestedEnd !== dataset.range.endDate ||
    selection.response.provenance.effectivePolicyRevision !== context.stamp.effectiveRevision
  ) {
    return finish('blocked', context, [
      selectedResponseDiagnostic(
        context.requirement,
        targets,
        '选中执行行情未通过固定请求关联或完整覆盖校验。',
        ['requestResponseCorrelation', 'coverage.requestedStart', 'coverage.requestedEnd'],
      ),
    ]);
  }

  const basisMismatches = priceBasisMismatches(selection.response, context.runConfig);
  if (basisMismatches.length > 0) {
    return finish('blocked', context, [
      makeDiagnostic(context.requirement, targets, {
        category: 'incompatible-price-basis',
        code: 'DATA_UNAVAILABLE',
        message: '执行来源价格口径与 RunConfig 冻结的 executionPriceProtocol 不一致。',
        action: 'select-compatible-route',
        actionDescription: '选择满足已冻结价格协议的来源，或基于新协议重新创建运行。',
        incompatibleRules: basisMismatches.map((field) => `sourcePriceBasis.${field}`),
      }),
    ]);
  }

  const historyFailure = await backtestHistoricalExecutionPreflightFailureV3(
    {
      request,
      response: selection.response,
      seriesVersion,
      dataAsOf: context.runConfig.dataAsOf,
      fetchedAt: readResult.evidence.fetchedAt,
    },
    context.runConfig,
    input.reconstruction,
  );
  if (historyFailure) {
    const strict = context.runConfig.executionPriceProtocol.history.basis === 'point-in-time';
    return finish('blocked', context, [
      makeDiagnostic(context.requirement, targets, {
        category: 'point-in-time-unavailable',
        code: historyFailure.code,
        message: historyFailure.message,
        action: strict ? 'provide-point-in-time-evidence' : 'repair-price-series',
        actionDescription: strict
          ? '提供满足 dataAsOf 的来源修订、重建依据和逐 Bar 可见时间证据。'
          : '使用来源观测、行情时间与逐 Bar 可用时间均不晚于 dataAsOf 的固定快照重新预检。',
        missingFields: historyFailure.missingFields,
      }),
    ]);
  }

  if (!hasExecutableBacktestWindowV3(selection.response, context.runConfig)) {
    return finish('blocked', context, [
      selectedResponseDiagnostic(
        context.requirement,
        targets,
        '执行行情没有运行范围内的 Bar，或包含非正 OHLC，不能用于成交价格预检。',
        ['bars.open', 'bars.high', 'bars.low', 'bars.close'],
      ),
    ]);
  }

  return finish('ready', context, []);
};
