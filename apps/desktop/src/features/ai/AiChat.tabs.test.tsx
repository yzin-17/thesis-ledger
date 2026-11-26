// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AiChat } from './AiChat.js';

const navigation = vi.hoisted(() => ({ navigate: vi.fn(), openNewResearch: vi.fn() }));
const providerState = vi.hoisted(() => ({
  current: { variant: 'outline', label: '服务已就绪', action: null as string | null },
}));

vi.mock('../shared/PageHeader.js', () => ({
  PageHeader: ({ actions }: { actions: React.ReactNode }) => (
    <header data-testid="page-header">{actions}</header>
  ),
}));
vi.mock('../shared/RefreshIconButton.js', () => ({ RefreshIconButton: () => null }));
vi.mock('../shared/usePageRefresh.js', () => ({
  usePageRefresh: () => ({ refreshing: false, refresh: vi.fn() }),
}));
vi.mock('./AiRunList.js', () => ({
  AiRunList: ({ readView }: { readView: string }) => (
    <div data-testid="run-list">
      <span data-testid="run-view">{readView}</span>
    </div>
  ),
}));
vi.mock('./AiResearchDetailView.js', () => ({
  ResearchDetailSheet: () => null,
  ResearchReadingView: () => null,
}));
vi.mock('./ResearchSubmissionSheet.js', () => ({ ResearchSubmissionSheet: () => null }));
vi.mock('./use-research-workbench.js', () => ({
  useResearchWorkbench: () => {
    return {
      navigate: navigation.navigate,
      pageState: {
        mode: 'list',
        selectedRunId: null,
        status: 'all',
        source: 'all',
        includeInternal: false,
      },
      listFallbackRef: { current: null },
      searchInput: '',
      setSearchInput: vi.fn(),
      setNavigationIds: vi.fn(),
      runsQuery: {
        isFetching: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        refetch: vi.fn(),
        fetchNextPage: vi.fn(),
      },
      runs: [],
      loadState: 'empty',
      provider: providerState.current,
      detailViewProps: {},
      newResearchOpen: false,
      initialQuestion: '',
      initialInstrument: null,
      retryOfRunId: undefined,
      updatePageState: vi.fn(),
      openNewResearch: navigation.openNewResearch,
      openRun: vi.fn(),
      handleCreated: vi.fn(),
      changeNewResearchOpen: vi.fn(),
    };
  },
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  navigation.navigate.mockClear();
  navigation.openNewResearch.mockClear();
  providerState.current = { variant: 'outline', label: '服务已就绪', action: null };
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AiChat />);
    await Promise.resolve();
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
  vi.unstubAllGlobals();
});

it('服务就绪时，列表工具区只显示一个新建研究入口', async () => {
  expect(container.querySelector('[data-ai-provider-status]')).toBeNull();
  expect(container.textContent).not.toContain('服务已就绪');
  expect(container.querySelector('[data-testid="page-header"] button')).toBeNull();
  expect(container.querySelector('[data-testid="run-list"] button')).toBeNull();
  const buttons = [...container.querySelectorAll('button')].filter(
    (button) => button.textContent?.trim() === '新建研究',
  );
  expect(buttons).toHaveLength(1);
  const [create] = buttons;
  await act(async () => {
    create?.click();
    await Promise.resolve();
  });
  expect(navigation.openNewResearch).toHaveBeenCalledOnce();
});

it('服务异常时仍保留状态提醒和配置入口', async () => {
  providerState.current = { variant: 'destructive', label: '服务异常', action: '检查服务配置' };
  await act(async () => {
    root.render(<AiChat />);
    await Promise.resolve();
  });
  expect(container.querySelector('[data-ai-provider-status]')?.textContent).toContain('服务异常');
  const settings = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === '检查服务配置',
  );
  expect(settings).toBeDefined();
  await act(async () => {
    settings?.click();
    await Promise.resolve();
  });
  expect(navigation.navigate).toHaveBeenCalledWith('/providers');
});

it('研究工作台使用当前账户模式读取报告', () => {
  expect(container.querySelector('[data-testid="run-view"]')?.textContent).toBe('scoped');
  expect(container.textContent).not.toContain('历史报告');
});
