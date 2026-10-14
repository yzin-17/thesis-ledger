// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalHistoryDocumentsSheet } from '../src/features/market-data/LocalHistoryDocumentsSheet.js';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

describe('公告列表交互', () => {
  it('默认列公告和原文链接，搜索无结果明确回显，读取检查另行触发', async () => {
    const provider: ProviderManifest = {
      providerId: 'official-states',
      displayName: '发行人停复牌公告',
      version: 1,
      configured: true,
      enabled: true,
      credentialConfigured: true,
      capabilities: {},
      sourceKind: 'local_history',
      upstreamSources: [
        {
          sourceId: 'suspension',
          displayName: '发行人停复牌公告',
          capabilities: {},
          localHistory: {
            datasetId: 'd',
            symbols: ['000995.SZ'],
            coverage: { start: '2023-08-16', end: '2023-08-21' },
            updateMode: 'bundled',
            documents: [
              {
                id: 'notice',
                title: '皇台酒业停牌公告',
                url: 'https://example.com/notice.pdf',
                publishedDate: '2023-08-17',
              },
            ],
          },
        },
      ],
    };
    const read = vi.fn();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <LocalHistoryDocumentsSheet provider={provider} onClose={() => {}} onReadCheck={read} />,
      ),
    );
    expect(document.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com/notice.pdf',
    );
    expect(document.body.textContent).toContain('发布日期：2023-08-17');
    expect(read).not.toHaveBeenCalled();
    const input = document.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '600519',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('没有匹配的公告或规则文档');
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === '检查读取能力',
    )!;
    await act(async () => button.click());
    expect(read).toHaveBeenCalledOnce();
  });
});
