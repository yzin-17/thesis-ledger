import { describe, expect, it, vi } from 'vitest';
import { marketReferenceInputSchema } from '@thesis-ledger/schemas';
import { marketReferenceClient } from '../src/market-reference-client.js';

describe('市场资料客户端', () => {
  it('非法条件在请求前拒绝，信号通过原传输传递', async () => {
    const request = vi.fn().mockRejectedValue(new Error('测试停止'));
    const client = marketReferenceClient(request);
    const input = marketReferenceInputSchema.parse({ dataset: 'global-news' });
    await expect(client.getReference({ ...input, page: 2 })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    const signal = new AbortController().signal;
    await expect(client.getReference(input, signal)).rejects.toThrow('测试停止');
    expect(request.mock.calls[0]?.[2]).toMatchObject({ method: 'POST', signal });
  });
});
