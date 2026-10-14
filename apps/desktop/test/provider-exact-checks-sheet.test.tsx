// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderExactChecksSheet } from '../src/features/market-data/ProviderExactChecksSheet.js';
import { catalog, key, provider, target } from './market-policy-defaults.fixture.js';

const api = vi.hoisted(() => ({ test: vi.fn() }));
vi.mock('../src/features/market-data/market-data.api.js', () => ({ testMarketProvider: api.test }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
let client: QueryClient;

async function render(currentCatalog = catalog) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <ProviderExactChecksSheet
          provider={provider}
          catalog={currentCatalog}
          onClose={vi.fn()}
          onConfigure={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  );
}

async function click(label: string) {
  await act(async () => {
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    )!;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  client?.clear();
  root = undefined;
  host = undefined;
  vi.clearAllMocks();
});

describe('全部来源精确能力检查入口', () => {
  it('以中文回显精确口径，只提交选择的 key 和 target', async () => {
    api.test.mockResolvedValue({
      routeResults: [
        {
          key,
          target,
          state: 'ready',
          result: { status: 'healthy', attempted: true, readOnly: true },
          sample: { symbol: '510300.SH', start: '2026-09-28', end: '2026-09-30' },
        },
      ],
    });
    await render();
    expect(document.body.textContent).toContain('前复权');
    expect(document.body.textContent).not.toContain('DAILY_BAR');
    await click('检查所选能力');
    expect(api.test).toHaveBeenCalledWith(provider, undefined, undefined, { key, target });
    expect(document.body.textContent).toContain('所选能力读取检查通过');
    expect(document.body.textContent).toContain('510300.SH');
  });
  it('事件证据缺失明确说明，不显示成功', async () => {
    api.test.mockResolvedValue({
      routeResults: [
        {
          key,
          target,
          state: 'not_admitted',
          result: {
            status: 'unavailable',
            attempted: false,
            readOnly: true,
            errorCode: 'not_admitted',
          },
        },
      ],
    });
    await render();
    await click('检查所选能力');
    expect(document.body.textContent).toContain('来源尚未准入');
    expect(document.body.textContent).not.toContain('读取检查通过');
  });
  it('目录未完整时禁止提交检查请求', async () => {
    await render({ ...catalog, status: 'partial', entries: [], reason: 'catalog_partial' });
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === '检查所选能力',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(api.test).not.toHaveBeenCalled();
  });
});
