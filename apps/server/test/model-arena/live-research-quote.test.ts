import { expect, it, vi } from 'vitest';
import { readLiveResearchQuote } from '../../src/model-arena/live/live-research-quote.js';
import { liveProtocolFixture } from './live-fixture.js';

const protocol = liveProtocolFixture();
const market = () => ({ getQuote: vi.fn().mockResolvedValue({ symbol: 'AAPL.US', price: 10 }) });
const signal = () => new AbortController().signal;

it('研究报价消费与提交相同的执行 Reader，保留证据拒绝原因', async () => {
  const execution = { read: vi.fn().mockResolvedValue({ status: 'unavailable', reason: 'live_quote_unqualified' }) };
  const result = await readLiveResearchQuote(protocol, 'AAPL.US', 'STOCK', signal(), market() as never, execution as never);
  expect(result).toMatchObject({ symbol: 'AAPL.US', price: 10,
    execution: { status: 'unavailable', reason: 'live_quote_unqualified' } });
  expect(execution.read).toHaveBeenCalledWith({ symbol: 'AAPL.US', assetType: 'STOCK', market: 'US',
    currency: 'USD', maxQuoteAgeSeconds: protocol.resources.maxQuoteAgeSeconds, expiresOn: [], needsBuySettlement: false });
});
it('合格执行证据返回自己的价格和来源时点，不暴露完整底层回执', async () => {
  const execution = { read: vi.fn().mockResolvedValue({ status: 'available', evidence: { private: 'raw' },
    observation: { price: '10.01', marketTime: '2026-11-12T16:00:00Z', observedAt: '2026-11-12T16:00:01Z' } }) };
  const result = await readLiveResearchQuote(protocol, 'AAPL.US', 'STOCK', signal(), market() as never, execution as never);
  expect(result.execution).toMatchObject({ status: 'available', price: '10.01', marketTime: '2026-11-12T16:00:00Z' });
  expect(result).not.toHaveProperty('evidence');
});
it('执行 Reader 缺失、故障与取消均不能认证可执行', async () => {
  expect(await readLiveResearchQuote(protocol, 'AAPL.US', 'STOCK', signal(), market() as never))
    .toMatchObject({ execution: { status: 'unavailable', reason: 'execution_reader_unavailable' } });
  const execution = { read: vi.fn().mockRejectedValue(new Error('private')) };
  expect(await readLiveResearchQuote(protocol, 'AAPL.US', 'STOCK', signal(), market() as never, execution as never))
    .toMatchObject({ execution: { status: 'unavailable', reason: 'execution_evidence_unavailable' } });
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await expect(readLiveResearchQuote(protocol, 'AAPL.US', 'STOCK', controller.signal, market() as never, execution as never))
    .rejects.toThrow('cancelled');
});
