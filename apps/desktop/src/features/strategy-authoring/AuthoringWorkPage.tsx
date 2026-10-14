import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthoringIdentity, useAuthoringIdentity } from './AuthoringIdentity.js';
import { authoringApi } from './authoring.api.js';
import { emptyAuthoringContent } from './use-authoring-draft.js';
import { AuthoringDefinition } from './AuthoringDefinition.js';
import { AuthoringOperation } from './AuthoringOperation.js';
import { useAuthoringEditor } from './use-authoring-editor.js';
import {
  AuthoringInputPanel,
  AuthoringRuleTabs,
  AuthoringModificationPanel,
  AuthoringSavePanel,
} from './AuthoringEditorForms.js';
import { AuthoringEditorStatus, AuthoringEditorHistory } from './AuthoringEditorState.js';

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
    onSuccess: (draft) => {
      const next = new URLSearchParams(params);
      next.set('draft', draft.id);
      setParams(next, { replace: true });
      void drafts.refetch();
    },
  });
  return (
    <div className="flex flex-col gap-5">
      <AuthoringIdentity disabled={editingDirty} />
      {session && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button disabled={create.isPending || editingDirty} onClick={() => create.mutate()}>
              新建编写草稿
            </Button>
            <Button
              variant="outline"
              disabled={editingDirty}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('draft');
                setParams(next);
              }}
            >
              草稿列表
            </Button>
          </div>
          {(create.error || drafts.error) && (
            <Alert variant="destructive">
              <AlertTitle>草稿读取失败</AlertTitle>
              <AlertDescription>{create.error?.message ?? drafts.error?.message}</AlertDescription>
            </Alert>
          )}
          {!id && (
            <div className="flex flex-col gap-3">
              {drafts.isLoading && <Skeleton className="h-24" />}
              {drafts.data?.pages
                .flatMap((page) => page.items)
                .map((draft) => (
                  <Card key={draft.id}>
                    <CardHeader>
                      <CardTitle>{draft.title || '未命名草稿'}</CardTitle>
                      <CardDescription>
                        修订 {draft.revision} · {draft.state === 'editing' ? '编写中' : '已结束'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const next = new URLSearchParams(params);
                          next.set('draft', draft.id);
                          setParams(next);
                        }}
                      >
                        继续查看
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              {drafts.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={drafts.isFetchingNextPage}
                  onClick={() => void drafts.fetchNextPage()}
                >
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

function AuthoringDraftEditor(props: {
  id: string;
  ownerId: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (strategyId: string, versionId: string) => void;
}) {
  const model = useAuthoringEditor(props);
  const { draft, busy, editing, operation } = model;
  if (draft.query.isLoading) return <Skeleton className="h-64" />;
  if (!draft.query.data)
    return (
      <Alert variant="destructive">
        <AlertTitle>无法读取草稿</AlertTitle>
        <AlertDescription>
          {draft.query.error?.message ?? '请确认草稿地址后重新读取'}
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="flex flex-col gap-5">
      <AuthoringEditorStatus model={model} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <AuthoringInputPanel model={model} />
          <AuthoringRuleTabs model={model} />
          <AuthoringModificationPanel model={model} />
        </div>
        <AuthoringDefinition
          content={model.content}
          onChange={draft.edit}
          disabled={!editing || busy}
        />
      </div>
      {operation.data && (
        <AuthoringOperation
          operation={operation.data}
          proposal={model.proposalView}
          busy={busy}
          stale={operation.data.revision !== draft.query.data.revision || draft.dirty}
          onAction={model.applyOperation}
          onProposal={model.applyProposal}
        />
      )}
      <AuthoringEditorHistory model={model} />
      {editing && <AuthoringSavePanel model={model} />}
    </div>
  );
}
