// @vitest-environment jsdom
import { act, useState, type Dispatch, type SetStateAction } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NavigationGuardProvider,
  useGuardedTransition,
  useNavigationGuard,
} from '../src/features/shared/navigation-guard.js';

const feedback = vi.hoisted(() => ({ confirm: vi.fn(), add: vi.fn() }));
vi.mock('../src/components/ui/confirm-dialog', () => ({
  useConfirmDialog: () => ({ confirm: feedback.confirm }),
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => feedback }));

type Props = {
  value: string;
  recordId: string;
  visible: boolean;
  extra: boolean;
  discard: () => void;
};
let props: Props;
let root: Root;
let host: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;
let transition: ReturnType<typeof useGuardedTransition>;
let update: Dispatch<SetStateAction<Props>>;
let finish: (accepted: boolean) => void;
const commit = vi.fn();
const initialDiscard = vi.fn();
const NativeRequest = globalThis.Request;
const options = { title: '放弃修改？', description: '切换验收范围。', confirmLabel: '放弃并切换' };

function RegisteredDraft({
  value,
  recordId,
  discard,
}: Pick<Props, 'value' | 'recordId' | 'discard'>) {
  const guard = { dirty: true, busy: false, draft: { recordId, value }, discard };
  useNavigationGuard(guard);
  return <p>{value}</p>;
}
function Screen() {
  const [state, setState] = useState(props);
  update = setState;
  transition = useGuardedTransition();
  return (
    <>
      {state.visible && <RegisteredDraft {...state} />}
      {state.extra && <RegisteredDraft value="新增草稿" recordId="extra" discard={state.discard} />}
    </>
  );
}
function Layout() {
  return (
    <NavigationGuardProvider>
      <Screen />
    </NavigationGuardProvider>
  );
}
async function render() {
  await act(async () => root.render(<RouterProvider router={router} />));
}
async function refresh(next: Partial<Props>) {
  await act(async () => update((current) => ({ ...current, ...next })));
}
async function request() {
  let result!: Promise<boolean>;
  feedback.confirm.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    result = transition!.request(commit, options);
  });
  expect(feedback.confirm).toHaveBeenCalledTimes(1);
  return { result };
}
async function resolveConfirmation(result: Promise<boolean>, accepted = true) {
  let resolved!: boolean;
  await act(async () => {
    finish(accepted);
    resolved = await result;
  });
  return resolved;
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Router 的 jsdom AbortSignal 与 Node Request 不同 realm；本组验证确认归属，不验证请求取消。
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init ? { ...init, signal: undefined } : undefined);
      }
    },
  );
  props = {
    value: '原始草稿',
    recordId: 'one',
    visible: true,
    extra: false,
    discard: initialDiscard,
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  router = createMemoryRouter([{ path: '*', element: <Layout /> }]);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  router.dispose();
  host.remove();
  vi.unstubAllGlobals();
});

describe('导航确认期间的草稿保护', () => {
  it.each([
    ['内容刷新', { value: '确认期间的新内容' }],
    ['切换同内容的业务记录', { recordId: 'two' }],
  ])('%s 后拒绝旧确认，下一次请求仍能正常确认', async (_name, next) => {
    const { result } = await request();
    await refresh(next);
    expect(await resolveConfirmation(result)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(initialDiscard).not.toHaveBeenCalled();
    feedback.confirm.mockResolvedValueOnce(true);
    let accepted!: boolean;
    await act(async () => {
      accepted = await transition!.request(commit, options);
    });
    expect(accepted).toBe(true);
    expect(initialDiscard).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['新增草稿', { extra: true }],
    ['移除原编辑器', { visible: false }],
  ])('%s 后不丢弃任何草稿或提交转换', async (_name, next) => {
    const { result } = await request();
    await refresh(next);
    expect(await resolveConfirmation(result)).toBe(false);
    expect(initialDiscard).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('相同内容重渲染后使用最新回调且只提交一次', async () => {
    const latestDiscard = vi.fn();
    const { result } = await request();
    await refresh({ discard: latestDiscard });
    expect(await resolveConfirmation(result)).toBe(true);
    expect(initialDiscard).not.toHaveBeenCalled();
    expect(latestDiscard).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('Provider 卸载后晚到确认不执行转换或丢弃', async () => {
    const { result } = await request();
    await act(async () => root.render(<p>已卸载</p>));
    expect(await resolveConfirmation(result)).toBe(false);
    expect(initialDiscard).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('取消后路由重置尚未渲染时再次离开仍能重新确认', async () => {
    feedback.confirm.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      void router.navigate('/first');
    });
    expect(feedback.confirm).toHaveBeenCalledTimes(1);
    await act(async () => {
      const reset = new Promise<void>((resolve) => {
        const unsubscribe = router.subscribe((state) => {
          if ([...state.blockers.values()].every((blocker) => blocker.state === 'unblocked')) {
            unsubscribe();
            resolve();
          }
        });
      });
      finish(false);
      await reset;
      void router.navigate('/first');
    });
    expect(feedback.confirm).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish(true);
    });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/first'));
    expect(initialDiscard).toHaveBeenCalledTimes(1);
  });

  it('确认期间重复请求其他路由，旧确认不能清理草稿或前往新目标', async () => {
    feedback.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      void router.navigate('/first');
    });
    await act(async () => {
      void router.navigate('/second');
    });
    await act(async () => {
      finish(true);
    });
    expect(router.state.location.pathname).toBe('/');
    expect(initialDiscard).not.toHaveBeenCalled();
    expect(feedback.confirm).toHaveBeenCalledTimes(1);
  });
});
