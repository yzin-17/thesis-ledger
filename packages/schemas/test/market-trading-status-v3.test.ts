import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketTradingStatusRequestV3Schema,
  marketTradingStatusResponseV3Schema,
} from '../src/market-trading-status-v3.js';
import { desiredProviderPolicyV3Schema } from '../src/market-route-v3.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/market-trading-status-v3.response.json', import.meta.url),
      'utf8',
    ),
  );

describe('日级停复牌来源合同', () => {
  it('真实生产包支持停牌、复牌及显式未知，并复用原路由协议', () => {
    const sample = fixture();
    const request = marketTradingStatusRequestV3Schema.parse(sample.request);
    const response = marketTradingStatusResponseV3Schema.parse(sample.response);
    expect(response.days.map((day) => day.state)).toEqual([
      'unknown',
      'suspended',
      'trading',
      'unknown',
      'unknown',
      'unknown',
    ]);
    expect(response.routeKey).toEqual(request.routeKey);
    expect(response.routeTarget).toEqual(request.routeTarget);
    expect(response.provenance.historicalAvailability).toBe('notVerified');
    expect(
      desiredProviderPolicyV3Schema.safeParse({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'states-policy',
        revision: 1,
        enabled: true,
        routes: [
          {
            key: request.routeKey,
            targets: [
              {
                providerId: request.routeTarget.providerId,
                upstreamSource: request.routeTarget.upstreamSource,
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    'missingDay',
    'duplicateDay',
    'missingReference',
    'unknownReference',
    'fakeUnknownFact',
  ])('拒绝 %s，不能用未知掩盖无效事实', (mutation) => {
    const response = fixture().response;
    if (mutation === 'missingDay') response.days.splice(2, 1);
    else if (mutation === 'duplicateDay') response.days[2] = response.days[1];
    else if (mutation === 'missingReference') response.days[1].sourceDocumentIds = [];
    else if (mutation === 'unknownReference')
      response.days[1].sourceDocumentIds = ['missing-document'];
    else response.days[0].sourceDocumentIds = ['huangtai-2023-029'];
    expect(marketTradingStatusResponseV3Schema.safeParse(response).success).toBe(false);
  });

  it('请求范围和市场必须匹配首批能力', () => {
    const sample = fixture();
    expect(
      marketTradingStatusRequestV3Schema.safeParse({
        ...sample.request,
        range: { start: '2023-08-21', end: '2023-08-16' },
      }).success,
    ).toBe(false);
    expect(
      marketTradingStatusRequestV3Schema.safeParse({
        ...sample.request,
        routeKey: { ...sample.request.routeKey, market: 'JP' },
      }).success,
    ).toBe(false);
  });

  it('无效日期返回合同错误，不让日期转换抛出异常', () => {
    const sample = fixture();
    sample.response.range.start = 'not-a-date';
    expect(marketTradingStatusResponseV3Schema.safeParse(sample.response).success).toBe(false);
  });
});
