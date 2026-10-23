import { describe, expect, it, vi } from 'vitest';
import { fetchProviders } from '../src/features/providers/providers.api.js';
import { sortProviderRecords } from '../src/features/providers/providers.types.js';

describe('提供方列表调用优先级', () => {
  it('AI 按优先级降序、同级按名称排序，且不修改原数组', () => {
    const providers = [
      { name: 'local', type: 'ai', priority: 1 },
      { name: 'z-cloud', type: 'ai', priority: 100 },
      { name: 'a-cloud', type: 'ai', priority: 100 },
    ];
    const original = providers.slice();

    expect(sortProviderRecords(providers).map(({ name }) => name)).toEqual([
      'a-cloud',
      'z-cloud',
      'local',
    ]);
    expect(providers).toEqual(original);
  });

  it('初次加载与重新读取均保持通知升序、AI 降序及原有类型分组', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/providers/config') {
        return [
          { name: 'backup', type: 'notification', priority: 100 },
          { name: 'primary', type: 'notification', priority: 1 },
          { name: 'legacy-ai', type: 'ai', priority: 999 },
        ];
      }
      return [
        { name: 'local', type: 'ai', priority: 1 },
        { name: 'cloud', type: 'ai', priority: 100 },
      ];
    });

    for (let load = 0; load < 2; load += 1) {
      const providers = await fetchProviders({ request });
      expect(providers.map(({ name }) => name)).toEqual(['primary', 'backup', 'cloud', 'local']);
    }
  });
});
