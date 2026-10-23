import { useEffect, useRef, useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { draftIsFrozen, rowCanSubmit, reviewedDraftCommand } from '@thesis-ledger/api-client';
import {
  type ImportDraftReviewRecord,
  type ImportDraftRow,
  type SubmitImportDraftRevisionCommand,
} from '@thesis-ledger/schemas';
import type { AccountStackParams } from '../../app/navigation-types';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useLedger, useMobileCommand } from '../../app/query/mobile-queries';
import { assertWritable, canUseReadForWrite } from '../../app/query/query-state';
import { Action, Page, QueryStatus, failureMessage } from '../../components/MobilePrimitives';
import { DraftReviewContent } from './DraftReviewContent';
import { reviewSnapshot } from './review-snapshot';

export function DraftReviewScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'DraftReview'>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((item) => item.id === params.accountId);
  const ledger = useLedger(account?.id ?? null);
  const query = useQuery({
    queryKey: [...scope, 'drafts', params.accountId],
    enabled: Boolean(account),
    queryFn: ({ signal }) => api.imports.getReviews(params.accountId, signal),
  });
  const [opened, setOpened] = useState<ImportDraftReviewRecord | null>(null);
  const [rows, setRows] = useState<ImportDraftRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [awaitingRead, setAwaitingRead] = useState(false);
  const submitting = useRef(false);
  const current = query.data?.find((item) => item.id === params.draftId);
  const adopt = (draft: ImportDraftReviewRecord) => {
    setOpened(draft);
    setRows(draft.review?.rows ?? []);
    setSelected([]);
    setAwaitingRead(false);
  };
  useEffect(() => {
    if (!opened && current) adopt(current);
  }, [opened, current]);
  useEffect(() => {
    if (revision === null && ledger.data) setRevision(ledger.data.ledgerRevision);
  }, [revision, ledger.data]);
  const snapshot = reviewSnapshot(opened, current, rows);
  const dirty = !awaitingRead && snapshot.dirty;
  useDirtyForm(dirty, () => setRows(snapshot.storedRows));
  const save = useMobileCommand(
    async (input: { draft: ImportDraftReviewRecord; rows: ImportDraftRow[] }) => {
      const command = await reviewedDraftCommand(input.draft, input.rows, (value) =>
        Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
      );
      return api.ledger.reviseImportDraft(command);
    },
  );
  const submit = useMobileCommand((command: SubmitImportDraftRevisionCommand) =>
    api.ledger.submitImportDraftRevision(command),
  );
  const busy = save.isPending || submit.isPending;
  const stale = snapshot.stale;
  const blocked =
    busy ||
    awaitingRead ||
    !account?.active ||
    !canUseReadForWrite(accounts) ||
    !canUseReadForWrite(ledger) ||
    !canUseReadForWrite(query) ||
    stale ||
    !revision;
  const refresh = async () => {
    if (dirty && !(await confirmAction('重新读取草稿？', '未保存的人工修改会被清除。'))) return;
    const [drafts, events] = await Promise.all([query.refetch(), ledger.refetch()]);
    const draft = drafts.data?.find((item) => item.id === params.draftId);
    if (!drafts.isError && draft) adopt(draft);
    if (!events.isError && events.data) setRevision(events.data.ledgerRevision);
  };
  const act = async (commit: boolean) => {
    if (blocked || submitting.current || !opened) return;
    submitting.current = true;
    try {
      assertWritable(accounts);
      assertWritable(query);
      assertWritable(ledger);
      if (draftIsFrozen(opened)) throw new Error('当前草稿已冻结或缺少修订。');
      if (commit) {
        if (dirty) throw new Error('请先保存人工修订，再重新选择需要提交的行。');
        if (
          !selected.length ||
          rows.some((row) => selected.includes(row.rowId) && !rowCanSubmit(opened, row))
        )
          throw new Error('请只选择已核对且可提交的持仓行。');
        if (
          opened.review?.scope === 'FULL' &&
          !(await confirmAction(
            '提交完整持仓快照？',
            '本次完整快照中遗漏的标的可能归零。请核对所选行及范围后确认。',
            true,
          ))
        )
          return;
        const result = await submit.mutateAsync({
          command: 'SUBMIT_IMPORT_DRAFT_REVISION',
          draftId: opened.id,
          revision: opened.review!.revision,
          expectedLedgerRevision: revision,
          selectedRowIds: selected,
          actorId: 'mobile-user',
        });
        setSelected([]);
        setAwaitingRead(true);
        setFeedback(result.refreshFailed ? '所选行已提交，数据尚未刷新。' : '所选行已提交账本。');
      } else {
        const result = await save.mutateAsync({ draft: opened, rows });
        setAwaitingRead(true);
        setFeedback(
          result.refreshFailed
            ? '草稿修订已保存，读取尚未恢复，请重新读取。'
            : '草稿修订已保存，请重新选择提交行。',
        );
      }
      const result = await query.refetch();
      const draft = result.data?.find((item) => item.id === params.draftId);
      if (!result.isError && draft) adopt(draft);
    } catch (error) {
      setFeedback(failureMessage(error));
    } finally {
      submitting.current = false;
    }
  };
  const change = (
    rowId: string,
    patch: { symbol?: string; quantity?: string; averageCost?: string },
  ) => {
    setRows((previous) =>
      previous.map((row) =>
        row.rowId === rowId && row.kind === 'POSITION_BASELINE'
          ? { ...row, ...patch, issues: [] }
          : row,
      ),
    );
    setSelected([]);
  };
  return (
    <Page
      title="审核持仓草稿"
      action={<Action label="重新读取" disabled={busy} onPress={() => void refresh()} />}
    >
      <QueryStatus query={query} retry={() => void refresh()} />
      {opened ? (
        <DraftReviewContent
          opened={opened}
          rows={rows}
          selected={selected}
          revision={revision}
          stale={stale && !busy && !awaitingRead}
          blocked={blocked}
          dirty={dirty}
          feedback={feedback}
          hasError={save.isError || submit.isError}
          onChange={change}
          onToggle={(id) =>
            setSelected((values) =>
              values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
            )
          }
          onRemove={(id) => {
            setRows((values) => values.filter((row) => row.rowId !== id));
            setSelected([]);
          }}
          onSave={() => void act(false)}
          onSubmit={() => void act(true)}
        />
      ) : null}
    </Page>
  );
}
