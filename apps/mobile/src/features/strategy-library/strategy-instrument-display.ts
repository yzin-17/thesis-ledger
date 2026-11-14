import type { StrategyVersionRead } from '@thesis-ledger/schemas';
import { instrumentLabelLookup } from '../market/instrument-display';

export function strategyInstrumentLabel(version: StrategyVersionRead | undefined) {
  const instrument = version?.schema?.executionInstrument;
  if (!instrument || typeof instrument !== 'object' || !('symbol' in instrument)
    || typeof instrument.symbol !== 'string') return '未配置标的';
  return instrumentLabelLookup(version?.instrumentDirectory)(instrument.symbol);
}
