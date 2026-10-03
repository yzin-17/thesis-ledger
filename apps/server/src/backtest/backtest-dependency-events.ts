import type {
  AssetSymbolRef,
  BacktestCorporateActionsResponse,
  CorporateActionFact,
  RunConfigV3,
  BacktestStrategy,
} from '@thesis-ledger/schemas';
import { compareMarketPitEvidenceInstantStringsV1 } from '@thesis-ledger/schemas';
import type {
  BacktestDependencyPlanIssue,
  BacktestEventDependency,
  BacktestPlannedDataset,
} from './backtest-dependency-plan.js';

const instrumentTypes = { stock: 'STOCK', etf: 'ETF', fund: 'NAV_FUND' } as const;

const instrumentKey = (instrument: AssetSymbolRef) =>
  `${instrument.market}:${instrument.symbol}:${instrument.assetType}`;

export const collectEventTypes = (strategy: Pick<BacktestStrategy, 'entry' | 'exit'>): CorporateActionFact['type'][] => {
  const types = new Set<CorporateActionFact['type']>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (
      node.type === 'corporateActionEvent' &&
      (node.eventType === 'CASH_DIVIDEND' ||
        node.eventType === 'SPLIT' ||
        node.eventType === 'REVERSE_SPLIT')
    ) {
      types.add(node.eventType);
    }
    Object.values(node).forEach(visit);
  };
  visit(strategy.entry);
  visit(strategy.exit);
  return [...types].sort();
};

const issue = (
  code: BacktestDependencyPlanIssue['code'],
  path: readonly (string | number)[],
  message: string,
): BacktestDependencyPlanIssue => ({ code, path, message });

const covers = (
  response: BacktestCorporateActionsResponse,
  range: BacktestEventDependency['effectiveDateWindow'],
) =>
  response.coverage.complete &&
  response.coverage.start !== null &&
  response.coverage.end !== null &&
  response.coverage.start <= range.startDate &&
  response.coverage.end >= range.endDate;

const factMatches = (fact: CorporateActionFact, instrument: AssetSymbolRef) =>
  fact.symbol === instrument.symbol &&
  fact.market === instrument.market &&
  fact.instrumentType === instrumentTypes[instrument.assetType];

