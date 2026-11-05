import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts } from '../../app/query/mobile-queries';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import { strategyRiskStatusLabel } from './risk-application-actions';
import {
  Action,
  Choices,
  Copy,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
export function StrategyRiskScreen() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'StrategyRisk'>>();
  const { api, scope, mode } = useMobileRuntime();
  const accounts = useAccounts();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [accountId, setAccountId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState('no');
  const query = useQuery({
    queryKey: [...scope, 'strategy-risk-list', accountId, search, history],
    enabled: accounts.isSuccess,
    queryFn: ({ signal }) =>
      api.strategy.risk.list(
        {
          ...(accountId ? { accountId } : {}),
          ...(search ? { symbol: search } : {}),
          includeArchived: history === 'yes',
        },
        signal,
      ),
    retry: false,
  });
  const ids = new Set(accounts.data?.map((v) => v.id));
  const rows = query.data?.filter((v) => ids.has(v.accountId)) ?? [];
  return (
    <Page title="策略风险应用">
      <Copy>
        {mode === 'shadow' ? '模拟账户范围' : '实际账户范围'} ·
        应用按账户、标的、策略版本及生效范围管理。
      </Copy>
      <Action
        label="预览新策略风险应用"
        primary
        onPress={() =>
          navigation.navigate(
            'StrategyRiskCreate',
            params?.versionId ? { versionId: params.versionId } : undefined,
          )
        }
      />
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <Choices
        label="应用账户范围"
        value={accountId}
        onChange={setAccountId}
        options={[
          { value: '', label: '当前模式全部账户' },
          ...(accounts.data ?? []).map((v) => ({ value: v.id, label: v.name })),
        ]}
      />
      <Field label="风险应用标的筛选" value={symbol} onChange={setSymbol} />
      <Action label="筛选策略风险应用" onPress={() => setSearch(symbol.trim())} />
      <Choices
        label="风险应用历史"
        value={history}
        onChange={setHistory}
        options={[
          { value: 'no', label: '当前应用' },
          { value: 'yes', label: '包含归档历史' },
        ]}
      />
      <QueryStatus query={query} empty={!rows.length} retry={() => void query.refetch()} />
      {rows.map((v) => (
        <Section key={v.id} title={`${v.symbol} · ${strategyRiskStatusLabel(v)}`}>
          <Copy>
            {accounts.data?.find((a) => a.id === v.accountId)?.name ?? '账户未记录'} · 修订{' '}
            {v.revision}
          </Copy>
          <Copy>
            版本 {v.strategyVersionId} · 覆盖 {v.coverage.riskMapped}/{v.coverage.riskTotal}
          </Copy>
          <Copy>
            生效范围 {v.cycleMode === 'existingAndFuture' ? '当前及未来持仓周期' : '下个持仓周期'}
          </Copy>
          <Action
            label={`管理风险应用 ${v.id}`}
            onPress={() => navigation.navigate('StrategyRiskEditor', { id: v.id })}
          />
        </Section>
      ))}
    </Page>
  );
}
