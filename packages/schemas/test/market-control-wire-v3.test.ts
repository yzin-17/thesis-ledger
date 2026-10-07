import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketControlHandshakeRequestV3Schema,
  marketControlHandshakeResponseV3Schema,
  marketControlPolicyApplyRequestV3Schema,
  marketControlPolicyApplyResponseV3Schema,
  marketControlUnsupportedVersionErrorV3Schema,
  marketDataContractCapabilitiesV3Schema,
} from '../src/index.js';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as unknown;

const handshakeRequestFixture = () => fixture('market-control-v3.handshake.request.json');
const handshakeResponseFixture = () => fixture('market-control-v3.handshake.response.json');
const effectiveFixture = () => fixture('market-control-v3.effective.etf-qfq.json');

describe('Market Control Wire V3', () => {
  it('解析 V3 握手并让 Control 能力与 Data 版本独立声明', () => {
    const request = marketControlHandshakeRequestV3Schema.parse(handshakeRequestFixture());
    const response = marketControlHandshakeResponseV3Schema.parse(handshakeResponseFixture());
    const dataCapabilities = marketDataContractCapabilitiesV3Schema.parse({
      dataContractVersions: [3],
      serviceCapabilities: { fundNav: true },
    });

    expect(response).toMatchObject({
      contractVersion: request.contractVersion,
      consumer: request.consumer,
      accepted: true,
      policyApply: true,
      requestId: request.requestId,
    });
    expect('dataContractVersions' in response).toBe(false);
    expect(dataCapabilities.dataContractVersions).toEqual([3]);
    expect(
      marketControlHandshakeResponseV3Schema.safeParse({
        ...response,
        dataContractVersions: [3],
      }).success,
    ).toBe(false);
    expect(
      marketControlHandshakeRequestV3Schema.safeParse({
        ...request,
        supportedVersions: [2, 3],
      }).success,
    ).toBe(false);
  });

  it('复用既有 Desired RoutePolicy V3 并校验共享 Effective fixture 与 Apply 响应', () => {
    const desired = marketControlPolicyApplyRequestV3Schema.parse(
      fixture('market-route-v3.etf-qfq.json'),
    );
    const effective = effectiveFixture();
    const response = marketControlPolicyApplyResponseV3Schema.parse({
      status: 'applied',
      idempotent: false,
      desired,
      effective,
      requestId: desired.requestId,
    });

    expect(response.desired.routes[0]?.key).toEqual(response.effective.routes[0]?.key);
    expect(response.effective.sourceDesiredRevision).toBe(response.desired.revision);
    expect(
      marketControlPolicyApplyResponseV3Schema.safeParse({
        ...response,
        requestId: 'mismatched-request',
      }).success,
    ).toBe(false);
    expect(
      marketControlPolicyApplyResponseV3Schema.safeParse({
        ...response,
        effective: { ...effective, sourceDesiredRevision: desired.revision + 1 },
      }).success,
    ).toBe(false);
    expect(
      marketControlPolicyApplyRequestV3Schema.safeParse({
        ...desired,
        contractVersion: 2,
      }).success,
    ).toBe(false);
  });

  it('拒绝新功能时保留受控版本错误，且不接受旧握手或 Policy 响应降级', () => {
    const errors = fixture('market-control-v3.errors.json') as unknown[];
    expect(
      errors.map((error) => marketControlUnsupportedVersionErrorV3Schema.parse(error).code),
    ).toEqual(['CONTROL_CONTRACT_UNSUPPORTED']);
    expect(
      marketControlHandshakeResponseV3Schema.safeParse({
        ...(handshakeResponseFixture() as object),
        contractVersion: 2,
      }).success,
    ).toBe(false);

    const routeV1 = {
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: 'legacy-v1',
      revision: 1,
      enabled: true,
      routes: { DAILY_BAR: { ETF: ['hithink'] } },
    };
    const routeV2 = {
      contractVersion: 2,
      consumer: 'thesis-ledger',
      requestId: 'legacy-v2',
      revision: 2,
      enabled: true,
      routes: {
        DAILY_BAR: { ETF: [{ providerId: 'hithink', upstreamSource: 'hithink-financial-api' }] },
      },
    };

    expect(marketControlPolicyApplyRequestV3Schema.safeParse(routeV1).success).toBe(false);
    expect(marketControlPolicyApplyRequestV3Schema.safeParse(routeV2).success).toBe(false);
  });
});
