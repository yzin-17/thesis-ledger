import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RuleMonitorVersions } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState } from '@/components/ui/spinner';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { ruleMonitorKey } from './useRuleSourceMonitor.js';
import { RuleSourceVersionContent } from './RuleSourceVersionContent.js';

type Version = RuleMonitorVersions['versions'][number];
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const versionLabel = (version: Version) =>
  `${time(version.lastSeenAt)} · ${version.contentHash.slice(0, 12)}`;

export function RuleSourceVersionReader({
  kind,
  identity,
  versions,
  versionsRefreshing = false,
}: Pick<RuleMonitorVersions, 'kind' | 'identity' | 'versions'> & { versionsRefreshing?: boolean }) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const selected = versions.find((item) => item.contentHash === selectedHash) ?? versions[0];
  const candidates = versions.filter((item) => item.contentHash !== selected?.contentHash);
  const base = candidates.find((item) => item.contentHash === baseHash) ?? candidates[0];
  const query = useQuery({
    queryKey: [
      ...ruleMonitorKey,
      'version',
      kind,
      identity,
      selected?.contentHash,
      base?.contentHash,
    ],
    enabled: !!selected,
    retry: false,
    queryFn: ({ signal }) => {
      if (!selected) throw new Error('未选择资料版本');
      return getDesktopApiClient().market.getRuleMonitorVersion(
        {
          kind,
          identity,
          contentHash: selected.contentHash,
          ...(base ? { baseHash: base.contentHash } : {}),
        },
        signal,
      );
    },
  });
  if (!selected) return null;
  return (
    <div className="grid min-w-0 gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel>查看版本（最近观察时间 · 内容指纹）</FieldLabel>
          <Select
            value={selected.contentHash}
            onValueChange={(value) => {
              if (value) {
                setSelectedHash(value);
                setBaseHash(null);
              }
            }}
          >
            <SelectTrigger aria-label="查看正文版本" className="w-full">
              <SelectValue>{versionLabel(selected)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {versions.map((item) => (
                  <SelectItem key={item.contentHash} value={item.contentHash}>
                    {versionLabel(item)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {base ? (
          <Field>
            <FieldLabel>比较基准（最近观察时间 · 内容指纹）</FieldLabel>
            <Select
              value={base.contentHash}
              onValueChange={(value) => {
                if (value) setBaseHash(value);
              }}
            >
              <SelectTrigger aria-label="比较基准版本" className="w-full">
                <SelectValue>{versionLabel(base)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {candidates.map((item) => (
                    <SelectItem key={item.contentHash} value={item.contentHash}>
                      {versionLabel(item)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </FieldGroup>
      <ListRefreshRegion
        refreshing={(versionsRefreshing || query.isRefetching) && !!query.data}
        label="正在刷新版本正文"
      >
        {query.isPending ? <LoadingState label="正在读取正文快照" /> : null}
        {query.isError ? (
          <div className="grid justify-items-start gap-2">
            <p role="alert" className="text-sm text-destructive">
              正文快照暂时无法读取，请重试。
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              重试读取正文
            </Button>
          </div>
        ) : null}
        {query.data ? (
          <RuleSourceVersionContent key={selected.contentHash} data={query.data} />
        ) : null}
      </ListRefreshRegion>
      <dl className="grid min-w-0 gap-2 border-t pt-4 text-xs">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">首次观察</dt>
          <dd>{time(selected.firstSeenAt)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">最近观察</dt>
          <dd>{time(selected.lastSeenAt)}</dd>
        </div>
        {selected.datasetId ? (
          <div className="grid gap-1">
            <dt className="text-muted-foreground">资料包标识</dt>
            <dd className="break-all">{selected.datasetId}</dd>
          </div>
        ) : null}
        <div className="grid gap-1">
          <dt className="text-muted-foreground">完整内容指纹（SHA-256）</dt>
          <dd className="break-all font-mono">{selected.contentHash}</dd>
        </div>
        {selected.rawHash && selected.rawHash !== selected.contentHash ? (
          <div className="grid gap-1">
            <dt className="text-muted-foreground">原始文件指纹（SHA-256）</dt>
            <dd className="break-all font-mono">{selected.rawHash}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
