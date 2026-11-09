import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apiRateLimitPolicies, apiRateLimitPolicy } from '../../src/platform/api-rate-limit-policy.js';
import { apiRouteInventory } from './api-route-inventory.js';

describe('全接口成本登记门禁', () => {
  it('所有 Controller 操作唯一登记，不允许漏项、失效项或重复登记', () => {
    const actual = apiRouteInventory(fileURLToPath(new URL('../../src', import.meta.url)));
    const registered = apiRateLimitPolicies.map((policy) => policy.operation);
    expect(new Set(actual).size).toBe(actual.length);
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual([...actual].sort());
  });

  it('动态参数和静态路径按各自操作匹配，查询、大小写及尾斜线不改变分类', () => {
    for (const policy of apiRateLimitPolicies) {
      const [method, path] = policy.operation.split(' ') as [string, string];
      const sample = path.replace(/:[^/]+/gu, 'fixture');
      expect(apiRateLimitPolicy(method, sample)?.operation, policy.operation).toBe(policy.operation);
      expect(apiRateLimitPolicy(method, `${sample.toUpperCase()}/?page=2`)?.operation).toBe(policy.operation);
      if (method === 'GET') expect(apiRateLimitPolicy('HEAD', sample)?.operation).toBe(policy.operation);
    }
    expect(apiRateLimitPolicy('GET', '/api/v1/not-registered')).toBeUndefined();
  });

  it.each([
    ['POST', '/api/v1/research/submissions/find', 'poll'],
    ['GET', '/api/market-data/rule-monitor', 'poll'],
    ['POST', '/api/v1/watchlist/prices', 'marketRead'],
    ['POST', '/api/market/quotes', 'marketRead'],
    ['POST', '/api/market-data/reference', 'marketRead'],
    ['GET', '/api/market/000001.OF/fund-valuation', 'marketRead'],
    ['GET', '/api/market/000001.OF/fund-valuation/today', 'marketRead'],
    ['POST', '/api/v1/backtests/run-config/prepare', 'marketRead'],
    ['POST', '/api/v1/backtests/run-config/execution-model', 'marketRead'],
    ['POST', '/api/v1/strategy-optimization/run-config/prepare', 'marketRead'],
    ['POST', '/api/v1/automations/workflows/digest', 'preview'],
    ['POST', '/api/v1/ai/providers/validation-plan', 'preview'],
    ['POST', '/api/v1/ai/providers', 'write'],
    ['PATCH', '/api/v1/ai/providers/provider/enabled', 'write'],
    ['POST', '/api/v1/backtests/runs/run/cancel', 'write'],
    ['POST', '/api/v1/research/submissions/cancel', 'write'],
    ['POST', '/api/v1/backtests/runs', 'task'],
    ['POST', '/api/v1/strategy-optimization/experiments/experiment/finalize', 'task'],
    ['POST', '/api/v1/strategy-submissions/submission/confirm', 'task'],
    ['POST', '/api/v1/model-weeklies/arena/week/revisions', 'ai'],
    ['POST', '/api/v1/ai/providers/test-and-save', 'ai'],
    ['POST', '/api/v1/research/submissions', 'ai'],
    ['POST', '/api/market-data/catalog/sync', 'integration'],
    ['POST', '/api/v1/providers/health/check', 'integration'],
    ['POST', '/api/v1/identity/sessions', 'auth'],
    ['GET', '/api/v1/identity/context', 'read'],
    ['GET', '/api/v1/performance/targets', 'preview'],
    ['GET', '/api/v1/exports/account', 'export'],
    ['GET', '/api/v1/ledger/account/events/replay', 'export'],
    ['GET', '/api/v1/health', 'monitor'],
  ])('%s %s 按实际成本归入 %s', (method, path, cost) => {
    expect(apiRateLimitPolicy(method, path)?.cost).toBe(cost);
  });
});
