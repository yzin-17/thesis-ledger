import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useQuery } from '@tanstack/react-query';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { ruleMonitorKey } from './useRuleSourceMonitor.js';
import { RuleSourceVersionReader } from './RuleSourceVersionReader.js';

export function RuleSourceMonitorVersions({
  kind,
  identity,
  name,
  trigger,
  onClose,
}: {
  kind: 'pack' | 'document';
  identity: string;
  name: string;
  trigger: HTMLElement;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: [...ruleMonitorKey, 'versions', kind, identity],
    retry: false,
    queryFn: ({ signal }) =>
      getDesktopApiClient().market.getRuleMonitorVersions(kind, identity, signal),
  });
  const sourceUrl = kind === 'document' && /^https?:\/\//i.test(identity) ? identity : null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent size="form" finalFocus={() => trigger} aria-label="资料版本记录">
        <SheetHeader>
          <SheetTitle>资料版本记录</SheetTitle>
          <SheetDescription className="break-words text-foreground">{name}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          <div className="grid justify-items-start gap-2">
            <p className="text-sm text-muted-foreground">
              查看采集时保存的正文，并选择比较基准查看新增和删除内容。观察时间与快照采集时间均不代表规则生效日期。
            </p>
            {sourceUrl ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  role="link"
                  render={<a href={sourceUrl} target="_blank" rel="noopener noreferrer" />}
                >
                  打开来源网页
                </Button>
                <p className="text-xs text-muted-foreground">
                  来源网页展示当前内容，可能与记录时不同。
                </p>
              </>
            ) : null}
            <p className="max-w-full break-all text-xs text-muted-foreground">{identity}</p>
          </div>
          {query.isPending ? <LoadingState label="正在读取版本记录" /> : null}
          {query.isError ? (
            <div className="grid justify-items-start gap-2">
              <p className="text-sm text-destructive">版本记录暂时无法读取。</p>
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                重试读取版本
              </Button>
            </div>
          ) : null}
          <ListRefreshRegion
            refreshing={query.isRefetching && query.data?.versions.length === 0}
            label="正在刷新版本记录"
          >
            {query.data?.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚无版本记录。</p>
            ) : null}
            {query.data?.versions.length ? (
              <p className="mb-3 text-sm text-muted-foreground">
                最近观察的 {query.data.versions.length} 个不同内容版本（最多展示 20 个）
              </p>
            ) : null}
            {query.data?.versions.length ? (
              <RuleSourceVersionReader
                kind={kind}
                identity={identity}
                versions={query.data.versions}
                versionsRefreshing={query.isRefetching}
              />
            ) : null}
          </ListRefreshRegion>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
