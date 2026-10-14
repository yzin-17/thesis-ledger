import type { ExecutionInstrumentFact } from '@thesis-ledger/domain';
import type { BacktestResearchLotSize } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';

/** 身份观察与执行坐标转换；原产物中的未知单位保持不变。 */
export function instrumentFact(row: ArtifactRow, normalizedCoordinates = false, researchLot?: BacktestResearchLotSize): ExecutionInstrumentFact {
  const stringField = (field: string) => {
    const value = row[field];
    if (typeof value !== 'string' || !value) throw new Error(`Instrument ${field} 缺少冻结事实`);
    return value;
  };
  const coordinateOnly = normalizedCoordinates && row.lotSize === null && row.tickSize === null;
  let provider = coordinateOnly ? 'normalized-execution-coordinate-config' : stringField('provider');
  let providerRevision = stringField('providerRevision');
  if (researchLot) {
    provider = 'research-lot-size-configuration';
    providerRevision = `${researchLot.source.sha256}:adopted-lot:${researchLot.sharesPerLot}`;
  }
  return {
    symbol: stringField('symbol'),
    market: row.market as ExecutionInstrumentFact['market'],
    instrumentType: row.instrumentType as ExecutionInstrumentFact['instrumentType'],
    currency: row.currency as ExecutionInstrumentFact['currency'],
    lotSize: researchLot?.sharesPerLot ?? (coordinateOnly ? '1' : stringField('lotSize')),
    tickSize: coordinateOnly ? '1' : stringField('tickSize'),
    tradable: row.tradable === true,
    provider,
    providerRevision,
    occurredAt: stringField('occurredAt'),
    availableAt: stringField('availableAt'),
  };
}
