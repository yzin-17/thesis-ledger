import { useCallback, useEffect, useRef, useState } from 'react';
import { createToastManager } from '@/components/ui/toast';

export type ArenaAvailability = 'pending' | 'empty' | 'ready' | 'error';
const noticeId = 'arena-empty';
export function useArenaEmptyToast(scope: string) {
  const [manager] = useState(createToastManager);
  const activation = useRef<string | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const anchor = useCallback((node: HTMLDivElement | null) => {
    if (node) setContainer(node.closest<HTMLElement>('[role="dialog"]'));
  }, []);
  useEffect(() => {
    activation.current = null;
    manager.close(noticeId);
  }, [scope, manager]);
  const request = (enabled: boolean) => {
    activation.current = enabled ? scope : null;
    if (!enabled) manager.close(noticeId);
  };
  const report = useCallback((availability: ArenaAvailability) => {
    if (availability === 'pending' || activation.current !== scope) return;
    activation.current = null;
    if (availability === 'empty') manager.add({ id: noticeId, title: '暂无包含此标的的比赛', type: 'info', timeout: 3000, priority: 'low' });
  }, [manager, scope]);
  return { manager, container, anchor, request, report };
}
