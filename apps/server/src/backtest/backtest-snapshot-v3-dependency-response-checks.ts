import {
  backtestCalendarResponseSchema,
  backtestCorporateActionsResponseSchema,
  backtestInstrumentFactsResponseSchema,
  marketCalendarTimezonesV3,
  type BacktestCalendarResponse,
  type BacktestCorporateActionsResponse,
  type BacktestDependencyCoverage,
  type BacktestInstrumentFactsResponse,
  type CorporateActionFact,
  type InstrumentFact,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { composeSnapshotIdentityTradabilityV3 } from './backtest-snapshot-v3-identity-tradability.js';
import { freezeTradabilityRowsV3, validateSnapshotTradabilityV3 } from './backtest-snapshot-v3-tradability.js';
import type { BacktestDependencyPlan } from './backtest-dependency-plan.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import { isBacktestEvidenceAfterDataAsOfV3 } from './backtest-v3-evidence-clock.js';
import type {
  DependencyRequest,
  SnapshotDependencyV3Input,
} from './backtest-snapshot-v3-dependencies.js';
import {
  SnapshotDependencyV3Error,
  type SnapshotDependencyV3ErrorReason,
} from './backtest-snapshot-v3-dependency-error.js';
import {
  identityForAsset,
  instrumentIdentity,
} from './backtest-snapshot-v3-dependency-instrument-identity.js';

type DependencyPurpose = DependencyRequest['purpose'];
type DependencyResponse =
  BacktestCalendarResponse | BacktestInstrumentFactsResponse | BacktestCorporateActionsResponse;
const currencyByMarket = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;
function fail(reason: SnapshotDependencyV3ErrorReason, message: string): never {
  throw new SnapshotDependencyV3Error(reason, message);
}

const compareDateRange = (
  coverage: BacktestDependencyCoverage,
  requested: { start: string; end: string },
  purpose: DependencyPurpose,
  identity: string,
): void => {
  if (
    !coverage.complete ||
    coverage.start === null ||
    coverage.end === null ||
    coverage.start > requested.start ||
    coverage.end < requested.end
  ) {
    fail(
      'response_unavailable',
      `Snapshot V3 ${purpose} 覆盖未完整覆盖 ${identity} ${requested.start}..${requested.end}`,
    );
  }
};

const factAvailableAt = (value: string, dataAsOf: string, identity: string): void => {
  if (isBacktestEvidenceAfterDataAsOfV3(value, dataAsOf)) {
    fail('future_fact', `Snapshot V3 事实晚于 dataAsOf 或可用时间无效: ${identity}`);
  }
};

const scalarRows = (facts: readonly object[]): ArtifactRow[] =>
  facts.map((fact) =>
    Object.fromEntries(
      Object.entries(fact).map(([key, value]) => {
        if (
          value === undefined ||
          value === null ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          return [key, value ?? null];
        }
        return [key, canonicalizeManifest(value)];
      }),
    ),
  );

const makeEmptyFactRow = (purpose: 'corporateActions', identity: string): ArtifactRow => ({
  kind: 'empty-dataset',
  purpose,
  instrument: identity,
});

const corporateActionFactsForPlan = (
  response: BacktestCorporateActionsResponse,
  dependencies: BacktestDependencyPlan['corporateActions']['dependencies'],
): CorporateActionFact[] =>
  response.facts.filter((fact) =>
    dependencies.some(
      (dependency) =>
        dependency.eventTypes.includes(fact.type) &&
        fact.effectiveDate !== undefined &&
        fact.effectiveDate >= dependency.effectiveDateWindow.startDate &&
        fact.effectiveDate <= dependency.effectiveDateWindow.endDate,
    ),
  );

const rowFactsForResponse = (
  request: DependencyRequest,
  response:
    BacktestCalendarResponse | BacktestInstrumentFactsResponse | BacktestCorporateActionsResponse,
): readonly object[] => {
  if (request.purpose === 'calendar') {
    const calendar = response as BacktestCalendarResponse;
    const facts = calendar.facts.filter((fact) => fact.market === request.identity);
    if (facts.length !== calendar.facts.length) {
      fail(
        'response_scope_mismatch',
        `Snapshot V3 Calendar 响应包含其他市场事实: ${request.identity}`,
      );
    }
    return facts;
  }
  if (request.purpose === 'instrumentFacts') {
    const instrumentRequest = request.request;
    const instrument = instrumentIdentity(request.identity);
    const facts = (response as BacktestInstrumentFactsResponse).facts.filter(
      (fact) =>
        fact.symbol === instrument.symbol &&
        fact.market === instrument.market &&
        fact.instrumentType === instrument.instrumentType,
    );
    if (facts.length !== (response as BacktestInstrumentFactsResponse).facts.length) {
      fail(
        'response_scope_mismatch',
        `Snapshot V3 instrumentFacts 响应包含其他标的事实: ${request.identity}`,
      );
    }
    if (
      facts.some(
        (fact) =>
          fact.symbol !== instrumentRequest.symbol ||
          fact.market !== instrumentRequest.market ||
          fact.instrumentType !== instrumentRequest.instrumentType,
      )
    ) {
      fail(
        'response_scope_mismatch',
        `Snapshot V3 instrumentFacts 响应标的与请求不一致: ${request.identity}`,
      );
    }
    return facts;
  }
  const actionResponse = response as BacktestCorporateActionsResponse;
  const instrument = instrumentIdentity(request.identity);
  if (
    actionResponse.facts.some(
      (fact) =>
        fact.symbol !== instrument.symbol ||
        fact.market !== instrument.market ||
        fact.instrumentType !== instrument.instrumentType,
    )
  ) {
    fail(
      'response_scope_mismatch',
      `Snapshot V3 corporateActions 响应包含其他标的事实: ${request.identity}`,
    );
  }
  return corporateActionFactsForPlan(actionResponse, request.dependencies);
};

const modelScopeMatchesFact = (
  input: SnapshotDependencyV3Input,
  identity: string,
  fact: InstrumentFact,
): boolean => {
  const model = input.runConfig.executionModel;
  if (!model || identity !== identityForAsset(input.strategy.executionInstrument)) return true;
  return (
    model.scope.symbol === fact.symbol &&
    model.scope.market === fact.market &&
    model.scope.instrumentType === fact.instrumentType &&
    model.scope.currency === fact.currency
  );
};

const validateCalendarResponseFacts = (
  input: SnapshotDependencyV3Input,
  request: Extract<DependencyRequest, { purpose: 'calendar' }>,
  response: DependencyResponse,
): void => {
  const typedResponse = response as BacktestCalendarResponse;
  if (typedResponse.facts.length === 0) {
    fail('fact_unavailable', `Snapshot V3 缺少 Calendar 事实: ${request.identity}`);
  }
  for (const fact of typedResponse.facts) {
    if (
      fact.market !== request.identity ||
      fact.timezone !== marketCalendarTimezonesV3[fact.market] ||
      (input.runConfig.executionModel?.scope.market === fact.market &&
        input.runConfig.executionModel.scope.timezone !== fact.timezone)
    ) {
      fail('response_scope_mismatch', `Snapshot V3 Calendar 市场或时区不匹配: ${request.identity}`);
    }
    if (
      fact.range.start === null ||
      fact.range.end === null ||
      fact.range.start > request.range.start ||
      fact.range.end < request.range.end
    ) {
      fail(
        'response_scope_mismatch',
        `Snapshot V3 Calendar 事实未覆盖请求范围: ${request.identity}`,
      );
    }
    factAvailableAt(fact.availableAt, input.runConfig.dataAsOf, request.identity);
  }
};

const validateInstrumentResponseFacts = (
  input: SnapshotDependencyV3Input,
  request: Extract<DependencyRequest, { purpose: 'instrumentFacts' }>,
  response: DependencyResponse,
): void => {
  const typedResponse = response as BacktestInstrumentFactsResponse;
  const instrument = instrumentIdentity(request.identity);
  if ((typedResponse.historicalTradability || typedResponse.historicalTradabilityWindows) && !input.tradabilityWindow) {
    fail('request_scope_invalid', '逐日可交易性响应缺少可核对的冻结行情');
  }
  if (input.tradabilityWindow && instrument.market === 'CN') {
    validateSnapshotTradabilityV3(input.tradabilityWindow, input.runConfig, request.range, typedResponse);
  }
  if (typedResponse.facts.length === 0) {
    fail('fact_unavailable', `Snapshot V3 缺少标的历史事实: ${request.identity}`);
  }
  if (typedResponse.missingInputs?.some((missing) => missing.category === 'criticalFact')) {
    fail('fact_unavailable', `Snapshot V3 标的历史事实缺少关键字段: ${request.identity}`);
  }
  for (const fact of typedResponse.facts) {
    if (
      fact.symbol !== instrument.symbol ||
      fact.market !== instrument.market ||
      fact.instrumentType !== instrument.instrumentType ||
      fact.currency !== currencyByMarket[instrument.market]
    ) {
      fail('response_scope_mismatch', `Snapshot V3 标的身份或币种不匹配: ${request.identity}`);
    }
    if (!fact.tradable && !(input.tradabilityWindow && (typedResponse.historicalTradability || typedResponse.historicalTradabilityWindows))) {
      fail('fact_unavailable', `Provider 未证明标的历史可交易性: ${instrument.symbol}`);
    }
    if (!modelScopeMatchesFact(input, request.identity, fact)) {
      fail(
        'model_scope_mismatch',
        `Snapshot V3 标的事实与冻结执行模型适用范围不一致: ${identityForAsset(input.strategy.executionInstrument)}`,
      );
    }
    factAvailableAt(fact.availableAt, input.runConfig.dataAsOf, request.identity);
  }
};

const validateCorporateActionResponseFacts = (
  input: SnapshotDependencyV3Input,
  request: Extract<DependencyRequest, { purpose: 'corporateActions' }>,
  response: DependencyResponse,
): void => {
  const typedResponse = response as BacktestCorporateActionsResponse;
  const instrument = instrumentIdentity(request.identity);
  for (const fact of typedResponse.facts) {
    if (
      fact.symbol !== instrument.symbol ||
      fact.market !== instrument.market ||
      fact.instrumentType !== instrument.instrumentType
    ) {
      fail('response_scope_mismatch', `Snapshot V3 公司行动标的与请求不一致: ${request.identity}`);
    }
    factAvailableAt(fact.availableAt, input.runConfig.dataAsOf, request.identity);
  }
};

export const validateSnapshotDependencyResponseV3 = (
  input: SnapshotDependencyV3Input,
  request: DependencyRequest,
  value: unknown,
): {
  response:
    BacktestCalendarResponse | BacktestInstrumentFactsResponse | BacktestCorporateActionsResponse;
  facts: readonly object[];
  rows: ArtifactRow[];
} => {
  let response:
    BacktestCalendarResponse | BacktestInstrumentFactsResponse | BacktestCorporateActionsResponse;
  try {
    if (request.purpose === 'calendar') {
      response = backtestCalendarResponseSchema.parse(value);
    } else if (request.purpose === 'instrumentFacts') {
      response = backtestInstrumentFactsResponseSchema.parse(value);
    } else {
      response = backtestCorporateActionsResponseSchema.parse(value);
    }
  } catch {
    return fail(
      'response_contract_invalid',
      `Snapshot V3 ${request.purpose} 响应未通过严格 Schema 校验: ${request.identity}`,
    );
  }
  if (response.status !== 'supported') {
    fail(
      'response_unavailable',
      response.reason ?? `Snapshot V3 ${request.purpose} 未受支持: ${request.identity}`,
    );
  }
  compareDateRange(response.coverage, request.range, request.purpose, request.identity);

  if (request.purpose === 'calendar') {
    validateCalendarResponseFacts(input, request, response);
  } else if (request.purpose === 'instrumentFacts') {
    response = composeSnapshotIdentityTradabilityV3(input, request, response as BacktestInstrumentFactsResponse);
    validateInstrumentResponseFacts(input, request, response);
  } else {
    validateCorporateActionResponseFacts(input, request, response);
  }

  const facts = rowFactsForResponse(request, response);
  const rows = scalarRows(facts);
  if (request.purpose === 'instrumentFacts') {
    freezeTradabilityRowsV3(rows, response as BacktestInstrumentFactsResponse);
  }
  if (request.purpose === 'corporateActions' && rows.length === 0) {
    // Parquet requires a column even for a trusted empty dependency. The row is a
    // typed sentinel, while the complete response/coverage proof remains metadata.
    rows.push(makeEmptyFactRow('corporateActions', request.identity));
  }
  return { response, facts, rows };
};
