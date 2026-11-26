import { DecimalValue as D } from '@thesis-ledger/domain';
import { hkEtfSpreadTables } from './market-hk-etf-registry.js';
export { hkEtfSpreadEvidence } from './market-hk-etf-registry.js';
const partD = [
  ['1', '0.001'],
  ['5', '0.002'],
  ['10', '0.005'],
  ['20', '0.01'],
  ['100', '0.02'],
  ['200', '0.05'],
  ['500', '0.1'],
  ['1000', '0.2'],
  ['2000', '0.5'],
  ['9999', '1'],
] as const;

export function hkEtfPriceStep(symbol: string, price: string) {
  const table = hkEtfSpreadTables.get(symbol);
  if (!table) throw new Error('etf_spread_table_unverified');
  if (table === 'B') {
    if (D.from(price).compareTo('0.5') < 0 || D.from(price).compareTo('9999.95') > 0)
      throw new Error('price_step_unavailable');
    return '0.05';
  }
  if (D.from(price).compareTo('0.01') < 0) throw new Error('price_step_unavailable');
  const band = partD.find(([upper]) => D.from(price).compareTo(upper) <= 0);
  if (!band) throw new Error('price_step_unavailable');
  return band[1];
}
