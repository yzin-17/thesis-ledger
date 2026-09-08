import { useEffect, useRef } from 'react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

/** 保护用户主动关闭；保存成功后由所属功能直接关闭。 */
export function useDraftCloseGuard({
  open,
  draft,
  busy,
  dirty,
  onOpenChange,
}: {
  open: boolean;
  draft: unknown;
  busy: boolean;
  dirty?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { confirm } = useConfirmDialog();
  const baseline = useRef('');
  const wasOpen = useRef(false);
  const confirming = useRef(false);
  const serialized = JSON.stringify(draft);
  useEffect(() => {
    if (open && !wasOpen.current) baseline.current = serialized;
    wasOpen.current = open;
  }, [open, serialized]);

  return async (nextOpen: boolean) => {
    if (busy || confirming.current) return;
    if (!nextOpen && (dirty ?? serialized !== baseline.current)) {
      confirming.current = true;
      try {
        const discard = await confirm({
          title: '放弃未保存的修改？',
          description: '关闭后，本次修改将丢失。',
          confirmLabel: '放弃修改并关闭',
          cancelLabel: '继续编辑',
          variant: 'destructive',
        });
        if (!discard) return;
      } finally {
        confirming.current = false;
      }
    }
    onOpenChange(nextOpen);
  };
}
