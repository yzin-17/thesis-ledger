import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsaDataCapabilityReaderV3 } from '../../src/integration/dsa/dsa-data-capability-reader-v3.js';
import { DsaV3ProtocolError } from '../../src/integration/dsa/dsa-v3-protocol.js';
import { type RoutedStatusRequestV1 } from '../../src/integration/dsa/dsa-status-route-reader-v1.js';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const fixtures = JSON.parse(readFileSync(new URL('../../../../packages/schemas/test/fixtures/market-status-capabilities-v1.shared.json', import.meta.url), 'utf8'));
const capabilityNames: string[] = fixtures.valid.map((item: { name: string }) => item.name);
const fixture = (name = 'DAILY_TRADING_STATUS') => structuredClone(fixtures.valid.find((item: { name: string }) => item.name === name));
function context(name = 'DAILY_TRADING_STATUS') {
  const item = fixture(name);
  const input = structuredClone(item.request);
  delete input.routeTarget;
  delete input.policyRevision;
  const targets = [item.request.routeTarget, { providerId: 'fixture-backup', upstreamSource: 'backup', routeIndex: 1 }];
  const policy = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'policy-trace', revision: item.request.policyRevision,
    sourceDesiredRevision: item.request.policyRevision, enabled: true, appliedAt: '2026-10-10T15:00:00Z',
    routes: [{ key: item.request.routeKey, enabled: true, reason: null,
      targets: targets.map((target) => ({ ...target, eligible: true, reason: null })) }] };
  const read = vi.fn(async () => structuredClone(policy));
  const post = vi.fn(async (_path, request) => ({ ...item.result, ...request }));
  const reader = new DsaDataCapabilityReaderV3(post, (parse) => parse(), undefined, read as never);
  return { item, input: input as RoutedStatusRequestV1, policy, read, post, reader };
}

describe('原能力 Reader 的 Server 唯一主备边界', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('真实 DsaClient 的 HTTP 错误转换后仍按两目标切源', async () => {
    const c = context();
    const client = Object.assign(Object.create(DsaClient.prototype), { config: {
      dsaBaseUrl: 'https://dsa.example.test', dsaTimeoutMs: 5000, dsaToken: 'synthetic', controlToken: 'synthetic',
    } }) as DsaClient;
    const calls: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL, options?: RequestInit) => {
      if (url.pathname.endsWith('/policies/effective')) return new Response(JSON.stringify({
        contractVersion: 3, consumer: 'thesis-ledger', projection: { effective: c.policy },
      }), { status: 200 });
      const request = JSON.parse(options!.body as string);
      calls.push(request.routeTarget);
      if (request.routeTarget.routeIndex === 0) return new Response(JSON.stringify({ detail: {
        code: 'upstream_unavailable', message: '单次来源失败',
      } }), { status: 503 });
      return new Response(JSON.stringify({ ...c.item.result, ...request }), { status: 200 });
    }));
    const result = await client.dataCapabilities.routedStatusCapability(c.input);
    expect(result.result.routeTarget.routeIndex).toBe(1);
    expect(result.attempts.map((attempt) => attempt.error)).toEqual(['unavailable', null]);
    expect(calls).toEqual(c.policy.routes[0]!.targets.map(({ providerId, upstreamSource, routeIndex }) => ({ providerId, upstreamSource, routeIndex })));
  });
  it.each(capabilityNames)('沿原单目标接口读取能力 %s', async (name) => {
    const c = context(name as string);
    const result = await c.reader.routedStatusCapability(c.input);
    expect(result.result).toEqual(c.item.result);
    expect(result.outcome).toBe(name === 'SECURITY_BASIC_DATES' ? 'observed' : 'complete');
    expect(c.post).toHaveBeenCalledOnce();
    expect(c.post).toHaveBeenCalledWith('/api/v3/thesis-ledger/market/status-capabilities', c.item.request, expect.any(Function));
  });
  it('分类来源失败只执行一次人工备用，披露实际目标及两次尝试', async () => {
    const c = context();
    c.post.mockRejectedValueOnce(new DsaV3ProtocolError('来源不可用', 'unavailable'));
    const result = await c.reader.routedStatusCapability(c.input);
    expect(c.post).toHaveBeenCalledTimes(2);
    expect(result.result.routeTarget.routeIndex).toBe(1);
    expect(result.result.routeTarget.providerId).toBe('fixture-backup');
    expect(result.attempts.map((attempt) => attempt.error)).toEqual(['unavailable', null]);
  });
  it('关闭功能保留选择且不会产生读取', async () => {
    const c = context();
    c.policy.routes[0]!.enabled = false;
    for (const target of c.policy.routes[0]!.targets) Object.assign(target, { eligible: false, reason: 'disabled' });
    await expect(c.reader.routedStatusCapability(c.input)).rejects.toMatchObject({ code: 'control-rejected' });
    expect(c.post).not.toHaveBeenCalled();
    expect(c.policy.routes[0]!.targets).toHaveLength(2);
  });
  it.each([false, true])('请求后政策变化立即停止，包括失败路径 %s', async (failure) => {
    const c = context();
    c.read.mockResolvedValueOnce(structuredClone(c.policy)).mockImplementation(async () => ({ ...c.policy, revision: c.policy.revision + 1 }));
    if (failure) c.post.mockRejectedValueOnce(new DsaV3ProtocolError('来源不可用', 'unavailable'));
    await expect(c.reader.routedStatusCapability(c.input)).rejects.toMatchObject({ code: 'stale-revision' });
    expect(c.post).toHaveBeenCalledOnce();
  });
  it.each(['unauthorized', 'invalid-request', 'control-rejected', 'stale-revision', 'invalid-response'] as const)('协议或控制错误不被备用掩盖 %s', async (code) => {
    const c = context();
    c.post.mockRejectedValueOnce(new DsaV3ProtocolError('已分类错误', code));
    await expect(c.reader.routedStatusCapability(c.input)).rejects.toMatchObject({ code });
    expect(c.post).toHaveBeenCalledOnce();
  });
  it('部分覆盖返回 partial，保留未知，不自动混合第二来源', async () => {
    const c = context();
    c.item.result.days[0].state = 'unknown';
    c.item.result.days[0].evidenceRefs = [];
    c.item.result.coverage.complete = false;
    c.item.result.coverage.unknownDates = c.item.result.coverage.expectedDates;
    const result = await c.reader.routedStatusCapability(c.input);
    expect(result.outcome).toBe('partial');
    expect(result.result).toEqual(c.item.result);
    expect(c.post).toHaveBeenCalledOnce();
  });
  it('最多两个人工目标，错误后不会重试或增加注册来源', async () => {
    const c = context();
    c.post.mockRejectedValue(new DsaV3ProtocolError('来源不可用', 'unavailable'));
    await expect(c.reader.routedStatusCapability(c.input)).rejects.toMatchObject({ code: 'unavailable' });
    expect(c.post).toHaveBeenCalledTimes(2);
  });
});
