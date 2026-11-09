import {
  backtestExecutionModelSchemaV3,
  type BacktestStrategy,
  type BacktestModelResolutionRequest,
} from '@thesis-ledger/schemas';
import { strategyExecutionFees } from './backtest-strategy-model-cost.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';

const policyVersion = 'strategy-research-default-v1';
const timezones = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };

export function strategyResearchExecutionModel(
  request: BacktestModelResolutionRequest,
  strategy: Pick<BacktestStrategy, 'cost' | 'executionInstrument'>,
  configuredAt: string,
) {
  const instrument = strategy.executionInstrument;
  const normalized = request.adjustment !== 'none';
  const sellableAfterTradingDays = instrument.market === 'CN' ? 1 : 0;
  const notes = [
    '不模拟涨跌停；仍核验停牌、退市和行情完整性。',
    instrument.market === 'CN'
      ? '按买入后下一交易日可卖模拟；成交扣款，卖出款当日可再投资。'
      : '按买入当日可卖、成交扣款及卖出款当日可再投资模拟。',
    '佣金、最低佣金和滑点沿用策略。未配置税费暂不计入；取得适用的已核验税费后按冻结设置计算。',
    ...(normalized ? ['复权研究使用连续价格和归一化数量，不应用真实整手及价位约束。'] : []),
  ];
  const model = backtestExecutionModelSchemaV3.parse({
    schemaVersion: 'execution-model-v1',
    id: `strategy-research:${request.strategyVersionId}`,
    version: hashCanonicalManifest({ request, strategy, configuredAt, policyVersion }),
    scope: {
      symbol: instrument.symbol,
      market: instrument.market,
      instrumentType: instrument.assetType === 'stock' ? 'STOCK' : 'ETF',
      currency: request.currency,
      timezone: timezones[instrument.market],
      range: { start: request.startDate, end: request.endDate },
    },
    segments: [
      {
        id: policyVersion,
        range: { start: request.startDate, end: request.endDate },
        source: {
          kind: 'researchPreset',
          configuredAt,
          description: '策略回测研究默认规则。',
          references: [`app:${policyVersion}`, `strategy-version:${request.strategyVersionId}`],
          revision: policyVersion,
        },
        assumptions: notes,
        fees: strategyExecutionFees(strategy.cost, request.currency),
        execution: {
          mode: 'exchange',
          calendarMarket: instrument.market,
          reserveCashAt: 'orderAccepted',
          buyDebitAt: 'fill',
          sellableAfterTradingDays,
          saleReinvestableAfterTradingDays: 0,
          price: {
            kind: 'noDailyLimit',
            reason: '按研究默认规则，不模拟涨跌停限制。',
          },
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
        },
      },
    ],
  });
  return { status: 'available' as const, policy: 'research-defaults' as const, notes, model };
}
