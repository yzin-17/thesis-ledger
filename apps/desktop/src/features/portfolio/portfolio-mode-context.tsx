import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { useToastManager } from '@/components/ui/toast';
import { useGuardedTransition } from '../shared/navigation-guard.js';
import type { PortfolioMode } from './portfolio.types.js';

const storageKey = 'thesis-ledger-portfolio-mode';
const ModeContext = createContext<{
  mode: PortfolioMode;
  busy: boolean;
  changeMode: (next: PortfolioMode) => Promise<boolean>;
} | null>(null);
const readMode = (): PortfolioMode => {
  try {
    return window.localStorage.getItem(storageKey) === 'shadow' ? 'shadow' : 'actual';
  } catch {
    return 'actual';
  }
};

export function PortfolioModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(readMode);
  const modeRef = useRef(mode);
  const inFlight = useRef(false);
  const [changing, setChanging] = useState(false);
  const guard = useGuardedTransition();
  const queryClient = useQueryClient();
  const mutationCount = useIsMutating();
  const toast = useToastManager();
  const location = useLocation();
  const navigate = useNavigate();
  const changeMode = async (next: PortfolioMode) => {
    if (next === modeRef.current || inFlight.current || !guard) return false;
    inFlight.current = true;
    setChanging(true);
    try {
      return await guard.request(
        () => {
          try {
            window.localStorage.setItem(storageKey, next);
          } catch {
            toast.add({
              title: '模式记忆未保存',
              description: '本次选择仍有效，重新打开后可能恢复为实际。',
              type: 'warning',
            });
          }
          modeRef.current = next;
          setMode(next);
          const params = new URLSearchParams(location.search);
          for (const key of [
            'accountId',
            'tradeId',
            'reviewObjectId',
            'reviewObjectType',
            'closeSliceId',
            'entry',
            'setup',
            'mode',
          ])
            params.delete(key);
          const search = params.toString();
          if (search !== location.search.replace(/^\?/, ''))
            void navigate(
              { pathname: location.pathname, search: search ? `?${search}` : '' },
              { replace: true },
            );
        },
        {
          title: '放弃未保存的修改并切换模式？',
          description: `当前输入仍属于${modeRef.current === 'actual' ? '实际' : '模拟'}范围。切换将丢弃未保存修改，不会改变已提交对象的归属。`,
          confirmLabel: '放弃修改并切换',
        },
        () => queryClient.isMutating() > 0,
      );
    } finally {
      inFlight.current = false;
      setChanging(false);
    }
  };
  return (
    <ModeContext.Provider
      value={{
        mode,
        changeMode,
        busy: changing || Boolean(guard?.busy || guard?.checking) || mutationCount > 0,
      }}
    >
      {children}
    </ModeContext.Provider>
  );
}

export function usePortfolioMode() {
  const context = useContext(ModeContext);
  if (!context) throw new Error('缺少应用账户模式上下文');
  return context;
}
/** 独立表单测试仍可显式提供原 props；应用内始终由外壳提供模式。 */
export function useOptionalPortfolioMode() {
  return useContext(ModeContext);
}
