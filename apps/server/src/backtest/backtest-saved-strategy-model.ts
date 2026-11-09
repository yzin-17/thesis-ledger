import {
  backtestExecutionModelSchemaV3,
  compareMarketPitEvidenceInstantStringsV1,
  type BacktestInstrumentFactsResponse,
  type BacktestModelResolutionRequest,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { DecimalValue } from '@thesis-ledger/domain';
import { strategyExecutionFees } from './backtest-strategy-model-cost.js';

type Fact = BacktestInstrumentFactsResponse['facts'][number];
type SavedModelStrategy = Pick<BacktestStrategy, 'cost' | 'executionInstrument'>;
type SupportedRules = Extract<Fact['executionRules'], { status: 'supported' }>;
const nextDay = (day: string, offset = 1) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const timezones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };
const feeNames: Record<string, string> = {
  STAMP_DUTY: 'stampDuty',
  stampDuty: 'stampDuty',
  TRANSFER_FEE: 'transferFee',
  transferFee: 'transferFee',
  REGULATORY_FEE: 'regulatoryFee',
  regulatoryFee: 'regulatoryFee',
  HANDLING_FEE: 'handlingFee',
  handlingFee: 'handlingFee',
  AFRC_LEVY: 'afrcLevy',
  afrcLevy: 'afrcLevy',
};

