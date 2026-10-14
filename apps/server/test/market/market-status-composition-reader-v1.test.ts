import { describe, expect, it } from 'vitest';
import { evaluateStatusCompositionV1 } from '@thesis-ledger/schemas';
import { readMarketStatusCompositionV1 } from '../../src/market/market-status-composition-reader-v1.js';
import {
  DsaV3ProtocolError,
  mapDataV3HttpError,
} from '../../src/integration/dsa/dsa-v3-protocol.js';
import { compositionFixture } from './status-composition-fixtures.js';

describe('组合沿原能力 Reader 读取', () => {
  it('原Control投影仅采样时钟变化时保留事实，冻结首份原时钟', async () => {
    const c = compositionFixture();
    let sample = 0;
    c.readPolicy.mockImplementation(async () => ({
      ...structuredClone(c.policy),
      appliedAt: new Date(Date.parse(c.policy.appliedAt) + sample++ * 1000).toISOString(),
    }));
    const result = await readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy);
    expect(result.entries).toHaveLength(5);
    expect(result.policy.appliedAt).toBe(new Date(c.policy.appliedAt).toISOString());
    expect(c.post).toHaveBeenCalledTimes(5);
  });
  it.each(['revision', 'desired', 'enabled', 'operation', 'route-enabled', 'provider', 'targets'])(
    '采样时间变化仍不掩盖真实政策事实 %s',
    async (field) => {
      const c = compositionFixture();
      const after = structuredClone(c.policy);
      after.appliedAt = '2026-10-10T00:00:01Z';
      if (field === 'revision') after.revision++;
      if (field === 'desired') after.sourceDesiredRevision++;
      if (field === 'enabled') {
        after.enabled = false;
        for (const route of after.routes) {
          route.reason = 'disabled';
          for (const target of route.targets) {
            target.eligible = false;
            target.reason = 'disabled';
          }
        }
      }
      if (field === 'operation') after.requestId = 'another-operation';
      if (field === 'route-enabled') {
        after.routes[0]!.enabled = false;
        after.routes[0]!.reason = 'disabled';
        after.routes[0]!.targets[0]!.eligible = false;
        after.routes[0]!.targets[0]!.reason = 'disabled';
      }
      if (field === 'provider') after.routes[0]!.targets[0]!.providerId = 'another-source';
      if (field === 'targets') {
        after.routes[0]!.targets.push({
          ...after.routes[0]!.targets[0]!,
          providerId: 'backup-source',
          routeIndex: 1,
        });
      }
      c.readPolicy.mockResolvedValueOnce(c.policy).mockResolvedValueOnce(after);
      // 隔离组合自身的整组前后守卫；各能力Reader的守卫另有原执行合同。
      const reader = {
        routedStatusCapability: async (
          query: Parameters<typeof c.reader.routedStatusCapability>[0],
        ) => ({
          outcome: 'observed' as const,
          result: {
            ...c.samples.find((item: { name: string }) => item.name === query.routeKey.capability).result,
            ...query,
          },
          attempts: [],
        }),
      };
      await expect(
        readMarketStatusCompositionV1(c.demands, reader, c.readPolicy),
      ).rejects.toMatchObject({ code: 'stale-revision' });
    },
  );
  it.each([true, false])('实际 HTTP 错误映射仅保留标准可选失败：标准信封=%s', async (standard) => {
    const c = compositionFixture();
    const original = c.post.getMockImplementation()!;
    c.post.mockImplementation(async (path, request) => {
      if (request.routeKey.capability !== 'RISK_WARNING') return original(path, request);
      const error = { code: 'upstream_failure', message: '行情上游暂时不可用' };
      const detail = standard
        ? { contractVersion: 3, requestId: request.requestId, error }
        : { contractVersion: 3, requestId: request.requestId, ...error };
      throw mapDataV3HttpError(503, { detail }, request.requestId);
    });
    const pending = readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy);
    if (!standard) {
      await expect(pending).rejects.toMatchObject({ code: 'invalid-response' });
      return;
    }
    const result = await pending;
    expect(result.entries[1]).toMatchObject({ status: 'failed', error: 'unavailable' });
    expect(result.entries.filter((entry) => entry.status === 'included')).toHaveLength(4);
    expect(evaluateStatusCompositionV1(result.entries).blockedCapabilities).toEqual([]);
    expect(c.post).toHaveBeenCalledTimes(5);
  });
  it('五项独立参数、来源和时钟保留，基础日期没有窗口', async () => {
    const c = compositionFixture();
    const result = await readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy);
    expect(result.entries).toHaveLength(5);
    expect(c.post).toHaveBeenCalledTimes(5);
    expect(
      result.entries
        .filter((item) => item.status === 'included')
        .map((item) => item.result.routeTarget.providerId),
    ).toEqual(
      c.samples.map(
        (item: { result: { routeTarget: { providerId: string } } }) =>
          item.result.routeTarget.providerId,
      ),
    );
    expect('range' in result.entries.at(-1)!.query).toBe(false);
  });
  it('可选来源失败保留其他事实，必需项只阻断对应能力', async () => {
    const c = compositionFixture({ riskFailure: true });
    c.demands[1]!.requirement = 'completeWindow';
    const result = await readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy);
    expect(result.entries[1]).toMatchObject({ status: 'failed', error: 'unavailable' });
    expect(result.entries[0]?.status).toBe('included');
    expect(evaluateStatusCompositionV1(result.entries).blockedCapabilities).toEqual([
      'RISK_WARNING',
    ]);
    expect(c.post).toHaveBeenCalledTimes(5);
  });
  it('政策跨能力代次变化拒绝发布组合', async () => {
    const c = compositionFixture();
    c.post.mockImplementation(async (_path, request) => {
      const item = c.samples.find(
        (sample: { name: string }) => sample.name === request.routeKey.capability,
      );
      c.policy.revision++;
      return { ...item.result, ...request };
    });
    await expect(
      readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy),
    ).rejects.toMatchObject({ code: 'stale-revision' });
  });
  it.each(['unauthorized', 'invalid-request', 'invalid-response', 'control-rejected'] as const)(
    '可选项不掩盖协议/控制错误 %s',
    async (code) => {
      const c = compositionFixture();
      c.post.mockRejectedValue(new DsaV3ProtocolError('隔离错误', code));
      await expect(
        readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy),
      ).rejects.toMatchObject({ code });
    },
  );
  it('未选择和混合身份在读取前拒绝，来源调用为零', async () => {
    for (const disabled of [true, false]) {
      const c = compositionFixture();
      if (disabled) c.policy.routes[0]!.enabled = false;
      else c.demands[0]!.query.symbol = '600519.SH';
      await expect(
        readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy),
      ).rejects.toThrow();
      expect(c.post).not.toHaveBeenCalled();
    }
  });
});
