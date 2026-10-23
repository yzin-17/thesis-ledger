import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { InfoIcon } from 'lucide-react';

const priorityDescription =
  '列表按各类提供方的调用优先级排列。AI 提供方：同一模型的可用候选中，数值越大越优先（100 优先于 1），显式指定的提供方优先。通知提供方：数值越小越优先。停用或不满足调用条件的提供方不会参与调用。';

export function ProviderPriorityHeader() {
  return (
    <span className="inline-flex items-center justify-center gap-1">
      优先级
      <HoverCard>
        <HoverCardTrigger
          delay={150}
          closeDelay={100}
          render={<button type="button" />}
          className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5"
          aria-label="优先级说明"
          aria-description={priorityDescription}
        >
          <InfoIcon aria-hidden="true" />
        </HoverCardTrigger>
        <HoverCardContent side="top" align="center" className="w-72 min-w-0 p-3 text-xs leading-5">
          {priorityDescription}
        </HoverCardContent>
      </HoverCard>
    </span>
  );
}
