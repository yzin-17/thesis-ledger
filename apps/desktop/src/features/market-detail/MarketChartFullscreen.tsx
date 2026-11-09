import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export function useChartFullscreen() {
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !expanded) trigger.current?.focus();
    wasOpen.current = expanded;
  }, [expanded]);
  return { expanded, setExpanded, trigger };
}

export function MarketChartFullscreen({ expanded, onOpenChange, title, children }: {
  expanded: boolean;
  onOpenChange: (expanded: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  if (!expanded) return children;
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent finalFocus={false} aria-describedby={undefined}
      className="h-dvh max-h-dvh w-screen max-w-none overflow-y-auto rounded-none p-2 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-none sm:rounded-lg sm:p-4">
      <DialogTitle className="sr-only">{title}</DialogTitle>
      {children}
    </DialogContent>
  </Dialog>;
}
