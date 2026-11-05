import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { performanceReadQuerySchema } from '@thesis-ledger/schemas';
import type { PortfolioStackParams } from '../../app/navigation-types';
import { useDirtyForm } from '../../app/MobileRuntime';
import { useAccounts } from '../../app/query/mobile-queries';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { usePerformanceQueries, type PerformanceFilters } from './performance-queries';
import { PerformanceResults } from './PerformanceResults';
export function PerformanceScreen() {
  const route = useRoute<RouteProp<PortfolioStackParams, 'Performance'>>();
  const navigation = useNavigation<NativeStackNavigationProp<PortfolioStackParams>>();
  const accounts = useAccounts();
  const initial: PerformanceFilters = {
    accountId: route.params?.accountId ?? '',
    start: '',
    end: '',
    fxMerge: false,
    baseCurrency: 'CNY',
    range: '1Y',
    interval: '1d',
  };
  const [filters, setFilters] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dirty = JSON.stringify(filters) !== JSON.stringify(draft);
  useDirtyForm(dirty, () => setDraft(filters));
  const accountValid =
    !filters.accountId || Boolean(accounts.data?.some((row) => row.id === filters.accountId));
  const queries = usePerformanceQueries(filters, accounts.isSuccess && accountValid);
  const change = (patch: Partial<PerformanceFilters>) =>
    setDraft((value) => ({ ...value, ...patch }));
  const apply = () => {
    try {
      performanceReadQuerySchema.parse({
        ...(draft.start ? { start: draft.start } : {}),
        ...(draft.end ? { end: draft.end } : {}),
      });
      setFilters(draft);
      setFeedback(null);
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title="收益分析">
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <Section title="查询范围">
        <Choices
          label="收益账户"
          value={draft.accountId}
          options={[
            { value: '', label: '全部账户' },
            ...(accounts.data ?? []).map((row) => ({ value: row.id, label: row.name })),
          ]}
          onChange={(accountId) => change({ accountId })}
        />
        <Field
          label="收益开始日期（可选 YYYY-MM-DD）"
          value={draft.start}
          onChange={(start) => change({ start })}
        />
        <Field
          label="收益结束日期（可选 YYYY-MM-DD）"
          value={draft.end}
          onChange={(end) => change({ end })}
        />
        <Choices
          label="汇率合并"
          value={draft.fxMerge ? 'on' : 'off'}
          options={[
            { value: 'off', label: '分币种' },
            { value: 'on', label: '使用汇率合并' },
          ]}
          onChange={(value) => change({ fxMerge: value === 'on' })}
        />
        <Choices
          label="基准币种"
          value={draft.baseCurrency}
          options={[
            { value: 'CNY', label: '人民币' },
            { value: 'HKD', label: '港币' },
            { value: 'USD', label: '美元' },
          ]}
          onChange={(baseCurrency) => change({ baseCurrency })}
        />
        <Choices
          label="走势区间"
          value={draft.range}
          options={[
            { value: '1D', label: '当日' },
            { value: '5D', label: '五日' },
            { value: '1M', label: '一月' },
            { value: '3M', label: '三月' },
            { value: 'YTD', label: '年初至今' },
            { value: '1Y', label: '一年' },
            { value: '5Y', label: '五年' },
            { value: 'ALL', label: '全部历史' },
          ]}
          onChange={(range) => change({ range })}
        />
        <Choices
          label="走势粒度"
          value={draft.interval}
          options={[
            { value: '1min', label: '分钟' },
            { value: '1h', label: '小时' },
            { value: '1d', label: '日' },
            { value: '1w', label: '周' },
            { value: '1mo', label: '月' },
            { value: '1y', label: '年' },
          ]}
          onChange={(interval) => change({ interval })}
        />
        {dirty ? <Copy muted>筛选尚未应用，下面保留上次查询结果。</Copy> : null}
        <Feedback message={feedback} error />
        <Action label="应用收益筛选" primary onPress={apply} />
      </Section>
      {!accountValid ? <Feedback message="账户不在当前范围，请重新选择。" error /> : null}
      <Action
        label="编辑配置目标"
        disabled={!accountValid || !accounts.isSuccess || accounts.isFetching || dirty}
        onPress={() =>
          navigation.navigate('PerformanceTargets', { accountId: filters.accountId || null })
        }
      />
      <PerformanceResults queries={queries} />
    </Page>
  );
}
