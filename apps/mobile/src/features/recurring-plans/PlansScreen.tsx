import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { AccountStackParams } from '../../app/navigation-types';
import { confirmAction, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import {
  monthlyClient,
  planStatusOptions,
  occurrenceStatusOptions,
  type MonthlyPlan,
} from './plan-api';

export function PlansScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'Plans'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParams>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((row) => row.id === params.accountId);
  const client = monthlyClient(api, params.kind);
  const plans = useQuery({
    queryKey: [...scope, 'monthly-plans', params.kind, params.accountId],
    enabled: Boolean(account),
    queryFn: ({ signal }) => client.getPlans({ accountId: params.accountId }, signal),
  });
  const occurrences = useQuery({
    queryKey: [...scope, 'monthly-occurrences', params.kind, params.accountId],
    enabled: Boolean(account),
    queryFn: ({ signal }) => client.getOccurrences({ accountId: params.accountId }, signal),
  });
  const [status, setStatus] = useState('all');
  const [occurrenceStatus, setOccurrenceStatus] = useState('all');
  const [feedback, setFeedback] = useState<string | null>(null);
  const mutation = useMobileCommand(
    (input: { plan: MonthlyPlan; action: 'pause' | 'resume' | 'end' }) => {
      if (input.action === 'pause') return client.pausePlan(input.plan.id, input.plan.version);
      if (input.action === 'resume') return client.resumePlan(input.plan.id, input.plan.version);
      return client.endPlan(input.plan.id, input.plan.version);
    },
  );
  const writable =
    Boolean(account?.active && account.mode === 'actual' && account.type === params.kind) &&
    canUseReadForWrite(accounts) &&
    canUseReadForWrite(plans) &&
    !mutation.isPending;
  const changeState = async (plan: MonthlyPlan, action: 'pause' | 'resume' | 'end') => {
    if (
      !writable ||
      !(await confirmAction(
        '确认变更计划状态？',
        `${plan.name}，版本 ${plan.version}。已结束计划不能恢复。`,
        action === 'end',
      ))
    )
      return;
    try {
      const result = await mutation.mutateAsync({ plan, action });
      setFeedback(result.refreshFailed ? '状态已保存，列表尚未刷新。' : '计划状态已更新。');
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title={params.kind === 'cash' ? '定期入账' : '基金定投'}>
      <Copy>{account?.name ?? '账户不在当前范围'}</Copy>
      <Copy muted>发生项由服务端调度生成；手机确认实际发生，不自动记账。</Copy>
      <Action
        label="刷新计划与发生项"
        disabled={plans.isFetching || occurrences.isFetching}
        onPress={() => {
          void Promise.all([plans.refetch(), occurrences.refetch()]);
        }}
      />
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <Action
        label="新建月度计划"
        disabled={!writable}
        onPress={() => navigation.navigate('PlanEditor', params)}
      />
      <Feedback message={feedback} error={mutation.isError} />
      <Choices
        label="计划状态"
        value={status}
        options={[{ value: 'all', label: '全部计划' }, ...planStatusOptions]}
        onChange={setStatus}
      />
      <QueryStatus
        query={plans}
        empty={plans.data?.length === 0}
        retry={() => void plans.refetch()}
      />
      {plans.data
        ?.filter((row) => status === 'all' || row.status === status)
        .map((plan) => (
          <Section key={plan.id} title={plan.name}>
            <Copy>
              {plan.expectedAmount} {plan.currency} · 每月 {plan.dayOfMonth} 日 ·{' '}
              {planStatusOptions.find((item) => item.value === plan.status)?.label}
            </Copy>
            {'symbol' in plan ? (
              <Copy>
                {plan.fundName} · {plan.symbol}
              </Copy>
            ) : null}
            <Copy muted>
              起始 {plan.startPeriod} · 下期 {plan.nextDueAt ?? '无'} · 版本 {plan.version}
            </Copy>
            <Action
              label={`编辑计划 ${plan.name}`}
              disabled={!writable || plan.status === 'ENDED'}
              onPress={() => navigation.navigate('PlanEditor', { ...params, plan })}
            />
            {plan.status === 'ACTIVE' ? (
              <Action
                label={`暂停计划 ${plan.name}`}
                disabled={!writable}
                onPress={() => void changeState(plan, 'pause')}
              />
            ) : null}
            {plan.status === 'PAUSED' ? (
              <Action
                label={`恢复计划 ${plan.name}`}
                disabled={!writable}
                onPress={() => void changeState(plan, 'resume')}
              />
            ) : null}
            {plan.status !== 'ENDED' ? (
              <Action
                label={`结束计划 ${plan.name}`}
                disabled={!writable}
                destructive
                onPress={() => void changeState(plan, 'end')}
              />
            ) : null}
          </Section>
        ))}
      <Choices
        label="发生项状态"
        value={occurrenceStatus}
        options={[{ value: 'all', label: '全部发生项' }, ...occurrenceStatusOptions]}
        onChange={setOccurrenceStatus}
      />
      <QueryStatus
        query={occurrences}
        empty={occurrences.data?.length === 0}
        retry={() => void occurrences.refetch()}
      />
      {occurrences.data
        ?.filter((row) => occurrenceStatus === 'all' || row.status === occurrenceStatus)
        .map((occurrence) => (
          <Section key={occurrence.id} title={`${occurrence.planName} · ${occurrence.periodKey}`}>
            <Copy>
              {occurrenceStatusOptions.find((item) => item.value === occurrence.status)?.label} ·
              预计 {occurrence.expectedAmount} {occurrence.currency} · 版本 {occurrence.version}
            </Copy>
            <Copy muted>
              计划日 {occurrence.scheduledFor} · 账本事件 {occurrence.ledgerEventId ?? '尚未记账'}
            </Copy>
            {'actualAmount' in occurrence ? (
              <Copy>实际金额 {occurrence.actualAmount ?? '—'}</Copy>
            ) : (
              <Copy>
                实际份额 {occurrence.actualQuantity ?? '—'} · 净值 {occurrence.unitPrice ?? '—'} ·
                费用 {occurrence.commission ?? '—'}
              </Copy>
            )}
            {occurrence.status === 'PENDING' ? (
              <>
                <Action
                  label={`确认发生 ${occurrence.periodKey}`}
                  disabled={!writable || !canUseReadForWrite(occurrences)}
                  onPress={() =>
                    navigation.navigate('OccurrenceEditor', {
                      ...params,
                      occurrence,
                      action: 'confirm',
                    })
                  }
                />
                <Action
                  label={`跳过发生 ${occurrence.periodKey}`}
                  disabled={!writable || !canUseReadForWrite(occurrences)}
                  onPress={() =>
                    navigation.navigate('OccurrenceEditor', {
                      ...params,
                      occurrence,
                      action: 'skip',
                    })
                  }
                />
              </>
            ) : null}
            {occurrence.status === 'SKIPPED' ? (
              <Action
                label={`重开发生 ${occurrence.periodKey}`}
                disabled={!writable || !canUseReadForWrite(occurrences)}
                onPress={() =>
                  navigation.navigate('OccurrenceEditor', {
                    ...params,
                    occurrence,
                    action: 'reopen',
                  })
                }
              />
            ) : null}
          </Section>
        ))}
    </Page>
  );
}
