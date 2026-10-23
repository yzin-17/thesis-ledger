import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { PortfolioStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Choices,
  Copy,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { riskSeverities } from '../risk-rules/risk-rule-form';
export function RiskEventsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortfolioStackParams>>();
  const { api, scope, mode } = useMobileRuntime();
  const [severity, setSeverity] = useState('all');
  const [symbol, setSymbol] = useState('');
  const query = useInfiniteQuery({
    queryKey: [...scope, 'risk-events-pages'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.risk.getEvents({ mode, limit: 30, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => (page.length === 30 ? page.at(-1)?.id : undefined),
  });
  const rows = query.data?.pages.flat() ?? [];
  const events = rows.filter(
    (row) =>
      (severity === 'all' || row.severity === severity) &&
      (!symbol.trim() || (row.symbol ?? '').toLowerCase().includes(symbol.trim().toLowerCase())),
  );
  return (
    <Page title="风险中心">
      <Action label="风险规则" onPress={() => navigation.navigate('RiskRules')} />
      <Action label="通知与路由状态" onPress={() => navigation.navigate('RiskNotifications')} />
      <Copy muted>
        {mode === 'shadow' ? '模拟' : '实际'} · 已加载 {rows.length} 条，筛选后 {events.length} 条
      </Copy>
      <Choices
        label="事件严重级别"
        value={severity}
        options={[{ value: 'all', label: '全部级别' }, ...riskSeverities]}
        onChange={setSeverity}
      />
      <Field label="按风险标的筛选" value={symbol} onChange={setSymbol} />
      <QueryStatus query={query} empty={rows.length === 0} retry={() => void query.refetch()} />
      {events.map((event) => (
        <Section key={event.id} title={event.message}>
          <Copy>
            {riskSeverities.find((row) => row.value === event.severity)?.label ?? '其他级别'} ·{' '}
            {event.symbol ?? '组合／账户'} · {event.triggered ? '已触发' : '未触发'}
          </Copy>
          <Copy muted>
            {event.evaluatedAt} · 规则版本 {event.ruleVersion}
          </Copy>
          <Action
            label="风险事件详情"
            onPress={() => navigation.navigate('RiskEventDetail', { event })}
          />
        </Section>
      ))}
      {query.hasNextPage ? (
        <Action
          label="更多风险事件"
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </Page>
  );
}
