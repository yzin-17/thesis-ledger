import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import type { StrategyStackParams } from '../../app/strategy-navigation';
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
import { useStrategyLibrary } from '../strategy-library/useStrategyLibrary';
import {
  definitionRecord,
  initialStrategyDefinition,
  parsePendingStrategySave,
  recoverStrategySave,
  validatedDefinition,
  type PendingStrategySave,
} from './strategy-editor-state';
type Draft = { name: string; text: string; pending: PendingStrategySave | null };
async function readDraft(key: string): Promise<Draft | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw Error('本机草稿无效，已保留原文件。');
  const row = value as Record<string, unknown>;
  if (typeof row.name !== 'string' || typeof row.text !== 'string')
    throw Error('本机草稿缺少名称或定义。');
  return {
    name: row.name,
    text: row.text,
    pending: row.pending ? parsePendingStrategySave(row.pending) : null,
  };
}
export function StrategyEditorScreen() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'StrategyEditor'>>();
  const { strategyId, versionId } = params ?? {};
  const { baseUrl, scope } = useMobileRuntime();
  const library = useStrategyLibrary();
  const storageKey = JSON.stringify([
    'mobile-strategy-editor-v1',
    baseUrl,
    strategyId ?? 'new',
    versionId ?? 'new',
  ]);
  const stored = useQuery({
    queryKey: [...scope, 'strategy-editor-draft', storageKey],
    queryFn: () => readDraft(storageKey),
    retry: false,
    staleTime: Infinity,
  });
  const owner = library.data?.find((v) => v.id === strategyId);
  const version = owner?.versions.find((v) => v.id === versionId);
  const ready = library.isSuccess && stored.isSuccess && (!strategyId || !!version);
  return (
    <Page title={strategyId ? '编辑为新版本' : '新建策略'}>
      <QueryStatus query={library} retry={() => void library.refetch()} />
      <QueryStatus query={stored} retry={() => void stored.refetch()} />
      {ready ? (
        <StrategyEditorForm
          key={storageKey}
          storageKey={storageKey}
          strategyId={strategyId}
          initial={
            stored.data ?? {
              name: owner?.name ?? '我的策略',
              text: JSON.stringify(
                version?.schema ?? initialStrategyDefinition('我的策略'),
                null,
                2,
              ),
              pending: null,
            }
          }
        />
      ) : null}
      {!ready && library.isSuccess && strategyId && !version ? (
        <Copy>原版本不可读，请返回重新选择；本机草稿仍保留。</Copy>
      ) : null}
    </Page>
  );
}
function StrategyEditorForm({
  initial,
  storageKey,
  strategyId,
}: {
  initial: Draft;
  storageKey: string;
  strategyId: string | undefined;
}) {
  const { api, scope } = useMobileRuntime();
  const client = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ strategyId: string; versionId: string } | null>(null);
  const [advanced, setAdvanced] = useState('common');
  const [dirty, setDirty] = useState(false);
  useDirtyForm(dirty, () => {
    setDraft(initial);
    setDirty(false);
  });
  const change = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setSaved(null);
  };
  let definition: Record<string, unknown> = {};
  try {
    definition = definitionRecord(draft.text);
  } catch {
    /* 无效 JSON 保留供修正。 */
  }
  const instrument = (definition.executionInstrument ?? {}) as Record<string, unknown>;
  const patch = (values: Record<string, unknown>) => {
    try {
      change({
        ...draft,
        text: JSON.stringify({ ...definitionRecord(draft.text), ...values }, null, 2),
      });
    } catch {
      setMessage('请先修正高级 JSON，再修改常用配置。');
    }
  };
  const setInstrument = (field: string, value: string) => {
    const sources = Array.isArray(definition.signalSources) ? definition.signalSources : [];
    patch({
      executionInstrument: { ...instrument, [field]: value },
      signalSources: sources.map((source: unknown) => {
        if (!source || typeof source !== 'object' || !('id' in source) || source.id !== 'execution')
          return source;
        const row = source as Record<string, unknown>;
        return { ...row, asset: { ...(row.asset as Record<string, unknown>), [field]: value } };
      }),
    });
  };
  const command = useMobileCommand(
    async (action: 'local' | 'save' | 'recover') => {
      if (action === 'local') {
        await AsyncStorage.setItem(storageKey, JSON.stringify(draft));
        setDirty(false);
        setMessage('本机草稿已保存。');
        return;
      }
      let pending = draft.pending;
      if (action === 'save') {
        if (pending) throw Error('原保存尚未确认，请先读取并找回。');
        const schema = validatedDefinition(draft.text);
        const rows = await api.strategy.definitions.list();
        const owner = rows.find((v) => v.id === strategyId);
        if (strategyId && !owner) throw Error('当前策略已不可读，输入仍保留。');
        pending = {
          name: draft.name,
          schema,
          ...(strategyId ? { strategyId } : {}),
          baselineIds: strategyId ? owner!.versions.map((v) => v.id) : rows.map((v) => v.id),
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify({ ...draft, pending }));
        setDraft({ ...draft, pending });
        try {
          let receipt: { strategyId: string; versionId: string };
          if (strategyId) {
            const v = await api.strategy.definitions.createVersion(strategyId, schema);
            receipt = { strategyId, versionId: v.id };
          } else {
            const row = await api.strategy.definitions.create({ name: draft.name, schema });
            const found = recoverStrategySave(pending, [row]);
            if (!found) throw Error('保存回执与定义不一致，保留原提交记录。');
            receipt = found;
          }
          setSaved(receipt);
        } catch (error) {
          if (error instanceof ThesisLedgerApiError && [400, 422].includes(error.status)) {
            setDraft({ ...draft, pending: null });
            await AsyncStorage.setItem(storageKey, JSON.stringify({ ...draft, pending: null }));
          }
          throw error;
        }
      } else {
        if (!pending) throw Error('没有待确认保存。');
        const receipt = recoverStrategySave(pending, await api.strategy.definitions.list());
        if (!receipt) throw Error('尚未发现唯一匹配回执；保留原输入和保存基线，请重新读取。');
        setSaved(receipt);
      }
      await AsyncStorage.removeItem(storageKey);
      setDraft({ ...draft, pending: null });
      setDirty(false);
      client.setQueryData([...scope, 'strategy-editor-draft', storageKey], null);
      await client.invalidateQueries({ queryKey: [...scope, 'strategy-library'] });
      setMessage('服务端已确认保存，可打开新版本。');
    },
    { refresh: false },
  );
  const execute = (action: 'local' | 'save' | 'recover') =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  return (
    <>
      <Copy muted>
        {strategyId ? '保存会创建新版本，原版本仍可阅读。' : '请核对示例规则后明确保存。'}
      </Copy>
      {draft.pending ? (
        <Section title="原保存待确认">
          <Copy>保存基线已留在本机；不会自动重复创建。</Copy>
          <Action
            label="读取并找回保存结果"
            disabled={command.isPending}
            onPress={() => execute('recover')}
          />
        </Section>
      ) : null}
      <Field
        label="策略名称"
        value={draft.name}
        editable={!strategyId && !draft.pending && !command.isPending}
        onChange={(name) => {
          const next = { ...draft, name };
          try {
            next.text = JSON.stringify({ ...definitionRecord(draft.text), name }, null, 2);
          } catch {
            /* 保留原 JSON，名称仍可修正。 */
          }
          change(next);
        }}
      />
      <Choices
        label="编辑方式"
        value={advanced}
        onChange={setAdvanced}
        options={[
          { value: 'common', label: '常用配置' },
          { value: 'advanced', label: '高级 JSON' },
        ]}
      />
      {advanced === 'common' ? (
        <StrategyCommonFields
          definition={definition}
          instrument={instrument}
          locked={!!draft.pending || command.isPending}
          onPatch={patch}
          onInstrument={setInstrument}
        />
      ) : (
        <Field
          label="完整策略 JSON"
          value={draft.text}
          multiline
          editable={!draft.pending && !command.isPending}
          onChange={(text) => change({ ...draft, text })}
        />
      )}
      <Action label="保存本机草稿" disabled={command.isPending} onPress={() => execute('local')} />
      <Action
        label={strategyId ? '确认保存新版本' : '确认创建策略'}
        primary
        disabled={command.isPending || !!draft.pending || !!saved}
        onPress={() => execute('save')}
      />
      <Feedback message={message} error={command.isError} />
      {saved ? (
        <Action
          label="打开已保存版本"
          onPress={() => navigation.navigate('StrategyVersion', saved)}
        />
      ) : null}
    </>
  );
}

