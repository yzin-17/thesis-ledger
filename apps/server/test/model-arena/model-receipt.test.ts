import { afterEach, expect, it, vi } from 'vitest';
import { prepareModelReceipt } from '../../src/ai/ai-model-receipt.js';

const key = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive';
const model = key + '@q4_k_m';
const base = {
  baseURL: 'http://fixture.local/v1',
  apiKey: '',
  authMode: 'none' as const,
  timeoutMs: 3000,
};
const runtime = {
  ...base,
  modelCatalog: { url: 'http://fixture.local/api/v1/models', itemsPath: '/models', idPath: '/key' },
};
const row = {
  type: 'llm',
  key,
  size_bytes: 22066041088,
  quantization: { name: 'Q4_K_M' },
  loaded_instances: [],
};
const loaded = { ...row, loaded_instances: [{ id: key }] };
afterEach(() => vi.unstubAllGlobals());
function pages(...pages: unknown[][]) {
  const fetch = vi.fn();
  for (const models of pages)
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ models }), { headers: { 'content-type': 'application/json' } }),
    );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('目录确认量化并在回执时观测到同模型实例，才承认简写标识', async () => {
  const fetch = pages([row], [loaded]);
  const check = await prepareModelReceipt(runtime, model);
  expect(await check.verify(key)).toMatchObject({
    accepted: true,
    before: { instances: [] },
    after: { instances: [key] },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([
  ['不同量化', { ...loaded, quantization: { name: 'Q8_0' } }],
  ['多个变体', { ...loaded, variants: [model, key + '@q8_0'] }],
  ['实际文件变化', { ...loaded, size_bytes: 123 }],
  ['目录无已加载实例', row],
  ['加载了其他实例', { ...row, loaded_instances: [{ id: 'other' }] }],
])('回执时%s不能计分', async (_name, changed) => {
  pages([row], [changed]);
  expect((await (await prepareModelReceipt(runtime, model)).verify(key)).accepted).toBe(false);
});
it('派发前量化不符或目录项有歧义时拒绝', async () => {
  pages([{ ...row, quantization: { name: 'Q8_0' } }], [row, row]);
  await expect(prepareModelReceipt(runtime, model)).rejects.toThrow();
  await expect(prepareModelReceipt(runtime, model)).rejects.toThrow();
});
it('未指定原生目录的接入只接受完整回执，不读取目录', async () => {
  const fetch = pages();
  const check = await prepareModelReceipt(base, model);
  for (const actual of [null, key, key + '@q8_0'])
    expect((await check.verify(actual)).accepted).toBe(false);
  expect((await check.verify(model)).accepted).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
