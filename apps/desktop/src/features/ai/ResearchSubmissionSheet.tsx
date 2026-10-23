import type { ResearchSubmissionReceiptV2 } from '@thesis-ledger/schemas';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useOptionalPortfolioMode } from '../portfolio/portfolio-mode-context.js';
import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { useResearchDefaultModel } from './use-research-default-model.js';
import { ResearchDefaultModelField } from './ResearchDefaultModelField.js';
import { useResearchCapabilitiesQuery } from './research.queries.js';
import { useResearchSubmission } from './use-research-submission.js';
import {
  useResearchDraft,
  researchDraftDirty,
  researchScopeLabels as scopeLabels,
} from './use-research-draft.js';
import { ResearchDraftFields } from './ResearchDraftFields.js';
import { ResearchCreationReadiness, researchCreationReady } from './ResearchCreationReadiness.js';
import { researchStateMeta } from './research-state-display.js';
export function ResearchSubmissionSheet({
  open,
  onOpenChange,
  initialQuestion = '',
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuestion?: string;
  onCreated: (value: ResearchSubmissionReceiptV2) => void;
}) {
  const mode = useOptionalPortfolioMode()?.mode ?? 'actual';
  const capabilities = useResearchCapabilitiesQuery(open);
  const model = useResearchDefaultModel(open);
  const settings = model.query;
  const submission = useResearchSubmission(mode, open, onCreated);
  const state = useResearchDraft(
    open,
    initialQuestion,
    mode,
    !submission.pending,
    capabilities.isError ? [] : (capabilities.data?.scopes ?? []),
  );
  const { draft, selection } = state;
  const canSubmit =
    researchCreationReady(state.valid, settings, capabilities, draft.scope) &&
    model.ready &&
    !submission.busy;
  const close = useDraftCloseGuard({
    open,
    draft: { mode, ...draft },
    dirty: Boolean(submission.pending || model.dirty || researchDraftDirty(draft, initialQuestion)),
    busy: submission.busy || model.saving,
    onOpenChange,
    ...(submission.pending ? {
      confirmation: {
        title: '关闭提交面板？',
        description: '提交结果尚未确认。关闭只收起面板，不会取消任务；原提交标识和输入会保留，重新打开后可找回或原样重试。需要取消任务时，请使用面板中的“取消已提交任务”。',
        confirmLabel: '关闭面板',
        cancelLabel: '继续确认',
        variant: 'default' as const,
      },
    } : {}),
  });
  const submit = () => {
    if (!selection || !canSubmit || !settings.data) return;
    submission.submit({
      version: 2,
      mode,
      scope: selection,
      question: draft.question.trim(),
      ...(draft.templateId ? { templateId: draft.templateId } : {}),
      researchSettingsRevision: settings.data.revision,
    });
  };
  return (
    <Sheet open={open} onOpenChange={(next) => void close(next)}>
      <SheetContent side="right" size="form" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>新建研究</SheetTitle>
          <SheetDescription>
            选择研究对象，准备并固定资料后提交。当前使用{mode === 'shadow' ? '模拟' : '实际'}模式。
          </SheetDescription>
        </SheetHeader>
        <ResearchDefaultModelField
          model={model}
          disabled={submission.busy || Boolean(submission.pending)}
        />
        {submission.pending ? (
          <Alert>
            <AlertTitle>继续确认原提交</AlertTitle>
            <AlertDescription>
              <p>
                {scopeLabels[submission.pending.scope.scope]} · {submission.pending.question}
              </p>
              <p>尚未确认响应，找回或重试会继续使用原提交标识和输入。</p>
            </AlertDescription>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submission.busy}
                onClick={submission.find}
              >
                找回原提交
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submission.busy}
                onClick={submission.retry}
              >
                原样重试
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submission.busy}
                onClick={submission.cancel}
              >
                取消已提交任务
              </Button>
            </div>
          </Alert>
        ) : (
          capabilities.isSuccess && (
            <ResearchDraftFields
              draft={draft}
              onChange={state.update}
              objects={state.objects}
              allowedScopes={capabilities.data?.scopes ?? []}
            />
          )
        )}
        <ResearchCreationReadiness settings={settings} capability={capabilities} />
        {submission.busy && (
          <Alert>
            <AlertTitle>{researchStateMeta.preparing.label}</AlertTitle>
            <AlertDescription>{researchStateMeta.preparing.description}</AlertDescription>
          </Alert>
        )}
        {submission.error && (
          <Alert variant="destructive">
            <AlertTitle>{submission.pending ? '提交尚未确认' : '研究未提交'}</AlertTitle>
            <AlertDescription>{submission.error}</AlertDescription>
          </Alert>
        )}
        <SheetFooter>
          {submission.busy ? (
            <Button type="button" variant="outline" onClick={submission.stopWaiting}>
              停止等待并保留提交标识
            </Button>
          ) : (
            !submission.pending && (
              <Button type="button" disabled={!canSubmit} onClick={submit}>
                准备并提交研究
              </Button>
            )
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
