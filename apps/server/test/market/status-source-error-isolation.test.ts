import { describe, expect, it } from 'vitest';
import { evaluateStatusCompositionV1 } from '@thesis-ledger/schemas';
import { mapDataV3HttpError } from '../../src/integration/dsa/dsa-v3-protocol.js';
import { readMarketStatusCompositionV1 } from '../../src/market/market-status-composition-reader-v1.js';
import { compositionFixture } from './status-composition-fixtures.js';

describe('来源坏响应与协议损坏分别处理', () => {
  it.each([false, true])('标准来源 502 冻结为失败，必需=%s', async (required) => {
    const c = compositionFixture();
    if (required) c.demands[0]!.requirement = 'completeWindow';
    const original = c.post.getMockImplementation()!;
    c.post.mockImplementation(async (path, request) => {
      if (request.routeKey.capability !== 'DAILY_TRADING_STATUS') return original(path, request);
      throw mapDataV3HttpError(
        502,
        {
          detail: {
            contractVersion: 1,
            requestId: request.requestId,
            error: { code: 'invalid_response', message: '行情上游响应格式无效' },
          },
        },
        request.requestId,
      );
    });
    const result = await readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy);
    expect(result.entries[0]).toMatchObject({ status: 'failed', error: 'invalid-response' });
    expect(result.entries.filter((entry) => entry.status === 'included')).toHaveLength(4);
    expect(evaluateStatusCompositionV1(result.entries)).toMatchObject({
      suspendedDates: [],
      blockedCapabilities: required ? ['DAILY_TRADING_STATUS'] : [],
    });
    expect(c.post).toHaveBeenCalledTimes(5);
  });

  it('标准来源错误只尝试已有人工备用并保留错误分类', async () => {
    const c = compositionFixture();
    const route = c.policy.routes[0]!;
    route.targets.push({
      ...route.targets[0]!,
      providerId: 'fixture-backup',
      upstreamSource: 'backup',
      routeIndex: 1,
    });
    const original = c.post.getMockImplementation()!;
    c.post.mockImplementation(async (path, request) => {
      if (
        request.routeKey.capability === 'DAILY_TRADING_STATUS' &&
        request.routeTarget.routeIndex === 0
      )
        throw mapDataV3HttpError(
          502,
          {
            detail: {
              contractVersion: 1,
              requestId: request.requestId,
              error: { code: 'invalid_response', message: '行情上游响应格式无效' },
            },
          },
          request.requestId,
        );
      return original(path, request);
    });
    const result = await c.reader.routedStatusCapability(c.demands[0]!.query);
    expect(result.result.routeTarget.routeIndex).toBe(1);
    expect(result.attempts.map((attempt) => attempt.error)).toEqual(['invalid-response', null]);
    expect(c.post).toHaveBeenCalledTimes(2);
  });

  it.each(['malformed', 'wrong-request', 'wrong-message', 'unbound', 'wrong-success'])(
    '协议损坏继续阻断：%s',
    async (mode) => {
      const c = compositionFixture();
      const original = c.post.getMockImplementation()!;
      c.post.mockImplementation(async (path, request) => {
        if (request.routeKey.capability !== 'DAILY_TRADING_STATUS') return original(path, request);
        if (mode === 'wrong-success')
          return { ...(await original(path, request)), symbol: '600519.SH' };
        let detail: unknown;
        if (mode === 'malformed') {
          detail = { contractVersion: 1, requestId: request.requestId, code: 'invalid_response' };
        } else {
          detail = {
            contractVersion: 1,
            requestId: mode === 'wrong-request' ? 'wrong-request' : request.requestId,
            error: {
              code: 'invalid_response',
              message: mode === 'wrong-message' ? '来源坏响应' : '行情上游响应格式无效',
            },
          };
        }
        throw mapDataV3HttpError(
          502,
          { detail },
          mode === 'unbound' ? undefined : request.requestId,
        );
      });
      await expect(
        readMarketStatusCompositionV1(c.demands, c.reader, c.readPolicy),
      ).rejects.toMatchObject({ code: 'invalid-response' });
    },
  );
});
