import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBeforeUnload, useBlocker, type Location } from 'react-router';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';

type Guard = {
  dirty: boolean;
  busy: boolean;
  bypass?: () => boolean;
  blocksLocation?: (current: Location, next: Location) => boolean;
  discard?: () => void;
};
type TransitionOptions = { title: string; description: string; confirmLabel: string };
type GuardContextValue = {
  update: (id: symbol, guard: Guard) => void;
  remove: (id: symbol) => void;
  request: (
    commit: () => void,
    options: TransitionOptions,
    pending?: () => boolean,
  ) => Promise<boolean>;
  busy: boolean;
  checking: boolean;
};
const GuardContext = createContext<GuardContextValue | null>(null);

/** UI 转换的草稿与在途事实源；不拥有业务提交或模式状态。 */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<symbol, Guard>());
  const checkingRef = useRef(false);
  const committing = useRef(false);
  const [revision, setRevision] = useState(0);
  const [checking, setChecking] = useState(false);
  const { confirm } = useConfirmDialog();
  const toast = useToastManager();
  const update = useCallback((id: symbol, guard: Guard) => {
    const previous = guards.current.get(id);
    guards.current.set(id, guard);
    if (Boolean(previous?.dirty) !== guard.dirty || Boolean(previous?.busy) !== guard.busy)
      setRevision((value) => value + 1);
  }, []);
  const remove = useCallback((id: symbol) => {
    const previous = guards.current.get(id);
    guards.current.delete(id);
    if (previous?.dirty || previous?.busy) setRevision((value) => value + 1);
  }, []);
  const activeGuards = useCallback(
    () => [...guards.current.values()].filter((guard) => !guard.bypass?.()),
    [],
  );
  const request = useCallback(
    async (commit: () => void, options: TransitionOptions, pending?: () => boolean) => {
      if (checkingRef.current) return false;
      checkingRef.current = true;
      setChecking(true);
      const isBusy = () => Boolean(pending?.()) || activeGuards().some((guard) => guard.busy);
      try {
        if (isBusy()) {
          toast.add({
            title: '操作尚未完成',
            description: '请等待保存及确认读取完成后再切换或离开。',
            type: 'warning',
          });
          return false;
        }
        if (activeGuards().some((guard) => guard.dirty)) {
          const discard = await confirm({
            ...options,
            cancelLabel: '继续编辑',
            variant: 'destructive',
          });
          if (!discard) return false;
        }
        // 确认框打开期间可能开始提交，不能沿用确认前的在途状态。
        if (isBusy()) {
          toast.add({
            title: '操作尚未完成',
            description: '确认期间开始了提交，请等待完成后重新切换。',
            type: 'warning',
          });
          return false;
        }
        committing.current = true;
        try {
          for (const guard of activeGuards()) guard.discard?.();
          commit();
        } finally {
          committing.current = false;
        }
        return true;
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [activeGuards, confirm, toast],
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !committing.current &&
      activeGuards().some(
        (guard) =>
          (guard.dirty || guard.busy) &&
          (guard.blocksLocation?.(currentLocation, nextLocation) ??
            (currentLocation.pathname !== nextLocation.pathname ||
              currentLocation.search !== nextLocation.search)),
      ),
  );
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  const requestRef = useRef(request);
  requestRef.current = request;
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void requestRef
      .current(
        () => {
          if (blockerRef.current.state === 'blocked') blockerRef.current.proceed();
        },
        {
          title: '放弃未保存的修改？',
          description: '离开后，本页未保存的输入将丢失。',
          confirmLabel: '放弃修改并离开',
        },
      )
      .then((accepted) => {
        if (!accepted && blockerRef.current.state === 'blocked') blockerRef.current.reset();
      });
  }, [blocker.state]);
  useBeforeUnload(
    (event) => {
      if (activeGuards().some((guard) => guard.dirty || guard.busy)) event.preventDefault();
    },
    { capture: true },
  );
  const value = useMemo(
    () => ({
      update,
      remove,
      request,
      checking,
      busy: [...guards.current.values()].some((guard) => guard.busy && !guard.bypass?.()),
      // revision 响应注册状态变化，转换回调读取最新的保护事实。
    }),
    [update, remove, request, checking, revision],
  );
  return <GuardContext.Provider value={value}>{children}</GuardContext.Provider>;
}

export function useNavigationGuard(guard: Guard) {
  const context = useContext(GuardContext);
  const id = useRef(Symbol('navigation-guard'));
  const update = context?.update;
  const remove = context?.remove;
  useLayoutEffect(() => {
    update?.(id.current, guard);
  });
  useLayoutEffect(() => {
    const registration = id.current;
    return () => remove?.(registration);
  }, [remove]);
}

export function useGuardedTransition() {
  return useContext(GuardContext);
}
