import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';
const model = JSON.parse(
  readFileSync(
    new URL('../../schemas/fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
    'utf8',
  ),
);
describe('回测客户端披露兼容', () => {
  it.each([false, true])('读取失败响应时保留原因和可选模型：%s', async (withModel) => {
    const payload = {
      id: 'run',
      strategyVersionId: 'version',
      mode: 'V2',
      status: 'failed',
      errorCode: 'DATA_UNAVAILABLE',
      errorSummary: 'historical status unavailable',
      ...(withModel ? { executionModelDisclosure: { model } } : {}),
    };
    const client = new ThesisLedgerApiClient(
      'http://localhost',
      vi.fn(
        async () =>
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    expect(await client.backtests.getRun('run')).toEqual(payload);
  });
});
