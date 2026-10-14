import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { debounce, isEqual } from 'es-toolkit';
import type { AuthoringContent } from '@thesis-ledger/schemas';
import { authoringApi, type AuthoringDraftView } from './authoring.api.js';

export const emptyAuthoringContent: AuthoringContent = {
  title: '',
  description: '',
  questions: [],
  requirements: [],
  runtimeIntents: [],
  removedRequirements: [],
  definitionText: '',
  manualChanges: [],
  confirmation: null,
};
export function useAuthoringDraft(ownerId: string | null, id: string | null) {
  const cache = useQueryClient();
  const key = useMemo(() => ['desktop', 'authoring', ownerId, id] as const, [ownerId, id]);
  const query = useQuery({
    queryKey: key,
    queryFn: () => authoringApi.read(id!),
    enabled: Boolean(ownerId && id),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [content, setContent] = useState<AuthoringContent>(emptyAuthoringContent);
  const [dirty, setDirty] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const local = useRef(content);
  const baseline = useRef<AuthoringDraftView | null>(null);
  const dirtyRef = useRef(false);
  const running = useRef<Promise<AuthoringDraftView | null> | null>(null);
  const update = useMutation({
    mutationFn: ({ revision, content }: { revision: number; content: AuthoringContent }) =>
      authoringApi.update(id!, revision, content),
  });
  const mutateAsync = update.mutateAsync;
  useEffect(() => {
    if (!query.data || dirtyRef.current) return;
    baseline.current = query.data;
    local.current = query.data.content;
    setContent(query.data.content);
  }, [query.data]);
  const flush = useCallback(async (): Promise<AuthoringDraftView | null> => {
    if (running.current) {
      await running.current;
      return flush();
    }
    if (!dirtyRef.current) return baseline.current;
    if (!id || !ownerId || !baseline.current) throw new Error('请读取当前工作区草稿后保存');
    const snapshot = local.current;
    const revision = baseline.current.revision;
    const work = mutateAsync({ revision, content: snapshot })
      .then((saved) => {
        baseline.current = saved;
        cache.setQueryData(key, saved);
        if (isEqual(local.current, snapshot)) {
          local.current = saved.content;
          setContent(saved.content);
          dirtyRef.current = false;
          setDirty(false);
        }
        setFailure(null);
        return saved;
      })
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : '自动保存失败，当前输入已保留');
        throw error;
      })
      .finally(() => {
        running.current = null;
      });
    running.current = work;
    const result = await work;
    if (dirtyRef.current) return flush();
    return result;
  }, [cache, id, key, ownerId, mutateAsync]);
  const delayed = useMemo(
    () =>
      debounce(() => {
        void flush().catch(() => undefined);
      }, 1000),
    [flush],
  );
  useEffect(() => () => delayed.cancel(), [delayed]);
  const edit = (next: AuthoringContent) => {
    local.current = next;
    dirtyRef.current = true;
    setContent(next);
    setDirty(true);
    setFailure(null);
    delayed();
  };
  const reload = async () => {
    if (dirtyRef.current) throw new Error('请先保存当前输入');
    const saved = await authoringApi.read(id!);
    baseline.current = saved;
    local.current = saved.content;
    setContent(saved.content);
    cache.setQueryData(key, saved);
    return saved;
  };
  const useServerContent = async () => {
    if (running.current) throw new Error('请等待当前保存完成');
    delayed.cancel();
    const saved = await authoringApi.read(id!);
    baseline.current = saved;
    local.current = saved.content;
    dirtyRef.current = false;
    setDirty(false);
    setFailure(null);
    setContent(saved.content);
    cache.setQueryData(key, saved);
    return saved;
  };
  return {
    query,
    content,
    edit,
    dirty,
    failure,
    busy: update.isPending,
    flush,
    reload,
    useServerContent,
  };
}
