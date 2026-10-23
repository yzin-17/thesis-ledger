import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAccounts, useValuation } from '../../app/query/mobile-queries';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { createStyles } from '../../styles/mobileStyles';
import { MobilePortfolioScreen } from '../../components/MobilePortfolioScreen';
import { Action, Choices, Copy, Page, QueryStatus } from '../../components/MobilePrimitives';
import { valuationLoadState } from '../../app/query/query-state';
import type { PortfolioStackParams } from '../../app/navigation-types';
import type { RootTabParams } from '../../app/navigation-types';
import { mobileInstrument } from '../market-detail/market-model';

export function PortfolioScreen() {
  const runtime = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<PortfolioStackParams>>();
  const rootNavigation = useNavigation<NavigationProp<RootTabParams>>();
  const accounts = useAccounts();
  const [selection, setSelection] = useState('all');
  const query = useValuation(selection === 'all' ? null : selection);
  const state = {
    status: valuationLoadState(query),
    mode: runtime.mode,
    portfolio: query.data ?? null,
    riskEvents: [],
    error: query.error?.message ?? null,
  };
  return (
    <Page
      title="投资组合"
      action={
        <Action label="刷新" onPress={() => void query.refetch()} disabled={query.isFetching} />
      }
    >
      <Copy muted>
        {runtime.mode === 'shadow' ? '模拟资产' : '实际资产'} · {query.data?.valuedAt ?? '等待估值'}
      </Copy>
      <Choices
        label="账户范围"
        value={selection}
        options={[
          { value: 'all', label: '全部账户' },
          ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
        ]}
        onChange={setSelection}
      />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {state.status === 'stale' ? <Copy muted>部分估值不可用，当前数据带有陈旧标记。</Copy> : null}
      <MobilePortfolioScreen
        state={state}
        theme={runtime.theme}
        styles={createStyles(runtime.theme)}
        renderPositionAction={(position) => (
          <Action
            label={`查看行情 ${position.symbol}`}
            onPress={() =>
              rootNavigation.navigate('Market', {
                screen: 'MarketDetail',
                params: {
                  instrument: mobileInstrument({
                    symbol: position.symbol,
                    displayName: position.asset?.name ?? position.symbol,
                    instrumentType: position.asset?.assetType ?? '',
                  }),
                  accountId: position.accountId,
                  mode: runtime.mode,
                },
              })
            }
          />
        )}
      />
      <Action
        label="查看交易"
        onPress={() =>
          navigation.navigate('Trades', { accountId: selection === 'all' ? null : selection })
        }
      />
      <Action label="风险事件" onPress={() => navigation.navigate('Risk')} />
      <Action
        label="收益分析"
        onPress={() =>
          navigation.navigate('Performance', { accountId: selection === 'all' ? null : selection })
        }
      />
    </Page>
  );
}
