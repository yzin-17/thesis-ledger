import { strategyRequiredLookback } from '@thesis-ledger/domain';
import {
  backtestNavRouteKeyV3Schema,
  backtestNavRunConfigV3Schema,
  strategySchema,
  type BacktestNavRunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { assertSupportedNavStrategy, navConfirmationBudget } from './backtest-nav-input-budget.js';
import { planNavVisibility } from './backtest-nav-visibility.js';
import {
  resolveNavDateRanges,
  validateNavPlanningCalendar,
  type NavPlanningCalendar,
} from './backtest-nav-planning-calendar.js';

/** 规划数据与可见性日历范围；来源选择、逐条原文核验和冻结由准备阶段完成。 */
export const planNavSnapshotInputsV3 = (input: {
  strategy: BacktestStrategy;
  runConfig: BacktestNavRunConfigV3;
  calendar: NavPlanningCalendar;
}) => {
  const strategy = strategySchema.parse(input.strategy) as BacktestStrategy;
  const runConfig = backtestNavRunConfigV3Schema.parse(input.runConfig);
  const signalSources = assertSupportedNavStrategy(strategy, runConfig);
  const calendar = validateNavPlanningCalendar(
    input.calendar,
    runConfig.navInput.symbol,
    runConfig.dataAsOf,
    runConfig.navVisibility.mode,
  );
  const lookback = strategyRequiredLookback(strategy);
  const budget = navConfirmationBudget(runConfig);
  const runWindow = { startDate: runConfig.startDate, endDate: runConfig.endDate };
  const dates = resolveNavDateRanges(
    calendar,
    runWindow,
    lookback.required,
    budget.tailTradingDays,
  );
  const instrument = `CN:${runConfig.navInput.symbol}:fund`;
  const visibility = planNavVisibility(runConfig, calendar, dates.expectedValuationDates);
  return {
    version: 'nav-input-plan-v1' as const,
    inputKind: 'nav' as const,
    runWindow,
    dataAsOf: runConfig.dataAsOf,
    executionInstrument: instrument,
    routeKey: backtestNavRouteKeyV3Schema.parse({
      kind: 'data',
      market: 'CN',
      assetType: 'MUTUAL_FUND',
      capability: 'FUND_NAV_HISTORY',
    }),
    signalSources: signalSources.map(({ id, timeframe, fields }) => ({
      id,
      instrument,
      timeframe,
      fields,
    })),
    benchmark: { instrument, explicit: strategy.benchmark !== undefined, range: runWindow },
    warmup: {
      lookbackPeriods: lookback.required,
      entry: lookback.entry,
      exit: lookback.exit,
      startDate: dates.navRange.startDate,
      rangePolicyVersion: 'nav-valuation-calendar-v1' as const,
      expectedValuationDates: dates.warmupDates,
    },
    ...dates,
    visibility,
    requiredCalendarRange: {
      startDate: dates.calendarRange.startDate,
      endDate:
        visibility.disclosureRange &&
        visibility.disclosureRange.endDate > dates.calendarRange.endDate
          ? visibility.disclosureRange.endDate
          : dates.calendarRange.endDate,
    },
    priceInputs: [
      {
        purpose: 'execution' as const,
        artifactKey: 'execution/nav.parquet' as const,
        range: dates.navRange,
      },
      ...signalSources.map((source) => ({
        purpose: 'signal' as const,
        sourceId: source.id,
        artifactKey: 'execution/nav.parquet' as const,
        range: dates.navRange,
      })),
      {
        purpose: 'benchmark' as const,
        artifactKey: 'execution/nav.parquet' as const,
        range: runWindow,
      },
    ],
    calendarEvidence: {
      symbol: calendar.symbol,
      market: calendar.market,
      timezone: calendar.timezone,
      version: calendar.version,
      contentHash: calendar.contentHash,
      evidenceRef: calendar.evidenceRef,
      availableAt: calendar.availableAt,
      coverage: calendar.coverage,
    },
    executionModel: { id: runConfig.executionModel.id, version: runConfig.executionModel.version },
    periodEnd: { behavior: 'retain-pending' as const, resultEndDate: runConfig.endDate, ...budget },
  };
};

export type NavSnapshotInputPlanV3 = ReturnType<typeof planNavSnapshotInputsV3>;
