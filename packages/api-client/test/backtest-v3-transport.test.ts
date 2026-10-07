import { readFileSync } from 'node:fs';
import { backtestRunCreateSchemaV3 } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerContractError,
  type BacktestRunCreateV3,
} from '../src/index.js';

const baseRequest = {
  strategyVersionId: '00000000-0000-4000-8000-000000000001',
  idempotencyKey: 'backtest-transport',
  runConfig: {
    startDate: '2026-08-03',
    endDate: '2026-08-07',
    dataAsOf: '2026-08-10T00:00:00.000Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '1000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
  },
} as const;
const requestV3: BacktestRunCreateV3 = backtestRunCreateSchemaV3.parse({
  ...baseRequest,
  contractVersion: 3,
  preparationStamp: JSON.parse(
    readFileSync(
      new URL('../../schemas/fixtures/backtest-preparation-stamp-v3.json', import.meta.url),
      'utf8',
    ),
  ),
  runConfig: {
    ...baseRequest.runConfig,
    schemaVersion: '3',
    executionPriceProtocol: JSON.parse(
      readFileSync(
        new URL('../../schemas/fixtures/execution-price.raw-events.json', import.meta.url),
        'utf8',
      ),
    ),
    priceInputBindings: {
      signals: [],
      benchmark: { binding: 'execution-series' },
    },
  },
});
const queuedResponse = {
  id: 'run-v3',
  strategyVersionId: baseRequest.strategyVersionId,
  mode: 'V3',
  status: 'queued',
  stage: 'queued',
  input: requestV3,
  runConfig: requestV3.runConfig,
  snapshotId: 'frozen-snapshot',
};

describe('回测客户端版本化传输', () => {
  it.each(['getRun', 'retryRun', 'cancelRun'] as const)(
    '%s 拒绝响应串用其他 Run',
    async (operation) => {
      const client = new ThesisLedgerApiClient(
        'https://thesis-ledger.test/api/v1',
        vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(queuedResponse))),
      );
      await expect(client.backtests[operation]('different-run')).rejects.toBeInstanceOf(
        ThesisLedgerContractError,
      );
    },
  );
  it('联合预检原样发送固定配置并严格解析修订结果', async () => {
    const request = {
      contractVersion: 3 as const,
      requestId: 'preflight-transport',
      strategyVersionId: requestV3.strategyVersionId,
      runConfig: requestV3.runConfig,
    };
    const result = {
      contractVersion: 3,
      requestId: request.requestId,
      checkedAt: '2026-09-27T00:00:00Z',
      status: 'ready',
      revisionStamp: requestV3.preparationStamp,
      diagnostics: [],
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result)));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    expect(await client.backtests.preflightRunConfig(request)).toEqual(result);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://thesis-ledger.test/api/v1/backtests/run-config/preflight');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(request);
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...result, revisionStamp: null })));
    await expect(client.backtests.preflightRunConfig(request)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });

  it('原样发送现行创建合同并保留持久化 Job 响应', async () => {
    const request = requestV3;
    const payload = { ...queuedResponse, input: request, runConfig: request.runConfig };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    expect(await client.backtests.createRun(request)).toEqual(payload);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://thesis-ledger.test/api/v1/backtests/runs');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('拒绝旧模式的持久化 Run 响应', async () => {
    const client = new ThesisLedgerApiClient(
      'https://thesis-ledger.test/api/v1',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ ...queuedResponse, mode: 'V2' }))),
    );
    await expect(client.backtests.getRun(queuedResponse.id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });

  it.each(['getRun', 'retryRun', 'cancelRun'] as const)(
    '%s 保留V3身份及服务端失败诊断',
    async (operation) => {
      const payload = {
        ...queuedResponse,
        status: 'failed',
        stage: 'failed',
        errorCode: 'DATA_UNAVAILABLE',
        errorSummary: '冻结配置与快照不一致',
        diagnostics: { code: 'SNAPSHOT_CONFIG_MISMATCH', path: ['runConfig'] },
      };
      const client = new ThesisLedgerApiClient(
        'https://thesis-ledger.test/api/v1',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
      );
      expect(await client.backtests[operation](payload.id)).toEqual(payload);
    },
  );

  it('不将缺少持久化状态的成功HTTP响应视为合法Run', async () => {
    const client = new ThesisLedgerApiClient(
      'https://thesis-ledger.test/api/v1',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 'run-v3', contractVersion: 3 }), { status: 200 }),
        ),
    );
    await expect(client.backtests.createRun(requestV3)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
});
