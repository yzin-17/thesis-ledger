import * as React from 'react';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export type ConfirmDialogOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
};

type ConfirmRequest = {
  options: ConfirmDialogOptions;
  resolve: (confirmed: boolean) => void;
};

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

const ConfirmDialogContext = React.createContext<ConfirmDialogContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null);
  const activeRequestRef = React.useRef<ConfirmRequest | null>(null);
  const queuedRequestsRef = React.useRef<ConfirmRequest[]>([]);

  const settle = React.useCallback((confirmed: boolean) => {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return;

    activeRequestRef.current = null;
    activeRequest.resolve(confirmed);
    const nextRequest = queuedRequestsRef.current.shift() ?? null;
    activeRequestRef.current = nextRequest;
    setRequest(nextRequest);
  }, []);

  const confirm = React.useCallback(
    (options: ConfirmDialogOptions) =>
      new Promise<boolean>((resolve) => {
        const nextRequest = { options, resolve };
        if (activeRequestRef.current) {
          queuedRequestsRef.current.push(nextRequest);
          return;
        }
        activeRequestRef.current = nextRequest;
        setRequest(nextRequest);
      }),
    [],
  );

  React.useEffect(
    () => () => {
      activeRequestRef.current?.resolve(false);
      for (const queuedRequest of queuedRequestsRef.current) queuedRequest.resolve(false);
      activeRequestRef.current = null;
      queuedRequestsRef.current = [];
    },
    [],
  );

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog
        open={Boolean(request)}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        {request && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{request.options.title}</AlertDialogTitle>
              <AlertDialogDescription>{request.options.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose
                render={
                  <Button type="button" variant="outline">
                    {request.options.cancelLabel ?? '取消'}
                  </Button>
                }
              />
              <Button
                type="button"
                variant={request.options.variant ?? 'default'}
                onClick={() => settle(true)}
              >
                {request.options.confirmLabel ?? '确认'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = React.useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  }
  return context;
}
