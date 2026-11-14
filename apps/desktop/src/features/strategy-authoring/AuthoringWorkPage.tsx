import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { useCallback, useRef, useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { AuthoringIdentity, useAuthoringIdentity } from './AuthoringIdentity.js';
import { authoringApi } from './authoring.api.js';
import { emptyAuthoringContent } from './use-authoring-draft.js';
import { AuthoringDraftEditor } from './AuthoringDraftEditor.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';

export function AuthoringWorkPage(props: {
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (strategyId: string, versionId: string) => void;
}) {
  const control = useAuthoringWorkPage(props);
  const {
    editingDirty,
    remove,
    session,
    id,
    create,
    params,
    setParams,
    drafts,
    reportDirty,
    onSaved,
  } = control;

  return (
    <div className="flex flex-col gap-5">
      <AuthoringIdentity disabled={editingDirty || remove.isPending} />
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
                  disabled={create.isPending || remove.isPending || editingDirty}
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
          {remove.error && (
            <Alert variant="destructive">
              <AlertTitle>删除草稿失败</AlertTitle>
              <AlertDescription>{remove.error.message}</AlertDescription>
            </Alert>
          )}
          {!id && (
            <div className="flex flex-col gap-3">
              {drafts.isLoading && <LoadingState label="正在读取策略草稿" />}
              <AuthoringDraftList control={control} />
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

function useAuthoringWorkPage({
  onDirtyChange,
  onSaved,
}: {
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (strategyId: string, versionId: string) => void;
}) {
  const session = useAuthoringIdentity();
  const cache = useQueryClient();
  const { confirm } = useConfirmDialog();
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
  const remove = useMutation({
    mutationFn: (draft: { id: string; revision: number }) =>
      authoringApi.discardDraft(draft.id, draft.revision),
    onMutate: () => {
      savedNavigation.current = false;
    },
    onSuccess: (_result, removed) => {
      cache.setQueryData<typeof drafts.data>(
        ['desktop', 'authoring-list', session?.principal.id],
        (current) =>
          current && {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.filter((draft) => draft.id !== removed.id),
            })),
          },
      );
      void drafts.refetch();
    },
  });
  useNavigationGuard({
    dirty: false,
    busy: create.isPending || remove.isPending,
    bypass: () => savedNavigation.current,
  });

  return {
    editingDirty,
    remove,
    session,
    id,
    create,
    params,
    setParams,
    drafts,
    confirm,
    reportDirty,
    onSaved,
  };
}

function AuthoringDraftList({ control }: { control: ReturnType<typeof useAuthoringWorkPage> }) {
  return (
    <>
      <ListRefreshRegion
        refreshing={control.drafts.isRefetching && !!control.drafts.data}
        label="正在刷新策略草稿"
        className="flex flex-col gap-3"
      >
        {control.drafts.data?.pages
          .flatMap((page) => page.items)
          .map((draft) => (
            <div
              key={draft.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="wrap-anywhere text-sm font-medium">{draft.title || '未命名草稿'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  修订 {draft.revision} · {draft.state === 'editing' ? '编写中' : '已结束'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={control.remove.isPending}
                  onClick={() => {
                    const next = new URLSearchParams(control.params);
                    next.set('draft', draft.id);
                    control.setParams(next);
                  }}
                >
                  编辑
                </Button>
                {draft.state === 'editing' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={control.create.isPending || control.remove.isPending}
                    aria-busy={
                      control.remove.isPending && control.remove.variables?.id === draft.id
                    }
                    onClick={() => {
                      void control
                        .confirm({
                          title: '删除这个草稿？',
                          description: `“${draft.title || '未命名草稿'}”将从列表移除，不能继续编辑；已有调用记录保留。`,
                          confirmLabel: '删除草稿',
                          variant: 'destructive',
                        })
                        .then((confirmed) => {
                          if (confirmed) control.remove.mutate(draft);
                        });
                    }}
                  >
                    {control.remove.isPending && control.remove.variables?.id === draft.id && (
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                    )}
                    删除
                  </Button>
                )}
              </div>
            </div>
          ))}
      </ListRefreshRegion>
    </>
  );
}
