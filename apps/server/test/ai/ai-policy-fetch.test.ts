import { afterEach, expect, it, vi } from 'vitest';
import * as undici from 'undici';
import { aiPolicyFetch } from '../../src/ai/timeout/ai-policy-fetch.js';
vi.mock('undici', async (original) => ({
  ...(await original<typeof undici>()),
  getGlobalDispatcher: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('保留宿主dispatcher并仅移除HTTP重复等待，signal与请求保持', async () => {
  const dispatch = vi.fn(() => true);
  vi.mocked(undici.getGlobalDispatcher).mockReturnValue({ dispatch } as never);
  const signal = new AbortController().signal;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      expect(init.signal).toBe(signal);
      init.dispatcher.dispatch({ origin: 'http://localhost', path: '/', method: 'GET' }, {});
      return new Response('{}');
    }),
  );
  await aiPolicyFetch('http://localhost', { signal });
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ headersTimeout: 0, bodyTimeout: 0 }),
    expect.anything(),
  );
});
