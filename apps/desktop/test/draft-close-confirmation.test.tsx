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
function Probe({ busy = false }: { busy?: boolean }) {
  close = useDraftCloseGuard({
    open: true,
    draft: { submissionId: 'retained' },
    dirty: true,
    busy,
    onOpenChange: api.close,
    confirmation,
  });
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
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
});
