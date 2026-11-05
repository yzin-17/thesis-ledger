import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { isEqual } from 'es-toolkit';
import { authoringContentSchema, type AuthoringContent } from '@thesis-ledger/schemas';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { useStrategyLibrary } from '../strategy-library/useStrategyLibrary';
import { AuthoringDraftScreen } from './AuthoringDraftScreen';
type Creation = { content: AuthoringContent; baselineIds: string[] };
export function StrategyAuthoringScreen() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'StrategyAuthoring'>>();
  if (params?.draftId) return <AuthoringDraftScreen id={params.draftId} />;
  return <AuthoringHome versionId={params?.versionId} />;
}
function AuthoringHome({ versionId }: { versionId: string | undefined }) {
  const { api, scope, baseUrl } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const library = useStrategyLibrary();
  const version = library.data?.flatMap((v) => v.versions).find((v) => v.id === versionId);
  const [title, setTitle] = useState('我的编写草稿');
  const [description, setDescription] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const key = JSON.stringify(['mobile-authoring-create-v1', baseUrl]);
  const pending = useQuery({
    queryKey: [...scope, 'authoring-create-pending'],
    queryFn: async (): Promise<Creation | null> => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const value = JSON.parse(raw) as Creation;
      const content = authoringContentSchema.parse(value.content);
      if (
        !Array.isArray(value.baselineIds) ||
        !value.baselineIds.every((v) => typeof v === 'string')
      )
        throw Error('草稿创建基线无效。');
      return { content, baselineIds: value.baselineIds };
    },
    retry: false,
  });
  const list = useInfiniteQuery({
    queryKey: [...scope, 'authoring-list'],
    initialPageParam: undefined as { id: string; updatedAt: string } | undefined,
    queryFn: ({ pageParam, signal }) => api.strategy.authoring.list(pageParam, signal),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    retry: false,
  });
  const source = useQuery({
    queryKey: [...scope, 'authoring-version-source', versionId],
    enabled: !!versionId,
    queryFn: ({ signal }) => api.strategy.authoring.source(versionId!, signal),
    retry: false,
  });
  const command = useMobileCommand(
    async (action: 'create' | 'find') => {
      let entry = pending.data;
      if (action === 'create') {
        if (entry) throw Error('原草稿创建尚未确认，请先找回。');
        if (versionId && !version) throw Error('参考版本不可读，不能创建。');
        const first = await api.strategy.authoring.list();
        let page = first;
        const baselineIds = page.items.map((v) => v.id);
        while (page.nextCursor) {
          page = await api.strategy.authoring.list(page.nextCursor);
          baselineIds.push(...page.items.map((v) => v.id));
        }
        const content: AuthoringContent = {
          title,
          description,
          questions: [],
          requirements: [],
          runtimeIntents: [],
          removedRequirements: [],
          definitionText: version ? JSON.stringify(version.schema, null, 2) : '',
          manualChanges: [],
        };
        authoringContentSchema.parse(content);
        entry = { content, baselineIds };
        await AsyncStorage.setItem(key, JSON.stringify(entry));
        await pending.refetch();
        const created = await api.strategy.authoring.create(content);
        setReceipt(created.id);
      } else {
        if (!entry) throw Error('没有待确认创建。');
        let page = await api.strategy.authoring.list();
        const matches: string[] = [];
        for (;;) {
          for (const row of page.items) {
            if (entry.baselineIds.includes(row.id) || row.title !== entry.content.title) continue;
            const draft = await api.strategy.authoring.read(row.id);
            if (isEqual(draft.content, entry.content)) matches.push(row.id);
          }
          if (!page.nextCursor) break;
          page = await api.strategy.authoring.list(page.nextCursor);
        }
        if (matches.length !== 1) throw Error('尚未找到唯一草稿，保留原创建凭据。');
        setReceipt(matches[0]!);
      }
      await AsyncStorage.removeItem(key);
      await pending.refetch();
      await list.refetch();
      setMessage('草稿已确认，可进入编写。');
    },
    { refresh: false },
  );
  const execute = (action: 'create' | 'find') =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  return (
    <Page title="辅助编写工作区">
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      {versionId ? (
        <Section title="参考版本">
          <Copy>{versionId}</Copy>
          <QueryStatus query={source} retry={() => void source.refetch()} />
          {source.data ? (
            <Copy>
              原编写草稿 {source.data.draftId} · 修订 {source.data.revision}
            </Copy>
          ) : null}
          <Copy muted>新草稿保留参考定义，保存时由服务端返回正式策略与版本身份。</Copy>
        </Section>
      ) : null}
      <Field
        label="新草稿标题"
        value={title}
        editable={!command.isPending && !pending.data}
        onChange={setTitle}
      />
      <Field
        label="新草稿需求"
        value={description}
        multiline
        editable={!command.isPending && !pending.data}
        onChange={setDescription}
      />
      <Action
        label="创建编写草稿"
        disabled={
          command.isPending || !pending.isSuccess || !!pending.data || !!receipt || !title.trim()
        }
        onPress={() => execute('create')}
      />
      {pending.data ? (
        <Action
          label="找回原编写草稿"
          disabled={command.isPending}
          onPress={() => execute('find')}
        />
      ) : null}
      <Feedback message={message} error={command.isError} />
      {receipt ? (
        <Action
          label="进入新编写草稿"
          onPress={() => navigation.navigate('StrategyAuthoring', { draftId: receipt })}
        />
      ) : null}
      <QueryStatus query={list} retry={() => void list.refetch()} />
      {list.data?.pages
        .flatMap((p) => p.items)
        .map((row) => (
          <Section key={row.id} title={row.title || '未命名草稿'}>
            <Copy>
              修订 {row.revision} ·{' '}
              {(
                { editing: '编写中', saved: '已保存', discarded: '已丢弃' } as Record<
                  string,
                  string
                >
              )[row.state] ?? '待核对'}
            </Copy>
            <Action
              label={`打开草稿 ${row.id}`}
              onPress={() => navigation.navigate('StrategyAuthoring', { draftId: row.id })}
            />
          </Section>
        ))}
      {list.hasNextPage ? (
        <Action
          label="更多编写草稿"
          disabled={list.isFetching}
          onPress={() => void list.fetchNextPage()}
        />
      ) : null}
    </Page>
  );
}
