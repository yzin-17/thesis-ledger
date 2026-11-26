import { describe, expect, it, vi } from 'vitest';
import { fetchOnboardingStatus } from '../src/features/onboarding/onboarding.api.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';

function statusClient(rules: boolean[], schedules: boolean[] | Error): DesktopRequestClient {
  return {
    request: vi.fn(async <T>(path: string): Promise<T> => {
      let response: unknown;
      if (path === '/providers/config') response = [];
      else if (path === '/risk/rules') response = rules.map((enabled) => ({ enabled }));
      else if (path === '/api/market-data/providers') response = { providers: [] };
      else if (path === '/api/market-data/policy') {
        response = {
          contractVersion: 1,
          consumer: 'thesis-ledger',
          requestId: 'onboarding-test',
          revision: 1,
          enabled: false,
          routes: [],
          syncState: 'unknown',
          effectiveProjection: null,
          effectiveStale: true,
        };
      } else if (path === '/automations/risk-monitoring') {
        if (schedules instanceof Error) throw schedules;
        response = schedules.map((enabled) => ({ enabled }));
      } else throw new Error(`Unexpected request: ${path}`);
      return response as T;
    }),
  };
}

describe('新手引导风险配置完成条件', () => {
  it.each([
    { rules: [true], schedules: [], complete: true },
    { rules: [true], schedules: [false], complete: true },
    { rules: [], schedules: [true], complete: false },
    { rules: [false], schedules: [true], complete: false },
    { rules: [false, true], schedules: [false, true], complete: true },
  ])(
    '规则 $rules、排程 $schedules 对应完成状态 $complete',
    async ({ rules, schedules, complete }) => {
      const client = statusClient(rules, schedules);
      expect(await fetchOnboardingStatus(client)).toMatchObject({ hasRiskRule: complete });
      expect(client.request).not.toHaveBeenCalledWith('/automations/risk-monitoring', undefined);
    },
  );

  it('排程不可用不再阻止已启用规则完成配置', async () => {
    const error = new Error('排程读取失败');
    await expect(fetchOnboardingStatus(statusClient([true], error))).resolves.toMatchObject({ hasRiskRule: true });
  });
});
