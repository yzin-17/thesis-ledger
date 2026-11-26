import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';

const sample = JSON.parse(
  readFileSync(
    new URL('../../schemas/fixtures/rule-source-monitor-v1.json', import.meta.url),
    'utf8',
  ),
);

describe('来源目录扩展的客户端传输', () => {
  it.each([10, 17])('发送并完整接收 %i 个来源，非法输入仍零发送', async (count) => {
    const sourceIds = Array.from({ length: count }, (_, i) => `official-rules/source-${i}`);
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        ...sample.taskResponse,
        config: { ...sample.taskResponse.config, sourceIds },
      }),
    );
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const input = { ...sample.taskRequest, sourceIds };
    expect((await client.market.createRuleMonitorTask(input)).config.sourceIds).toEqual(sourceIds);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual(input);
    await client.market.configureRuleMonitor({ ...input, enabled: true });
    fetcher.mockResolvedValueOnce(
      Response.json({
        ...sample.queued,
        run: { ...sample.queued.run, sourceIds },
      }),
    );
    await client.market.checkRuleSources({ ...sample.request, sourceIds });
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const invalid of [[], [...sourceIds, sourceIds[0]], ['invalid']]) {
      expect(() => client.market.createRuleMonitorTask({ ...input, sourceIds: invalid })).toThrow();
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
