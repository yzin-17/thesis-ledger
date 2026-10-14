import { aiGenerationContracts, type AiGenerationContractRef } from '@thesis-ledger/schemas';

/** 用途格式探针的代表性实例；业务语义保真另由编写操作验收。 */
export function authoringConnectionProbe(purpose: AiGenerationContractRef['id']) {
  if (purpose !== 'strategy_authoring_generation' && purpose !== 'strategy_authoring_modification')
    return null;
  const close = { type: 'series', sourceId: 'primary', field: 'close' };
  const average = { type: 'indicator', name: 'MA', input: close, params: { period: 20 } };
  const example = {
    definition: {
      schemaVersion: '2',
      name: '编写用途格式验证',
      signalSources: [
        {
          id: 'primary',
          asset: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
          timeframe: '1d',
          series: ['open', 'high', 'low', 'close', 'volume'],
        },
      ],
      executionInstrument: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
      primaryTimeframe: '1d',
      entry: { type: 'cross', direction: 'above', left: close, right: average },
      exit: { type: 'cross', direction: 'below', left: close, right: average },
      sizing: { type: 'percentOfEquity', percent: '0.5' },
      risk: [{ type: 'fixedStop', percent: '0.03' }],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0.0003', slippageRate: '0.001' },
    },
    coverage: [{ requirementId: 'rules', definitionPaths: ['entry', 'exit', 'risk'] }],
  };
  const contract =
    purpose === 'strategy_authoring_generation'
      ? aiGenerationContracts.authoringGeneration
      : aiGenerationContracts.authoringModification;
  return contract.schema.parse(example);
}
