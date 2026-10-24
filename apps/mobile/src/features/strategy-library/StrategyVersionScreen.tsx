import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { useStrategyLibrary } from './useStrategyLibrary';
export function StrategyVersionScreen() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'StrategyVersion'>>();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const query = useStrategyLibrary();
  const strategy = query.data?.find((v) => v.id === params.strategyId);
  const version = strategy?.versions.find((v) => v.id === params.versionId);
  return (
    <Page title={strategy?.name ?? '策略版本'}>
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {version ? (
        <>
          <Section title={`版本 ${version.version}`}>
            <Copy>策略 {params.strategyId}</Copy>
            <Copy>版本 {version.id}</Copy>
            <Copy>
              定义格式 {version.schemaVersion ?? '未记录'} · 保存 {version.createdAt ?? '未记录'}
            </Copy>
            <Copy>来源 {JSON.stringify(version.source ?? strategy?.source ?? '未记录')}</Copy>
          </Section>
          <Action
            label="编辑为新版本"
            onPress={() => navigation.navigate('StrategyEditor', params)}
          />
          <Action
            label="辅助修改此版本"
            onPress={() => navigation.navigate('StrategyAuthoring', { versionId: version.id })}
          />
          <Action
            label="准备普通回测"
            onPress={() => navigation.navigate('BacktestSetup', { ...params, kind: 'ordinary' })}
          />
          <Action
            label="准备净值回测"
            onPress={() => navigation.navigate('BacktestSetup', { ...params, kind: 'nav' })}
          />
          <Action
            label="从此版本创建实验"
            onPress={() => navigation.navigate('OptimizationSetup', { versionId: version.id })}
          />
          <Action
            label="应用策略风险计划"
            onPress={() => navigation.navigate('StrategyRisk', { versionId: version.id })}
          />
          <Section title="完整策略定义">
            <Copy>{JSON.stringify(version.schema ?? null, null, 2)}</Copy>
          </Section>
        </>
      ) : null}
      {!version && query.isSuccess ? <Copy>当前策略不包含该版本，请返回重新选择。</Copy> : null}
    </Page>
  );
}
