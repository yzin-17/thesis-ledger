import { useState } from 'react';
import { InfoIcon } from 'lucide-react';
import { SelectItem } from '@/components/ui/select';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

export function PerformanceTrendSelectItem({
  value,
  label,
  disabled,
  description,
}: {
  value: string;
  label: string;
  disabled: boolean;
  description?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center">
      <SelectItem
        value={value}
        disabled={disabled}
        aria-description={description}
        className={description ? 'pr-16' : undefined}
      >
        {label}
      </SelectItem>
      {description && (
        <HoverCard open={open} onOpenChange={setOpen}>
          <HoverCardTrigger
            render={<button type="button" />}
            delay={150}
            closeDelay={100}
            aria-label={`${label}说明`}
            aria-description={description}
            aria-expanded={open}
            className="absolute right-7 inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
            }}
            onFocus={() => setOpen(true)}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(true);
            }}
          >
            <InfoIcon aria-hidden="true" />
          </HoverCardTrigger>
          <HoverCardContent className="w-64 min-w-0 p-3 text-sm leading-6" side="left">
            {description}
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