function modelFees(
  strategy: SavedModelStrategy,
  rules: SupportedRules,
  currency: BacktestModelResolutionRequest['currency'],
) {
  const fees: Record<string, unknown> = { ...strategyExecutionFees(strategy.cost, currency) };
  for (const name of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'])
    fees[name] = {
      treatment: 'notApplicable',
      reason: '来源执行规则未单独列示此费项，沿用该规则包的收费范围。',
    };
  const assigned = new Set<string>();
  for (const charge of rules.statutoryCharges) {
    const name = Object.hasOwn(feeNames, charge.code) ? feeNames[charge.code] : undefined;
    if (!name || assigned.has(name))
      throw new Error('该区间的市场收费规则暂时无法自动解析，请更新规则数据后重试。');
    assigned.add(name);
    fees[name] = {
      treatment: 'charged',
      side: charge.side,
      basis: 'turnover',
      currency,
      rate: charge.rate,
      minimum:
        charge.minimum && DecimalValue.from(charge.minimum).isPositive()
          ? { kind: 'amount', amount: charge.minimum }
          : { kind: 'none' },
    };
  }
  return fees;
}

function modelExecution(
  rules: SupportedRules,
  request: BacktestModelResolutionRequest,
  market: 'CN' | 'HK' | 'US',
) {
  if (rules.cashSettlement.buyDebitAfterTradingDays !== 0)
    throw new Error('该标的的买入资金结算时序暂不支持自动回测。');
  const normalized = request.adjustment !== 'none';
  const { maxUpRatio, maxDownRatio } = rules.price;
  let price: unknown;
  if (normalized) {
    price = {
      kind: 'noDailyLimit',
      reason: '按所选复权口径进行归一化研究，不套用真实价格涨跌停。',
    };
  } else if (maxUpRatio === null && maxDownRatio === null) {
    price = { kind: 'noDailyLimit', reason: '来源执行规则明确未设置日涨跌幅限制。' };
  } else {
    if (
      !maxUpRatio ||
      !maxDownRatio ||
      !DecimalValue.from(maxUpRatio).isPositive() ||
      !DecimalValue.from(maxDownRatio).isPositive()
    )
      throw new Error('该区间的涨跌幅规则不完整，请更新市场规则后重试。');
    price = {
      kind: 'dailyLimit',
      reference: 'previousRawClose',
      maxUpRatio,
      maxDownRatio,
      rounding: 'halfUpToTick',
      minimumDistanceTicks: 1,
      minimumPriceTicks: 1,
    };
  }
  return {
    mode: 'exchange',
    calendarMarket: market,
    reserveCashAt: 'orderAccepted',
    buyDebitAt: 'fill',
    sellableAfterTradingDays: rules.positionSettlement.sellableAfterTradingDays,
    saleReinvestableAfterTradingDays: rules.cashSettlement.sellCreditAfterTradingDays,
    price,
    ...(normalized
      ? {
          normalizedExecution: {
            priceCoordinate: 'continuous-decimal',
            quantityUnits: 'continuous-normalized-decimal',
            lotSizeConstraint: 'not-applied',
            tickSizeConstraint: 'not-applied',
            dailyPriceLimit: 'not-applied',
            feeBasis: 'simulatedTurnover',
          },
        }
      : {}),
  };
}

/** 只组装已保存的策略成本及覆盖区间的来源规则，不从代码或名称猜市场参数。 */
export function savedStrategyExecutionModel(
  request: BacktestModelResolutionRequest,
  strategy: SavedModelStrategy,
  response: BacktestInstrumentFactsResponse,
  configuredAt: string,
) {
  const instrument = strategy.executionInstrument;
  const type = instrument.assetType === 'stock' ? 'STOCK' : 'ETF';
  if (
    response.status !== 'supported' ||
    !response.coverage.complete ||
    !response.coverage.start ||
    response.coverage.start > request.startDate ||
    !response.coverage.end ||
    response.coverage.end < request.endDate
  )
    throw new Error('所选区间的市场交易规则尚未齐备，请更新数据或调整回测日期后重试。');
  const facts = response.facts.filter((fact) => {
    const occurred = compareMarketPitEvidenceInstantStringsV1(fact.occurredAt, configuredAt);
    const available = compareMarketPitEvidenceInstantStringsV1(fact.availableAt, configuredAt);
    return (
      fact.symbol === instrument.symbol &&
      fact.market === instrument.market &&
      fact.instrumentType === type &&
      fact.currency === request.currency &&
      occurred !== undefined &&
      occurred <= 0 &&
      available !== undefined &&
      available <= 0 &&
      fact.executionRules.status === 'supported'
    );
  });
  const endExclusive = nextDay(request.endDate);
  const boundaries = new Set([request.startDate, endExclusive]);
  for (const fact of facts) {
    const rules = fact.executionRules as SupportedRules;
    if (rules.range.end < request.startDate || rules.range.start > request.endDate) continue;
    boundaries.add(rules.range.start < request.startDate ? request.startDate : rules.range.start);
    const end = nextDay(rules.range.end);
    boundaries.add(end > endExclusive ? endExclusive : end);
  }
  const dates = [...boundaries].sort();
  const segments: unknown[] = [];
  for (let index = 0; index < dates.length - 1; index += 1) {
    const start = dates[index]!,
      end = nextDay(dates[index + 1]!, -1);
    const matching = facts.filter((fact) => {
      const rules = fact.executionRules as SupportedRules;
      return rules.range.start <= start && rules.range.end >= end;
    });
    if (!matching.length)
      throw new Error('所选区间缺少完整的市场执行规则，请更新数据或调整日期后重试。');
    const configurations = matching.map((fact) => {
      const rules = fact.executionRules as SupportedRules;
      return {
        fees: modelFees(strategy, rules, request.currency),
        execution: modelExecution(rules, request, instrument.market),
      };
    });
    if (new Set(configurations.map(hashCanonicalManifest)).size !== 1)
      throw new Error('所选区间存在相互冲突的市场规则，请核对来源后重试。');
    const fact = matching[0]!;
    segments.push({
      id: `saved-strategy-${index + 1}`,
      range: { start, end },
      ...configurations[0],
      source: {
        kind: 'researchPreset',
        configuredAt,
        description: '沿用已保存策略的成本与成交设置，并使用来源市场规则。',
        references: matching.map(
          (row) => `instrument-facts:${row.provider}:${row.providerRevision}`,
        ),
        revision: (fact.executionRules as SupportedRules).version,
      },
      assumptions: [
        '佣金、最低佣金及滑点沿用已保存策略，滑点仍由策略执行器单独计算。',
        '法定收费与结算时序按本区间来源规则；未列示费项不额外推定。',
        ...(request.adjustment === 'none'
          ? []
          : ['复权研究使用连续价格和归一化数量，不使用真实整手、价位及涨跌停约束。']),
      ],
    });
  }
  return backtestExecutionModelSchemaV3.parse({
    schemaVersion: 'execution-model-v1',
    id: `saved-strategy:${request.strategyVersionId}`,
    version: hashCanonicalManifest({ strategy, request, segments }),
    scope: {
      symbol: instrument.symbol,
      market: instrument.market,
      instrumentType: type,
      currency: request.currency,
      timezone: timezones[instrument.market],
      range: { start: request.startDate, end: request.endDate },
    },
    segments,
  });
}
