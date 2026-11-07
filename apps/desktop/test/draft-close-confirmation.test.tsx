// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraftCloseGuard } from '../src/features/shared/useDraftCloseGuard.js';

const api = vi.hoisted(() => ({ confirm: vi.fn(), close: vi.fn() }));
vi.mock('../src/components/ui/confirm-dialog', () => ({
  useConfirmDialog: () => ({ confirm: api.confirm }),
}));
let root: Root, host: HTMLDivElement, close: ReturnType<typeof useDraftCloseGuard>;
const confirmation = {
  title: '关闭提交面板？',
  description: '关闭只收起面板，不会取消任务。',
  confirmLabel: '关闭面板',
  variant: 'default' as const,
};
function Probe({
  busy = false,
  open = true,
  draft = 'retained',
  dirty = true,
  onOpenChange = api.close,
}: {
  busy?: boolean;
  open?: boolean;
  draft?: string;
  dirty?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  close = useDraftCloseGuard({
    open,
    draft: { submissionId: draft },
    dirty,
    busy,
    onOpenChange,
    confirmation,
  });
  return null;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});
async function mount(busy = false) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe busy={busy} />));
}
describe('关闭确认的调用方文案', () => {
  it('取消保留面板，确认只关闭；重入不重复确认', async () => {
    await mount();
    api.confirm.mockResolvedValueOnce(false);
    await act(async () => close(false));
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining(confirmation));
    expect(api.close).not.toHaveBeenCalled();
    let finish!: (value: boolean) => void;
    api.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = close(false);
      await close(false);
    });
    expect(api.confirm).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(api.close).toHaveBeenCalledExactlyOnceWith(false);
  });
  it('提交中沿用现有保护，不打开关闭确认', async () => {
    await mount(true);
    await act(async () => close(false));
    expect(api.confirm).not.toHaveBeenCalled();
    expect(api.close).not.toHaveBeenCalled();
  });

  it('未修改的草稿直接关闭，不打开确认', async () => {
    await mount();
    await act(async () => root.render(<Probe dirty={false} />));
    await act(async () => close(false));
    expect(api.confirm).not.toHaveBeenCalled();
    expect(api.close).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('确认期间开始提交时保留面板，提交结束后可重新确认关闭', async () => {
    await mount();
    let finish!: (value: boolean) => void;
    api.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = close(false);
    await act(async () => root.render(<Probe busy />));
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(api.close).not.toHaveBeenCalled();
    await act(async () => root.render(<Probe />));
    api.confirm.mockResolvedValueOnce(true);
    await act(async () => close(false));
    expect(api.close).toHaveBeenCalledExactlyOnceWith(false);
    expect(api.confirm).toHaveBeenCalledTimes(2);
  });

  it('确认期间内容变化后保留新草稿，新的关闭请求重新确认', async () => {
    await mount();
    let finish!: (value: boolean) => void;
    api.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = close(false);
    await act(async () => root.render(<Probe draft="new-draft" />));
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(api.close).not.toHaveBeenCalled();
    api.confirm.mockResolvedValueOnce(true);
    await act(async () => close(false));
    expect(api.close).toHaveBeenCalledExactlyOnceWith(false);
    expect(api.confirm).toHaveBeenCalledTimes(2);
  });

  it('关闭后重新打开的面板不消费上次会话的确认', async () => {
    await mount();
    let finish!: (value: boolean) => void;
    api.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = close(false);
    await act(async () => root.render(<Probe open={false} />));
    await act(async () => root.render(<Probe />));
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(api.close).not.toHaveBeenCalled();
  });

  it('卸载后忽略晚到确认', async () => {
    await mount();
    let finish!: (value: boolean) => void;
    api.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = close(false);
    await act(async () => root.unmount());
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(api.close).not.toHaveBeenCalled();
  });

  it('有效确认使用最新已提交的关闭回调', async () => {
    await mount();
    let finish!: (value: boolean) => void;
    const latestClose = vi.fn();
    api.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = close(false);
    await act(async () => root.render(<Probe onOpenChange={latestClose} />));
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(api.close).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledExactlyOnceWith(false);
  });
});
