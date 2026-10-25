// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { button, click, field, input, mount, setApi, view, flush } from './mobile-view-harness';
import { AiProviderEditor } from '../../src/features/ai-providers/AiProviderEditor';
import { MarketProviderEditor } from '../../src/features/market-providers/MarketProviderEditor';
import { ProviderOAuthScreen } from '../../src/features/provider-oauth/ProviderOAuthScreen';
import { MarketPolicyScreen } from '../../src/features/market-policy/MarketPolicyScreen';
import { MarketCatalogScreen } from '../../src/features/market-catalog/MarketCatalogScreen';
import { AutomationsScreen } from '../../src/features/automation/AutomationsScreen';
import { DiagnosticsScreen } from '../../src/features/diagnostics/DiagnosticsScreen';
import { b5Ai, b5Plan, b5Provider, b5Job, b5Policy, b5Catalog, b5Session } from './batch5-fixture';
vi.mock('../../src/platform/links/open-link', () => ({
  openExternalLink: vi.fn().mockResolvedValue(undefined),
}));
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const props = { route: { params: undefined }, navigation: {} } as never;
async function fillAi() {
  await input(field('来源名称'), 'B5-fixture');
  await input(field('模型服务地址'), 'https://fixture.test/v1');
  await input(field('已选模型（每行一个）'), 'fixture');
  await input(field('API Key'), 'fixture-dummy-key');
}
describe('第 5 批手机配置交互', () => {
  it('离线提交零请求且清空凭证，恢复连接后只在用户再次提交时保存', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        response(String(url).endsWith('validation-plan') ? b5Plan() : b5Ai),
      );
    setApi(fetcher);
    await mount(<AiProviderEditor {...props} />);
    await fillAi();
    onlineManager.setOnline(false);
    await click(button('验证并保存配置'));
    expect(fetcher).not.toHaveBeenCalled();
    expect(field('API Key').value).toBe('');
    expect(field('来源名称').value).toBe('B5-fixture');
    expect(document.body.textContent).toContain('当前离线');
    onlineManager.setOnline(true);
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
    await input(field('API Key'), 'fixture-dummy-key');
    await click(button('验证并保存配置'));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('配置已保存');
  });
  it('改为无需认证立即清空密钥，保存及目录请求均不携带旧凭证', async () => {
    const bodies: unknown[] = [];
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        if (String(url).endsWith('/models')) return response({ models: ['fixture'] });
        return response(
          String(url).endsWith('validation-plan')
            ? b5Plan()
            : { ...b5Ai, authMode: 'none', credentialConfigured: false },
        );
      }),
    );
    await mount(<AiProviderEditor {...props} />);
    await fillAi();
    await click(button('无需认证'));
    expect(field('API Key').value).toBe('');
    expect(field('API Key').disabled).toBe(true);
    await click(button('读取模型目录'));
    await click(button('验证并保存配置'));
    expect(bodies).toHaveLength(3);
    for (const body of bodies) {
      expect(body).toMatchObject({ authMode: 'none' });
      expect(body).not.toHaveProperty('apiKey');
    }
    expect(document.body.textContent).toContain('配置已保存');
  });
  it('凭证提交即清空且不进入查询或 Mutation variables，保存失败保留非敏感输入', async () => {
    const calls: string[] = [];
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        calls.push(String(url));
        return String(url).endsWith('validation-plan')
          ? response(b5Plan())
          : response({ message: 'echo fixture-dummy-key' }, 409);
      }),
    );
    const client = await mount(<AiProviderEditor {...props} />);
    await fillAi();
    await click(button('验证并保存配置'));
    await flush();
    expect(field('API Key').value).toBe('');
    expect(field('来源名称').value).toBe('B5-fixture');
    expect(document.body.textContent).toContain('配置或引用已改变');
    expect(document.body.textContent).not.toContain('fixture-dummy-key');
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state),
      ),
    ).not.toContain('fixture-dummy-key');
    expect(
      client
        .getMutationCache()
        .getAll()
        .every((mutation) => mutation.state.variables === undefined),
    ).toBe(true);
    expect(calls).toHaveLength(2);
  });
  it('验证计划取消后零模型调用和零保存请求', async () => {
    view.confirm.mockResolvedValue(false);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(b5Plan(true)));
    setApi(fetcher);
    await mount(<AiProviderEditor {...props} />);
    await fillAi();
    await click(button('验证并保存配置'));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/validation-plan');
    expect(view.confirm).toHaveBeenCalledWith(
      '授权测试并保存？',
      expect.stringContaining('最多 2 次调用'),
    );
    expect(field('API Key').value).toBe('');
  });
  it('合法无待验证计划只保存一次，不用连接测试伪造用途就绪', async () => {
    const calls: string[] = [];
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        calls.push(String(url));
        return response(String(url).endsWith('validation-plan') ? b5Plan() : b5Ai);
      }),
    );
    await mount(<AiProviderEditor {...props} />);
    await fillAi();
    await click(button('验证并保存配置'));
    expect(document.body.textContent).toContain('配置已保存');
    expect(calls.some((path) => path.endsWith('/test'))).toBe(false);
    expect(calls).toHaveLength(2);
  });
  it('AI 冲突后只在显式采用最新配置时更新修订与输入', async () => {
    let version = b5Ai;
    const saves: unknown[] = [];
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        if (String(url).endsWith('validation-plan')) return response(b5Plan());
        if (init?.method === 'POST') {
          saves.push(JSON.parse(String(init.body)));
          version = { ...b5Ai, priority: 20, updatedAt: '2026-10-25T02:00:00.000Z' };
          return response({}, 409);
        }
        return response([version]);
      }),
    );
    await mount(<AiProviderEditor {...({ route: { params: { name: b5Ai.name } } } as never)} />);
    await input(field('优先级'), '50');
    await click(button('验证并保存配置'));
    expect(saves[0]).toMatchObject({ expectedRevision: b5Ai.updatedAt, priority: 50 });
    expect(field('优先级').value).toBe('50');
    await click(button('放弃输入并采用服务端 AI 配置'));
    expect(field('优先级').value).toBe('20');
    await click(button('验证并保存配置'));
    expect(saves[1]).toMatchObject({ expectedRevision: version.updatedAt, priority: 20 });
  });
  it('取消无待验证计划的保存请求也会中止网络等待且不自动重试', async () => {
    let savedSignal: AbortSignal | null = null;
    let saves = 0;
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        if (String(url).endsWith('validation-plan')) return response(b5Plan());
        if (String(url).includes('/cancel')) return response({ cancelled: true });
        saves++;
        savedSignal = init?.signal ?? null;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')));
        });
      }),
    );
    await mount(<AiProviderEditor {...props} />);
    await fillAi();
    await click(button('验证并保存配置'));
    await click(button('取消当前操作'));
    expect(savedSignal).not.toBeNull();
    expect((savedSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(saves).toBe(1);
    expect(field('API Key').value).toBe('');
    expect(document.body.textContent).toContain('取消');
    expect(document.body.textContent).toContain('重新读取服务端状态');
  });
  it('行情配置冲突清空秘密、保留设置并绑定原配置代次', async () => {
    const posts: unknown[] = [];
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        if (init?.method === 'POST') {
          posts.push(JSON.parse(String(init.body)));
          return response({ message: 'fixture-secret-token' }, 409);
        }
        return response({ contractVersion: 3, consumer: 'thesis-ledger', providers: [b5Provider] });
      }),
    );
    await mount(
      <MarketProviderEditor {...({ route: { params: { providerId: 'longbridge' } } } as never)} />,
    );
    await input(field('访问令牌（必填）'), 'fixture-secret-token');
    await input(field('来源设置（JSON，不填写凭证）'), '{"region":"CN"}');
    await click(button('保存行情凭证与设置'));
    expect(field('访问令牌（必填）').value).toBe('');
    expect(field('来源设置（JSON，不填写凭证）').value).toBe('{"region":"CN"}');
    expect(posts).toEqual([
      {
        expectedConfigVersion: 1,
        settings: { region: 'CN' },
        credentials: { method: 'token', values: { token: 'fixture-secret-token' } },
      },
    ]);
    expect(document.body.textContent).not.toContain('fixture-secret-token');
  });
  it('行情凭证在请求发出时清空，取消等待不重复提交', async () => {
    let signal: AbortSignal | null = null;
    let writes = 0;
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        if (init?.method === 'POST') {
          writes++;
          signal = init.signal ?? null;
          return new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('', 'AbortError')),
            );
          });
        }
        return response({ contractVersion: 3, consumer: 'thesis-ledger', providers: [b5Provider] });
      }),
    );
    await mount(
      <MarketProviderEditor {...({ route: { params: { providerId: 'longbridge' } } } as never)} />,
    );
    await input(field('访问令牌（必填）'), 'fixture-secret-token');
    await click(button('保存行情凭证与设置'));
    expect(field('访问令牌（必填）').value).toBe('');
    await click(button('取消等待行情操作'));
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    expect(writes).toBe(1);
    expect(document.body.textContent).toContain('已取消等待');
  });
  it('OAuth 系统浏览器返回保持等待，取消后以服务端终态为准', async () => {
    let cancelled = false;
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        if (init?.method === 'POST') {
          cancelled = true;
          return response({ ...b5Session, status: 'cancelled' });
        }
        return response({ session: cancelled ? { ...b5Session, status: 'cancelled' } : b5Session });
      }),
    );
    await mount(<ProviderOAuthScreen />);
    await click(button('在系统浏览器继续授权'));
    expect(document.body.textContent).toContain('返回本身不代表授权成功');
    expect(document.body.textContent).toContain('等待网页授权');
    await click(button('取消网页授权'));
    expect(document.body.textContent).toContain('已取消');
  });
  it('路由冲突保留原修订和输入，查询失败不开放保存', async () => {
    const posts: unknown[] = [];
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        if (init?.method === 'PUT') {
          posts.push(JSON.parse(String(init.body)));
          return response({}, 409);
        }
        if (String(url).includes('/routes/'))
          return response({
            contractVersion: 3,
            consumer: 'thesis-ledger',
            status: 'unavailable',
            catalogRevision: null,
            generatedAt: null,
            entries: [],
            reason: 'control_unavailable',
          });
        return response(b5Policy);
      }),
    );
    await mount(<MarketPolicyScreen />);
    await input(field('路由列表（JSON）'), '[]');
    await click(button('保存并验证行情路由'));
    expect(posts[0]).toMatchObject({
      expectedRevision: 2,
      revision: 3,
      enabled: false,
      routes: [],
    });
    expect(field('路由列表（JSON）').value).toBe('[]');
    expect(document.body.textContent).toContain('配置或引用已改变');
  });
  it('目录任务读取失败不再次同步，明确显示尚未确认', async () => {
    let posts = 0;
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        if (init?.method === 'POST') {
          posts++;
          return response({}, 503);
        }
        if (String(url).includes('/jobs/')) return response({}, 503);
        return response({ ...b5Catalog, activeJobId: 'existing-task', refreshInProgress: true });
      }),
    );
    await mount(<MarketCatalogScreen />);
    expect(button('同步标的目录').disabled).toBe(true);
    await click(button('重新读取同步任务'));
    expect(posts).toBe(0);
    expect(document.body.textContent).toContain('尚未确认目录更新');
  });
  it('系统任务禁止删除，运行锁跳过不会被显示为成功', async () => {
    let posts = 0;
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        if (init?.method === 'POST') {
          posts++;
          return response({ skipped: true, reason: '执行锁已占用' });
        }
        return response([{ ...b5Job, managed: true }]);
      }),
    );
    await mount(<AutomationsScreen {...props} />);
    expect(button(`删除任务 ${b5Job.name}`).disabled).toBe(true);
    await click(button(`立即执行 ${b5Job.name}`));
    expect(posts).toBe(1);
    expect(document.body.textContent).toContain('本次未执行：执行锁已占用');
  });
  it('诊断部分失败保留错误且重新读取不外发', async () => {
    const writes: string[] = [];
    setApi(
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        if (init?.method) writes.push(init.method);
        return String(url).includes('/notifications')
          ? response([
              {
                id: 'notification-1',
                provider: 'fixture',
                status: 'failed',
                lastError: '受控投递失败',
              },
            ])
          : response({}, 503);
      }),
    );
    await mount(<DiagnosticsScreen />);
    await click(button('通知失败'));
    expect(document.body.textContent).toContain('受控投递失败');
    await click(button('重新读取通知失败'));
    expect(writes).toEqual([]);
  });
});
