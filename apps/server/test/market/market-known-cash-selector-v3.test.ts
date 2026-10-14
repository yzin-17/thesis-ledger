import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  marketKnownCashExchangeV3Schema,
  type MarketKnownCashRequestV3,
} from '@thesis-ledger/schemas';
import { selectMarketKnownCashV3 } from '../../src/market/market-known-cash-selector-v3.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';

function fixture() {
  const exchange = marketKnownCashExchangeV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/market-known-cash-v3.exchange.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  const primary = { providerId: 'any-primary', upstreamSource: 'announced-plans' };
  const secondary = { providerId: 'any-secondary', upstreamSource: 'secondary-plans' };
  const effective = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'policy',
    revision: 1,
    sourceDesiredRevision: 1,
    enabled: true,
    appliedAt: '2026-10-09T12:00:00Z',
    routes: [
      {
        key: exchange.request.routeKey,
        reason: 'not_admitted',
        targets: [primary, secondary].map((target, routeIndex) => ({
          ...target,
          routeIndex,
          eligible: false,
          reason: 'not_admitted',
        })),
      },
    ],
  };
  const catalog = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    catalogRevision: 1,
    generatedAt: '2026-10-09T12:00:00Z',
    integrity: 'complete',
    entries: [primary, secondary].map((target) => ({
      key: exchange.request.routeKey,
      target,
      state: 'not_admitted',
    })),
  };
  const read = vi.fn(async (request: MarketKnownCashRequestV3) => ({
    ...exchange.response,
    ...request,
    source: { ...exchange.response.source, target: request.routeTarget },
  }));
  return { scope: exchange.request, effective, catalog, read };
}

describe('显式方案观察的通用来源选择', () => {
  it('使用保存的主源，保留未知覆盖及原交换，没有供应商名单', async () => {
    const input = fixture();
    const before = JSON.stringify(input.effective);
    const result = await selectMarketKnownCashV3(input);
    expect(result.status).toBe('observed');
    if (result.status !== 'observed') throw new Error('无观察');
    expect(result.request.routeTarget.providerId).toBe('any-primary');
    expect(result.response.coverage.complete).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(input.read).toHaveBeenCalledOnce();
    expect(JSON.stringify(input.effective)).toBe(before);
  });
  it('主源不支持显式合同后按原顺序读取备用，记录两次实际原因', async () => {
    const input = fixture();
    const original = input.read;
    input.read = vi.fn(async (request) => {
      if (request.routeTarget.routeIndex === 0)
        throw new DsaError(
          'safe',
          'unsupported-capability',
          422,
          'research_protocol_not_supported',
        );
      return original(request);
    });
    const result = await selectMarketKnownCashV3(input);
    expect(result.status).toBe('observed');
    expect(result.attempts.map((x) => x.reason)).toEqual(['research_protocol_not_supported', null]);
    expect(result.attempts[1]!.target.routeIndex).toBe(1);
  });
  it('空记录是一次观察成功，不据此换源或证明零分红', async () => {
    const input = fixture();
    const original = input.read;
    input.read = vi.fn(async (request) => ({
      ...(await original(request)),
      records: [],
      ignoredEmptyRows: 1,
    }));
    const result = await selectMarketKnownCashV3(input);
    expect(result.status).toBe('observed');
    expect(input.read).toHaveBeenCalledOnce();
    if (result.status === 'observed') expect(result.response.coverage.complete).toBe(false);
  });
  it.each(['policy', 'catalog', 'disabled', 'invalid'])('拒绝%s，无来源调用', async (mode) => {
    const input = fixture();
    if (mode === 'policy') input.effective.revision++;
    else if (mode === 'catalog') input.catalog.integrity = 'partial';
    else if (mode === 'disabled') input.effective.enabled = false;
    else input.scope.symbol = 'invalid';
    expect((await selectMarketKnownCashV3(input)).status).toBe('unavailable');
    expect(input.read).not.toHaveBeenCalled();
  });
  it('凭证缺失、Provider禁用不因研究模式而放行', async () => {
    const input = fixture();
    input.effective.routes[0]!.targets[0]!.reason = 'credential_missing';
    input.catalog.entries[0]!.state = 'credential_missing';
    input.effective.routes[0]!.targets[1]!.reason = 'disabled';
    const result = await selectMarketKnownCashV3(input);
    expect(result.status).toBe('unavailable');
    expect(input.read).not.toHaveBeenCalled();
    expect(result.attempts.map((x) => x.reason)).toEqual([
      'credential_missing',
      'provider_unavailable',
    ]);
  });
  it.each(['stale-revision', 'unauthorized'] as const)(
    '%s不尝试备用绕过配置/鉴权变化',
    async (code) => {
      const input = fixture();
      input.read = vi.fn(async () => {
        throw new DsaError('safe', code, 503, 'configuration_changed');
      });
      expect((await selectMarketKnownCashV3(input)).status).toBe('unavailable');
      expect(input.read).toHaveBeenCalledOnce();
    },
  );
  it('最多两目标，不泄露未知异常正文，保留标准失败原因', async () => {
    const input = fixture();
    input.read = vi.fn(async (request) => {
      if (request.routeTarget.routeIndex === 0)
        throw new DsaError('safe', 'unavailable', 503, 'permission_denied');
      throw new Error('private-secret-body');
    });
    const result = await selectMarketKnownCashV3(input);
    expect(result.attempts.map((x) => x.reason)).toEqual([
      'permission_denied',
      'source_unavailable',
    ]);
    expect(JSON.stringify(result)).not.toContain('private-secret-body');
    expect(input.read).toHaveBeenCalledTimes(2);
  });
  it('响应身份错配不能成为观察，记录实际失败', async () => {
    const input = fixture();
    const original = input.read;
    input.read = vi.fn(async (request) => ({ ...(await original(request)), requestId: 'other' }));
    const result = await selectMarketKnownCashV3(input);
    expect(result.status).toBe('unavailable');
    expect(result.attempts.map((x) => x.reason)).toEqual([
      'invalid_source_response',
      'invalid_source_response',
    ]);
  });
});