function StrategyCommonFields({
  definition,
  instrument,
  locked,
  onPatch,
  onInstrument,
}: {
  definition: Record<string, unknown>;
  instrument: Record<string, unknown>;
  locked: boolean;
  onPatch: (v: Record<string, unknown>) => void;
  onInstrument: (field: string, value: string) => void;
}) {
  return (
    <Section title="常用配置">
      <Field
        label="策略说明"
        value={typeof definition.description === 'string' ? definition.description : ''}
        editable={!locked}
        multiline
        onChange={(description) => onPatch({ description })}
      />
      <Field
        label="执行标的"
        value={typeof instrument.symbol === 'string' ? instrument.symbol : ''}
        editable={!locked}
        onChange={(v) => onInstrument('symbol', v)}
      />
      <Choices
        label="市场"
        value={typeof instrument.market === 'string' ? instrument.market : 'CN'}
        disabled={locked}
        onChange={(v) => onInstrument('market', v)}
        options={[
          { value: 'CN', label: '境内' },
          { value: 'HK', label: '香港' },
          { value: 'US', label: '美国' },
        ]}
      />
      <Choices
        label="资产类型"
        value={typeof instrument.assetType === 'string' ? instrument.assetType : 'stock'}
        disabled={locked}
        onChange={(v) => onInstrument('assetType', v)}
        options={[
          { value: 'stock', label: '股票' },
          { value: 'etf', label: '场内基金' },
          { value: 'fund', label: '净值基金' },
        ]}
      />
      <Copy>
        周期：
        {typeof definition.primaryTimeframe === 'string' ? definition.primaryTimeframe : '未填写'}
        。信号、仓位、风险、执行与成本可在高级 JSON 中完整编辑。
      </Copy>
    </Section>
  );
}
