import { keyBy } from 'es-toolkit';
import type { InstrumentDirectory } from '@thesis-ledger/schemas';

/** 只消费主响应的目录展示信息，代码仍用于业务身份。 */
export function instrumentLabelLookup(directory?: InstrumentDirectory) {
  const names = keyBy(directory?.items ?? [], (item) => item.symbol.toUpperCase());
  return (symbol: string) => {
    const name = names[symbol.trim().toUpperCase()]?.displayName;
    return name && name !== symbol ? `${name} · ${symbol}` : symbol;
  };
}
