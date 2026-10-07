import { readFileSync } from 'node:fs';
import { backtestRunPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

const request = backtestRunPreparationRequestV3Schema.parse({
  contractVersion: 3,
  requestId: 'prepare-transport',
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
  adjustment: 'none',
  accountingBasis: 'raw-events',
  history: { basis: 'fixed-provider-snapshot' },
  runConfig: {
    startDate: '2024-01-02',
    endDate: '2024-03-29',
    dataAsOf: '2026-09-11T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel: JSON.parse(
      readFileSync(
        new URL('../../schemas/fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
        'utf8',
      ),
    ),
  },
});
const blocked = {
  contractVersion: 3,
  requestId: request.requestId,
  checkedAt: '2026-09-11T00:00:00Z',
  scope: 'execution-window',
  status: 'blocked',
  diagnostics: [
    {
      severity: 'error',
      category: 'data-unavailable',
      code: 'DATA_UNAVAILABLE',
      message: '来源不可用',
      symbol: null,
      capability: null,
      purpose: null,
      dateRange: null,
      routeKey: null,
      missingFields: [],
      incompatibleRules: [],
      targetSources: [],
      suggestedActions: [{ action: 'retry-preflight', description: '恢复来源后重试' }],
    },
  ],
};

describe('配置准备客户端传输', () => {
  it('只发送用户意图并保留完整阻塞诊断', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(blocked)));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    expect(await client.backtests.prepareRunConfig(request)).toEqual(blocked);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://thesis-ledger.test/api/v1/backtests/run-config/prepare');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    { ...blocked, runConfig: request.runConfig },
    { ...blocked, status: 'prepared' },
    { ...blocked, diagnostics: [] },
  ])('拒绝伪成功或不完整准备结果', async (response) => {
    const client = new ThesisLedgerApiClient(
      'https://thesis-ledger.test/api/v1',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response))),
    );
    await expect(client.backtests.prepareRunConfig(request)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
});
