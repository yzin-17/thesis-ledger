import { createHash } from 'node:crypto';
import { marketDataBarSeriesResponseV3Schema } from '@thesis-ledger/schemas';
import { canonicalizeManifest } from '../backtest/backtest-snapshot.js';
import { marketFrozenWindowHashV3 } from '../market/market-frozen-window-v3.js';

export function convertObservation(raw: Record<string, unknown>) {
  const { contractVersion, ...data } = raw;
  if (contractVersion !== 1 && contractVersion !== 2)
    throw new Error('日级冻结证据缺少可识别的原配置');
  return { ...data, contract: 'market-daily-tradability-window-v1',
    priceOnlyAllowed: contractVersion === 2 };
}

export function convertPriceAcquisition(value: unknown, previousHash: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('缺少原价参考窗口响应');
  const raw = value as Record<string, unknown>;
  if (raw.contractVersion !== 3 || raw.windowObservations !== undefined)
    throw new Error('原价参考需要原多窗口采集协议的独立证明');
  const projection: Record<string, unknown> = { ...raw, contractVersion: 1 };
  if (Array.isArray(raw.historicalTradabilityWindows))
    projection.historicalTradabilityWindows = raw.historicalTradabilityWindows.map(convertObservation);
  const normalized = marketDataBarSeriesResponseV3Schema.parse(projection);
  const originalObservation = (observation: NonNullable<typeof normalized.historicalTradabilityWindows>[number]) => {
    const { contract, priceOnlyAllowed, ...facts } = observation;
    return { contractVersion: priceOnlyAllowed ? 2 : 1, ...facts };
  };
  const original = {
    ...normalized,
    contractVersion: 3,
    ...(normalized.historicalTradabilityWindows ? { historicalTradabilityWindows: normalized.historicalTradabilityWindows.map(originalObservation) } : {}),
  };
  const legacyHash = createHash('sha256')
    .update(JSON.stringify({ ...original, requestId: 'frozen-market-window-v1' }))
    .digest('hex');
  if (legacyHash !== previousHash || canonicalizeManifest(original) !== canonicalizeManifest(raw))
    throw new Error('原价参考的旧响应摘要或资料无法核验');
  return { response: normalized, responseHash: marketFrozenWindowHashV3(normalized) };
}
