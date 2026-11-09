import { useState } from 'react';
import { InfoIcon } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

export function InfoTip({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  return (
    <HoverCard open={open} onOpenChange={(next, details) => {
      setOpen(next);
      if (details.reason === 'escape-key') details.event.stopPropagation();
    }}>
      <HoverCardTrigger
        delay={150}
        closeDelay={100}
        render={<button type="button" />}
        onClick={() => setOpen(true)}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4"
        data-info-tip-trigger
        aria-label={label}
        aria-description={children}
        aria-expanded={open}
      >
        <InfoIcon aria-hidden="true" />
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-72 min-w-0 p-3 text-sm leading-6">
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}
