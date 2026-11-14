import { ArenaSections } from './ArenaSections.js';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  arenaLiveInitialForm,
  arenaLiveModels,
  saveArenaLiveSetup,
  validateArenaLiveSetup,
  arenaChoice,
  arenaChoiceMarket,
  arenaMerge,
  copyArenaLiveGroup,
  type ArenaChoice,
  type ArenaBinding,
} from '@thesis-ledger/api-client';
import type { ArenaLiveProtocol } from '@thesis-ledger/schemas';
import { InstrumentMultiSelect } from '../market-data/InstrumentMultiSelect.js';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { Button } from '@/components/ui/button';
import { ArenaDetailHeader } from './ArenaDetailShell.js';
import { ArenaModelSelector } from './ArenaModelSelector.js';
import { ArenaSetupFields } from './ArenaSetupFields.js';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Spinner } from '@/components/ui/spinner';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { arenaCatalogReturn } from './arena-catalog-navigation.js';
import { useArenaSetupFeedback } from './useArenaSetupFeedback.js';
import { ArenaSetupIssue } from './ArenaSetupIssue.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';

export function ArenaLiveSetup(props: { scope: readonly string[] }) {
  const control = useArenaLiveSetup(props);
  const {
    feedback,
    save,
    group,
    input,
    signature,
    returnPath,
    form,
    update,
    errors,
    market,
    universe,
    pool,
    models,
    allowWebSearch,
    budgetCurrency,
    setBudgetCurrency,
  } = control;

  return (
    <form
      ref={feedback.root}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending && !group.isPending && feedback.beginSubmit())
          save.mutate({ ...input, signature });
      }}
      className="grid min-w-0 gap-group text-sm"
    >
      <ArenaDetailHeader title="新建比赛" backPath={returnPath} />
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <ArenaSections>
          <section className="grid min-w-0 gap-5">
            <h2 className="text-xl font-semibold">比赛信息</h2>
            <ArenaSetupFields
              keys={['title', 'startsOn', 'endsOn']}
              form={form}
              onChange={update}
              errors={errors}
            />
            <p className="text-xs text-muted-foreground">
              日期可留空：启动时开始，持续运行至手动结束。
            </p>
          </section>
          <LiveSetupUniverse control={control} />
          <LiveSetupModels control={control} />
          <section className="grid min-w-0 gap-5">
            <h2 className="text-xl font-semibold">模拟资金与交易规则</h2>
            <p className="text-xs text-muted-foreground">
              每个模型使用独立模拟资金，金额币种为 {{ CN: 'CNY', HK: 'HKD', US: 'USD' }[market]}
              。留空使用输入框提示的默认值。
            </p>
            <ArenaSetupFields
              keys={[
                'initialCash',
                'maxPositionBps',
                'buyBps',
                'sellBps',
                'minimum',
                'slippageBps',
              ]}
              form={form}
              onChange={update}
              errors={errors}
            />
          </section>
          <section className="grid min-w-0 gap-5">
            <h2 className="text-xl font-semibold">赛制与预算</h2>
            <p className="text-xs text-muted-foreground">
              总额度可留空，表示不限额；填 0 表示零额度。已填写的每模型与全场额度同时生效。
            </p>
            <div className="grid gap-2">
              <span className="text-xs text-muted-foreground">模型费用币种</span>
              <ToggleGroup
                aria-label="模型费用币种"
                value={[budgetCurrency]}
                onValueChange={(values) => {
                  if (values[0]) setBudgetCurrency(values[0] as typeof budgetCurrency);
                }}
              >
                {(['USD', 'CNY', 'HKD'] as const).map((c) => (
                  <ToggleGroupItem key={c} value={c}>
                    {c}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <ArenaSetupIssue label="模型费用币种校验" error={errors.budgetCurrency} />
            <h3 className="text-sm font-medium">每模型总额度</h3>
            <ArenaSetupFields
              keys={['requests', 'tokens', 'cost']}
              form={form}
              onChange={update}
              optionalBudget
              errors={errors}
            />
            <h3 className="text-sm font-medium">全场总额度</h3>
            <ArenaSetupFields
              keys={['allRequests', 'allTokens', 'allCost']}
              form={form}
              onChange={update}
              optionalBudget
              errors={errors}
            />
            <h3 className="text-sm font-medium">单次模型请求</h3>
            <ArenaSetupFields
              keys={['maxInput', 'maxOutput']}
              form={form}
              onChange={update}
              errors={errors}
            />
            <p className="text-xs text-muted-foreground">
              单次上限可留空；已设总额度和上游模型能力仍生效。
            </p>
          </section>
          <section className="grid min-w-0 gap-5">
            <h2 className="text-xl font-semibold">研究设置</h2>
            <ArenaSetupFields
              keys={['maxResearchSteps', 'maxCycleSeconds']}
              form={form}
              onChange={update}
              errors={errors}
            />
            <p className="text-xs text-muted-foreground">留空时不限制，由模型完成本次研究。</p>
          </section>
          <section className="grid min-w-0 gap-5">
            <h2 className="text-xl font-semibold">行情观察设置</h2>
            <ArenaSetupFields
              keys={['maxActiveSymbols', 'quoteIntervalSeconds', 'maxQuoteAgeSeconds']}
              form={form}
              onChange={update}
              errors={errors}
            />
            <p className="text-xs text-muted-foreground">
              留空使用默认值。行情观察用于模拟成交、估值及检查已有预约。
            </p>
          </section>
        </ArenaSections>
        <aside
          className="grid min-w-0 gap-4 bg-muted/20 p-5 xl:sticky xl:top-6"
          aria-label="比赛草稿摘要"
        >
          <h2 className="text-xl font-semibold">比赛草稿</h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">市场</dt>
              <dd>{{ CN: 'A股', HK: '港股', US: '美股' }[market]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">选股范围</dt>
              <dd>{universe === 'fixed' ? pool.length + ' 个标的' : '全市场'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">参赛模型</dt>
              <dd>{models.length} 个</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">网页搜索</dt>
              <dd>{allowWebSearch ? '开启' : '关闭'}</dd>
            </div>
          </dl>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            保存后生成草稿，启动比赛时才会调用模型。
          </p>
          <ArenaSetupIssue
            label="保存结果"
            error={
              errors.form ||
              (feedback.requestError
                ? requestFailureMessage(feedback.requestError, '保存失败，请稍后重试。')
                : undefined)
            }
          />
          <Button type="submit" disabled={save.isPending || group.isPending}>
            {save.isPending && <Spinner />}保存比赛草稿
          </Button>
        </aside>
      </div>
    </form>
  );
}

function useArenaLiveSetup({ scope }: { scope: readonly string[] }) {
  const api = getDesktopApiClient(),
    navigate = useNavigate(),
    cache = useQueryClient();
  const returnPath = arenaCatalogReturn(useLocation().state);
  const [form, setForm] = useState(arenaLiveInitialForm);
  const [market, setMarket] = useState<ArenaLiveProtocol['market']>('CN');
  const [universe, setUniverse] = useState<ArenaLiveProtocol['universe']>('fixed');
  const [budgetCurrency, setBudgetCurrency] = useState<ArenaLiveProtocol['budgetCurrency']>('USD');
  const [allowWebSearch, setWebSearch] = useState(false);
  const [pool, setPool] = useState<ArenaChoice[]>([]),
    [names, setNames] = useState<Record<string, string>>({});
  const [models, setModels] = useState<ArenaBinding[]>([]),
    [error, setError] = useState('');
  const providers = useQuery({
    queryKey: [...scope, 'providers'],
    queryFn: ({ signal }) => api.aiProviders.list(signal),
  });
  const groups = useQuery({
    queryKey: [...scope, 'groups'],
    queryFn: ({ signal }) => api.watchlist.list({ limit: 1 }, signal),
  });
  const add = (items: ArenaChoice[]) => {
    try {
      if (items.some((i) => arenaChoiceMarket(i.symbol) !== market))
        throw Error('请选择本场市场的标的');
      setPool(arenaMerge(pool, items));
      setError('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const group = useMutation({
    mutationFn: (id: string) => copyArenaLiveGroup(api, id),
    onSuccess: (result) => {
      add(result.items);
      setNames((n) => ({ ...n, ...result.names }));
    },
  });
  const input = {
      form,
      pool,
      models,
      options: { market, universe, budgetCurrency, allowWebSearch },
    },
    signature = JSON.stringify(input);
  const validation = validateArenaLiveSetup(form, pool, models, input.options);
  const save = useMutation({
    mutationFn: (value: typeof input & { signature: string }) =>
      saveArenaLiveSetup(api, value.form, value.pool, value.models, value.options),
    onError: () => feedback.focusErrors(),
    onSuccess: async (r) => {
      await cache.invalidateQueries({ queryKey: scope });
      void navigate('/arena/' + r.id, { replace: true, state: { arenaReturn: returnPath } });
    },
  });
  const feedback = useArenaSetupFeedback(
      signature,
      validation.errors,
      save.error,
      save.variables?.signature,
      true,
    ),
    errors = feedback.errors;
  const choices = arenaLiveModels(providers.data ?? []);
  const update = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  return {
    feedback,
    save,
    group,
    input,
    signature,
    returnPath,
    form,
    update,
    errors,
    market,
    setMarket,
    setPool,
    setError,
    universe,
    setUniverse,
    error,
    pool,
    names,
    add,
    setNames,
    groups,
    models,
    providers,
    choices,
    setModels,
    allowWebSearch,
    setWebSearch,
    budgetCurrency,
    setBudgetCurrency,
  };
}

function LiveSetupModels({ control }: { control: ReturnType<typeof useArenaLiveSetup> }) {
  return (
    <>
      <section className="grid min-w-0 gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">参赛模型</h2>
          <span className="text-xs text-muted-foreground">已选 {control.models.length} 个</span>
        </div>
        {control.providers.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            正在读取可用模型
          </p>
        )}
        {control.providers.isError && (
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => void control.providers.refetch()}
          >
            重新读取模型配置
          </Button>
        )}
        {control.providers.isSuccess && !control.choices.length && (
          <div className="grid justify-items-start gap-3 rounded-lg bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">
              请在数据与自动化中配置并验证“竞技场自主研究”用途。
            </p>
            <Button variant="outline" size="sm" onClick={() => void control.providers.refetch()}>
              刷新可用模型
            </Button>
          </div>
        )}
        <ArenaSetupIssue label="参赛模型校验" error={control.errors.models}>
          {(control.choices.length > 0 || control.models.length > 0) && (
            <ArenaModelSelector
              choices={control.choices}
              value={control.models}
              onChange={control.setModels}
            />
          )}
        </ArenaSetupIssue>
        <div className="flex items-center justify-between gap-4 pt-2">
          <div>
            <span className="font-medium">网页搜索</span>
            <p className="mt-1 text-xs text-muted-foreground">
              允许模型在研究中搜索网页，调用计入研究预算。
            </p>
          </div>
          <Switch
            variant="risk"
            aria-label="网页搜索"
            checked={control.allowWebSearch}
            onCheckedChange={control.setWebSearch}
          >
            <SwitchThumb variant="risk" aria-hidden="true" />
          </Switch>
        </div>
        <ArenaSetupIssue label="网页搜索校验" error={control.errors.allowWebSearch} />
      </section>
    </>
  );
}

function LiveSetupUniverse({ control }: { control: ReturnType<typeof useArenaLiveSetup> }) {
  return (
    <>
      <section className="grid min-w-0 gap-5">
        <h2 className="text-xl font-semibold">市场与选股范围</h2>
        <ToggleGroup
          aria-label="交易市场"
          value={[control.market]}
          onValueChange={(values) => {
            const value = values[0] as typeof control.market | undefined;
            if (value) {
              control.setMarket(value);
              control.setPool([]);
              control.setError('');
            }
          }}
        >
          {(
            [
              ['CN', 'A股'],
              ['HK', '港股'],
              ['US', '美股'],
            ] as const
          ).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="选股范围"
          value={[control.universe]}
          onValueChange={(values) => {
            if (values[0]) {
              control.setUniverse(values[0] as typeof control.universe);
              control.setError('');
            }
          }}
        >
          <ToggleGroupItem value="fixed">固定标的池</ToggleGroupItem>
          <ToggleGroupItem value="market">全市场自主选股</ToggleGroupItem>
        </ToggleGroup>
        {control.universe === 'fixed' ? (
          <div className="grid min-w-0 gap-3">
            <ArenaSetupIssue
              label="参赛标的"
              error={
                control.errors.instruments ||
                control.error ||
                (control.group.error ? requestFailureMessage(control.group.error) : undefined)
              }
            >
              <InstrumentMultiSelect
                key={control.market}
                label="搜索参赛标的"
                selected={control.pool.map((item) => ({
                  id: item.instrumentId,
                  symbol: item.symbol,
                  displayName: control.names[item.symbol] ?? item.symbol,
                }))}
                onRemove={(id) =>
                  control.setPool(control.pool.filter((item) => item.instrumentId !== id))
                }
                accepts={(item) =>
                  Boolean(arenaChoice(item)) && arenaChoiceMarket(item.symbol) === control.market
                }
                onSelect={(item) => {
                  const choice = arenaChoice(item);
                  if (!choice || !control.add([choice])) return false;
                  control.setNames({ ...control.names, [item.symbol]: item.displayName });
                  return true;
                }}
              />
            </ArenaSetupIssue>
            {control.groups.data && control.groups.data.groups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {control.groups.data.groups.map((g) => (
                  <Button
                    key={g.id}
                    variant="outline"
                    size="sm"
                    disabled={control.group.isPending}
                    onClick={() => control.group.mutate(g.id)}
                  >
                    导入 {g.name}
                  </Button>
                ))}
              </div>
            )}
            {control.groups.isError && (
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={() => void control.groups.refetch()}
              >
                重新读取自选分组
              </Button>
            )}
            {!control.pool.length && (
              <p className="text-xs text-muted-foreground">
                搜索并添加本场标的，或从已有自选分组导入。
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            模型在所选市场中自主寻找标的，受监测数量和研究预算限制。
          </p>
        )}
        <ArenaSetupIssue
          label="市场与选股范围校验"
          error={control.errors.market || control.errors.universe}
        />
      </section>
    </>
  );
}