export const deriveEventDependencyPlan = (
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  warmupStartDate: string,
  responses: Readonly<Record<string, BacktestCorporateActionsResponse>> | undefined,
) => {
  const instrument = strategy.executionInstrument;
  const instrumentId = instrumentKey(instrument);
  const signalTypes = collectEventTypes(strategy);
  const dependencies: BacktestEventDependency[] = [];
  if (runConfig.executionPriceProtocol.accountingBasis === 'raw-events') {
    dependencies.push({
      instrument: instrumentId,
      purpose: 'raw-accounting',
      effectiveDateWindow: { startDate: runConfig.startDate, endDate: runConfig.endDate },
      eventTypes: ['CASH_DIVIDEND', 'REVERSE_SPLIT', 'SPLIT'],
      requiredFields: [
        'symbol',
        'market',
        'instrumentType',
        'type',
        'effectiveDate',
        'ratio for split/reverse split',
        'cashAmount and currency for cash dividend',
      ],
      completeCoverageRequired: true,
      visibilityRequired: false,
    });
  }
  if (signalTypes.length > 0) {
    dependencies.push({
      instrument: instrumentId,
      purpose: 'strategy-signal',
      effectiveDateWindow: { startDate: warmupStartDate, endDate: runConfig.endDate },
      eventTypes: signalTypes,
      requiredFields: [
        'symbol',
        'market',
        'instrumentType',
        'type',
        'effectiveDate',
        'strategyVisibility',
      ],
      completeCoverageRequired: true,
      visibilityRequired: true,
    });
  }

  const issues: BacktestDependencyPlanIssue[] = [];
  const response = responses?.[instrumentId];
  let validation: 'not-required' | 'pending' | 'complete' | 'blocked' = 'not-required';
  if (dependencies.length > 0 && !responses) {
    validation = 'pending';
  } else if (dependencies.length > 0 && !response) {
    validation = 'pending';
    issues.push(
      issue(
        'EVENT_COVERAGE_UNAVAILABLE',
        ['corporateActionResponses', instrumentId],
        `缺少 ${instrumentId} 的公司行动覆盖响应`,
      ),
    );
  } else if (dependencies.length > 0 && response) {
    let blocked = false;
    for (const dependency of dependencies) {
      if (response.status !== 'supported') {
        blocked = true;
        issues.push(
          issue(
            'EVENT_COVERAGE_UNAVAILABLE',
            ['corporateActionResponses', instrumentId, 'status'],
            response.reason ?? `${instrumentId} 的公司行动能力不可用`,
          ),
        );
        continue;
      }
      if (!covers(response, dependency.effectiveDateWindow)) {
        blocked = true;
        issues.push(
          issue(
            'EVENT_COVERAGE_INCOMPLETE',
            ['corporateActionResponses', instrumentId, 'coverage'],
            `${instrumentId} 的公司行动覆盖未完整覆盖 ${dependency.effectiveDateWindow.startDate}..${dependency.effectiveDateWindow.endDate}`,
          ),
        );
      }
      const relevantFacts = response.facts.filter(
        (fact) =>
          factMatches(fact, instrument) &&
          (dependency.purpose === 'raw-accounting' || dependency.eventTypes.includes(fact.type)),
      );
      for (const fact of relevantFacts) {
        if (!fact.effectiveDate) {
          blocked = true;
          issues.push(
            issue(
              'EVENT_EFFECTIVE_DATE_MISSING',
              ['corporateActionResponses', instrumentId, 'facts'],
              `${fact.type} 公司行动缺少 effectiveDate，不能判断其是否影响本次窗口`,
            ),
          );
          continue;
        }
        const range = dependency.effectiveDateWindow;
        if (fact.effectiveDate < range.startDate || fact.effectiveDate > range.endDate) continue;
        const availableAtOrder = compareMarketPitEvidenceInstantStringsV1(
          fact.availableAt,
          runConfig.dataAsOf,
        );
        if (availableAtOrder === undefined || availableAtOrder > 0) {
          blocked = true;
          issues.push(
            issue(
              'EVENT_FACT_AFTER_DATA_AS_OF',
              ['corporateActionResponses', instrumentId, 'facts'],
              `${fact.type} 公司行动的 availableAt 无效或晚于 dataAsOf`,
            ),
          );
        }
        if (dependency.visibilityRequired && fact.strategyVisibility === undefined) {
          blocked = true;
          issues.push(
            issue(
              'EVENT_STRATEGY_VISIBILITY_MISSING',
              ['corporateActionResponses', instrumentId, 'facts'],
              `${fact.type} 事件信号缺少 strategyVisibility；occurredAt/availableAt 不能替代`,
            ),
          );
        }
        if (dependency.visibilityRequired && fact.strategyVisibility?.kind === 'announcement') {
          const announcementAtOrder = compareMarketPitEvidenceInstantStringsV1(
            fact.strategyVisibility.announcedAt,
            runConfig.dataAsOf,
          );
          if (announcementAtOrder === undefined || announcementAtOrder > 0) {
            blocked = true;
            issues.push(
              issue(
                'EVENT_FACT_AFTER_DATA_AS_OF',
                ['corporateActionResponses', instrumentId, 'facts', 'strategyVisibility'],
                '事件公告可见时间晚于 dataAsOf',
              ),
            );
          }
        }
      }
    }
    validation = blocked ? 'blocked' : 'complete';
  }

  const datasets: BacktestPlannedDataset[] = dependencies.map((dependency) => ({
    instrument: dependency.instrument,
    purpose: 'corporateActions',
    requestedTimeframe: '1d',
    baseTimeframe: '1d',
    range: dependency.effectiveDateWindow,
  }));
  return {
    dependencies,
    requiredInstruments: dependencies.length > 0 ? [instrumentId] : [],
    validation,
    issues,
    datasets,
  };
};
