import {
  runConfigSchemaV2,
  strategySchemaV2,
  validateStrategyRunConfig,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import type { BacktestSetupInput, QueueBacktestV2Input, StrategySchema } from './strategy.types.js';

export const runConfigForV2 = (
  schema: StrategySchema,
  setup: BacktestSetupInput,
): QueueBacktestV2Input['runConfig'] => {
  const market = (schema.executionInstrument as { market: 'CN' | 'HK' | 'US' }).market;
  let currency: 'CNY' | 'HKD' | 'USD' = 'USD';
  let timezone = 'America/New_York';
  if (market === 'CN') {
    currency = 'CNY';
    timezone = 'Asia/Shanghai';
  } else if (market === 'HK') {
    currency = 'HKD';
    timezone = 'Asia/Hong_Kong';
  }
  const universe = schema.universe as { asOf?: string } | undefined;
  const date = Date.parse(setup.dataAsOf ?? universe?.asOf ?? '');
  const config = runConfigSchemaV2.parse({
    startDate: setup.period.start,
    endDate: setup.period.end,
    dataAsOf: Number.isFinite(date) ? new Date(date).toISOString() : new Date().toISOString(),
    baseCurrency: setup.baseCurrency ?? currency,
    initialCash: { [currency]: String(setup.initialCash) },
    valuationPolicy: {
      baseTimezone: timezone,
      dailyValuationTime: '16:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    ...(setup.executionModel ? { executionModel: setup.executionModel } : {}),
  });
  if (config.executionModel) {
    const strategy = strategySchemaV2.parse(schema) as StrategySchemaV2;
    const validation = validateStrategyRunConfig(strategy, config);
    if (!validation.valid)
      throw new Error(
        validation.errors.map((error) => `${error.path.join('.')}：${error.message}`).join('；'),
      );
  }
  return config;
};
