import { useQuery } from '@tanstack/react-query';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { ruleMonitorKey } from './useRuleSourceMonitor.js';

export function RuleSourceMonitorVersions({
  kind,
  identity,
  name,
}: {
  kind: 'pack' | 'document';
  identity: string;
  name: string;
}) {
  const query = useQuery({
    queryKey: [...ruleMonitorKey, 'versions', kind, identity],
    retry: false,
    queryFn: ({ signal }) =>
      getDesktopApiClient().market.getRuleMonitorVersions(kind, identity, signal),
  });
  return (
    <div className="rounded-lg border p-3" aria-label="资料版本记录">
      <p className="text-sm font-medium">{name} · 最近版本</p>
      {query.isPending ? <p className="text-xs text-muted-foreground">正在读取版本记录…</p> : null}
      {query.isError ? (
        <p className="text-xs text-destructive">版本记录暂时无法读取，请重新选择。</p>
      ) : null}
      <ul className="mt-2 grid gap-2 text-xs text-muted-foreground">
        {query.data?.versions.map((version) => (
          <li key={version.contentHash} className="flex flex-wrap justify-between gap-2">
            <span title={version.contentHash}>摘要 {version.contentHash.slice(0, 12)}</span>
            <span>
              首次观察 {new Date(version.firstSeenAt).toLocaleString('zh-CN', { hour12: false })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
