import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ThesisLedgerApiError,
  type CreateTradeOpeningBoundaryAssertionCommandV2,
  type TradeDetailResponseV2,
} from '@thesis-ledger/api-client';
import { useToastManager } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Loader2Icon } from 'lucide-react';
import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { useCreatePortfolioTradeOpeningBoundaryMutation } from './portfolio-trade.mutations.js';

const pad = (value: number) => String(value).padStart(2, '0');

const currentLocalDateTime = () => {
  const value = new Date();
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

const sourceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const commandId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const errorMessage = (error: unknown) => {
  if (error instanceof ThesisLedgerApiError)
    return error.payload?.message ?? '提交失败，请稍后重试。';
  if (error instanceof Error && error.message) return error.message;
  return '提交失败，请稍后重试。';
};

export function PortfolioTradeOpeningBoundarySheet({
  detail,
  open,
  onOpenChange,
}: {
  detail: TradeDetailResponseV2;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toastManager = useToastManager();
  const mutation = useCreatePortfolioTradeOpeningBoundaryMutation();
  const [openingAt, setOpeningAt] = useState('');
  const [reason, setReason] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOpeningAt('');
    setReason('');
    setDirty(false);
    setError(null);
    commandIdRef.current = null;
  }, [detail.id, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOpeningAt('');
      setReason('');
      setDirty(false);
      setError(null);
      commandIdRef.current = null;
    }
    onOpenChange(nextOpen);
  };

  const requestClose = useDraftCloseGuard({
    open,
    draft: null,
    dirty,
    busy: mutation.isPending,
    onOpenChange: handleOpenChange,
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    if (!openingAt) {
      setError('请选择建仓时间。');
      return;
    }
    const parsedOpeningAt = new Date(openingAt);
    if (Number.isNaN(parsedOpeningAt.getTime())) {
      setError('建仓时间格式不正确。');
      return;
    }
    const baseline = detail.baselineComponents.find((component) => component.quantity !== '0');
    if (!baseline) {
      setError('当前交易没有可用于补录的持仓快照，请刷新后重试。');
      return;
    }
    if (!reason.trim()) {
      setError('请填写补录依据。');
      return;
    }

    const clientCommandId = commandIdRef.current ?? commandId();
    commandIdRef.current = clientCommandId;
    const command: CreateTradeOpeningBoundaryAssertionCommandV2 = {
      command: 'CREATE_TRADE_OPENING_BOUNDARY_ASSERTION',
      accountId: detail.accountId,
      occurredAt: parsedOpeningAt.toISOString(),
      timePrecision: 'INSTANT',
      sourceTimezone: sourceTimezone(),
      economicOrderKey: `trade-opening-boundary:${detail.id}:${clientCommandId}`,
      payload: {
        symbol: detail.symbol,
        baselineFactId: baseline.factId,
      },
      source: {
        category: 'MANUAL',
        channel: 'desktop-trade-opening-boundary',
        externalId: clientCommandId,
      },
      actorId: 'desktop-user',
      reason: reason.trim(),
    };

    try {
      const response = await mutation.mutateAsync({ tradeId: detail.id, command });
      toastManager.add({
        title: '建仓时间已补录',
        description: response.idempotentReplay
          ? '这条补录已存在，未重复写入。'
          : '原始持仓快照和成本证据保持不变。',
        type: 'success',
        timeout: 2800,
      });
      handleOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => void requestClose(nextOpen)}>
      <SheetContent side="right" size="compact" className="h-[100dvh] min-h-0 overflow-hidden p-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
          <SheetHeader>
            <SheetTitle>补录建仓时间</SheetTitle>
            <SheetDescription>
              这是用户补录的历史边界，不会生成买入成交；原始持仓快照仍会保留。
            </SheetDescription>
          </SheetHeader>
          <form
            onChangeCapture={() => setDirty(true)}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-6"
            onSubmit={(formEvent) => void submit(formEvent)}
          >
            <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
              <FieldGroup>
                <Field invalid={Boolean(error && !openingAt)}>
                  <FieldLabel htmlFor="trade-opening-boundary-at">建仓时间</FieldLabel>
                  <DateInput
                    id="trade-opening-boundary-at"
                    type="datetime-local"
                    value={openingAt}
                    max={currentLocalDateTime()}
                    step={60}
                    onChange={(inputEvent) => setOpeningAt(inputEvent.target.value)}
                    required
                  />
                  <FieldDescription>精确到分钟；不能晚于当前时间或最早持仓证据。</FieldDescription>
                </Field>
                <Field invalid={Boolean(error && !reason.trim())}>
                  <FieldLabel htmlFor="trade-opening-boundary-reason">补录依据</FieldLabel>
                  <Textarea
                    id="trade-opening-boundary-reason"
                    value={reason}
                    onChange={(inputEvent) => setReason(inputEvent.target.value)}
                    placeholder="例如：券商历史账单显示首次买入时间"
                    rows={4}
                    required
                  />
                  <FieldDescription>请说明时间来自哪一份账单、记录或其他依据。</FieldDescription>
                </Field>
                {error ? (
                  <Field invalid>
                    <FieldError>{error}</FieldError>
                  </Field>
                ) : null}
              </FieldGroup>
            </div>
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => void requestClose(false)}
                disabled={mutation.isPending}
              >
                取消
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : null}
                {mutation.isPending ? '补录中…' : '确认补录'}
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
