import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

export function ArenaDisclosure({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <Collapsible className={'min-w-0 ' + className}>
    <CollapsibleTrigger render={<Button variant="ghost" className="-mx-2 h-auto min-h-10 w-[calc(100%+1rem)] justify-between gap-3 px-2 py-2 text-left whitespace-normal" />}>
      {title}<ChevronDown aria-hidden="true" className="transition-transform group-aria-expanded/button:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
  </Collapsible>;
}
