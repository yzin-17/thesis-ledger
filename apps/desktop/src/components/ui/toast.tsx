import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ToastTone = 'default' | 'success' | 'warning' | 'error';

const toastTone = (type: string | undefined): ToastTone => {
  if (type === 'success' || type === 'warning' || type === 'error') return type;
  return 'default';
};

const toastIcon = (tone: ToastTone) => {
  if (tone === 'success') return '✓';
  if (tone === 'warning') return '!';
  if (tone === 'error') return '×';
  return 'i';
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider timeout={2800} limit={4}>
      {children}
      <ToastViewport />
    </ToastPrimitive.Provider>
  );
}

function ToastViewport() {
  const { toasts } = ToastPrimitive.useToastManager();

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        aria-label="通知"
        className="fixed top-4 right-4 layer-toast flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 outline-none"
      >
        {toasts.map((toast) => {
          const tone = toastTone(toast.type);
          const actionProps = toast.actionProps;
          const actionClassName = actionProps?.className;

          return (
            <ToastPrimitive.Root
              key={toast.id}
              toast={toast}
              className={cn(
                'pointer-events-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border bg-[var(--color-surface-1)] px-3.5 py-3 text-sm text-[var(--color-text-primary)] shadow-[var(--shadow-overlay)] outline-none transition-[opacity,transform] duration-200 data-[starting-style]:translate-x-2 data-[starting-style]:opacity-0 data-[ending-style]:translate-x-2 data-[ending-style]:opacity-0',
                tone === 'success' && 'border-[var(--color-border)]',
                tone === 'warning' && 'border-[var(--color-warning)]',
                tone === 'error' && 'border-[var(--color-negative)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex size-5 items-center justify-center rounded-full text-xs font-semibold',
                  tone === 'success' && 'text-[var(--color-positive)]',
                  tone === 'warning' && 'text-[var(--color-warning)]',
                  tone === 'error' && 'text-[var(--color-negative)]',
                  tone === 'default' && 'text-[var(--color-text-secondary)]',
                )}
              >
                {toastIcon(tone)}
              </span>
              <ToastPrimitive.Content className="min-w-0">
                {toast.title ? (
                  <ToastPrimitive.Title className="font-medium leading-5">
                    {toast.title}
                  </ToastPrimitive.Title>
                ) : null}
                {toast.description ? (
                  <ToastPrimitive.Description className="mt-0.5 text-xs leading-5 text-[var(--color-text-secondary)]">
                    {toast.description}
                  </ToastPrimitive.Description>
                ) : null}
              </ToastPrimitive.Content>
              <div className="flex items-start gap-1">
                {actionProps ? (
                  <ToastPrimitive.Action
                    {...actionProps}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs text-[var(--color-brand)] outline-none hover:bg-[var(--color-brand-soft)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]',
                      actionClassName,
                    )}
                  />
                ) : null}
                <ToastPrimitive.Close
                  aria-label="关闭通知"
                  className="rounded px-1 text-base leading-5 text-[var(--color-text-muted)] outline-none hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
                >
                  ×
                </ToastPrimitive.Close>
              </div>
            </ToastPrimitive.Root>
          );
        })}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

export const useToastManager = ToastPrimitive.useToastManager;
