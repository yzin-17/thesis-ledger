import { describe, expect, it, vi } from 'vitest';
import { backtestRunClient } from '../src/backtest-run-client.js';
import type { ParsedRequest } from '../src/parsed-request.js';

const id = '00000000-0000-4000-8000-000000000080';
describe('冻结标的序列客户端', () => {
  it('使用对应任务的只读端点并传递取消信号', async () => {
    const result = {
      schemaVersion: '1',
      runId: id,
      status: 'unavailable',
      reason: 'ARTIFACT_UNAVAILABLE',
      message: '冻结价格文件缺失',
    };
    const request = vi.fn(async (_path: string, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse(result),
    );
    const signal = new AbortController().signal;
    const client = backtestRunClient(request as ParsedRequest, vi.fn() as never);
    expect(await client.getInstrumentSeries(id, signal)).toEqual(result);
    expect(request).toHaveBeenCalledWith(
      `/backtests/runs/${id}/instrument-series`,
      expect.anything(),
      { signal },
    );
  });
  it('拒绝响应被串联到另一个任务', async () => {
    const request = vi.fn(async (_path: string, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse({
        schemaVersion: '1',
        runId: '00000000-0000-4000-8000-000000000081',
        status: 'unavailable',
        reason: 'EMPTY_SERIES',
        message: '没有价格',
      }),
    );
    await expect(
      backtestRunClient(request as ParsedRequest, vi.fn() as never).getInstrumentSeries(id),
    ).rejects.toThrow();
  });
});
