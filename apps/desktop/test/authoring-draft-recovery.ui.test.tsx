// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthoringDraftRecovery } from '../src/features/strategy-authoring/AuthoringDraftRecovery.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router';
import {
  NavigationGuardProvider,
  useNavigationGuard,
} from '../src/features/shared/navigation-guard.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import {
  PortfolioModeProvider,
  usePortfolioMode,
} from '../src/features/portfolio/portfolio-mode-context.js';
import { useAuthoringEditor } from '../src/features/strategy-authoring/use-authoring-editor.js';
import { emptyAuthoringContent } from '../src/features/strategy-authoring/use-authoring-draft.js';
import type { authoringApi } from '../src/features/strategy-authoring/authoring.api.js';

const controllerApi = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  history: vi.fn(),
  models: vi.fn(),
}));
const controllerToast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('../src/features/strategy-authoring/authoring.api.js', () => ({
  authoringApi: {
    read: controllerApi.get,
    update: controllerApi.update,
    history: controllerApi.history,
  },
  fetchAuthoringModels: controllerApi.models,
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => controllerToast }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });
let root: Root;
let disabled = false;
let controllerClient: QueryClient | undefined;
let controllerRouter: ReturnType<typeof createMemoryRouter> | undefined;
const read = vi.fn();
const discard = vi.fn();
const copy = vi.fn();
const content = { description: '受控本地草稿，禁止发送生成请求' };
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === text,
  )!;
async function click(text: string) {
  await act(async () => button(text).click());
}
async function render() {
  await act(async () =>
    root.render(
      <AuthoringDraftRecovery
        content={content}
        disabled={disabled}
        onReadLatest={read}
        onDiscard={discard}
      />,
    ),
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  disabled = false;
  copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  controllerRouter?.dispose();
  controllerClient?.clear();
  controllerRouter = undefined;
  controllerClient = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('自然语言草稿恢复确认差集', () => {
  it('读取和丢弃都先确认，取消不调用动作，确认只调用所选动作', async () => {
    await click('读取服务器最新草稿');
    expect(document.body.textContent).toContain('使用服务器最新内容？');
    await click('继续编辑');
    expect(read).not.toHaveBeenCalled();
    await click('丢弃这个草稿');
    await click('继续编辑');
    expect(discard).not.toHaveBeenCalled();
    await click('读取服务器最新草稿');
    await click('确认');
    expect(read).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
    await click('丢弃这个草稿');
    await click('确认');
    expect(discard).toHaveBeenCalledTimes(1);
  });
  it('确认期间开始其他操作后锁住确认，解除后保留原确认意图', async () => {
    await click('丢弃这个草稿');
    disabled = true;
    await render();
    expect(button('确认').disabled).toBe(true);
    expect(button('继续编辑').disabled).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    disabled = false;
    await render();
    await click('继续编辑');
    expect(discard).not.toHaveBeenCalled();
  });
  it('复制失败说明如何保留文本，重试仅复制原草稿', async () => {
    copy.mockRejectedValueOnce(new Error('受控剪贴板不可用'));
    await click('复制本地草稿');
    expect(document.body.textContent).toContain('无法复制');
    await click('复制本地草稿');
    expect(document.body.textContent).toContain('已复制本地草稿');
    expect(document.body.textContent).not.toContain('无法复制');
    expect(copy).toHaveBeenLastCalledWith(JSON.stringify(content, null, 2));
    expect(read).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it('自动保存时模式保持锁定，路由按在途阻止而不进入放弃草稿确认', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const id = '22222222-2222-4222-8222-222222222222';
    controllerApi.get.mockResolvedValue({
      id,
      ownerId,
      state: 'editing',
      revision: 1,
      title: '',
      savedVersionId: null,
      content: emptyAuthoringContent,
      validation: { status: 'incomplete', issues: [] },
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    controllerApi.history.mockResolvedValue([]);
    controllerApi.models.mockResolvedValue([]);
    let rejectSave!: (error: Error) => void;
    const saving = new Promise<Awaited<ReturnType<typeof authoringApi.update>>>(
      (_resolve, reject) => {
        rejectSave = reject;
      },
    );
    controllerApi.update.mockReturnValue(saving);
    let editor!: ReturnType<typeof useAuthoringEditor>;
    const onDirtyChange = vi.fn(),
      onSaved = vi.fn();
    function EditorProbe() {
      editor = useAuthoringEditor({ id, ownerId, onDirtyChange, onSaved });
      // 页级草稿登记与现行 StrategyEditorPage 相同；控制器另须登记在途。
      useNavigationGuard({ dirty: editor.draft.dirty, busy: false });
      const mode = usePortfolioMode();
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => void mode.changeMode('shadow')}>切换模式 {mode.mode}</button>
          <button onClick={() => void navigate('/previous')}>离开编写</button>
        </>
      );
    }
    const NativeRequest = globalThis.Request;
    vi.stubGlobal(
      'Request',
      class extends NativeRequest {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
          const options = { ...init };
          delete options.signal;
          super(input, options);
        }
      },
    );
    localStorage.setItem('thesis-ledger-portfolio-mode', 'actual');
    controllerClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    controllerRouter = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <QueryClientProvider client={controllerClient}>
              <ConfirmDialogProvider>
                <NavigationGuardProvider>
                  <PortfolioModeProvider>
                    <EditorProbe />
                  </PortfolioModeProvider>
                </NavigationGuardProvider>
              </ConfirmDialogProvider>
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: ['/editor'] },
    );
    await act(async () => root.render(<RouterProvider router={controllerRouter!} />));
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(editor.draft.query.data?.id).toBe(id);
    });
    await act(async () => editor.draft.edit({ ...editor.content, description: '在途必须保留' }));
    await act(async () => {
      void editor.draft.flush().catch(() => {});
    });
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(controllerApi.update).toHaveBeenCalledTimes(1);
      expect(editor.draft.busy).toBe(true);
    });
    expect(controllerClient.isMutating()).toBe(1);
    await click('切换模式 actual');
    expect(button('切换模式 actual')).toBeDefined();
    await click('离开编写');
    expect(controllerRouter.state.location.pathname).toBe('/editor');
    expect(document.body.textContent).not.toContain('放弃未保存');
    await act(async () => rejectSave(new Error('受控自动保存失败')));
    expect(editor.content.description).toBe('在途必须保留');
    expect(controllerApi.update).toHaveBeenCalledTimes(1);
    localStorage.removeItem('thesis-ledger-portfolio-mode');
  });
});
