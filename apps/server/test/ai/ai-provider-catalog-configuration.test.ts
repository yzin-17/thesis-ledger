import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiProviderModelCatalogConfig } from '@thesis-ledger/schemas';
import { fetchAiProviderModelCatalog } from '../../src/ai/ai-provider-model-catalog.js';
import { catalogPointerValue } from '../../src/ai/ai-provider-model-catalog-source.js';
import { queryAiProviderModels } from '../../src/ai/ai-provider-model-catalog-query.js';

const baseUrl = 'https://example.test/v1';
const config: AiProviderModelCatalogConfig = {
  url: 'https://example.test/catalog?scope=text',
  itemsPath: '/result',
  idPath: '/name',
  reasoningPath: '/metadata/reasoning',
  filter: { path: '/task/name', equals: 'Text Generation' },
};
const pageConfig: AiProviderModelCatalogConfig = {
  ...config,
  pagination: {
    pageParam: 'page',
    pageSizeParam: 'limit',
    pageSize: 2,
    startPage: 0,
    stopWhen: 'empty-page',
  },
};
const item = (name: string, task = 'Text Generation') => ({
  id: `uuid-${name}`,
  name,
  task: { name: task },
});
const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
type CatalogFetch = (
  url: string,
  options: RequestInit & { signal: AbortSignal },
) => Promise<ReturnType<typeof response>>;
const run = (value = config, timeoutMs = 1000) =>
  fetchAiProviderModelCatalog(
    baseUrl,
    'fixture-secret',
    timeoutMs,
    'chat-completions',
    'api_key',
    value,
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('通用模型目录执行', () => {
  it.each(['https://example.test', 'https://another.test'])(
    '只根据手动配置映射地址与列表：%s',
    (origin) => {
      const fetcher = vi.fn<CatalogFetch>(async () =>
        response({ result: [item('z'), item('a'), item('ignored', 'Embedding')] }),
      );
      vi.stubGlobal('fetch', fetcher);
      const modelCatalog = { ...config, url: `${origin}/custom-catalog` };
      return fetchAiProviderModelCatalog(
        `${origin}/v1`,
        'fixture-secret',
        1000,
        'chat-completions',
        'api_key',
        modelCatalog,
      ).then((result) => {
        expect(result.models).toEqual(['a', 'z']);
        expect(String(fetcher.mock.calls[0]?.[0])).toBe(modelCatalog.url);
        expect(fetcher).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'GET',
            redirect: 'error',
            headers: { authorization: 'Bearer fixture-secret' },
          }),
        );
      });
    },
  );

  it('配置根数组及字符串项，支持 JSON Pointer 标准转义', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ 'a/b': { '~items': ['beta', 'alpha'] } })),
    );
    expect((await run({ url: config.url, itemsPath: '/a~1b/~0items', idPath: '' })).models).toEqual(
      ['alpha', 'beta'],
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(['root-model'])),
    );
    expect((await run({ url: config.url, itemsPath: '', idPath: '' })).models).toEqual([
      'root-model',
    ]);
  });

  it('按配置元数据路径消费白名单字段，合并重复项', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          result: [
            item('one'),
            {
              ...item('one'),
              metadata: {
                reasoning: {
                  supported_efforts: ['low', 'unknown'],
                  mandatory: true,
                  private: 'not-returned',
                },
              },
            },
          ],
        }),
      ),
    );
    expect(await run()).toEqual({
      models: ['one'],
      modelDetails: [{ id: 'one', reasoning: { supportedEfforts: ['low'], mandatory: true } }],
    });
  });

  it('页码、容量、已有查询参数及结束规则均来自配置', async () => {
    const fetcher = vi
      .fn<CatalogFetch>()
      .mockResolvedValueOnce(response({ result: [item('a'), item('b')] }))
      .mockResolvedValueOnce(response({ result: [item('c')] }))
      .mockResolvedValueOnce(response({ result: [] }));
    vi.stubGlobal('fetch', fetcher);
    expect((await run(pageConfig)).models).toEqual(['a', 'b', 'c']);
    expect(
      fetcher.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('page')),
    ).toEqual(['0', '1', '2']);
    for (const [url, options] of fetcher.mock.calls) {
      expect(new URL(String(url)).searchParams.get('scope')).toBe('text');
      expect(new URL(String(url)).searchParams.get('limit')).toBe('2');
      expect(options.signal).toBe(fetcher.mock.calls[0]?.[1].signal);
    }
  });

  it('不足一页结束时不请求空页，容量参数可省略', async () => {
    const pagination = { ...pageConfig.pagination! };
    delete pagination.pageSizeParam;
    const fetcher = vi.fn<CatalogFetch>(async () => response({ result: [item('one')] }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await run({ ...pageConfig, pagination: { ...pagination, stopWhen: 'short-page' } })).models,
    ).toEqual(['one']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.has('limit')).toBe(false);
  });

  it('重复页立即失败，不返回已读部分', async () => {
    const fetcher = vi.fn<CatalogFetch>(async () => response({ result: [item('same')] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(run(pageConfig)).rejects.toThrow('分页未前进');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('数量上限统计筛选前的条目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ result: Array.from({ length: 2001 }, (_, i) => item(String(i), 'Embedding')) }),
      ),
    );
    await expect(run()).rejects.toThrow('2000 条上限');
  });

  it('持续小页也受总页数限制', async () => {
    let next = 0;
    const fetcher = vi.fn<CatalogFetch>(async () => response({ result: [item(String(next++))] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(run(pageConfig)).rejects.toThrow('21 页上限');
    expect(fetcher).toHaveBeenCalledTimes(21);
  });

  it('总超时中止后续分页，不重置等待或重试', async () => {
    const fetcher = vi
      .fn<CatalogFetch>()
      .mockResolvedValueOnce(response({ result: [item('first')] }))
      .mockImplementationOnce(async (_url, options) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        options.signal.throwIfAborted();
        throw new Error('总超时应中止分页');
      });
    vi.stubGlobal('fetch', fetcher);
    await expect(run(pageConfig, 10)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1].signal).toBe(fetcher.mock.calls[0]?.[1].signal);
    expect(fetcher.mock.calls[1]?.[1].signal.aborted).toBe(true);
  });

  it.each([null, {}, { result: {} }, { success: false, result: null }])(
    '错误形状整体失败：%j',
    async (payload) => {
      const fetcher = vi.fn<CatalogFetch>(async () => response(payload));
      vi.stubGlobal('fetch', fetcher);
      await expect(run()).rejects.toThrow('列表路径没有返回数组');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['', ' ', 123, null, 'x'.repeat(201)])('拒绝无效模型 ID：%s', async (name) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ result: [{ ...item('one'), name }] })),
    );
    await expect(run()).rejects.toThrow('无效模型 ID');
  });

  it('HTTP 失败不尝试其他地址或生成端点', async () => {
    const fetcher = vi.fn<CatalogFetch>(async () => response({}, 405));
    vi.stubGlobal('fetch', fetcher);
    await expect(run()).rejects.toThrow('HTTP 405');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('没有显式规则时始终使用标准路径', async () => {
    const fetcher = vi.fn<CatalogFetch>(async () => response({ data: [{ id: 'standard' }] }));
    vi.stubGlobal('fetch', fetcher);
    const url =
      'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1';
    expect((await fetchAiProviderModelCatalog(url, '', 1000)).models).toEqual(['standard']);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`${url}/models`);
  });

  it('读取自身字段，不沿原型链查找目录或模型 ID', () => {
    expect(catalogPointerValue(Object.create({ data: ['inherited'] }), '/data')).toBeUndefined();
    expect(
      catalogPointerValue({ own: Object.create({ id: 'inherited' }) }, '/own/id'),
    ).toBeUndefined();
  });

  it('API Key 不跨来源，无认证模式不发送已提供的 Key', async () => {
    const fetcher = vi.fn<CatalogFetch>(async () => response({ result: [item('one')] }));
    vi.stubGlobal('fetch', fetcher);
    const other = { ...config, url: 'https://other.test/catalog' };
    await expect(run(other)).rejects.toThrow('同源');
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (
        await fetchAiProviderModelCatalog(
          baseUrl,
          'fixture-secret',
          1000,
          'chat-completions',
          'none',
          other,
        )
      ).models,
    ).toEqual(['one']);
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: {} }),
    );
  });
});

