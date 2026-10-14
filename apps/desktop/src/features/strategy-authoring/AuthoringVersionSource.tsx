import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { StrategyVersion } from '../strategy/strategy.types.js';
import { useAuthoringIdentity } from './AuthoringIdentity.js';
import { useAuthoringSource } from './use-authoring-source.js';

export function AuthoringVersionSource({ version }: { version: StrategyVersion }) {
  const identity = useAuthoringIdentity();
  const assisted = version.source?.kind === 'ai_assisted';
  const referenceId = version.source?.kind === 'ai_assisted' ? version.source.referenceId : null;
  const source = useAuthoringSource(version);
  let label = '来源未记录';
  if (version.source?.kind === 'manual') label = '手动编写';
  else if (assisted) label = 'AI 辅助编写';
  else if (version.source?.kind === 'experiment') label = 'AI 实验采纳';
  return (
    <Card>
      <CardHeader>
        <CardTitle>版本来源：{label}</CardTitle>
        <CardDescription>来源按保存记录展示。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {assisted && !identity && (
          <Link to={`/strategy/library/new?authoring=1&draft=${encodeURIComponent(referenceId!)}`}>
            查看编写来源
          </Link>
        )}
        {source.isLoading && <Skeleton className="h-20" />}
        {source.error && (
          <Alert variant="destructive">
            <AlertTitle>无法读取来源</AlertTitle>
            <AlertDescription>{source.error.message}</AlertDescription>
          </Alert>
        )}
        {source.data && (
          <>
            <p className="whitespace-pre-wrap">
              原始描述：{source.data.snapshot.content.description}
            </p>
            <p>来源修订：{source.data.revision}</p>
            {source.data.snapshot.content.runtimeIntents.length > 0 && (
              <Alert>
                <AlertTitle>开始回测前再次确认</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5">
                    {source.data.snapshot.content.runtimeIntents.map((intent, index) => (
                      <li key={index}>{intent}</li>
                    ))}
                  </ul>
                  请在回测配置中明确日期、资金及数据设置。
                </AlertDescription>
              </Alert>
            )}
            {source.data.snapshot.content.manualChanges.length > 0 && (
              <ul className="list-disc pl-5">
                {source.data.snapshot.content.manualChanges.map((change, index) => (
                  <li key={index}>{change}</li>
                ))}
              </ul>
            )}
            <Link to={`/strategy/library/new?authoring=1&draft=${source.data.draftId}`}>
              查看完整需求、确认及调用记录
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
