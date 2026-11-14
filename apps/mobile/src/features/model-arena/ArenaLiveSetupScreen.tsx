import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { arenaLiveFieldPlaceholder, arenaLiveInitialForm, arenaLiveSetupFields, arenaResourceFields, arenaLiveModels, saveArenaLiveSetup, validateArenaLiveSetup,
  arenaChoice, arenaChoiceMarket, arenaMerge, copyArenaLiveGroup, type ArenaChoice, type ArenaBinding } from '@thesis-ledger/api-client';
import type { ArenaLiveProtocol } from '@thesis-ledger/schemas';
import type { ArenaStackParams } from '../../app/ArenaNavigator';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import { Page, ContentSection as Section, Copy, Action, Choices, Field, Feedback, QueryStatus, failureMessage } from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';
import { ArenaModelSelector } from './ArenaModelSelector';
import { useArenaSetupFeedback } from './useArenaSetupFeedback';
type Props = NativeStackScreenProps<ArenaStackParams, 'ArenaCreate' | 'ArenaSetup'>;
export function ArenaLiveSetupScreen({ navigation }: Props) {
  const identity = useMobileIdentity(), owner = identity.data?.principal?.id;
  if (!owner) return <Page title="新建模拟比赛"><QueryStatus query={identity} retry={() => void identity.refetch()} /><Copy>请先登录。</Copy></Page>;
  return <Setup key={owner} owner={owner} navigation={navigation} />;
}
function Setup({ owner, navigation }: { owner: string; navigation: Props['navigation'] }) {
  const { api, baseUrl } = useMobileRuntime(), cache = useQueryClient();
  const root = ['mobile-arena', baseUrl, owner];
  const [form, setForm] = useState(arenaLiveInitialForm), [market, setMarket] = useState<ArenaLiveProtocol['market']>('CN');
  const [universe, setUniverse] = useState<ArenaLiveProtocol['universe']>('fixed'), [budgetCurrency, setCurrency] = useState<ArenaLiveProtocol['budgetCurrency']>('USD');
  const [web, setWeb] = useState('off'), [pool, setPool] = useState<ArenaChoice[]>([]), [models, setModels] = useState<ArenaBinding[]>([]);
  const [names, setNames] = useState<Record<string, string>>({}), [error, setError] = useState('');
  const providers = useQuery({ queryKey: [...root, 'providers'], queryFn: ({ signal }) => api.aiProviders.list(signal) });
  const groups = useQuery({ queryKey: [...root, 'groups'], queryFn: ({ signal }) => api.watchlist.list({ limit: 1 }, signal) });
  const add = (items: ArenaChoice[]) => {
    try {
      if (items.some((i) => arenaChoiceMarket(i.symbol) !== market)) throw Error('请选择本场市场的标的');
      setPool(arenaMerge(pool, items)); setError('');
      return true;
    } catch (e) { setError(failureMessage(e)); return false; }
  };
  const group = useMutation({ mutationFn: (id: string) => copyArenaLiveGroup(api, id), onSuccess: (result) => { add(result.items); setNames((n) => ({ ...n, ...result.names })); } });
  const input = { form, pool, models, options: { market, universe, budgetCurrency, allowWebSearch: web === 'on' } }, signature = JSON.stringify(input);
  const validation = validateArenaLiveSetup(form, pool, models, input.options);
  const save = useMutation({ mutationFn: (value: typeof input & { signature: string }) => saveArenaLiveSetup(api, value.form, value.pool, value.models, value.options),
    onSuccess: async (r) => { await cache.invalidateQueries({ queryKey: root }); navigation.replace('ArenaMatch', { match: r.id }); } });
  const feedback = useArenaSetupFeedback(signature, validation.errors, save.error, save.variables?.signature, true), errors = feedback.errors;
  const renderField = ([key, label]: readonly [keyof typeof form, string, string]) => <Field key={key} label={label} error={errors[key]} placeholder={arenaLiveFieldPlaceholder(key)} value={form[key]} onChange={(v) => setForm({ ...form, [key]: v })} />;
  return <Page title="新建模拟比赛"><Section title="市场与选股范围">
    <Choices label="市场" value={market} options={[{ value: 'CN', label: 'A股' }, { value: 'HK', label: '港股' }, { value: 'US', label: '美股' }]} onChange={(v) => { setMarket(v); setPool([]); }} />
    <Choices label="选股范围" value={universe} options={[{ value: 'fixed', label: '固定标的池' }, { value: 'market', label: '全市场' }]} onChange={setUniverse} />
    {universe === 'fixed' && <><InstrumentPicker key={market} purpose="browse"
      accepts={(item) => Boolean(arenaChoice(item)) && arenaChoiceMarket(item.symbol) === market}
      selection={{
        items: pool.map((item) => ({ id: item.instrumentId, symbol: item.symbol, displayName: names[item.symbol] ?? item.symbol })),
        onRemove: (id) => setPool(pool.filter((item) => item.instrumentId !== id)),
      }} onConfirmed={(i) => {
      const item = arenaChoice(i); if (!item || !add([item])) return false;
      setNames({ ...names, [i.symbol]: i.displayName }); return true;
    }} />{groups.data?.groups.map((g) => <Action key={g.id} label={'导入 ' + g.name} disabled={group.isPending} onPress={() => group.mutate(g.id)} />)}
      <Feedback error message={errors.instruments || error || (group.error ? failureMessage(group.error) : null)} />
      </>}
    <Feedback error message={errors.market || errors.universe} />
  </Section><Section title="参赛模型"><QueryStatus query={providers} retry={() => void providers.refetch()} />
    {providers.isSuccess && !arenaLiveModels(providers.data).length && <Copy>请先配置并验证“竞技场自主研究”用途。</Copy>}
    {(arenaLiveModels(providers.data ?? []).length > 0 || models.length > 0) && <ArenaModelSelector choices={arenaLiveModels(providers.data ?? [])} value={models} onChange={setModels} />}
    <Feedback error message={errors.models} />
    <Choices label="网页搜索" value={web} options={[{ value: 'off', label: '关闭' }, { value: 'on', label: '开启' }]} onChange={setWeb} />
    <Feedback error message={errors.allowWebSearch} />
  </Section><Section title="赛制与预算"><Copy muted>总额度可留空，表示不限额；填 0 表示零额度。每个模型独立管理模拟资金。</Copy>
    <Copy muted>日期可留空：启动时开始，持续运行至手动结束。</Copy>
    <Choices label="模型费用币种" value={budgetCurrency} options={['USD', 'CNY', 'HKD'].map((value) => ({ value: value as typeof budgetCurrency, label: value }))} onChange={setCurrency} />
    <Feedback error message={errors.budgetCurrency} />
    <Copy muted>单次输入、输出留空时不限制，已设总额度和上游能力仍生效。资金与交易规则留空时使用提示的默认值。</Copy>
    {arenaLiveSetupFields.map(renderField)}
  </Section><Section title="研究设置">
    {arenaResourceFields.filter(([key]) => key === 'maxResearchSteps' || key === 'maxCycleSeconds').map(renderField)}
    <Copy muted>留空时不限制，由模型完成本次研究。</Copy>
  </Section><Section title="行情观察设置">
    {arenaResourceFields.filter(([key]) => key !== 'maxResearchSteps' && key !== 'maxCycleSeconds').map(renderField)}
    <Copy muted>留空使用默认值。行情观察用于模拟成交、估值及检查已有预约。</Copy>
  </Section><Feedback error message={errors.form || (feedback.requestError ? failureMessage(feedback.requestError) : null)} />
    <Action label="保存比赛草稿" primary busy={save.isPending} disabled={save.isPending || group.isPending} onPress={() => { if (feedback.beginSubmit()) save.mutate({ ...input, signature }); }} />
  </Page>;
}
