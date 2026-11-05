import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../../schemas/fixtures/rule-source-monitor-v1.json', import.meta.url),
      'utf8',
    ),
  );
describe('收费监测客户端请求归属与零发送拒绝', () => {
  it('传递中断信号和只读缓存语义，手动检查复用请求标识', async () => {
    const sample = fixture();
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      Response.json(String(url).endsWith('/checks') ? sample.queued : sample.status),
    );
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    await client.market.getRuleMonitor(signal);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ signal, cache: 'no-store' });
    await client.market.checkRuleSources(sample.request);
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual(sample.request);
    expect(String(fetcher.mock.calls[1]![0])).toBe(
      'https://ledger.test/api/market-data/rule-monitor/checks',
    );
  });
  it('拒绝晚到其他任务、其他文档版本以及未绑定配置修订', async () => {
    const sample = fixture();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(sample.queued));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(
      client.market.getRuleMonitorJob('00000000-0000-4000-8000-000000000099'),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    fetcher.mockResolvedValueOnce(Response.json(sample.versions));
    await expect(client.market.getRuleMonitorVersions('document', 'other')).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    fetcher.mockResolvedValueOnce(
      Response.json({ version: sample.request.version, config: sample.status.config }),
    );
    await expect(
      client.market.configureRuleMonitor({
        version: sample.request.version,
        expectedRevision: 0,
        enabled: false,
        sourceIds: [],
      }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('重复来源或非法任务ID在传输前拒绝', () => {
    const sample = fixture();
    const fetcher = vi.fn();
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    expect(() =>
      client.market.checkRuleSources({ ...sample.request, sourceIds: ['bad', 'bad'] }),
    ).toThrow();
    expect(() => client.market.getRuleMonitorJob('../bad')).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
