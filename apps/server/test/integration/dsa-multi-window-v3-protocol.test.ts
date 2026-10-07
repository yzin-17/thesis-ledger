import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBarSeriesResponseV3 } from '../../src/integration/dsa/dsa-v3-protocol.js';

const fixture = () => {
  const golden = JSON.parse(readFileSync(new URL(
    '../../../../packages/schemas/fixtures/market-data-v3.multi-window-hash.json', import.meta.url,
  ), 'utf8'));
  const response = golden.response;
  response.inputFingerprint = golden.expectedContentHash;
  response.sourcePriceBasis.revision.contentHash = golden.expectedContentHash;
  const request = {
    contractVersion: 3 as const, requestId: response.requestId, symbol: response.symbol,
    routeKey: response.routeKey, start: response.coverage.requestedStart, end: response.coverage.requestedEnd,
  };
  return { request, response };
};
const protocol = 'market-multi-window-content-v1';

describe('多窗口生产响应解析', () => {
  it('确认协议且完整指纹一致时保留全部子窗口', () => {
    const { request, response } = fixture();
    expect(parseBarSeriesResponseV3(response, request, protocol)).toEqual(response);
  });

  it.each([undefined, 'unknown'])('未确认协议 %s 时拒绝', (version) => {
    const { request, response } = fixture();
    expect(() => parseBarSeriesResponseV3(response, request, version)).toThrow('多窗口');
  });

  it.each(['time', 'childHash', 'parentHash', 'revisionHash', 'request'])(
    '拒绝 %s 改写', (change) => {
      const { request, response } = fixture();
      if (change === 'time') response.windowObservations[0].completedAt = '2026-05-20T07:03:00Z';
      if (change === 'childHash') response.windowObservations[0].response.inputFingerprint = 'changed';
      if (change === 'parentHash') response.inputFingerprint = 'b'.repeat(64);
      if (change === 'revisionHash') response.sourcePriceBasis.revision.contentHash = 'b'.repeat(64);
      if (change === 'request') request.requestId = 'wrong-request';
      expect(() => parseBarSeriesResponseV3(response, request, protocol)).toThrow('多窗口');
    },
  );
});
