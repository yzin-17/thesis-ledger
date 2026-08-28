import { useEffect, useState, type FormEvent } from 'react';
import type { LedgerCommandResponseV2 } from '@thesis-ledger/api-client';
import { useToastManager } from '@/components/ui/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LoaderCircle } from 'lucide-react';

import type { Account, InstrumentLookup } from '../portfolio/portfolio.types.js';
import { InstrumentCombobox } from '../portfolio/InstrumentCombobox.js';
import { useConfirmPortfolioInstrumentMutation } from '../portfolio/portfolio.mutations.js';
import { usePortfolioInstrumentSearch } from '../portfolio/portfolio.instrument-search.js';
import {
  useCreateExecutionMutation,
  useReplaceExecutionMutation,
} from './account-data.mutations.js';
import {
  commandFeedback,
  createClientCommandId,
  currencyLabel,
  dateOnly,
  errorCode,
  errorMessage,
  executionSubmitLabel,
  existingInstrument,
  executionDraft,
  isCurrency,
  isPositiveDecimal,
  sourceTimezone,
  supportedCurrency,
  toCommandTime,
  currencies,
} from './account-data.helpers.js';
import type {
  ChargeDraft,
  ExecutionDraft,
  ExecutionEvent,
  ExecutionSide,
  TimePrecision,
} from './account-data.types.js';

