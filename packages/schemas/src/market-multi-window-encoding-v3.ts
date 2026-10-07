import { marketDataMultiWindowResponseV3Schema } from './market-multi-window-v3.js';

/** 数值按 IEEE-754 二进制编码，避免跨 Python/JavaScript JSON 数字格式差异。 */
const encodeValue = (value: unknown): unknown => {
  if (typeof value === 'number') {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value === 0 ? 0 : value, false);
    return ['number', Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')];
  }
  if (Array.isArray(value)) return ['array', value.map(encodeValue)];
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return ['object', Object.keys(record).sort().map((key) => [key, encodeValue(record[key])])];
  }
  return value;
};

export const canonicalMarketMultiWindowEncodingV3 = (input: unknown): string => {
  const value = marketDataMultiWindowResponseV3Schema.parse(input);
  value.requestId = 'multi-window-transport';
  value.inputFingerprint = 'multi-window-content-v1';
  value.sourcePriceBasis.revision = { origin: 'local-observation', contentHash: '0'.repeat(64) };
  for (const observation of value.windowObservations) {
    observation.response.requestId = 'multi-window-transport';
  }
  return JSON.stringify(['market-multi-window-content-v1', encodeValue(value)]);
};
