import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuthoringDraftRecovery } from './AuthoringDraftRecovery.js';
import type { AuthoringEditorModel } from './use-authoring-editor.js';

function saveLabel(model: AuthoringEditorModel) {
  if (model.draft.failure) return '保存失败，输入已保留';
  if (model.draft.busy) return '正在保存…';
  if (model.draft.dirty) return '等待自动保存';
  return '已自动保存';
}
export function AuthoringEditorStatus({ model }: { model: AuthoringEditorModel }) {
  const { draft, busy, editing } = model;
  const failure =
    model.failure ??
    draft.failure ??
    model.history.error?.message ??
    model.operation.error?.message;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">修订 {draft.query.data?.revision}</Badge>
        <span role="status">{saveLabel(model)}</span>
        <Button
          variant="outline"
          disabled={busy || !draft.dirty}
          onClick={() => model.perform.mutate(() => draft.flush())}
        >
          立即保存草稿
        </Button>
      </div>
      <AuthoringDraftRecovery
        content={model.content}
        disabled={busy || model.active}
        onReadLatest={model.readLatest}
        {...(editing ? { onDiscard: model.discardDraft } : {})}
      />
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>操作未完成</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
          {model.submissionUnknown && (
            <Button variant="outline" disabled={busy} onClick={model.recoverSubmission}>
              核对原提交历史
            </Button>
          )}
          {model.submissionUnknown && (
            <Button variant="outline" disabled={busy} onClick={model.replaySubmission}>
              重试原提交
            </Button>
          )}
        </Alert>
      )}
      {!editing && (
        <Alert>
          <AlertTitle>草稿已结束</AlertTitle>
          <AlertDescription>
            {draft.query.data?.state === 'saved'
              ? '正式策略已保存。请从策略库查看对应版本。'
              : '此草稿已丢弃，历史仍可追溯。'}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
export function AuthoringEditorHistory({ model }: { model: AuthoringEditorModel }) {
  const history = model.history.data;
  if (!history || history.length <= 1) return null;
  return (
    <details>
      <summary>最近操作与费用追溯</summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {history.map((item) => (
          <Button
            key={item.id}
            variant="outline"
            size="sm"
            onClick={() => model.selectOperation(item.id)}
          >
            修订 {item.revision} ·{' '}
            {{ analyze: '分析', generate: '生成', modify: '修改' }[item.selection.kind]}
          </Button>
        ))}
      </div>
    </details>
  );
}
