import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'es-toolkit';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  authoringContentSchema,
  authoringSaveRequestSchema,
  canGenerateAuthoringContent,
  canModifyAuthoringContent,
} from '@thesis-ledger/schemas';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { AuthoringContentFields } from './AuthoringContentFields';
import { AuthoringOperations } from './AuthoringOperations';
type Authoring = ThesisLedgerApiClient['strategy']['authoring'];
type Draft = Awaited<ReturnType<Authoring['read']>>;
type SaveBody = ReturnType<typeof authoringSaveRequestSchema.parse>;
type LocalDraft = { text: string; revision: number; pendingSave: unknown };
async function readLocal(key: string): Promise<LocalDraft | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as LocalDraft;
  if (typeof value.text !== 'string' || !Number.isSafeInteger(value.revision) || value.revision < 1)
    throw Error('本机编写草稿无效。');
  if (value.pendingSave) authoringSaveRequestSchema.parse(value.pendingSave);
  return value;
}
export function AuthoringDraftScreen({ id }: { id: string }) {
  const { api, scope, baseUrl } = useMobileRuntime();
  const key = JSON.stringify(['mobile-authoring-content-v1', baseUrl, id]);
  const query = useQuery({
    queryKey: [...scope, 'authoring-draft', id],
    queryFn: ({ signal }) => api.strategy.authoring.read(id, signal),
    retry: false,
  });
  const local = useQuery({
    queryKey: [...scope, 'authoring-local', id],
    queryFn: () => readLocal(key),
    retry: false,
    staleTime: Infinity,
  });
  return (
    <Page title="编写与审核">
      <QueryStatus query={query} retry={() => void query.refetch()} />
      <QueryStatus query={local} retry={() => void local.refetch()} />
      {query.data && local.isSuccess ? (
        <AuthoringDraftForm key={key} initial={query.data} local={local.data} storageKey={key} />
      ) : null}
    </Page>
  );
}
function useAuthoringDraftController({
  initial,
  local,
  storageKey,
}: {
  initial: Draft;
  local: LocalDraft | null;
  storageKey: string;
}) {
  const { api, scope } = useMobileRuntime();
  const authoring = api.strategy.authoring;
  const cache = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [draft, setDraft] = useState(initial);
  const [text, setText] = useState(local?.text ?? JSON.stringify(initial.content, null, 2));
  const [revision, setRevision] = useState(local?.revision ?? initial.revision);
  const [pendingSave, setPendingSave] = useState<SaveBody | null>(
    local?.pendingSave ? authoringSaveRequestSchema.parse(local.pendingSave) : null,
  );
  const [review, setReview] = useState<Awaited<ReturnType<Authoring['review']>> | null>(null);
  const [reviewed, setReviewed] = useState('no');
  const [receipt, setReceipt] = useState<Awaited<ReturnType<Authoring['save']>> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [operationsBusy, setOperationsBusy] = useState(false);
  let same = false;
  try {
    same =
      isEqual(authoringContentSchema.parse(JSON.parse(text)), draft.content) &&
      revision === draft.revision;
  } catch {
    /* 无效输入保持未保存状态。 */
  }
  const dirty = !same;
  useDirtyForm(dirty, () => {
    setText(JSON.stringify(draft.content, null, 2));
    setRevision(draft.revision);
  });
  const persist = async (nextText = text, nextRevision = revision, body: unknown = pendingSave) =>
    AsyncStorage.setItem(
      storageKey,
      JSON.stringify({ text: nextText, revision: nextRevision, pendingSave: body }),
    );
  const accept = async (next: Draft) => {
    setDraft(next);
    setText(JSON.stringify(next.content, null, 2));
    setRevision(next.revision);
    setReview(null);
    setReviewed('no');
    await AsyncStorage.removeItem(storageKey);
    cache.setQueryData([...scope, 'authoring-draft', draft.id], next);
  };
  const reload = async () => accept(await authoring.read(draft.id));
  const command = useMobileCommand(
    async (action: 'local' | 'update' | 'reload' | 'review' | 'save' | 'discard') => {
      if (action === 'local') {
        await persist();
        setMessage('本机草稿已保存。');
        return;
      }
      if (action === 'reload') {
        if (
          dirty &&
          !(await confirmAction(
            '使用服务端草稿？',
            '这会替换当前输入，请先保存需要保留的本机草稿。',
          ))
        )
          return;
        await reload();
        return;
      }
      if (action === 'update') {
        const content = authoringContentSchema.parse(JSON.parse(text));
        await persist();
        const current = await authoring.read(draft.id);
        if (isEqual(current.content, content)) {
          await accept(current);
          setMessage('当前内容已在服务端，无需重复修订。');
          return;
        }
        if (current.revision !== revision)
          throw Error(`修订冲突：当前服务端为 ${current.revision}，本机输入仍保留。`);
        await accept(await authoring.update(draft.id, revision, content));
        setMessage('草稿已保存。');
        return;
      }
      if (dirty && (action !== 'save' || !pendingSave))
        throw Error('请先保存当前草稿，失败时输入仍保留。');
      if (action === 'discard') {
        if (!(await confirmAction('丢弃编写草稿？', '草稿将进入已丢弃状态，请核对当前草稿名称。')))
          return;
        await accept(await authoring.discardDraft(draft.id, revision));
        setMessage('草稿已丢弃。');
        return;
      }
      if (action === 'review') {
        const next = await authoring.review(draft.id);
        if (next.revision !== revision) throw Error('审核修订已变化，请重新读取。');
        setReview(next);
        setReviewed('no');
        return;
      }
      let body = pendingSave;
      if (!body) {
        if (!review || reviewed !== 'yes' || review.revision !== revision)
          throw Error('请核对本次审核定义并明确确认。');
        body = authoringSaveRequestSchema.parse({
          expectedRevision: revision,
          name: draft.content.title,
          reviewedDefinitionHash: review.definitionHash,
        });
        await persist(text, revision, body);
        setPendingSave(body);
      }
      const saved = await authoring.save(draft.id, body);
      setReceipt(saved);
      setPendingSave(null);
      await reload();
      await cache.invalidateQueries({ queryKey: [...scope, 'strategy-library'] });
      setMessage('正式策略版本已确认保存。');
    },
    { refresh: false },
  );
  const execute = (action: 'local' | 'update' | 'reload' | 'review' | 'save' | 'discard') =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  const locked = command.isPending || operationsBusy || draft.state !== 'editing' || !!pendingSave;
  return {
    draft,
    revision,
    text,
    locked,
    setText,
    setReview,
    setReviewed,
    setReceipt,
    command,
    execute,
    pendingSave,
    dirty,
    reload,
    setOperationsBusy,
    review,
    reviewed,
    message,
    receipt,
    navigation,
  };
}
function AuthoringDraftForm({
  initial,
  local,
  storageKey,
}: {
  initial: Draft;
  local: LocalDraft | null;
  storageKey: string;
}) {
  const state = useAuthoringDraftController({ initial, local, storageKey });
  const {
    draft,
    revision,
    text,
    locked,
    setText,
    setReview,
    setReviewed,
    setReceipt,
    command,
    execute,
    pendingSave,
    dirty,
    reload,
    setOperationsBusy,
    review,
    reviewed,
    message,
    receipt,
    navigation,
  } = state;
  return (
    <>
      <Section title={draft.title || '未命名草稿'}>
        <Copy>
          草稿 {draft.id} · 本机修订 {revision} · 服务端修订 {draft.revision}
        </Copy>
        <Copy>
          {draft.validation.status === 'structurally_valid' ? '定义结构校验通过' : '定义仍需核对'} ·{' '}
          {draft.validation.issues.join('；')}
        </Copy>
      </Section>
      <AuthoringContentFields
        text={text}
        disabled={locked}
        onChange={(value) => {
          setText(value);
          setReview(null);
          setReviewed('no');
          setReceipt(null);
        }}
      />
      <Action
        label="保存编写本机草稿"
        disabled={command.isPending}
        onPress={() => execute('local')}
      />
      <Action label="保存服务端草稿" disabled={locked} onPress={() => execute('update')} />
      <Action
        label="使用服务端草稿"
        disabled={command.isPending || !!pendingSave}
        onPress={() => execute('reload')}
      />
      <AuthoringOperations
        id={draft.id}
        revision={revision}
        generationReady={canGenerateAuthoringContent(draft.content)}
        modificationReady={canModifyAuthoringContent(draft.content)}
        disabled={command.isPending || draft.state !== 'editing' || !!pendingSave || dirty}
        reload={reload}
        onBusyChange={setOperationsBusy}
      />
      <Action
        label="审核完整策略定义"
        disabled={locked || dirty}
        onPress={() => execute('review')}
      />
      {review ? (
        <Section title="保存前审核">
          <Copy>
            修订 {review.revision} · 指纹 {review.definitionHash}
          </Copy>
          <Copy>{JSON.stringify(review.definition, null, 2)}</Copy>
          <Choices
            label="审核确认"
            value={reviewed}
            disabled={locked}
            onChange={setReviewed}
            options={[
              { value: 'no', label: '尚未确认' },
              { value: 'yes', label: '已核对定义并确认保存' },
            ]}
          />
        </Section>
      ) : null}
      {pendingSave ? <Copy>原保存待确认；重试将复用同一修订、名称及审核指纹。</Copy> : null}
      <Action
        label={pendingSave ? '找回原正式保存' : '确认保存正式版本'}
        primary
        disabled={command.isPending || (!pendingSave && (dirty || !review || reviewed !== 'yes'))}
        onPress={() => execute('save')}
      />
      <Action label="丢弃编写草稿" disabled={locked || dirty} onPress={() => execute('discard')} />
      <Feedback message={message} error={command.isError} />
      {receipt ? (
        <Action
          label="打开正式策略版本"
          onPress={() =>
            navigation.navigate('StrategyVersion', {
              strategyId: receipt.strategyId,
              versionId: receipt.versionId,
            })
          }
        />
      ) : null}
    </>
  );
}
