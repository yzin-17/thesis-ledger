import { LoadingState } from '@/components/ui/spinner';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { providerKeys } from '../providers/providers.queries.js';
import { Button } from '@/components/ui/button';
import { TableCell, TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import { useRuleSourceMonitor } from './useRuleSourceMonitor.js';
import { RuleSourceMonitorVersions } from './RuleSourceMonitorVersions.js';
import { RuleSourceMonitorSettings } from './RuleSourceMonitorSettings.js';

const runLabels = {
  queued: '等待检查',
  running: '正在检查',
  succeeded: '检查完成',
  partial: '部分资料暂不可读',
  failed: '检查未完成',
  interrupted: '检查已中止',
};
const observationLabels = {
  baseline: '首次记录',
  unchanged: '无变化',
  changed: '材料有变化',
  unavailable: '暂不可读',
};
type Selected = { kind: 'pack' | 'document'; identity: string; name: string; trigger: HTMLElement };

export function RuleSourceMonitorPanel() {
  const client = useQueryClient();
  const monitor = useRuleSourceMonitor({
    onTaskSaved: () => {
      void client.invalidateQueries({ queryKey: providerKeys.jobs() });
    },
  });
  const [selected, setSelected] = useState<Selected | null>(null);
  const data = monitor.status.data;
  const selection = monitor.selection;
  const active = data?.latestRun;
  return (
    <section className="grid gap-6" aria-label="收费资料更新监测">
      <p className="text-sm text-muted-foreground">
        检查公开收费资料的变化，保留历史版本。发现变化后需人工复核，不会自动修改已冻结的收费规则。
      </p>
      {monitor.status.isPending ? <LoadingState label="正在读取监测配置" /> : null}
      {monitor.status.isError ? (
        <p role="alert" className="text-sm text-destructive">
          监测状态暂时无法读取，请刷新页面后重试。
        </p>
      ) : null}
      {data && selection ? (
        <>
          <RuleSourceMonitorSettings monitor={monitor} />
          <section className="grid gap-4" aria-label="检查结果">
            <h2 className="text-xl font-semibold">检查结果</h2>
            {active ? (
              <p role="status" className="text-sm">
                {runLabels[active.status]}：已检查{active.counts.documents}份资料，
                {active.counts.changed}条变化，{active.counts.unavailable}条暂不可读。
                {active.status === 'partial' ? '最后成功摘要已保留。' : null}
              </p>
            ) : null}
            {data.observations.length ? (
              <TableContainer
                refreshing={monitor.status.isRefetching}
                refreshLabel="正在刷新监测记录"
              >
                <table className="w-full text-left text-sm">
                  <TableHeader>
                    <tr className="border-b text-muted-foreground">
                      <TableHead>资料</TableHead>
                      <TableHead>检查状态</TableHead>
                      <TableHead>最后成功读取</TableHead>
                      <StickyTableActionHeader>版本记录</StickyTableActionHeader>
                    </tr>
                  </TableHeader>
                  <tbody>
                    {data.observations.map((item) => (
                      <tr key={`${item.kind}:${item.identity}`} className="border-b last:border-0">
                        <TableCell className="max-w-80 p-3">
                          <span className="text-foreground">{item.name}</span>
                          {item.lastChangeAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              曾发现材料变化，需复核适用性。
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="p-3">{observationLabels[item.status]}</TableCell>
                        <TableCell className="p-3">
                          {item.lastSuccessAt
                            ? new Date(item.lastSuccessAt).toLocaleString('zh-CN', {
                                hour12: false,
                              })
                            : '尚无成功读取'}
                        </TableCell>
                        <StickyTableActionCell className="p-3 text-foreground">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!item.versionCount}
                            onClick={(event) =>
                              setSelected({
                                kind: item.kind,
                                identity: item.identity,
                                name: item.name,
                                trigger: event.currentTarget,
                              })
                            }
                          >
                            查看版本（{item.versionCount}）
                          </Button>
                        </StickyTableActionCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            ) : (
              <p className="text-sm text-muted-foreground">
                尚无检查记录。创建任务后，可在自动化中查看执行记录。
              </p>
            )}
            {data.observations.length ? (
              <p className="text-xs text-muted-foreground">
                首次记录用于建立比较基准；最后成功读取时间不代表规则生效日期。历史检查记录不随当前勾选范围筛选。
              </p>
            ) : null}
            {selected ? (
              <RuleSourceMonitorVersions
                key={`${selected.kind}:${selected.identity}`}
                {...selected}
                onClose={() => setSelected(null)}
              />
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  );
}
