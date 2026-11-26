import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import { FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import type { useRuleSourceMonitor } from './useRuleSourceMonitor';

const marketLabels = { CN: '内地', HK: '香港', US: '美国' };

export function RuleSourceMonitorSettings({
  monitor,
}: {
  monitor: ReturnType<typeof useRuleSourceMonitor>;
}) {
  const { data } = monitor.status;
  const { selection } = monitor;
  if (!data || !selection) return null;

  return (
    <FieldGroup className="gap-6">
      <FieldSet aria-label="选择监测来源">
        <FieldLegend className="mb-0 text-xl font-semibold">检查范围</FieldLegend>
        <p className="text-sm text-muted-foreground">
          选择需要检查的资料来源。已选 {selection.sourceIds.length} / {data.sources.length} 项。
        </p>
        <MultiSelect
          label="选择监测来源"
          options={data.sources.map((source) => ({
            value: source.identity,
            label: source.name,
            description: `${marketLabels[source.market]} · ${source.documentCount} 份公开资料`,
          }))}
          value={selection.sourceIds}
          disabled={monitor.create.isPending}
          onValueChange={(sourceIds) => monitor.update({ sourceIds })}
        />
      </FieldSet>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          aria-busy={monitor.create.isPending}
          disabled={
            monitor.create.isPending ||
            !selection.sourceIds.length ||
            (data.config.taskCreated && !monitor.dirty)
          }
          onClick={monitor.createTask}
        >
          {monitor.create.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {data.config.taskCreated ? '更新任务来源' : '创建任务'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          role="link"
          render={<Link to="/providers?tab=automation" />}
        >
          前往自动化
        </Button>
      </div>
      {data.config.taskCreated ? (
        <p className="text-xs text-muted-foreground">任务已创建，执行时间与启停在自动化中调整。</p>
      ) : null}
      {monitor.create.isError ? (
        <p role="alert" className="text-sm text-destructive">
          任务保存失败，所选来源已保留。
        </p>
      ) : null}
    </FieldGroup>
  );
}