export function ExecutionFormSheet({
  account,
  open,
  editingEvent,
  ledgerRevision,
  onOpenChange,
  onDirtyChange,
}: {
  account: Account;
  open: boolean;
  editingEvent: ExecutionEvent | null;
  ledgerRevision: string;
  onOpenChange: (open: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const toastManager = useToastManager();
  const createMutation = useCreateExecutionMutation();
  const replaceMutation = useReplaceExecutionMutation();
  const confirmInstrumentMutation = useConfirmPortfolioInstrumentMutation();
  const [draft, setDraft] = useState(() => executionDraft(editingEvent, account.currency));
  const [charges, setCharges] = useState<ChargeDraft[]>([]);
  const [instrumentQuery, setInstrumentQuery] = useState(editingEvent?.payload.symbol ?? '');
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentLookup | null>(
    existingInstrument(editingEvent),
  );
  const [manualInstrumentEntry, setManualInstrumentEntry] = useState(false);
  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const instrumentSearch = usePortfolioInstrumentSearch({
    accountType: account.type,
    positionSheetOpen: open,
    editing: null,
    selectedInstrument,
    manualInstrumentEntry,
    instrumentConfirmationBusy: confirmInstrumentMutation.isPending,
    instrumentQuery,
    toastManager,
  });
  const submitting = createMutation.isPending || replaceMutation.isPending;

  useEffect(() => {
    if (!open) return;
    const nextDraft = executionDraft(editingEvent, account.currency);
    setDraft(nextDraft);
    setCharges(
      editingEvent?.payload.charges.map((charge) => ({
        category: charge.category,
        amount: charge.amount,
        currency: supportedCurrency(charge.currency),
        description: charge.description ?? '',
      })) ?? [],
    );
    setInstrumentQuery(editingEvent?.payload.symbol ?? '');
    setSelectedInstrument(existingInstrument(editingEvent));
    setManualInstrumentEntry(false);
    setInstrumentOpen(false);
    setFormError(null);
    setDirty(false);
    onDirtyChange(false);
  }, [account.currency, editingEvent?.eventId, onDirtyChange, open]);

  const updateDraft = <K extends keyof ExecutionDraft>(key: K, value: ExecutionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    onDirtyChange(true);
  };

  const updateDirty = (nextDirty = true) => {
    setDirty(nextDirty);
    onDirtyChange(nextDirty);
  };

  const close = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (dirty && !window.confirm('当前有未保存修改，关闭后会丢弃，继续吗？')) return;
    updateDirty(false);
    onOpenChange(false);
  };

  const confirmInstrument = async (instrument: InstrumentLookup) => {
    try {
      await confirmInstrumentMutation.mutateAsync(instrument.id);
      setSelectedInstrument(instrument);
      setInstrumentQuery(instrument.symbol);
      setInstrumentOpen(false);
      updateDirty(true);
    } catch (error) {
      setFormError(errorMessage(error, '标的确认失败，请检查标的目录。'));
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const symbol = (selectedInstrument?.symbol ?? draft.symbol).trim().toUpperCase();
    if (!symbol) {
      setFormError('请选择或填写标的。');
      return;
    }
    if (!isPositiveDecimal(draft.quantity)) {
      setFormError('数量必须是大于 0 的数字，可保留高精度小数。');
      return;
    }
    if (!isPositiveDecimal(draft.price)) {
      setFormError('价格必须是大于 0 的数字，可保留高精度小数。');
      return;
    }
    if (draft.timePrecision === 'DATE' && !dateOnly(draft.occurredAt)) {
      setFormError('日期精度必须使用 YYYY-MM-DD。');
      return;
    }
    if (draft.timePrecision === 'INSTANT' && Number.isNaN(new Date(draft.occurredAt).getTime())) {
      setFormError('请填写有效的成交时间。');
      return;
    }
    if (draft.settledAt.trim() && Number.isNaN(new Date(draft.settledAt).getTime())) {
      setFormError('请填写有效的结算时间。');
      return;
    }
    const parsedCharges = [];
    for (const charge of charges) {
      if (!charge.amount.trim()) continue;
      if (!isPositiveDecimal(charge.amount)) {
        setFormError('费用金额必须是大于 0 的数字。');
        return;
      }
      parsedCharges.push({
        category: charge.category,
        amount: charge.amount.trim(),
        currency: charge.currency,
        ...(charge.description.trim() ? { description: charge.description.trim() } : {}),
      });
    }
    if (editingEvent && !draft.reason.trim()) {
      setFormError('更正原因必填。');
      return;
    }
    const commandId = createClientCommandId();
    const occurredAt = toCommandTime(draft.occurredAt, draft.timePrecision);
    const payload = {
      symbol,
      quantity: draft.quantity.trim(),
      price: draft.price.trim(),
      currency: draft.currency,
      ...(draft.settledAt.trim() ? { settledAt: new Date(draft.settledAt).toISOString() } : {}),
      capabilityVerification: draft.capabilityVerification,
      charges: parsedCharges,
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    } as const;
    try {
      let response: LedgerCommandResponseV2;
      if (editingEvent) {
        response = await replaceMutation.mutateAsync({
          command: 'REPLACE_EXECUTION',
          accountId: account.id,
          occurredAt,
          timePrecision: draft.timePrecision,
          sourceTimezone: sourceTimezone(),
          economicOrderKey: editingEvent.economicOrderKey,
          side: draft.side,
          payload,
          source: {
            category: 'MANUAL',
            channel: 'desktop-account-data',
            externalId: commandId,
          },
          actorId: 'desktop-user',
          expectedLedgerRevision: ledgerRevision,
          supersedesEventId: editingEvent.eventId,
          reason: draft.reason.trim(),
        });
      } else {
        response = await createMutation.mutateAsync({
          command: 'CREATE_EXECUTION',
          accountId: account.id,
          occurredAt,
          timePrecision: draft.timePrecision,
          sourceTimezone: sourceTimezone(),
          economicOrderKey: `${account.id}:${occurredAt}:${symbol}:${draft.side}:${commandId}`,
          side: draft.side,
          payload,
          source: {
            category: 'MANUAL',
            channel: 'desktop-account-data',
            externalId: commandId,
          },
          actorId: 'desktop-user',
        });
      }
      toastManager.add({
        title: commandFeedback(response, editingEvent ? '成交更正' : '成交'),
        type: 'success',
        timeout: 2800,
      });
      updateDirty(false);
      onOpenChange(false);
    } catch (error) {
      const code = errorCode(error);
      const conflict = code === 'LEDGER_REVISION_CONFLICT';
      setFormError(
        conflict
          ? '账本版本已变化，请刷新并比较后再提交；当前输入已保留。'
          : errorMessage(error, '成交写入失败；当前输入已保留。'),
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side="right"
        className="h-[100dvh] w-[680px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
      >
        <SheetTitle>{editingEvent ? '更正成交' : '录入成交'}</SheetTitle>
        <SheetDescription>
          {editingEvent
            ? '更正会生成新的 REPLACE 版本，原始成交和原因仍可在修正链中审计。'
            : '录入真实 BUY/SELL 事实；提交使用稳定客户端命令 ID，重复重放不会重复写入。'}
        </SheetDescription>
        <form className="mt-4 flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="execution-account">账户</FieldLabel>
              <div
                id="execution-account"
                className="flex min-h-9 items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 text-sm"
              >
                <span className="truncate">{account.name}</span>
                <Badge variant="outline">
                  {account.mode === 'shadow' ? '模拟成交' : '实际成交'}
                </Badge>
              </div>
              <FieldDescription>
                {account.institution || '未填写机构'} · {account.currency} ·{' '}
                {account.type === 'fund' ? '基金账户' : '证券账户'}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>标的</FieldLabel>
              {editingEvent ? (
                <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-muted/30 px-3">
                  <span className="text-sm font-medium">{editingEvent.payload.symbol}</span>
                  <span className="text-xs text-muted-foreground">已确认标的</span>
                </div>
              ) : (
                <InstrumentCombobox
                  manualEntry={manualInstrumentEntry}
                  open={instrumentOpen}
                  query={instrumentQuery}
                  results={instrumentSearch.results}
                  searchState={instrumentSearch.state}
                  selectedInstrument={selectedInstrument}
                  busy={instrumentSearch.busy}
                  onClearSelection={() => {
                    setSelectedInstrument(null);
                    setInstrumentQuery('');
                    updateDirty(true);
                  }}
                  onManualEntry={() => {
                    setManualInstrumentEntry(true);
                    setInstrumentOpen(false);
                    updateDirty(true);
                  }}
                  onOpenChange={setInstrumentOpen}
                  onQueryChange={(value) => {
                    setInstrumentQuery(value.toUpperCase());
                    setSelectedInstrument(null);
                    updateDirty(true);
                  }}
                  onSelect={(instrument) => void confirmInstrument(instrument)}
                  onStartSearch={() => {
                    if (instrumentQuery.trim()) setInstrumentOpen(true);
                  }}
                />
              )}
              {editingEvent && (
                <input type="hidden" name="symbol" value={editingEvent.payload.symbol} />
              )}
            </Field>
            <Field>
              <FieldLabel>方向</FieldLabel>
              <ToggleGroup
                value={[draft.side]}
                aria-label="成交方向"
                onValueChange={(value) => {
                  const next = value[0] as ExecutionSide | undefined;
                  if (next) updateDraft('side', next);
                }}
              >
                <ToggleGroupItem value="BUY">买入 BUY</ToggleGroupItem>
                <ToggleGroupItem value="SELL">卖出 SELL</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="execution-quantity">数量</FieldLabel>
                <Input
                  id="execution-quantity"
                  inputMode="decimal"
                  value={draft.quantity}
                  onChange={(event) => updateDraft('quantity', event.target.value)}
                  placeholder="例如 100"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="execution-price">价格</FieldLabel>
                <Input
                  id="execution-price"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(event) => updateDraft('price', event.target.value)}
                  placeholder="例如 12.3456"
                  required
                />
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor="execution-currency">成交币种</FieldLabel>
              <Select
                value={draft.currency}
                onValueChange={(value) => {
                  if (isCurrency(value)) updateDraft('currency', value);
                }}
              >
                <SelectTrigger id="execution-currency" className="w-full">
                  <SelectValue>{currencyLabel(draft.currency)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {currencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currencyLabel(currency)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)]">
              <Field>
                <FieldLabel htmlFor="execution-occurred-at">成交时间</FieldLabel>
                <Input
                  id="execution-occurred-at"
                  type={draft.timePrecision === 'DATE' ? 'date' : 'datetime-local'}
                  value={draft.occurredAt}
                  onChange={(event) => updateDraft('occurredAt', event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>时间精度</FieldLabel>
                <Select
                  value={draft.timePrecision}
                  onValueChange={(value) => {
                    const next = value as TimePrecision;
                    if (next === draft.timePrecision) return;
                    updateDraft('timePrecision', next);
                    if (next === 'DATE') updateDraft('occurredAt', draft.occurredAt.slice(0, 10));
                    else updateDraft('occurredAt', '');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {draft.timePrecision === 'DATE' ? '仅日期' : '精确时间'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="INSTANT">精确时间</SelectItem>
                      <SelectItem value="DATE">仅日期</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor="execution-settled-at">结算时间（可选）</FieldLabel>
              <Input
                id="execution-settled-at"
                type="datetime-local"
                value={draft.settledAt}
                onChange={(event) => updateDraft('settledAt', event.target.value)}
              />
              <FieldDescription>未填写时不推测待结算状态。</FieldDescription>
            </Field>
          </FieldGroup>
          <Alert>
            <AlertTitle>交易规则未验证</AlertTitle>
            <AlertDescription>
              当前能力元数据未验证，系统仅执行通用的高精度数量和价格校验。
            </AlertDescription>
          </Alert>
          <FieldGroup className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="m-0 text-sm font-semibold">费用明细</h3>
                <p className="m-0 mt-1 text-xs text-muted-foreground">
                  没有费用时可以留空；每行金额必须大于 0。
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setCharges((current) => [
                    ...current,
                    {
                      category: 'COMMISSION',
                      amount: '',
                      currency: draft.currency,
                      description: '',
                    },
                  ]);
                  updateDirty(true);
                }}
              >
                添加费用
              </Button>
            </div>
            {charges.length === 0 && (
              <p className="m-0 text-xs text-muted-foreground">暂无费用明细</p>
            )}
            {charges.map((charge, index) => (
              <FieldGroup
                key={`${index}-${charge.category}`}
                className="grid gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <Field>
                  <FieldLabel htmlFor={`charge-category-${index}`}>类别</FieldLabel>
                  <Select
                    value={charge.category}
                    onValueChange={(value) => {
                      setCharges((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, category: value as ChargeDraft['category'] }
                            : item,
                        ),
                      );
                      updateDirty(true);
                    }}
                  >
                    <SelectTrigger id={`charge-category-${index}`} className="w-full">
                      <SelectValue>{charge.category}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {['COMMISSION', 'TAX', 'LEVY', 'EXCHANGE', 'REGULATORY', 'OTHER'].map(
                          (category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ),
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`charge-amount-${index}`}>金额</FieldLabel>
                  <Input
                    id={`charge-amount-${index}`}
                    inputMode="decimal"
                    value={charge.amount}
                    onChange={(event) => {
                      setCharges((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, amount: event.target.value } : item,
                        ),
                      );
                      updateDirty(true);
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`charge-currency-${index}`}>币种</FieldLabel>
                  <Select
                    value={charge.currency}
                    onValueChange={(value) => {
                      if (!isCurrency(value)) return;
                      setCharges((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, currency: value } : item,
                        ),
                      );
                      updateDirty(true);
                    }}
                  >
                    <SelectTrigger id={`charge-currency-${index}`} className="w-full">
                      <SelectValue>{charge.currency}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {currencies.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="justify-end">
                  <FieldLabel className="sr-only" htmlFor={`remove-charge-${index}`}>
                    费用操作
                  </FieldLabel>
                  <Button
                    id={`remove-charge-${index}`}
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`移除第 ${index + 1} 条费用`}
                    onClick={() => {
                      setCharges((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      );
                      updateDirty(true);
                    }}
                  >
                    ×
                  </Button>
                </Field>
                <Field className="sm:col-span-3">
                  <FieldLabel className="sr-only" htmlFor={`charge-description-${index}`}>
                    费用说明
                  </FieldLabel>
                  <Input
                    id={`charge-description-${index}`}
                    aria-label={`第 ${index + 1} 条费用说明`}
                    value={charge.description}
                    placeholder="说明（可选）"
                    onChange={(event) => {
                      setCharges((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, description: event.target.value } : item,
                        ),
                      );
                      updateDirty(true);
                    }}
                  />
                </Field>
              </FieldGroup>
            ))}
          </FieldGroup>
          <FieldGroup>
            {editingEvent && (
              <Field>
                <FieldLabel htmlFor="execution-reason">更正原因</FieldLabel>
                <Textarea
                  id="execution-reason"
                  value={draft.reason}
                  onChange={(event) => updateDraft('reason', event.target.value)}
                  placeholder="说明为什么需要生成新的成交版本"
                  required
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="execution-note">备注（可选）</FieldLabel>
              <Textarea
                id="execution-note"
                value={draft.note}
                onChange={(event) => updateDraft('note', event.target.value)}
                placeholder="记录来源、人工判断或其他上下文"
              />
            </Field>
          </FieldGroup>
          {formError && <FieldError>{formError}</FieldError>}
          <div className="flex flex-col gap-4">
            <Separator />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting} aria-busy={submitting}>
                {submitting && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {executionSubmitLabel(submitting, Boolean(editingEvent))}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
