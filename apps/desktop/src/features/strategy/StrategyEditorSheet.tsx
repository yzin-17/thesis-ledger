import { useEffect, useMemo, useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { debounce } from 'es-toolkit';
import { CheckIcon, ChevronDownIcon, LoaderCircle, Plus, SearchIcon, Trash2 } from 'lucide-react';
import { strategySchemaV1 } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useInstrumentSearchQuery } from '../market-data/market-data.queries.js';
import type { InstrumentResult } from '../market-data/market-data.types.js';
import { schemaFromVersion, schemaName } from './strategy.schema.js';
import type { StrategyRecord, StrategySchema, StrategyVersion } from './strategy.types.js';

type Signal = { indicator: string; operator: string; value: number | string };
type EditorMode = 'create' | 'edit';

const selectLabel = (value: unknown, labels: Record<string, string>, fallback: string) =>
  typeof value === 'string' ? (labels[value] ?? fallback) : fallback;

const signalOperatorLabels: Record<string, string> = {
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  crossesAbove: '上穿',
  crossesBelow: '下穿',
};

const signalIndicatorLabels: Record<string, string> = {
  close: '收盘价（close）',
  price: '收盘价（price）',
  open: '开盘价（open）',
  high: '最高价（high）',
  low: '最低价（low）',
  volume: '成交量（volume）',
};

export const signalIndicatorOptions = Object.entries(signalIndicatorLabels).map(
  ([value, label]) => ({ value, label }),
);

export const benchmarkOptions = [
  { value: '000300.SH', label: '沪深 300' },
  { value: '000001.SH', label: '上证指数' },
  { value: '399001.SZ', label: '深证成指' },
  { value: '399006.SZ', label: '创业板指' },
  { value: '000905.SH', label: '中证 500' },
  { value: '000852.SH', label: '中证 1000' },
  { value: '000688.SH', label: '科创 50' },
];

export type BenchmarkOption = (typeof benchmarkOptions)[number];

type DirectoryInstrument = Pick<
  InstrumentResult,
  'symbol' | 'canonicalCode' | 'market' | 'displayName'
>;

export const directoryInstrumentOptions = (
  instruments: readonly DirectoryInstrument[],
): BenchmarkOption[] => {
  const seen = new Set<string>();
  return instruments.reduce<BenchmarkOption[]>((options, instrument) => {
    const value = instrument.symbol || `${instrument.canonicalCode}.${instrument.market}`;
    if (!value || seen.has(value)) return options;
    seen.add(value);
    options.push({ value, label: instrument.displayName || value });
    return options;
  }, []);
};

export const filterBenchmarkOptions = (option: BenchmarkOption, query: string) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return `${option.label} ${option.value}`.toLocaleLowerCase().includes(normalizedQuery);
};

const uniqueOptions = (...groups: Array<readonly BenchmarkOption[]>) => {
  const seen = new Set<string>();
  return groups.flatMap((group) =>
    group.filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    }),
  );
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const signalList = (schema: StrategySchema, key: 'entrySignals' | 'exitSignals'): Signal[] => {
  const value = schema[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const signal = asRecord(item);
    const rawValue = signal.value;
    return {
      indicator: typeof signal.indicator === 'string' ? signal.indicator : '',
      operator: typeof signal.operator === 'string' ? signal.operator : 'gt',
      value: typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : '',
    };
  });
};

const updateRecord = (schema: StrategySchema, key: string, value: unknown): StrategySchema => ({
  ...schema,
  [key]: value,
});

const updateNested = (schema: StrategySchema, key: string, nestedKey: string, value: unknown) => ({
  ...schema,
  [key]: { ...asRecord(schema[key]), [nestedKey]: value },
});

const schemaSymbols = (schema: StrategySchema) => {
  const universe = asRecord(schema.universe);
  return Array.isArray(universe.symbols)
    ? universe.symbols.filter((symbol): symbol is string => typeof symbol === 'string')
    : [];
};

