import { useEffect, useMemo, useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { debounce } from 'es-toolkit';
import { CheckIcon, ChevronDownIcon, LoaderCircle, SearchIcon } from 'lucide-react';
import { strategySchemaV1 } from '@thesis-ledger/schemas';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useInstrumentSearchQuery } from '../market-data/market-data.queries.js';
import type { InstrumentResult } from '../market-data/market-data.types.js';
import { schemaFromVersion, schemaName } from './strategy.schema.js';
import { hasUnappliedJson, shouldApplyAdvancedJson } from './strategy.formats.js';
import { StrategyRiskExecutionFields } from './StrategyRiskExecutionFields.js';
import type { StrategyRecord, StrategySchema, StrategyVersion } from './strategy.types.js';

import { SignalEditor, type Signal } from './StrategySignalEditor.js';
export { signalIndicatorOptions } from './StrategySignalEditor.js';
type EditorMode = 'create' | 'edit';

const selectLabel = (value: unknown, labels: Record<string, string>, fallback: string) =>
  typeof value === 'string' ? (labels[value] ?? fallback) : fallback;

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
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
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
      return false;
    }
    const validated = strategySchemaV1.safeParse(parsed);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      setJsonError(`${issue?.path.join('.') || 'Schema'}：${issue?.message ?? 'Schema 校验失败'}`);
      return false;
    }
    const next = normalizeSingleSymbol(validated.data);
    updateDraft(next);
    setJsonText(JSON.stringify(next, null, 2));
    setJsonError(null);
    return true;
  };

  const handleTabChange = (nextTab: string) => {
    if (shouldApplyAdvancedJson(activeTab, nextTab, jsonText, draft) && !applyJson()) return;
    setActiveTab(nextTab);
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    if (
      !nextOpen &&
      (JSON.stringify(draft) !== JSON.stringify(normalizeSingleSymbol(initialSchema)) ||
        (activeTab === 'advanced' && hasUnappliedJson(jsonText, draft)))
    ) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const submit = () => {
    if (activeTab === 'advanced' && !applyJson()) return;
    const candidate = activeTab === 'advanced' ? parseJson(jsonText) : draft;
    const validated = strategySchemaV1.safeParse(
      candidate ? normalizeSingleSymbol(candidate) : draft,
    );
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
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="right"
          size="form"
          className="overflow-hidden"
          aria-describedby="strategy-editor-description"
        >
          <SheetHeader>
            <SheetTitle>
              {mode === 'create' ? '新建策略' : `编辑 ${strategy?.name ?? '策略'} 的新版本`}
            </SheetTitle>
            <SheetDescription id="strategy-editor-description">
              {mode === 'create'
                ? '先保存策略 v1，再从策略库选择版本进行回测。'
                : '保存为新版本，已存在的版本和历史回测不会被覆盖。'}
            </SheetDescription>
          </SheetHeader>
          <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList variant="line" className="mb-6 w-full">
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
                    <DateInput
                      id="strategy-as-of"
                      type="datetime-local"
                      value={toDateTimeLocal(universe.asOf)}
                      onChange={(event) =>
                        updateDraft(
                          updateNested(
                            draft,
                            'universe',
                            'asOf',
                            toIsoDateTime(event.target.value),
                          ),
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
                  <StrategyRiskExecutionFields draft={draft} onChange={updateDraft} />
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
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    onClick={applyJson}
                  >
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
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => handleSheetOpenChange(false)}>
              取消
            </Button>
            <Button type="button" disabled={busy} onClick={submit}>
              {busy && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {saveButtonLabel}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>关闭后，本次修改将丢失。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmCloseOpen(false)}>
              继续编辑
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmCloseOpen(false);
                onOpenChange(false);
              }}
            >
              放弃修改并关闭
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
