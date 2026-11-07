import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { useCallback, useRef, useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { AuthoringIdentity, useAuthoringIdentity } from './AuthoringIdentity.js';
import { authoringApi } from './authoring.api.js';
import { emptyAuthoringContent } from './use-authoring-draft.js';
import { AuthoringDraftEditor } from './AuthoringDraftEditor.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';

export function AuthoringWorkPage({
  onDirtyChange,
  onSaved,
}: {
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (strategyId: string, versionId: string) => void;
}) {
  const session = useAuthoringIdentity();
  const [params, setParams] = useSearchParams();
  const id = params.get('draft');
  const [editingDirty, setEditingDirty] = useState(false);
  const savedNavigation = useRef(false);
  const reportDirty = useCallback(
    (dirty: boolean) => {
      setEditingDirty(dirty);
      onDirtyChange(dirty);
    },
    [onDirtyChange],
  );
  const drafts = useInfiniteQuery({
    queryKey: ['desktop', 'authoring-list', session?.principal.id],
    queryFn: ({ pageParam }) => authoringApi.list(pageParam),
    initialPageParam: null as Parameters<typeof authoringApi.list>[0],
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(session),
    retry: false,
  });
  const create = useMutation({
    mutationFn: () => authoringApi.create(emptyAuthoringContent),
    onMutate: () => {
      savedNavigation.current = false;
    },
    onSuccess: (draft) => {
      savedNavigation.current = true;
      const next = new URLSearchParams(params);
      next.set('draft', draft.id);
      setParams(next, { replace: true });
      void drafts.refetch();
    },
  });
  useNavigationGuard({
    dirty: false,
    busy: create.isPending,
    bypass: () => savedNavigation.current,
  });
  return (
    <div className="flex flex-col gap-5">
      <AuthoringIdentity disabled={editingDirty} />
      {session && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {!id && (
              <>
                <p className="text-sm text-muted-foreground">
                  描述想法、确认条件，再审阅保存为策略。
                </p>
                <Button
                  aria-busy={create.isPending}
                  disabled={create.isPending || editingDirty}
                  onClick={() => create.mutate()}
                >
                  {create.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                  新建编写草稿
                </Button>
              </>
            )}
            {id && (
              <Button
                variant="ghost"
                size="sm"
                disabled={editingDirty}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete('draft');
                  setParams(next);
                }}
              >
                <ArrowLeftIcon aria-hidden="true" />
                草稿列表
              </Button>
            )}
          </div>
          {(create.error || drafts.error) && (
            <Alert variant="destructive">
              <AlertTitle>草稿读取失败</AlertTitle>
              <AlertDescription>{create.error?.message ?? drafts.error?.message}</AlertDescription>
            </Alert>
          )}
          {!id && (
            <div className="flex flex-col gap-3">
              {drafts.isLoading && <LoadingState label="正在读取策略草稿" />}
              <ListRefreshRegion
                refreshing={drafts.isRefetching && !!drafts.data}
                label="正在刷新策略草稿"
                className="flex flex-col gap-3"
              >
                {drafts.data?.pages
                  .flatMap((page) => page.items)
                  .map((draft) => (
                    <div
                      key={draft.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="wrap-anywhere text-sm font-medium">
                          {draft.title || '未命名草稿'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          修订 {draft.revision} · {draft.state === 'editing' ? '编写中' : '已结束'}
                        </p>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          const next = new URLSearchParams(params);
                          next.set('draft', draft.id);
                          setParams(next);
                        }}
                      >
                        继续查看
                      </Button>
                    </div>
                  ))}
              </ListRefreshRegion>
              {drafts.hasNextPage && (
                <Button
                  aria-busy={drafts.isFetchingNextPage}
                  variant="outline"
                  disabled={drafts.isFetchingNextPage}
                  onClick={() => void drafts.fetchNextPage()}
                >
                  {drafts.isFetchingNextPage && (
                    <Spinner data-icon="inline-start" aria-hidden="true" />
                  )}
                  更多草稿
                </Button>
              )}
            </div>
          )}
          {id && (
            <AuthoringDraftEditor
              key={id}
              id={id}
              ownerId={session.principal.id}
              onDirtyChange={reportDirty}
              onSaved={onSaved}
            />
          )}
        </>
      )}
    </div>
  );
}
