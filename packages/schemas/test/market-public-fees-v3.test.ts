import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateExecutionModelFees } from '@thesis-ledger/domain';
import type { FrozenExecutionModelFees } from '@thesis-ledger/domain';
import {
  marketPublicFeesRequestV3Schema,
  marketPublicFeesResponseV3Schema,
} from '../src/market-public-fees-v3.js';
import { desiredProviderPolicyV3Schema } from '../src/market-route-v3.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/market-public-fees-v3.response.json', import.meta.url),
      'utf8',
    ),
  );

describe('公共收费主源合同 V3', () => {
  it('复用现有 RouteKey/RouteTarget，实际 DSA 数据包含历史切换与来源性质', () => {
    const sample = fixture();
    const request = marketPublicFeesRequestV3Schema.parse(sample.request);
    const response = marketPublicFeesResponseV3Schema.parse(sample.response);
    expect(response.routeKey).toEqual(request.routeKey);
    expect(response.routeTarget).toEqual(request.routeTarget);
    expect(response.segments.map((segment) => segment.range.start)).toEqual([
      '2023-08-25',
      '2023-08-28',
    ]);
    expect(
      response.sourceDocuments.find((source) => source.id === 'transfer-2022-republication')?.kind,
    ).toBe('governmentNewsRepublication');
    expect(
      desiredProviderPolicyV3Schema.safeParse({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'policy',
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

  it('拒绝反向日期、负费率和未知金额口径', () => {
    const sample = fixture();
    expect(
      marketPublicFeesRequestV3Schema.safeParse({
        ...sample.request,
        range: { start: '2023-08-29', end: '2023-08-25' },
      }).success,
    ).toBe(false);
    sample.response.segments[0].charges[0].rate = '-0.001';
    expect(marketPublicFeesResponseV3Schema.safeParse(sample.response).success).toBe(false);
    sample.response.segments[0].charges[0].rate = '0.001';
    sample.response.segments[0].charges[0].basis = 'adjustedPrice';
    expect(marketPublicFeesResponseV3Schema.safeParse(sample.response).success).toBe(false);
  });

  it('主源费率可供现有 Decimal 计算器使用，金额设置来自显式模型', () => {
    const response = marketPublicFeesResponseV3Schema.parse(fixture().response);
    const sellFees = response.segments.map((segment) => {
      const publicCharges = Object.fromEntries(
        segment.charges.map((fee) => [
          fee.code,
          {
            treatment: 'charged' as const,
            side: fee.side,
            basis: fee.basis,
            currency: fee.currency,
            rate: fee.rate,
            minimum: { kind: 'none' as const },
          },
        ]),
      );
      const configuredFees = {
        currency: 'CNY',
        collection: 'perFillPerCharge',
        rounding: { mode: 'halfUp', decimalPlaces: 2 },
        commission: {
          treatment: 'charged',
          side: 'both',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.0003',
          minimum: { kind: 'amount', amount: '5' },
        },
        ...publicCharges,
      } as FrozenExecutionModelFees;
      return calculateExecutionModelFees(configuredFees, {
        side: 'sell',
        turnover: '10000',
        currency: 'CNY',
      });
    });
    expect(
      sellFees.map((fees) => fees.charges.find((fee) => fee.code === 'stampDuty')?.amount),
    ).toEqual(['10', '5']);
    expect(
      sellFees.map((fees) => fees.charges.find((fee) => fee.code === 'handlingFee')?.amount),
    ).toEqual(['0.49', '0.34']);
  });
});
