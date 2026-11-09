import { useLayoutEffect, useRef } from 'react';
import { InfoIcon } from 'lucide-react';
import { Toast, ToastClose, ToastContent, ToastPortal, ToastProvider, ToastTitle, ToastViewport, useToastManager } from '@/components/ui/toast';
import type { useArenaEmptyToast } from './useArenaEmptyToast.js';

export function ArenaEmptyToast({ notice }: { notice: ReturnType<typeof useArenaEmptyToast> }) {
  return <ToastProvider toastManager={notice.manager} timeout={3000} limit={1}>
    <ArenaToastViewport container={notice.container} />
  </ToastProvider>;
}
function ArenaToastViewport({ container }: { container: HTMLElement | null }) {
  const { toasts } = useToastManager();
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || !container || !toasts.length) return;
    // 全屏弹窗自身滚动时，补偿其内容位移，使提示保持在可见顶部。
    const position = () => node.style.setProperty('--arena-toast-scroll', `${container.scrollTop}px`);
    position();
    container.addEventListener('scroll', position, { passive: true });
    return () => container.removeEventListener('scroll', position);
  }, [container, toasts.length]);
  return <ToastPortal container={container ?? undefined} className="contents">
    <ToastViewport ref={viewport} className="top-[calc(1rem+var(--arena-toast-scroll,0px))] right-auto left-1/2 w-max max-w-[calc(100%-2rem)] -translate-x-1/2">
      {toasts.map((item) => <Toast key={item.id} toast={item} className="rounded-lg">
        <ToastContent className="min-h-10 gap-2 px-3 py-2">
          <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1"><ToastTitle /></div>
          <ToastClose />
        </ToastContent>
      </Toast>)}
    </ToastViewport>
  </ToastPortal>;
}
