import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MarketRuleMonitorController } from '../../src/market/market-rule-monitor.controller.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const sample = JSON.parse(
  readFileSync(
    new URL('../../../../packages/schemas/fixtures/rule-source-monitor-v1.json', import.meta.url),
    'utf8',
  ),
);

describe('来源目录扩展的 Server 代理', () => {
  it.each([10, 17])('转发 %i 个来源且保持请求与结果归属', async (count) => {
    const sourceIds = Array.from({ length: count }, (_, i) => `official-rules/source-${i}`);
    const control = vi.fn(async () => ({
      ...sample.taskResponse,
      config: { ...sample.taskResponse.config, sourceIds },
    }));
    const reader = new MarketRuleMonitorController({ control } as unknown as DsaClient);
    const input = { ...sample.taskRequest, sourceIds };
    expect((await reader.createTask(input)).config.sourceIds).toEqual(sourceIds);
    expect(control.mock.calls[0]).toEqual([
      '/api/v1/thesis-ledger/control/rule-monitor/task',
      { method: 'POST', body: JSON.stringify(input) },
      1,
    ]);
    await reader.configure({ ...input, enabled: true });
    control.mockResolvedValueOnce({ ...sample.queued, run: { ...sample.queued.run, sourceIds } });
    await reader.check({ ...sample.request, sourceIds });
    control.mockResolvedValueOnce({
      ...sample.status,
      config: { ...sample.taskResponse.config, sourceIds },
      sources: sourceIds.map((identity) => ({ ...sample.status.sources[0], identity })),
    });
    expect((await reader.status()).sources).toHaveLength(count);
    await expect(
      reader.createTask({ ...input, sourceIds: [...sourceIds, sourceIds[0]] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(control).toHaveBeenCalledTimes(4);
  });
});
