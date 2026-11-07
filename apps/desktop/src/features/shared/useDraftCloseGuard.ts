import { useEffect, useLayoutEffect, useRef } from 'react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useNavigationGuard } from './navigation-guard.js';

/** 保护用户主动关闭；保存成功后由所属功能直接关闭。 */
export function useDraftCloseGuard({
  open,
  draft,
  busy,
  dirty,
  onOpenChange,
  confirmation,
}: {
  open: boolean;
  draft: unknown;
  busy: boolean;
  dirty?: boolean;
  onOpenChange: (open: boolean) => void;
  confirmation?: {
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel?: string;
    variant?: 'default' | 'destructive';
  };
}) {
  const { confirm } = useConfirmDialog();
  const baseline = useRef('');
  const wasOpen = useRef(false);
  const confirming = useRef(false);
  const serialized = JSON.stringify(draft);
  const current = useRef({
    open,
    busy,
    dirty,
    serialized,
    onOpenChange,
    session: 0,
    mounted: false,
  });
  useLayoutEffect(() => {
    const previous = current.current;
    current.current = {
      open,
      busy,
      dirty,
      serialized,
      onOpenChange,
      mounted: true,
      session: previous.session + (previous.open !== open ? 1 : 0),
    };
  });
  useLayoutEffect(
    () => () => {
      current.current.mounted = false;
      current.current.session += 1;
    },
    [],
  );
  useEffect(() => {
    if (open && !wasOpen.current) baseline.current = serialized;
    wasOpen.current = open;
  }, [open, serialized]);
  useNavigationGuard({
    draft: { open, serialized },
    dirty: open && (dirty ?? (wasOpen.current && serialized !== baseline.current)),
    busy: open && busy,
    discard: () => {
      if (open) onOpenChange(false);
    },
  });

  return async (nextOpen: boolean) => {
    const requested = current.current;
    const session = requested.session;
    if (!requested.mounted || requested.busy || confirming.current) return;
    if (!nextOpen && (requested.dirty ?? requested.serialized !== baseline.current)) {
      confirming.current = true;
      try {
        const discard = await confirm({
          title: '放弃未保存的修改？',
          description: '关闭后，本次修改将丢失。',
          confirmLabel: '放弃修改并关闭',
          cancelLabel: '继续编辑',
          variant: 'destructive',
          ...confirmation,
        });
        if (!discard) return;
      } finally {
        confirming.current = false;
      }
    }
    const latest = current.current;
    if (
      !latest.mounted ||
      latest.busy ||
      latest.session !== session ||
      latest.serialized !== requested.serialized
    )
      return;
    latest.onOpenChange(nextOpen);
  };
}
