import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { backtestRunDetailReadSchema } from '@thesis-ledger/schemas';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';
const manifest = JSON.parse(
  readFileSync(
    new URL('../../schemas/fixtures/backtest-snapshot-v3.manifest.json', import.meta.url),
    'utf8',
  ),
);
const result = {
  source: 'BACKTEST',
  schemaVersion: '3',
  snapshotVersion: 'snapshot-manifest-v3',
  runId: 'run-1',
  strategyVersionId: 'version-1',
  snapshotId: 'snapshot',
  resultChecksum: 'checksum',
  engineVersion: 'controlled',
  marketRuleVersion: 'fixture',
  calendarVersion: 'fixture',
  aggregationVersion: 'fixture',
  contentHash: 'content',
  completeness: 'complete',
  warnings: [],
  rejectedOrders: [],
  simulationFills: [],
  trades: [],
  equityCurve: [],
  metrics: {},
  executionPriceProtocol: manifest.executionPriceProtocol,
  comparableDataFingerprint: manifest.comparableDataFingerprint,
  actualSources: manifest.actualSources,
};
const row = {
  id: result.runId,
  strategyVersionId: result.strategyVersionId,
  mode: 'V3',
  status: 'succeeded',
  snapshotId: result.snapshotId,
  resultChecksum: result.resultChecksum,
  result,
};
function setup(value: unknown) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value)));
  return {
    api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).backtests,
    fetcher,
  };
}
describe('回测管理共享合同', () => {
  it('列表与详情传递取消信号，保留服务端状态和来源', async () => {
    const controller = new AbortController(),
      { api, fetcher } = setup([
        { id: 'run-1', strategyVersionId: 'version-1', mode: 'V3', status: 'running', progress: 0 },
      ]);
    await api.listRuns(controller.signal);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    const detail = setup(row);
    await expect(detail.api.getRun(row.id, controller.signal)).resolves.toEqual(row);
    expect(detail.fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
  it.each(['runId', 'strategyVersionId', 'snapshotId', 'resultChecksum'] as const)(
    '拒绝串用结果的 %s',
    async (key) => {
      expect(backtestRunDetailReadSchema.safeParse(row).success).toBe(true);
      await expect(
        setup({ ...row, result: { ...result, [key]: 'different' } }).api.getRun(row.id),
      ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    },
  );
  it('读取失败只返回错误，不产生重试或补投写入', async () => {
    const { api, fetcher } = setup([]);
    fetcher.mockRejectedValue(new Error('读取失败'));
    await expect(api.listRuns()).rejects.toThrow('读取失败');
    await expect(api.getRun('run-1')).rejects.toThrow('读取失败');
    expect(fetcher.mock.calls.every((c) => c[1]?.method === undefined)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('缺少冻结依据的创建与准备在网络请求前拒绝', async () => {
    const { api, fetcher } = setup({});
    expect(() => api.createRun({} as never)).toThrow();
    expect(() => api.createNavRun({} as never)).toThrow();
    await expect(api.prepareCheckedRunConfig({} as never)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
