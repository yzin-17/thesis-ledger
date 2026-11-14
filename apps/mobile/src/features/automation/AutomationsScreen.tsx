import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AutomationRecord } from '@thesis-ledger/schemas';
import { ruleMonitorDefaultSchedule } from '@thesis-ledger/schemas';
import { confirmAction, useMobileRuntime } from '../../app/MobileRuntime';
import type { SettingsStackParams } from '../../app/navigation-types';
import {
  Action,
  Copy,
  Feedback,
  Page,
  QueryList,
  Section,
} from '../../components/MobilePrimitives';
import { useConfigCommand } from '../configuration/use-config-command';
import { automationTypeLabel } from './automation-labels';

const enabledLabel = (row: AutomationRecord) => {
  if (row.enabled === null) return '读取失败';
  return row.enabled ? '已启用' : '已停用';
};
const nextRunLabel = (row: AutomationRecord) => {
  if (row.readError) return '暂不可读取';
  if (row.nextRunAt) return row.nextRunAt;
  if (row.enabled && row.source === 'rule-monitor') return '等待调度';
  return '未安排';
};
const scheduleLabel = (row: AutomationRecord) => {
  if (row.cron === ruleMonitorDefaultSchedule) return '每24小时';
  return row.scheduleLabel ?? `${row.cron} / ${row.timezone}`;
};
export function AutomationsScreen({
  navigation,
}: NativeStackScreenProps<SettingsStackParams, 'Automations'>) {
  const { api, scope } = useMobileRuntime();
  const [message, setMessage] = useState('');
  const command = useConfigCommand();
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'automations'],
    queryFn: ({ signal }) => api.automations.list(signal),
  });
  const act = async (row: AutomationRecord, kind: 'toggle' | 'run' | 'remove') => {
    const descriptions = {
      toggle: row.enabled ? '停用任务' : '启用定时任务',
      run: '立即执行，可能调用外部来源或发送已配置通知；停用任务也可手动执行，服务端锁与预算照常生效',
      remove: '删除无运行历史的自建任务；系统任务或已有历史任务应改用停用',
    };
    if (
      !(await confirmAction(
        '确认自动化操作？',
        `${row.name}：${descriptions[kind]}。`,
        kind === 'remove',
      ))
    )
      return;
    try {
      if (kind === 'run') {
        const result = await command.submit(() => api.automations.run(row.id));
        setMessage(
          result.skipped
            ? `本次未执行：${result.reason ?? '服务端未许可或锁已占用'}`
            : '执行回执已返回，请在运行历史核对终态。',
        );
      } else {
        await command.submit(() =>
          kind === 'toggle'
            ? api.automations.setEnabled(row.id, !row.enabled)
            : api.automations.remove(row.id),
        );
        setMessage(kind === 'remove' ? '任务已删除。' : '任务启停已保存。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成，请重新读取任务和历史。');
    }
  };
  return (
    <Page
      title="自动化任务"
      action={
        <Action label="新建自动化任务" onPress={() => navigation.navigate('AutomationEditor')} />
      }
    >
      <Copy muted>任务由服务端调度。账户范围不隔离全局自动化；立即执行与定时启停分别控制。</Copy>
      <Feedback busy={command.pending} message={message} />
      <Action
        label="重新读取自动化"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      />
      <Action label="全部运行历史" onPress={() => navigation.navigate('AutomationHistory')} />
      <QueryList
        query={query}
        empty={query.data?.length === 0}
        retry={() => void query.refetch()}
        label="正在刷新自动化任务"
      >
        {query.data?.map((row) => (
          <Section key={row.id} title={row.name}>
            <Copy>
              {automationTypeLabel(row.type)} · {enabledLabel(row)} ·{' '}
              {row.managed ? '系统托管任务' : '自建任务'}
            </Copy>
            <Copy>
              {scheduleLabel(row)}；下次运行 {nextRunLabel(row)}
            </Copy>
            {row.source === 'rule-monitor' ? (
              <Copy>检查来源由规则检测任务确定，执行时间可在桌面端自动化中调整。</Copy>
            ) : (
              <>
                <Action
                  label={`编辑任务 ${row.name}`}
                  onPress={() => navigation.navigate('AutomationEditor', { id: row.id })}
                />
              </>
            )}
            <Action
              label={`查看历史 ${row.name}`}
              onPress={() => navigation.navigate('AutomationHistory', { id: row.id })}
            />
            {row.source !== 'rule-monitor' ? (
              <>
                <Action
                  label={`${row.enabled ? '停用任务' : '启用任务'} ${row.name}`}
                  disabled={command.pending || query.isError}
                  onPress={() => void act(row, 'toggle')}
                />
                <Action
                  label={`立即执行 ${row.name}`}
                  disabled={command.pending || query.isError}
                  onPress={() => void act(row, 'run')}
                />
                <Action
                  label={`删除任务 ${row.name}`}
                  disabled={command.pending || query.isError || row.managed === true}
                  destructive
                  onPress={() => void act(row, 'remove')}
                />
              </>
            ) : null}
          </Section>
        ))}
      </QueryList>
    </Page>
  );
}
