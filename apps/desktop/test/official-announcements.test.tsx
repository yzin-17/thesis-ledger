// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficialAnnouncements } from '../src/features/market-data/OfficialAnnouncements.js';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ request }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const clients: QueryClient[] = [];
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
async function mountList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <OfficialAnnouncements />
      </QueryClientProvider>,
    );
  });
  await settle();
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  request.mockReset();
});

describe('真实公告目录的现有列表', () => {
  it('加载失败可重试，恢复后展示空库', async () => {
    request
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue({
        providerId: 'official-states',
        total: 0,
        page: 1,
        pageSize: 50,
        items: [],
      });
    const view = await mountList();
    try {
      expect(view.host.textContent).toContain('公告列表加载失败');
      await act(async () => view.host.querySelector('button')!.click());
      await settle();
      expect(view.host.textContent).toContain('当前尚未收录公告');
      expect(view.host.textContent).not.toContain('公告列表加载失败');
    } finally {
      await view.close();
    }
  });
  it('翻页后搜索从第一页开始，过滤无结果独立回显', async () => {
    request.mockImplementation(async (url: string) => {
      const params = new URL(url, 'http://localhost').searchParams;
      return {
        providerId: 'official-states',
        total: params.get('q') ? 0 : 51,
        page: Number(params.get('page')),
        pageSize: 50,
        items: [],
      };
    });
    const view = await mountList();
    try {
      const next = [...view.host.querySelectorAll('button')].find(
        (button) => button.textContent === '下一页',
      )!;
      await act(async () => next.click());
      await settle();
      expect(view.host.textContent).toContain('第 2 页');
      const input = view.host.querySelector('input')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          '600519',
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await settle();
      expect(view.host.textContent).toContain('没有匹配的公告或规则文档');
      expect(request).toHaveBeenLastCalledWith(
        '/api/market-data/announcements?q=600519&page=1&pageSize=50',
        expect.anything(),
      );
    } finally {
      await view.close();
    }
  });
  it('未解析和下载失败也展示标题、日期和原文', async () => {
    request.mockResolvedValue({
      providerId: 'official-states',
      total: 1,
      page: 1,
      pageSize: 50,
      items: [
        {
          id: '1',
          symbol: '000881.SZ',
          title: '中广核技停牌公告',
          url: 'https://static.cninfo.com.cn/1.PDF',
          publishedDate: '2023-08-21',
          uses: ['suspension'],
          downloadState: 'failed',
          parseState: 'unparsed',
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <OfficialAnnouncements />
          </QueryClientProvider>,
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(host.textContent).toContain('中广核技停牌公告');
      expect(host.textContent).toContain('下载失败');
      expect(host.textContent).toContain('未解析');
      expect(host.querySelector('a')?.getAttribute('href')).toBe(
        'https://static.cninfo.com.cn/1.PDF',
      );
      expect(request).toHaveBeenCalledWith(
        '/api/market-data/announcements?q=&page=1&pageSize=50',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
