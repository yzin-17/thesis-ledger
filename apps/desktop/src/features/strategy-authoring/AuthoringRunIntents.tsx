import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { StrategyVersion } from '../strategy/strategy.types.js';
import { useAuthoringSource } from './use-authoring-source.js';

export function AuthoringRunIntents({
  version,
  enabled = true,
}: {
  version: StrategyVersion | null;
  enabled?: boolean;
}) {
  const source = useAuthoringSource(version, enabled);
  if (!enabled || version?.source?.kind !== 'ai_assisted') return null;
  if (source.isLoading) return <Skeleton className="h-16" aria-label="读取编写时的回测意图" />;
  if (source.error)
    return (
      <Alert variant="destructive">
        <AlertTitle>无法读取编写时的回测意图</AlertTitle>
        <AlertDescription>{source.error.message}</AlertDescription>
      </Alert>
    );
  const intents = source.data?.snapshot.content.runtimeIntents ?? [];
  if (!intents.length) return null;
  return (
    <Alert>
      <AlertTitle>编写时保留的回测意图</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {intents.map((intent, index) => (
            <li key={index}>{intent}</li>
          ))}
        </ul>
        请在下方明确日期、资金和数据设置，再准备和运行回测。
      </AlertDescription>
    </Alert>
  );
}
