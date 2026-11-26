import { describe, expect, it } from 'vitest';
import { lifecycleCapabilitiesFixture } from './lifecycle-response.fixture.js';
import { lifecycleInputHashV3 } from '../../src/backtest/backtest-lifecycle-preparation-v3.js';

const fixture = () => lifecycleCapabilitiesFixture('000995.SZ', '2026-05-01', '2026-05-22', '2026-05-18');

describe('生命周期读取日级状态和证券基础日期', () => {
  it('只向当前两个独立能力读取并保留各自来源', async () => {
    const c = fixture();
    const result = await c.read();
    expect(result.basicLifecycle.ipoDate).toBe('2026-05-18');
    expect(result.days).toHaveLength(22);
    const requests = c.post.mock.calls.map(([path, query]) => [path, query.routeKey.capability]);
    expect(requests.sort()).toEqual([
      ['/api/v1/thesis-ledger/market/status-capabilities', 'DAILY_TRADING_STATUS'],
      ['/api/v1/thesis-ledger/market/status-capabilities', 'SECURITY_BASIC_DATES'],
    ]);
    expect(c.post.mock.calls.find(([, query]) => query.routeKey.capability === 'SECURITY_BASIC_DATES')?.[1])
      .not.toHaveProperty('range');
  });

  it('重新准备时，请求追踪及采样时钟不改变原事实摘要', async () => {
    const c = fixture();
    const first = await c.read();
    c.readPolicy.mockResolvedValue({ ...c.policy, appliedAt: '2026-10-10T00:00:01Z' });
    const second = await c.read();
    expect(lifecycleInputHashV3(first)).toBe(lifecycleInputHashV3(second));
  });

  it('读取期间路由修订变化时，请求失败并要求重新准备', async () => {
    const c = fixture();
    let sampled = false;
    c.readPolicy.mockImplementation(async () => {
      if (sampled && c.post.mock.calls.length >= 2)
        return { ...c.policy, sourceDesiredRevision: c.policy.sourceDesiredRevision + 1 };
      sampled = true;
      return c.policy;
    });
    await expect(c.read()).rejects.toMatchObject({ code: 'stale-revision' });
  });
});
