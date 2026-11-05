import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import {
  Action,
  Choices,
  Copy,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { useStrategyLibrary } from './useStrategyLibrary';
export function StrategyLibraryScreen() {
  const query = useStrategyLibrary();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(20);
  const rows = (query.data ?? []).filter(
    (row) =>
      (status === 'all' || row.status === status) &&
      `${row.name} ${row.id} ${row.description ?? ''} ${row.versions.map((v) => v.id).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Page title="策略与回测">
      <Action label="返回研究与复盘" onPress={() => navigation.getParent()?.goBack()} />
      <Action label="新建策略" primary onPress={() => navigation.navigate('StrategyEditor')} />
      <Action label="辅助编写工作区" onPress={() => navigation.navigate('StrategyAuthoring')} />
      <Action
        label="普通回测任务"
        onPress={() => navigation.navigate('BacktestJobs', { kind: 'ordinary' })}
      />
      <Action
        label="净值回测任务"
        onPress={() => navigation.navigate('BacktestJobs', { kind: 'nav' })}
      />
      <Action label="优化实验" onPress={() => navigation.navigate('OptimizationResults')} />
      <Action label="策略风险应用" onPress={() => navigation.navigate('StrategyRisk')} />
      <Field
        label="搜索策略或版本"
        value={search}
        onChange={(v) => {
          setSearch(v);
          setLimit(20);
        }}
      />
      <Choices
        label="策略状态"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'all', label: '全部状态' },
          { value: 'draft', label: '草稿' },
          { value: 'active', label: '使用中' },
          { value: 'archived', label: '已归档' },
        ]}
      />
      <QueryStatus query={query} empty={!rows.length} retry={() => void query.refetch()} />
      {rows.slice(0, limit).map((row) => (
        <Section key={row.id} title={row.name}>
          <Copy>{row.description ?? '暂无说明'}</Copy>
          <Copy muted>策略 {row.id}</Copy>
          {[...row.versions]
            .sort((a, b) => b.version - a.version)
            .map((version) => (
              <Action
                key={version.id}
                label={`查看 ${row.name} · 版本 ${version.version}`}
                onPress={() =>
                  navigation.navigate('StrategyVersion', {
                    strategyId: row.id,
                    versionId: version.id,
                  })
                }
              />
            ))}
        </Section>
      ))}
      {limit < rows.length ? (
        <Action label="更多策略" onPress={() => setLimit((v) => v + 20)} />
      ) : null}
    </Page>
  );
}
