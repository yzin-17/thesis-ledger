import { LoadingState, Spinner } from '@/components/ui/spinner';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TableContainer } from '@/components/ui/table';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import { useRuleSourceMonitor } from './useRuleSourceMonitor.js';
import { RuleSourceMonitorVersions } from './RuleSourceMonitorVersions.js';

const marketLabels = { CN: '内地', HK: '香港', US: '美国' };
const runLabels = {
  queued: '等待检查',
  running: '正在检查',
  succeeded: '检查完成',
  partial: '部分资料暂不可读',
  failed: '检查未完成',
  interrupted: '检查已中止',
};
const observationLabels = {
  baseline: '首次观察',
  unchanged: '无变化',
  changed: '材料有变化',
  unavailable: '暂不可读',
};
type Selected = { kind: 'pack' | 'document'; identity: string; name: string };

export function RuleSourceMonitorPanel() {
  const monitor = useRuleSourceMonitor();
  const [selected, setSelected] = useState<Selected | null>(null);
  const data = monitor.status.data;
  const selection = monitor.selection;
  const active = data?.latestRun;
  return (
    <section className="grid gap-4" aria-label="收费资料更新监测">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">收费资料更新</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            检查已有公开资料的内容与版本变化，保留历史记录。变化需复核后再采纳。
          </p>
        </div>
        <Button
          aria-busy={monitor.status.isFetching}
          size="sm"
          variant="outline"
          onClick={monitor.reload}
          disabled={monitor.save.isPending || monitor.status.isFetching}
        >
          {monitor.status.isFetching && <Spinner data-icon="inline-start" aria-hidden="true" />}
          重新载入配置
        </Button>
      </div>
      {monitor.status.isPending ? (
        <LoadingState label="正在读取监测配置" />
      ) : null}
      {monitor.status.isError ? (
        <p role="alert" className="text-sm text-destructive">
          监测状态暂时无法读取，请重新载入配置。
        </p>
      ) : null}
      {data && selection ? (
        <>
          <div
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
            role="group"
            aria-label="选择监测来源"
          >
            {data.sources.map((source) => {
              const pressed = selection.sourceIds.includes(source.identity);
              return (
                <Button
                  key={source.identity}
                  type="button"
                  variant={pressed ? 'secondary' : 'outline'}
                  className="h-auto justify-start whitespace-normal p-3 text-left"
                  aria-pressed={pressed}
                  disabled={monitor.save.isPending}
                  onClick={() =>
                    monitor.update({
                      sourceIds: pressed
                        ? selection.sourceIds.filter((id) => id !== source.identity)
                        : [...selection.sourceIds, source.identity],
                    })
                  }
                >
                  <span className="grid gap-1">
                    <span>{source.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {marketLabels[source.market]} · {source.documentCount}份公开资料
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={selection.enabled ? 'secondary' : 'outline'}
              aria-pressed={selection.enabled}
              disabled={monitor.save.isPending}
              onClick={() => monitor.update({ enabled: !selection.enabled })}
            >
              定期检查：{selection.enabled ? '开启' : '关闭'}
            </Button>
            <Button
              aria-busy={monitor.save.isPending}
              size="sm"
              disabled={
                !monitor.dirty ||
                monitor.save.isPending ||
                (selection.enabled && !selection.sourceIds.length)
              }
              onClick={monitor.saveConfig}
            >
              {monitor.save.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {monitor.save.isPending ? '正在保存…' : '保存监测配置'}
            </Button>
            <Button
              aria-busy={monitor.check.isPending}
              size="sm"
              variant="outline"
              disabled={monitor.busy || !selection.sourceIds.length || monitor.status.isError}
              onClick={monitor.run}
            >
              {monitor.check.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {monitor.check.isPending ? '正在提交…' : '手动检查'}
            </Button>
            {monitor.dirty ? (
              <span className="text-xs text-muted-foreground">配置尚未保存</span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            定期检查保存开启后每24小时执行一次；手动检查使用当前所选来源。材料变化不会自动修改已冻结规则。
          </p>
          {monitor.save.isError ? (
            <p role="alert" className="text-sm text-destructive">
              配置保存失败。请重新载入后核对来源再保存。
            </p>
          ) : null}
          {monitor.check.isError ? (
            <p role="alert" className="text-sm text-destructive">
              检查结果暂未确认。重试会核对这次检查。
            </p>
          ) : null}
          {active ? (
            <p role="status" className="text-sm">
              {runLabels[active.status]}：已检查{active.counts.documents}份资料，
              {active.counts.changed}条变化，{active.counts.unavailable}条暂不可读。
              {active.status === 'partial' ? '最后成功摘要已保留。' : null}
            </p>
          ) : null}
          {data.observations.length ? (
            <TableContainer refreshing={monitor.status.isRefetching} refreshLabel="正在刷新监测记录">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-3 font-medium">资料</th>
                    <th className="p-3 font-medium">检查状态</th>
                    <th className="p-3 font-medium">最后成功观察</th>
                    <StickyTableActionHeader className="p-3 font-medium">版本</StickyTableActionHeader>
                  </tr>
                </thead>
                <tbody>
                  {data.observations.map((item) => (
                    <tr key={`${item.kind}:${item.identity}`} className="border-b last:border-0">
                      <td className="max-w-80 p-3">
                        <span>{item.name}</span>
                        {item.lastChangeAt ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            曾发现材料变化，需复核适用性。
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap p-3">{observationLabels[item.status]}</td>
                      <td className="whitespace-nowrap p-3 text-muted-foreground">
                        {item.lastSuccessAt
                          ? new Date(item.lastSuccessAt).toLocaleString('zh-CN', { hour12: false })
                          : '尚无成功观察'}
                      </td>
                      <StickyTableActionCell className="p-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!item.versionCount}
                          onClick={() =>
                            setSelected({
                              kind: item.kind,
                              identity: item.identity,
                              name: item.name,
                            })
                          }
                        >
                          {item.versionCount}个版本
                        </Button>
                      </StickyTableActionCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
          ) : (
            <p className="text-sm text-muted-foreground">尚无检查记录。选择来源后可手动检查。</p>
          )}
          {selected ? (
            <RuleSourceMonitorVersions
              key={`${selected.kind}:${selected.identity}`}
              {...selected}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
