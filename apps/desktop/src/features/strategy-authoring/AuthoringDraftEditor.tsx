import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { LoadingState } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthoringClarification } from './AuthoringClarification.js';
import { AuthoringConfirmation } from './AuthoringConfirmation.js';
import { AuthoringDefinition } from './AuthoringDefinition.js';
import {
  AuthoringInputPanel,
  AuthoringModificationPanel,
  AuthoringSavePanel,
} from './AuthoringEditorForms.js';
import { AuthoringEditorStatus, AuthoringEditorHistory } from './AuthoringEditorState.js';
import { AuthoringModelField } from './AuthoringModelField.js';
import { AuthoringOperation } from './AuthoringOperation.js';
import { useAuthoringEditor, type AuthoringEditorModel } from './use-authoring-editor.js';

type Stage = 'describe' | 'confirm' | 'review';

export function AuthoringDraftEditor(props: Parameters<typeof useAuthoringEditor>[0]) {
  const model = useAuthoringEditor(props);
  const { draft } = model;
  if (draft.query.isLoading) return <LoadingState label="正在读取草稿内容" />;
  if (!draft.query.data)
    return (
      <Alert variant="destructive">
        <AlertTitle>无法读取草稿</AlertTitle>
        <AlertDescription>
          {draft.query.error?.message ?? '请确认草稿地址后重新读取'}
        </AlertDescription>
      </Alert>
    );
  return <AuthoringWorkflow model={model} />;
}

export function AuthoringWorkflow({ model }: { model: AuthoringEditorModel }) {
  const { draft, busy, editing, operation, content } = model;
  const hasDefinition = Boolean(content.definitionText.trim());
  const hasAnalysis = content.questions.length > 0 || content.requirements.length > 0;
  let suggested: Stage = 'describe';
  if (hasDefinition) suggested = 'review';
  else if (hasAnalysis) suggested = 'confirm';
  const [stage, setStage] = useState<Stage>(suggested);
  const [reviewReached, setReviewReached] = useState(hasDefinition);
  useEffect(() => {
    if (suggested === 'review') {
      setReviewReached(true);
      setStage('review');
    } else if (suggested === 'confirm') {
      setStage((current) => (current === 'review' ? current : 'confirm'));
    }
  }, [suggested]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <AuthoringEditorStatus model={model} />
      {operation.data && (
        <AuthoringOperation
          operation={operation.data}
          proposal={model.proposalView}
          busy={busy}
          stale={operation.data.revision !== draft.query.data?.revision || draft.dirty}
          onAction={model.applyOperation}
          onProposal={model.applyProposal}
        />
      )}
      <Tabs value={stage} onValueChange={(value) => setStage(value as Stage)}>
        <TabsList variant="line" aria-label="策略编写阶段" className="gap-3 sm:gap-6">
          <TabsTrigger value="describe">1 描述策略</TabsTrigger>
          <TabsTrigger value="confirm">2 确认条件</TabsTrigger>
          <TabsTrigger value="review" disabled={!reviewReached}>
            3 审阅保存
          </TabsTrigger>
        </TabsList>
        <TabsContent value="describe" className="max-w-3xl">
          <AuthoringInputPanel model={model} />
        </TabsContent>
        <TabsContent value="confirm" className="max-w-3xl">
          <AuthoringConditionStep model={model} onDescribe={() => setStage('describe')} />
        </TabsContent>
        <TabsContent value="review" className="flex flex-col gap-6">
          <AuthoringDefinition
            content={content}
            onChange={draft.edit}
            disabled={!editing || busy}
          />
          {editing && (
            <div className="flex max-w-3xl flex-col gap-6">
              <AuthoringModificationPanel model={model} />
              {!model.generationReady && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <p>定义已修改，请重新确认需求和交易条件后再审核。</p>
                  <Button variant="link" size="sm" onClick={() => setStage('confirm')}>
                    前往确认条件
                  </Button>
                </div>
              )}
              <AuthoringSavePanel model={model} />
            </div>
          )}
        </TabsContent>
      </Tabs>
      <AuthoringEditorHistory model={model} />
    </div>
  );
}

function AuthoringConditionStep({
  model,
  onDescribe,
}: {
  model: AuthoringEditorModel;
  onDescribe: () => void;
}) {
  const { content } = model;
  const pendingQuestions = content.questions.filter((q) => q.answerState !== 'confirmed').length;
  const pendingRequirements = content.requirements.filter(
    (r) => r.state === 'unresolved' || r.state === 'unsupported',
  ).length;
  const remaining: string[] = [];
  if (!content.description.trim()) remaining.push('填写策略描述');
  if (!content.requirements.length) remaining.push('先分析描述，取得需求清单');
  if (pendingQuestions) remaining.push(`${pendingQuestions} 个问题待确认`);
  if (pendingRequirements) remaining.push(`${pendingRequirements} 条需求待确认或处理`);
  if (!content.confirmation) remaining.push('确认全部交易条件');
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Tabs defaultValue="clarification">
        <TabsList variant="line">
          <TabsTrigger value="clarification">问题与需求</TabsTrigger>
          <TabsTrigger value="confirmation">交易条件</TabsTrigger>
        </TabsList>
        <TabsContent value="clarification">
          <AuthoringClarification
            content={content}
            onChange={model.draft.edit}
            disabled={!model.editing || model.busy}
          />
        </TabsContent>
        <TabsContent value="confirmation">
          <AuthoringConfirmation
            content={content}
            onChange={model.draft.edit}
            disabled={!model.editing || model.busy}
          />
        </TabsContent>
      </Tabs>
      {model.editing && (
        <FieldGroup className="border-t pt-5">
          <div className="text-xs text-muted-foreground" role="status">
            {remaining.length > 0 && <p>生成前还需：{remaining.join('；')}。</p>}
            {remaining.length === 0 && <p>条件已齐备。生成完成后，确认应用结果即可审阅定义。</p>}
          </div>
          <AuthoringModelField model={model} kind="generate" />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!model.controls.generate} onClick={() => model.submit('generate')}>
              生成草稿
            </Button>
            <Button variant="ghost" onClick={onDescribe}>
              返回描述
            </Button>
          </div>
        </FieldGroup>
      )}
    </div>
  );
}
