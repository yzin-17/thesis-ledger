import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerApiError } from '../src/index.js';
import { id, other } from './strategy-management.fixture.js';

const receipt = {
  strategyVersion: { id, strategyId: other, version: 2 },
  source: { experimentId: id, candidateId: other, candidateHash: 'candidate-hash' },
  riskApplicationEnabled: false,
  detailsStatus: 'unavailable', detailsErrorCode: 'ADOPTION_DETAILS_UNAVAILABLE',
};
const body = { candidateId: other, candidateHash: 'candidate-hash', expectedStrategyVersion: 1, idempotencyKey: 'same-intent' };

describe('采纳已提交回执与只读恢复', () => {
  it('附加信息暂不可用仍返回已保存版本，不伪装为空风险计划', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(receipt)));
    const api = new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).strategy.optimization;
    expect(await api.adopt(id, body)).toMatchObject(receipt);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['断开响应', '响应契约损坏'])('%s 后只发 GET 核对，不自动重复 POST', async (mode) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        if (mode === '断开响应') throw new TypeError('connection lost');
        return new Response(JSON.stringify({ invalid: true }));
      })
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)));
    const api = new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).strategy.optimization;
    expect((await api.adopt(id, body)).strategyVersion.version).toBe(2);
    expect(fetcher.mock.calls.map(call => call[1]?.method ?? 'GET')).toEqual(['POST', 'GET']);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(`/experiments/${id}/candidates/${other}/adoption`);
    expect(fetcher.mock.calls[1]?.[1]?.cache).toBe('no-store');
  });
  it.each([
    { ...receipt, source: { ...receipt.source, candidateHash: 'different' } },
    { ...receipt, source: { ...receipt.source, experimentId: other } },
    { ...receipt, source: { ...receipt.source, candidateId: id } },
    null,
  ])('不将错配或尚未读到的回执确认为成功', async (readReceipt) => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify(readReceipt)));
    const api = new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).strategy.optimization;
    await expect(api.adopt(id, body)).rejects.toMatchObject({ payload: { error: 'ADOPTION_OUTCOME_UNCONFIRMED' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('重查失败保留待确认状态；明确拒绝仍保留原稳定冲突码', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    const api = new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).strategy.optimization;
    await expect(api.adopt(id, body)).rejects.toBeInstanceOf(ThesisLedgerApiError);
    await expect(api.adopt(id, body)).rejects.toMatchObject({ payload: { error: 'ADOPTION_OUTCOME_UNCONFIRMED' } });
    fetcher.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'ADOPTION_STALE_BASELINE', errorCode: 'ADOPTION_STALE_BASELINE', message: '版本已变化' }), { status: 409 }))
      .mockResolvedValueOnce(new Response('null'));
    await expect(api.adopt(id, body)).rejects.toMatchObject({ status: 409, payload: { errorCode: 'ADOPTION_STALE_BASELINE' } });
  });
});
