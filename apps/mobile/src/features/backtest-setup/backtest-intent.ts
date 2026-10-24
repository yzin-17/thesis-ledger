import {
  backtestRunPreparationIntentV3Schema,
  backtestRunPreparationRequestV3Schema,
  createNavPreparationRequest,
} from '@thesis-ledger/schemas';
export type BacktestForm = {
  start: string;
  end: string;
  cash: string;
  currency: 'CNY' | 'HKD' | 'USD';
  model: string;
  adjustment: 'none' | 'qfq' | 'hfq';
  history: 'fixed-provider-snapshot' | 'point-in-time';
  evidence: string;
  extras: string;
  symbol: string;
  fundType: 'domestic' | 'qdii';
  calendar: string;
  domestic: string;
  calendarConfirmed: boolean;
  domesticConfirmed: boolean;
};
export function newBacktestForm(symbol: string, now = new Date()): BacktestForm {
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
    cash: '100000',
    currency: 'CNY',
    model: '',
    adjustment: 'none',
    history: 'fixed-provider-snapshot',
    evidence: '',
    extras: '{}',
    symbol,
    fundType: 'domestic',
    calendar: '',
    domestic: '',
    calendarConfirmed: false,
    domesticConfirmed: false,
  };
}
function common(form: BacktestForm, nav: boolean, now: string) {
  return {
    startDate: form.start,
    endDate: form.end,
    ...(!nav ? { dataAsOf: now } : {}),
    baseCurrency: form.currency,
    initialCash: { [form.currency]: form.cash },
    valuationPolicy: {
      baseTimezone: (
        { CNY: 'Asia/Shanghai', HKD: 'Asia/Hong_Kong', USD: 'America/New_York' } as const
      )[form.currency],
      dailyValuationTime: '16:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel: JSON.parse(form.model) as unknown,
  };
}
export function ordinaryPreparationIntentBase(form: BacktestForm, requestId: string, now: string) {
  const extras: unknown = JSON.parse(form.extras);
  if (!extras || typeof extras !== 'object' || Array.isArray(extras))
    throw Error('研究选项必须是 JSON 对象。');
  const allowed = [
    'lifecycleResearch',
    'warmupBudgetSessions',
    'marketRuleResearch',
    'cashEventResearch',
    'knownCashResearch',
    'reuseResearchData',
  ];
  if (Object.keys(extras).some((v) => !allowed.includes(v)))
    throw Error('研究选项只能包含已支持的预热、现金或原价规则决策。');
  return backtestRunPreparationIntentV3Schema.parse({
    ...extras,
    contractVersion: 3,
    requestId,
    adjustment: form.adjustment,
    accountingBasis: form.adjustment === 'none' ? 'raw-events' : 'normalized-series',
    history:
      form.history === 'point-in-time'
        ? { basis: form.history, reconstructionEvidenceRef: form.evidence.trim() }
        : { basis: form.history },
    freezeTimePolicy:
      form.history === 'fixed-provider-snapshot' ? 'after-acquisition' : 'requested-time',
    runConfig: common(form, false, now),
  });
}
export function ordinaryPreparationIntent(
  form: BacktestForm,
  versionId: string,
  requestId: string,
  now: string,
) {
  return backtestRunPreparationRequestV3Schema.parse({
    ...ordinaryPreparationIntentBase(form, requestId, now),
    strategyVersionId: versionId,
  });
}
export function navPreparationIntent(
  form: BacktestForm,
  versionId: string,
  requestId: string,
  now: string,
) {
  const config = {
    ...common(form, true, now),
    schemaVersion: '3',
    navInput: { kind: 'nav', symbol: form.symbol },
  };
  // 由现行 Schema 校验完整净值配置，不补造来源、可见时点或日历决策。
  return createNavPreparationRequest({
    requestId,
    strategyVersionId: versionId,
    runConfig: config as Parameters<typeof createNavPreparationRequest>[0]['runConfig'],
    calendarDecisionRaw: form.calendar,
    calendarDecisionConfirmed: form.calendarConfirmed,
    ...(form.fundType === 'domestic'
      ? {
          fundType: form.fundType,
          domesticRuleDecisionRaw: form.domestic,
          domesticRuleDecisionConfirmed: form.domesticConfirmed,
        }
      : { fundType: form.fundType, domesticRuleDecisionRaw: null }),
  });
}
