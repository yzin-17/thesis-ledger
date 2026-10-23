import { useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  createTradeOpeningBoundaryAssertionCommandSchema,
  type TradeDetailResponse,
} from '@thesis-ledger/schemas';
import { useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Choices,
  Feedback,
  Field,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { ledgerInputTime } from '../accounts/ledger-input-time';
export function OpeningBoundaryForm({ trade }: { trade: TradeDetailResponse }) {
  const { api } = useMobileRuntime();
  const accounts = useAccounts();
  const [baselineFactId, setBaselineFactId] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const prepared = useRef<{ key: string; id: string } | null>(null);
  const reset = () => {
    setBaselineFactId('');
    setOccurredAt('');
    setReason('');
  };
  useDirtyForm(Boolean(baselineFactId || occurredAt || reason), reset);
  const mutation = useMobileCommand(
    (command: ReturnType<typeof createTradeOpeningBoundaryAssertionCommandSchema.parse>) =>
      api.portfolio.createTradeOpeningBoundary(trade.id, command),
  );
  const eligible = trade.baselineComponents.filter((row) => row.occurredAt === null);
  const account = accounts.data?.find((item) => item.id === trade.accountId);
  const submit = async () => {
    if (mutation.isPending || accounts.isError || accounts.isFetching || !account?.active) return;
    try {
      const key = JSON.stringify({ baselineFactId, occurredAt, reason });
      if (prepared.current?.key !== key) prepared.current = { key, id: Crypto.randomUUID() };
      const command = createTradeOpeningBoundaryAssertionCommandSchema.parse({
        command: 'CREATE_TRADE_OPENING_BOUNDARY_ASSERTION',
        accountId: trade.accountId,
        occurredAt: ledgerInputTime(occurredAt, 'INSTANT'),
        timePrecision: 'INSTANT',
        sourceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        economicOrderKey: prepared.current.id,
        payload: { symbol: trade.symbol, baselineFactId },
        source: {
          category: 'MANUAL',
          channel: 'mobile-trade-opening-boundary',
          externalId: prepared.current.id,
        },
        actorId: 'mobile-user',
        reason: reason.trim(),
      });
      const result = await mutation.mutateAsync(command);
      reset();
      setFeedback(result.refreshFailed ? '建仓时间已补录，数据尚未刷新。' : '建仓时间已补录。');
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  if (!eligible.length || trade.openedAt) return null;
  return (
    <Section title="补录建仓时间">
      <Choices
        label="对应持仓快照"
        value={baselineFactId}
        options={eligible.map((row) => ({
          value: row.factId,
          label: `数量 ${row.observedQuantity} · ${row.factId.slice(0, 8)}`,
        }))}
        onChange={setBaselineFactId}
        disabled={mutation.isPending}
      />
      <Field
        label="建仓 ISO 时间（含时区）"
        value={occurredAt}
        onChange={setOccurredAt}
        editable={!mutation.isPending}
      />
      <Field label="补录原因" value={reason} onChange={setReason} editable={!mutation.isPending} />
      <Feedback message={feedback} error={mutation.isError} />
      <Action
        label="确认补录建仓时间"
        disabled={
          mutation.isPending ||
          !baselineFactId ||
          !reason ||
          !occurredAt ||
          accounts.isError ||
          accounts.isFetching ||
          !account?.active
        }
        onPress={() => void submit()}
      />
    </Section>
  );
}