export const normalizeSingleSymbol = (schema: StrategySchema): StrategySchema => {
  const symbols = schemaSymbols(schema);
  if (symbols.length <= 1) return schema;
  return updateNested(schema, 'universe', 'symbols', [symbols[0]]);
};

const updateSignal = (
  schema: StrategySchema,
  key: 'entrySignals' | 'exitSignals',
  index: number,
  field: keyof Signal,
  value: string,
) => {
  const signals = signalList(schema, key).map((signal, signalIndex) => {
    if (signalIndex !== index) return signal;
    const nextValue =
      field === 'value' && value.trim() !== '' && Number.isFinite(Number(value))
        ? Number(value)
        : value;
    return { ...signal, [field]: nextValue };
  });
  return updateRecord(schema, key, signals);
};

const toDateTimeLocal = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string) => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const parseJson = (value: string): StrategySchema | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as StrategySchema)
      : null;
  } catch {
    return null;
  }
};

export function StrategyEditorSheet({
  open,
  mode,
  strategy,
  version,
  busy,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  mode: EditorMode;
  strategy?: StrategyRecord | null;
  version?: StrategyVersion | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (schema: StrategySchema) => void;
}) {
  const initialSchema = useMemo(
    () => schemaFromVersion(mode === 'edit' ? (version ?? null) : null, strategy?.name),
    [mode, strategy?.name, version],
  );
  const [draft, setDraft] = useState<StrategySchema>(initialSchema);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initialSchema, null, 2));
  const [activeTab, setActiveTab] = useState('common');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [benchmarkQuery, setBenchmarkQuery] = useState('');
  const [debouncedBenchmarkSearchQuery, setDebouncedBenchmarkSearchQuery] = useState('');
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbolQuery, setSymbolQuery] = useState('');
  const [debouncedSymbolSearchQuery, setDebouncedSymbolSearchQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = normalizeSingleSymbol(initialSchema);
    setDraft(next);
    setJsonText(JSON.stringify(next, null, 2));
    setActiveTab('common');
    setJsonError(null);
    setSchemaError(null);
    setBenchmarkOpen(false);
    setBenchmarkQuery('');
    setSymbolOpen(false);
    setSymbolQuery('');
  }, [initialSchema, open]);

  useEffect(() => {
    if (activeTab === 'advanced') setJsonText(JSON.stringify(draft, null, 2));
  }, [activeTab, draft]);

  const normalizedBenchmarkSearchQuery = benchmarkOpen ? benchmarkQuery.trim() : '';

  useEffect(() => {
    const updateDebouncedQuery = debounce(
      () => setDebouncedBenchmarkSearchQuery(normalizedBenchmarkSearchQuery),
      300,
    );
    updateDebouncedQuery();
    return () => updateDebouncedQuery.cancel();
  }, [normalizedBenchmarkSearchQuery]);

  const normalizedSymbolSearchQuery = symbolOpen ? symbolQuery.trim() : '';

  useEffect(() => {
    const updateDebouncedQuery = debounce(
      () => setDebouncedSymbolSearchQuery(normalizedSymbolSearchQuery),
      300,
    );
    updateDebouncedQuery();
    return () => updateDebouncedQuery.cancel();
  }, [normalizedSymbolSearchQuery]);

  const benchmarkSearch = useInstrumentSearchQuery(debouncedBenchmarkSearchQuery);
  const symbolSearch = useInstrumentSearchQuery(debouncedSymbolSearchQuery);

  const name = schemaName(draft, strategy?.name ?? '');
  const universe = asRecord(draft.universe);
  const stopLoss = asRecord(draft.stopLoss);
  const takeProfit = asRecord(draft.takeProfit);
  const sizing = asRecord(draft.sizing);
  const execution = asRecord(draft.execution);
  const cost = asRecord(draft.cost);
  const symbols = schemaSymbols(draft);
  const entrySignals = signalList(draft, 'entrySignals');
  const exitSignals = signalList(draft, 'exitSignals');
  const selectedBenchmark = useMemo(() => {
    if (typeof draft.benchmark !== 'string' || !draft.benchmark) return null;
    return (
      benchmarkOptions.find((option) => option.value === draft.benchmark) ?? {
        value: draft.benchmark,
        label: draft.benchmark,
      }
    );
  }, [draft.benchmark]);
  const benchmarkSearchActive = Boolean(normalizedBenchmarkSearchQuery);
  const benchmarkSearchDebouncing =
    benchmarkSearchActive && debouncedBenchmarkSearchQuery !== normalizedBenchmarkSearchQuery;
  const benchmarkSearchBusy =
    benchmarkSearchActive && (benchmarkSearchDebouncing || benchmarkSearch.isFetching);
  const benchmarkSearchOptions = useMemo(
    () => directoryInstrumentOptions(benchmarkSearch.data ?? []),
    [benchmarkSearch.data],
  );
  const localBenchmarkOptions = useMemo(
    () =>
      benchmarkSearchActive
        ? benchmarkOptions.filter((option) =>
            filterBenchmarkOptions(option, normalizedBenchmarkSearchQuery),
          )
        : benchmarkOptions,
    [benchmarkSearchActive, normalizedBenchmarkSearchQuery],
  );
  const benchmarkItems = useMemo(() => {
    const items = benchmarkSearchActive
      ? uniqueOptions(benchmarkSearchOptions, localBenchmarkOptions)
      : localBenchmarkOptions;
    if (
      !selectedBenchmark ||
      items.some((option) => option.value === selectedBenchmark.value) ||
      (benchmarkSearchActive &&
        !filterBenchmarkOptions(selectedBenchmark, normalizedBenchmarkSearchQuery))
    ) {
      return items;
    }
    return [selectedBenchmark, ...items];
  }, [
    benchmarkSearchActive,
    benchmarkSearchOptions,
    localBenchmarkOptions,
    normalizedBenchmarkSearchQuery,
    selectedBenchmark,
  ]);
  const symbolSearchActive = Boolean(normalizedSymbolSearchQuery);
  const symbolSearchDebouncing =
    symbolSearchActive && debouncedSymbolSearchQuery !== normalizedSymbolSearchQuery;
  const symbolSearchBusy =
    symbolSearchActive && (symbolSearchDebouncing || symbolSearch.isFetching);
  const symbolSearchOptions = useMemo(
    () => directoryInstrumentOptions(symbolSearch.data ?? []),
    [symbolSearch.data],
  );
  const symbolItems = symbolSearchActive ? symbolSearchOptions : [];
  const selectedSymbolValue = symbols[0] ?? '';
  const selectedSymbolOption = selectedSymbolValue
    ? { value: selectedSymbolValue, label: selectedSymbolValue }
    : null;

  useEffect(() => {
    if (!benchmarkOpen) setBenchmarkQuery(selectedBenchmark?.label ?? '');
  }, [benchmarkOpen, selectedBenchmark]);

  useEffect(() => {
    if (!symbolOpen) setSymbolQuery(selectedSymbolValue);
  }, [selectedSymbolValue, symbolOpen]);

  const updateDraft = (next: StrategySchema) => {
    setDraft(next);
    setSchemaError(null);
  };

  const applyJson = () => {
    const parsed = parseJson(jsonText);
    if (!parsed) {
      setJsonError('JSON 格式无效，请检查括号、逗号和字符串引号。');
      return;
    }
    const validated = strategySchemaV1.safeParse(parsed);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      setJsonError(`${issue?.path.join('.') || 'Schema'}：${issue?.message ?? 'Schema 校验失败'}`);
      return;
    }
    const next = normalizeSingleSymbol(validated.data);
    updateDraft(next);
    setJsonText(JSON.stringify(next, null, 2));
    setJsonError(null);
  };

  const submit = () => {
    const validated = strategySchemaV1.safeParse(normalizeSingleSymbol(draft));
    if (!validated.success) {
      const issue = validated.error.issues[0];
      setSchemaError(
        `${issue?.path.join('.') || 'Schema'}：${issue?.message ?? 'Schema 校验失败'}`,
      );
      return;
    }
    onSave(validated.data);
  };

  const updateName = (value: string) => updateDraft(updateRecord(draft, 'name', value));
  const canEditName = mode === 'create';
  let saveButtonLabel = '保存为新版本';
  if (busy) saveButtonLabel = '保存中…';
  else if (mode === 'create') saveButtonLabel = '创建策略';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden sm:max-w-2xl"
        aria-describedby="strategy-editor-description"
      >
        <SheetHeader className="shrink-0 border-b p-6">
          <SheetTitle>
            {mode === 'create' ? '新建策略' : `编辑 ${strategy?.name ?? '策略'} 的新版本`}
          </SheetTitle>
          <SheetDescription id="strategy-editor-description">
            {mode === 'create'
              ? '先保存策略 v1，再从策略库选择版本进行回测。'
              : '保存为新版本，已存在的版本和历史回测不会被覆盖。'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="line" className="mb-6 w-full justify-start">
              <TabsTrigger value="common">常用配置</TabsTrigger>
              <TabsTrigger value="advanced">高级 JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="common" className="mt-0">
              <FieldGroup>
                <Field invalid={Boolean(schemaError && schemaError.startsWith('name'))}>
                  <FieldLabel htmlFor="strategy-name">策略名称</FieldLabel>
                  <Input
                    id="strategy-name"
                    value={name}
                    readOnly={!canEditName}
                    onChange={(event) => updateName(event.target.value)}
                    placeholder="例如：均线突破"
                  />
                  <FieldDescription>
                    {canEditName ? '名称会同步写入 Schema。' : '编辑已有策略时名称保持不变。'}
                  </FieldDescription>
                  {schemaError?.startsWith('name') && <FieldError>{schemaError}</FieldError>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="strategy-description">说明</FieldLabel>
                  <Textarea
                    id="strategy-description"
                    value={typeof draft.description === 'string' ? draft.description : ''}
                    onChange={(event) =>
                      updateDraft(updateRecord(draft, 'description', event.target.value))
                    }
                    rows={3}
                    placeholder="记录这条策略的假设和适用范围"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>状态</FieldLabel>
                    <Select
                      value={typeof draft.status === 'string' ? draft.status : 'draft'}
                      onValueChange={(value) =>
                        value && updateDraft(updateRecord(draft, 'status', value))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {selectLabel(
                            draft.status,
                            {
                              draft: '草稿',
                              active: '启用',
                              archived: '归档',
                            },
                            '草稿',
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="draft">草稿</SelectItem>
                          <SelectItem value="active">启用</SelectItem>
                          <SelectItem value="archived">归档</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="strategy-benchmark">基准</FieldLabel>
                    <Combobox.Root
                      items={benchmarkItems}
                      value={selectedBenchmark}
                      inputValue={benchmarkQuery}
                      autoHighlight
                      filter={null}
                      itemToStringLabel={(option) => option.label}
                      itemToStringValue={(option) => option.value}
                      onOpenChange={(nextOpen) => {
                        setBenchmarkOpen(nextOpen);
                        if (nextOpen) setBenchmarkQuery('');
                      }}
                      onInputValueChange={(value) => setBenchmarkQuery(value)}
                      onValueChange={(option) => {
                        if (option) {
                          updateDraft(updateRecord(draft, 'benchmark', option.value));
                          setBenchmarkOpen(false);
                          setBenchmarkQuery(option.label);
                        }
                      }}
                    >
                      <InputGroup className="h-9" aria-busy={benchmarkSearchBusy}>
                        <Combobox.Input
                          id="strategy-benchmark"
                          data-slot="input-group-control"
                          className="h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2.5 py-2 pr-1 text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0"
                          placeholder="搜索标的名称或代码"
                          aria-label="搜索基准"
                          aria-busy={benchmarkSearchBusy}
                        />
                        {benchmarkSearchBusy && (
                          <InputGroupAddon align="inline-end">
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                          </InputGroupAddon>
                        )}
                        <InputGroupAddon align="inline-end">
                          <ChevronDownIcon aria-hidden="true" />
                        </InputGroupAddon>
                      </InputGroup>
                      <Combobox.Portal>
                        <Combobox.Positioner
                          className="layer-popover"
                          side="bottom"
                          align="start"
                          sideOffset={4}
                        >
                          <Combobox.Popup
                            aria-label="基准选项"
                            className="w-(--anchor-width) overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
                          >
                            <Combobox.List className="max-h-72 overflow-auto p-1">
                              {benchmarkSearchBusy && (
                                <Combobox.Status className="px-3 py-2 text-sm text-muted-foreground">
                                  正在搜索标的…
                                </Combobox.Status>
                              )}
                              {!benchmarkSearchBusy &&
                                benchmarkSearchActive &&
                                benchmarkSearch.isError && (
                                  <Combobox.Status className="px-3 py-2 text-sm text-destructive">
                                    标的搜索失败，请稍后重试。
                                  </Combobox.Status>
                                )}
                              <Combobox.Group>
                                {benchmarkItems.map((option, index) => (
                                  <Combobox.Item
                                    key={option.value}
                                    value={option}
                                    index={index}
                                    className="relative flex w-full cursor-default items-center rounded-sm px-3 py-2 pr-9 text-left text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                                  >
                                    <span className="truncate">
                                      {option.label}（{option.value}）
                                    </span>
                                    <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                                      <CheckIcon aria-hidden="true" />
                                    </Combobox.ItemIndicator>
                                  </Combobox.Item>
                                ))}
                              </Combobox.Group>
                              {!benchmarkSearchBusy &&
                                !benchmarkSearch.isError &&
                                benchmarkSearchActive &&
                                benchmarkItems.length === 0 && (
                                  <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground">
                                    没有匹配的标的
                                  </Combobox.Empty>
                                )}
                            </Combobox.List>
                          </Combobox.Popup>
                        </Combobox.Positioner>
                      </Combobox.Portal>
                    </Combobox.Root>
                    <FieldDescription>
                      打开时默认展示常用指数；输入名称或代码可搜索已同步目录中的全部标的。
                    </FieldDescription>
                  </Field>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold">标的范围</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    每条策略只配置一个标的，回测将使用当前选中的标的。
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="strategy-symbol-search">标的</FieldLabel>
                  <Combobox.Root<BenchmarkOption>
                    items={symbolItems}
                    value={selectedSymbolOption}
                    inputValue={symbolQuery}
                    autoHighlight
                    filter={null}
                    isItemEqualToValue={(item, value) => item.value === value.value}
                    itemToStringLabel={(option) => option.label}
                    itemToStringValue={(option) => option.value}
                    onOpenChange={(nextOpen) => {
                      setSymbolOpen(nextOpen);
                      setSymbolQuery('');
                    }}
                    onInputValueChange={(value) => setSymbolQuery(value)}
                    onValueChange={(option) => {
                      updateDraft(
                        updateNested(draft, 'universe', 'symbols', option ? [option.value] : []),
                      );
                      setSymbolOpen(false);
                      setSymbolQuery('');
                    }}
                  >
                    <InputGroup className="h-9" aria-busy={symbolSearchBusy}>
                      <Combobox.Input
                        id="strategy-symbol-search"
                        data-slot="input-group-control"
                        className="h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2.5 py-2 text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0"
                        placeholder="搜索并选择标的"
                        aria-label="搜索并选择标的"
                        aria-busy={symbolSearchBusy}
                      />
                      {symbolSearchBusy && (
                        <InputGroupAddon align="inline-end">
                          <LoaderCircle className="animate-spin" aria-hidden="true" />
                        </InputGroupAddon>
                      )}
                      <InputGroupAddon align="inline-end">
                        <SearchIcon aria-hidden="true" />
                      </InputGroupAddon>
                    </InputGroup>
                    <Combobox.Portal>
                      <Combobox.Positioner
                        className="layer-popover"
                        side="bottom"
                        align="start"
                        sideOffset={4}
                      >
                        <Combobox.Popup
                          aria-label="标的搜索结果"
                          className="w-(--anchor-width) overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
                        >
                          <Combobox.List className="max-h-72 overflow-auto p-1">
                            {!symbolSearchActive && (
                              <Combobox.Status className="px-3 py-2 text-sm text-muted-foreground">
                                输入名称或代码开始搜索
                              </Combobox.Status>
                            )}
                            {symbolSearchBusy && (
                              <Combobox.Status className="px-3 py-2 text-sm text-muted-foreground">
                                正在搜索标的…
                              </Combobox.Status>
                            )}
                            {!symbolSearchBusy && symbolSearchActive && symbolSearch.isError && (
                              <Combobox.Status className="px-3 py-2 text-sm text-destructive">
                                标的搜索失败，请稍后重试。
                              </Combobox.Status>
                            )}
                            <Combobox.Group>
                              {symbolItems.map((option, index) => (
                                <Combobox.Item
                                  key={option.value}
                                  value={option}
                                  index={index}
                                  className="relative flex w-full cursor-default items-center rounded-sm px-3 py-2 pr-9 text-left text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                                >
                                  <span className="truncate">
                                    {option.label}（{option.value}）
                                  </span>
                                  <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                                    <CheckIcon aria-hidden="true" />
                                  </Combobox.ItemIndicator>
                                </Combobox.Item>
                              ))}
                            </Combobox.Group>
                            {!symbolSearchBusy &&
                              !symbolSearch.isError &&
                              symbolSearchActive &&
                              symbolItems.length === 0 && (
                                <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground">
                                  没有匹配的标的
                                </Combobox.Empty>
                              )}
                          </Combobox.List>
                        </Combobox.Popup>
                      </Combobox.Positioner>
                    </Combobox.Portal>
                  </Combobox.Root>
                  <FieldDescription>输入名称或代码搜索并选择标的。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="strategy-as-of">数据时点</FieldLabel>
                  <Input
                    id="strategy-as-of"
                    type="datetime-local"
                    value={toDateTimeLocal(universe.asOf)}
                    onChange={(event) =>
                      updateDraft(
                        updateNested(draft, 'universe', 'asOf', toIsoDateTime(event.target.value)),
                      )
                    }
                  />
                </Field>
                <Separator />
                <SignalEditor
                  label="入场信号"
                  signals={entrySignals}
                  onChange={(index, field, value) =>
                    updateDraft(updateSignal(draft, 'entrySignals', index, field, value))
                  }
                  onAdd={() =>
                    updateDraft(
                      updateRecord(draft, 'entrySignals', [
                        ...entrySignals,
                        { indicator: 'close', operator: 'gt', value: 0 },
                      ]),
                    )
                  }
                  onRemove={(index) =>
                    updateDraft(
                      updateRecord(
                        draft,
                        'entrySignals',
                        entrySignals.filter((_, signalIndex) => signalIndex !== index),
                      ),
                    )
                  }
                />
                <SignalEditor
                  label="离场信号"
                  signals={exitSignals}
                  onChange={(index, field, value) =>
                    updateDraft(updateSignal(draft, 'exitSignals', index, field, value))
                  }
                  onAdd={() =>
                    updateDraft(
                      updateRecord(draft, 'exitSignals', [
                        ...exitSignals,
                        { indicator: 'close', operator: 'lt', value: 0 },
                      ]),
                    )
                  }
                  onRemove={(index) =>
                    updateDraft(
                      updateRecord(
                        draft,
                        'exitSignals',
                        exitSignals.filter((_, signalIndex) => signalIndex !== index),
                      ),
                    )
                  }
                />
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold">风险与执行</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NestedNumberField
                    label="止损比例"
                    value={stopLoss.value}
                    onChange={(value) =>
                      updateDraft(updateNested(draft, 'stopLoss', 'value', value))
                    }
                  />
                  <Field>
                    <FieldLabel>止损类型</FieldLabel>
                    <Select
                      value={typeof stopLoss.type === 'string' ? stopLoss.type : 'fixed'}
                      onValueChange={(value) =>
                        value && updateDraft(updateNested(draft, 'stopLoss', 'type', value))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {selectLabel(
                            stopLoss.type,
                            {
                              fixed: '固定比例',
                              trailing: '移动止损',
                              atr: 'ATR',
                            },
                            '固定比例',
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="fixed">固定比例</SelectItem>
                          <SelectItem value="trailing">移动止损</SelectItem>
                          <SelectItem value="atr">ATR</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <NestedNumberField
                    label="仓位数值"
                    value={sizing.value}
                    onChange={(value) => updateDraft(updateNested(draft, 'sizing', 'value', value))}
                  />
                  <Field>
                    <FieldLabel>仓位类型</FieldLabel>
                    <Select
                      value={typeof sizing.type === 'string' ? sizing.type : 'weight'}
                      onValueChange={(value) =>
                        value && updateDraft(updateNested(draft, 'sizing', 'type', value))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {selectLabel(
                            sizing.type,
                            {
                              fixed: '固定数量',
                              weight: '资金权重',
                              risk: '风险预算',
                            },
                            '资金权重',
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="fixed">固定数量</SelectItem>
                          <SelectItem value="weight">资金权重</SelectItem>
                          <SelectItem value="risk">风险预算</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>执行价格</FieldLabel>
                    <Select
                      value={typeof execution.price === 'string' ? execution.price : 'close'}
                      onValueChange={(value) =>
                        value && updateDraft(updateNested(draft, 'execution', 'price', value))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {selectLabel(
                            execution.price,
                            {
                              open: '开盘价',
                              close: '收盘价',
                              nextOpen: '下一交易日开盘',
                            },
                            '收盘价',
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="open">开盘价</SelectItem>
                          <SelectItem value="close">收盘价</SelectItem>
                          <SelectItem value="nextOpen">下一交易日开盘</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <NestedNumberField
                    label="最小交易单位"
                    value={execution.lotSize}
                    integer
                    onChange={(value) =>
                      updateDraft(updateNested(draft, 'execution', 'lotSize', value))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">T+1</p>
                    <p className="text-xs text-muted-foreground">启用后买入当日不可卖出。</p>
                  </div>
                  <Switch
                    checked={execution.tPlusOne === true}
                    variant="risk"
                    onCheckedChange={(checked) =>
                      updateDraft(updateNested(draft, 'execution', 'tPlusOne', Boolean(checked)))
                    }
                  >
                    <SwitchThumb variant="risk" />
                  </Switch>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NestedNumberField
                    label="手续费率"
                    value={cost.commissionRate}
                    step="0.0001"
                    onChange={(value) =>
                      updateDraft(updateNested(draft, 'cost', 'commissionRate', value))
                    }
                  />
                  <NestedNumberField
                    label="最低手续费"
                    value={cost.minimumCommission}
                    onChange={(value) =>
                      updateDraft(updateNested(draft, 'cost', 'minimumCommission', value))
                    }
                  />
                  <NestedNumberField
                    label="印花税率"
                    value={cost.stampDutyRate}
                    step="0.0001"
                    onChange={(value) =>
                      updateDraft(updateNested(draft, 'cost', 'stampDutyRate', value))
                    }
                  />
                  <NestedNumberField
                    label="滑点率"
                    value={cost.slippageRate}
                    step="0.0001"
                    onChange={(value) =>
                      updateDraft(updateNested(draft, 'cost', 'slippageRate', value))
                    }
                  />
                </div>
                <Field>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor="strategy-take-profit">止盈比例</FieldLabel>
                    <Switch
                      id="strategy-take-profit"
                      checked={Boolean(takeProfit.value)}
                      variant="risk"
                      onCheckedChange={(checked) =>
                        updateDraft(
                          checked
                            ? { ...draft, takeProfit: { type: 'fixed', value: 0.2 } }
                            : (() => {
                                const next = { ...draft };
                                delete next.takeProfit;
                                return next;
                              })(),
                        )
                      }
                    >
                      <SwitchThumb variant="risk" />
                    </Switch>
                  </div>
                  {takeProfit.value !== undefined && (
                    <Input
                      type="number"
                      min="0.0001"
                      step="0.01"
                      value={
                        typeof takeProfit.value === 'number' || typeof takeProfit.value === 'string'
                          ? takeProfit.value
                          : ''
                      }
                      onChange={(event) =>
                        updateDraft(
                          updateNested(draft, 'takeProfit', 'value', Number(event.target.value)),
                        )
                      }
                    />
                  )}
                </Field>
              </FieldGroup>
            </TabsContent>
            <TabsContent value="advanced" className="mt-0">
              <Field invalid={Boolean(jsonError)}>
                <FieldLabel htmlFor="strategy-json">Strategy Schema JSON</FieldLabel>
                <Textarea
                  id="strategy-json"
                  value={jsonText}
                  onChange={(event) => {
                    setJsonText(event.target.value);
                    setJsonError(null);
                  }}
                  rows={24}
                  className="font-mono text-xs"
                />
                <FieldDescription>
                  高级字段如 entryCondition、exitCondition、riskConstraints
                  会原样保留。只有点击“应用 JSON”后才会同步到常用配置。
                </FieldDescription>
                {jsonError && <FieldError>{jsonError}</FieldError>}
                <Button type="button" variant="outline" className="self-start" onClick={applyJson}>
                  应用 JSON
                </Button>
              </Field>
            </TabsContent>
          </Tabs>
          {schemaError && !schemaError.startsWith('name') && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {schemaError}
            </p>
          )}
        </div>
        <SheetFooter className="shrink-0 border-t p-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy} onClick={submit}>
            {busy && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {saveButtonLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function NestedNumberField({
  label,
  value,
  integer,
  step = '0.01',
  onChange,
}: {
  label: string;
  value: unknown;
  integer?: boolean;
  step?: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="number"
        min="0"
        step={integer ? '1' : step}
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(event) =>
          onChange(
            integer
              ? Math.max(1, Math.round(Number(event.target.value)))
              : Number(event.target.value),
          )
        }
      />
    </Field>
  );
}

function SignalEditor({
  label,
  signals,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  signals: Signal[];
  onChange: (index: number, field: keyof Signal, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          添加条件
        </Button>
      </div>
      {signals.map((signal, index) => (
        <div
          key={`${label}-${index}`}
          className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <Field>
            <FieldLabel>指标</FieldLabel>
            <Select
              value={signal.indicator}
              onValueChange={(value) => value && onChange(index, 'indicator', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {signalIndicatorLabels[signal.indicator] ??
                    (signal.indicator ? `历史值（${signal.indicator}）` : '请选择指标')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {signalIndicatorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                  {signal.indicator && !signalIndicatorLabels[signal.indicator] && (
                    <SelectItem value={signal.indicator}>历史值（{signal.indicator}）</SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>运算符</FieldLabel>
            <Select
              value={signal.operator}
              onValueChange={(value) => value && onChange(index, 'operator', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {signalOperatorLabels[signal.operator] ?? signal.operator}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="gt">大于</SelectItem>
                  <SelectItem value="gte">大于等于</SelectItem>
                  <SelectItem value="lt">小于</SelectItem>
                  <SelectItem value="lte">小于等于</SelectItem>
                  <SelectItem value="crossesAbove">上穿</SelectItem>
                  <SelectItem value="crossesBelow">下穿</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>值</FieldLabel>
            <Input
              value={String(signal.value)}
              onChange={(event) => onChange(index, 'value', event.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="self-end"
            aria-label={`删除${label} ${index + 1}`}
            onClick={() => onRemove(index)}
            disabled={signals.length <= 1}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
    </section>
  );
}