describe('Provider 目录查询的草稿与已存配置', () => {
  const stored = {
    name: 'example',
    type: 'ai',
    settings: {
      baseUrl,
      models: ['one'],
      authMode: 'api_key',
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      modelCatalog: config,
    },
  };
  const dependencies = () => ({
    findStored: vi.fn(async () => stored),
    readCredential: vi.fn(async () => 'fixture-secret'),
  });

  it('省略规则时复用已存规则和凭据，只查询不保存', async () => {
    const fetcher = vi.fn<CatalogFetch>(async () => response({ result: [item('one')] }));
    vi.stubGlobal('fetch', fetcher);
    const configs = dependencies();
    expect(
      (await queryAiProviderModels({ name: 'example', baseUrl }, configs as never)).models,
    ).toEqual(['one']);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(config.url);
    expect(configs.readCredential).toHaveBeenCalledTimes(1);
  });

  it('临时规则覆盖已存规则，显式 null 使用默认规则', async () => {
    const fetcher = vi
      .fn<CatalogFetch>()
      .mockResolvedValueOnce(response({ alternate: [{ code: 'draft' }] }))
      .mockResolvedValueOnce(response({ data: [{ id: 'default' }] }));
    vi.stubGlobal('fetch', fetcher);
    const modelCatalog = {
      url: 'https://example.test/draft',
      itemsPath: '/alternate',
      idPath: '/code',
    };
    const configs = dependencies();
    expect(
      (await queryAiProviderModels({ name: 'example', baseUrl, modelCatalog }, configs as never))
        .models,
    ).toEqual(['draft']);
    expect(
      (
        await queryAiProviderModels(
          { name: 'example', baseUrl, modelCatalog: null },
          configs as never,
        )
      ).models,
    ).toEqual(['default']);
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(`${baseUrl}/models`);
    expect(stored.settings.modelCatalog).toEqual(config);
  });
});
