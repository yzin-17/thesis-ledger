import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import {
  effectiveProviderPolicyV3Schema,
  statusCapabilityQueryV1Schema,
  correlateStatusCapabilityV1,
  type StatusCapabilityRequestV1,
  type StatusCompositionDemandV1,
} from '@thesis-ledger/schemas';
import { DsaDataCapabilityReaderV3 } from '../../src/integration/dsa/dsa-data-capability-reader-v3.js';
import { DsaV3ProtocolError } from '../../src/integration/dsa/dsa-v3-protocol.js';

/** 合同原文为隔离样例；不作为真实来源覆盖证据。 */
export function compositionFixture(
  options: { symbol?: string; dates?: string[]; riskFailure?: boolean } = {},
) {
  const samples = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/test/fixtures/market-status-capabilities-v1.shared.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ).valid;
  for (const item of samples) {
    if (options.symbol) item.request.symbol = item.result.symbol = options.symbol;
    if (options.dates && item.request.range) {
      item.request.range = item.result.range = {
        start: options.dates[0],
        end: options.dates.at(-1),
      };
      const day = item.result.days[0];
      item.result.days = options.dates.map((date) => ({
        ...day,
        date,
        ...(item.name === 'DAILY_TRADING_STATUS'
          ? { state: date === '2023-08-17' ? 'suspended' : 'trading' }
          : {}),
      }));
      item.result.coverage.expectedDates = options.dates;
      item.result.coverage.range = item.request.range;
    }
  }
  const demands: StatusCompositionDemandV1[] = samples.map((item: { request: object }) => ({
    requirement: 'optional',
    query: statusCapabilityQueryV1Schema.parse(
      Object.fromEntries(
        Object.entries(item.request).filter(
          ([key]) => !['routeTarget', 'policyRevision'].includes(key),
        ),
      ),
    ),
  }));
  const policy = effectiveProviderPolicyV3Schema.parse({
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'composition-policy',
    revision: 7,
    sourceDesiredRevision: 7,
    enabled: true,
    appliedAt: '2026-10-10T00:00:00Z',
    routes: samples.map((item: { request: { routeKey: object; routeTarget: object } }) => ({
      key: item.request.routeKey,
      enabled: true,
      reason: null,
      targets: [{ ...item.request.routeTarget, eligible: true, reason: null }],
    })),
  });
  const readPolicy = vi.fn(async () => structuredClone(policy));
  const post = vi.fn(async (_path: string, request: StatusCapabilityRequestV1) => {
    if (options.riskFailure && request.routeKey.capability === 'RISK_WARNING')
      throw new DsaV3ProtocolError('隔离来源不可用', 'unavailable');
    const item = samples.find(
      (sample: { name: string }) => sample.name === request.routeKey.capability,
    );
    return correlateStatusCapabilityV1(request, { ...structuredClone(item.result), ...request });
  });
  const reader = new DsaDataCapabilityReaderV3(
    post as never,
    (parse) => parse(),
    undefined,
    readPolicy,
  );
  return { samples, demands, policy, readPolicy, post, reader };
}
