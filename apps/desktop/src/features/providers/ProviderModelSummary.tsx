import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

export function ProviderModelList({ models }: { models: string[] }) {
  return (
    <div className="flex flex-col gap-3" data-provider-model-list>
      <p className="text-sm font-medium text-foreground">已配置 {models.length} 个模型</p>
      <ul className="flex max-h-64 flex-col gap-2 overflow-auto overscroll-contain pr-2">
        {models.map((model) => (
          <li className="whitespace-nowrap font-mono text-xs text-muted-foreground" key={model}>
            {model}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProviderModelSummary({ models }: { models: string[] }) {
  const firstModel = models[0];
  if (!firstModel) return null;

  const remainingCount = models.length - 1;
  const accessibleLabel =
    remainingCount > 0
      ? `首个模型 ${firstModel}，另有 ${remainingCount} 个模型`
      : `模型 ${firstModel}`;

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={200}
        closeDelay={150}
        render={<button type="button" />}
        className="mt-1 flex max-w-40 min-w-0 items-center gap-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 2xl:max-w-64"
        data-provider-model-summary
        aria-label={`${accessibleLabel}，悬停或聚焦查看全部`}
      >
        <span className="mt-0 min-w-0 flex-1 truncate">{firstModel}</span>
        {remainingCount > 0 ? (
          <Badge className="mt-0" variant="secondary" aria-hidden="true">
            +{remainingCount}
          </Badge>
        ) : null}
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start">
        <ProviderModelList models={models} />
      </HoverCardContent>
    </HoverCard>
  );
}
