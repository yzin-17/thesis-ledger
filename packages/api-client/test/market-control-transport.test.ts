import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

const probe = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  providerId: 'tushare',
  requestId: 'probe-current',
  status: 'unconfigured',
  credentialConfigured: false,
  capabilityResults: { DAILY_BAR: { status: 'unconfigured', readOnly: true, attempted: false } },
};
describe('Market 控制客户端当前传输', () => {
  it('解析当前 Registry 空列表，缺信封或缺字段不能升级为空成功', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ contractVersion: 3, consumer: 'thesis-ledger', providers: [] }),
        ),
      );
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    expect((await client.market.getProviderRegistry()).providers).toEqual([]);
    for (const raw of [{ providers: [] }, { contractVersion: 3, consumer: 'thesis-ledger' }]) {
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify(raw)));
      await expect(client.market.getProviderRegistry()).rejects.toBeInstanceOf(
        ThesisLedgerContractError,
      );
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('探测只请求当前 URL，绑定 Provider 身份并保留明确未配置状态', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(probe)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...probe, providerId: 'other' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...probe, contractVersion: 2 })));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    expect((await client.market.testProvider('tushare', {})).status).toBe('unconfigured');
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://thesis-ledger.test/api/market-data/providers/tushare/test',
    );
    await expect(client.market.testProvider('tushare', {})).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    await expect(client.market.testProvider('tushare', {})).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
