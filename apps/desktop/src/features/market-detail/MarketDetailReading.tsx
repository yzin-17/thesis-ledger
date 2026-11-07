import { useSyncExternalStore } from 'react';
import { ChevronUpIcon, NewspaperIcon, PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { InstrumentReading } from './InstrumentReading.js';
import type { MarketDetailPosition } from './market-detail.types.js';

type ReadingProps = { position: MarketDetailPosition };
const narrowQuery = '(width < 64rem)';
function subscribeToWidth(notify: () => void) {
  const media = window.matchMedia?.(narrowQuery);
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
}
export function useNarrowMarketDetail() {
  return useSyncExternalStore(subscribeToWidth, () => window.matchMedia?.(narrowQuery).matches ?? false, () => false);
}

export function ReadingSidebarToggle({ open, onToggle, controls }: {
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  const Icon = open ? PanelRightCloseIcon : PanelRightOpenIcon;
  return (
    <Button
      type="button" size="sm" variant={open ? "secondary" : "ghost"} onClick={onToggle}
      aria-expanded={open} aria-controls={open ? controls : undefined}
    >
      <Icon data-icon="inline-start" />
      {open ? '收起资讯' : '相关资讯'}
    </Button>
  );
}

export function InstrumentReadingSidebar({ position, open, id }: ReadingProps & {
  open: boolean; id: string;
}) {
  return (
    <aside id={id} hidden={!open} aria-label="相关资讯"
      className="w-72 min-w-0 shrink-0 overflow-y-auto overscroll-contain border-l bg-muted/20 px-4 py-4 xl:w-[21rem] xl:px-5">
      <InstrumentReading position={position} />
    </aside>
  );
}

export function InstrumentReadingSheet({ position }: ReadingProps) {
  return (
    <Sheet>
      <div className="shrink-0 border-t bg-popover px-4 pb-[env(safe-area-inset-bottom)]">
        <SheetTrigger render={<Button variant="ghost" className="h-12 w-full justify-between px-0" />}>
          <span className="inline-flex items-center gap-2"><NewspaperIcon />相关资讯</span>
          <ChevronUpIcon />
        </SheetTrigger>
      </div>
      <SheetContent side="bottom" className="max-h-[80dvh] min-h-[50dvh] gap-3 rounded-t-xl p-4">
        <SheetHeader><SheetTitle>相关资讯</SheetTitle></SheetHeader>
        <SheetBody><InstrumentReading position={position} /></SheetBody>
      </SheetContent>
    </Sheet>
  );
}
