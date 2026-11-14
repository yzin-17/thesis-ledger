import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LoaderCircle } from 'lucide-react';
import { researchQuestionTemplates } from './ai.templates.js';
import type { AiResearchScope, AiRunResult } from './ai.types.js';
import {
  NewResearchAccountField,
  NewResearchPositionFields,
  NewResearchReadBoundary,
  NewResearchStrategyField,
} from './NewResearchObjectFields.js';
import { ResearchDefaultModelField } from './ResearchDefaultModelField.js';
import { useNewResearchSheet } from './use-new-research-sheet.js';

const scopeOptions: Array<{ value: AiResearchScope; label: string }> = [
  { value: 'portfolio', label: '全组合' },
  { value: 'account', label: '账户' },
  { value: 'position', label: '单个持仓' },
  { value: 'strategy', label: '策略版本' },
];

export function NewResearchSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuestion?: string | undefined;
  retryOfRunId?: string | undefined;
  onCreated: (run: AiRunResult) => void;
}) {
  const control = useNewResearchSheet(props);
  const {
    open,
    requestClose,
    retryOfRunId,
    researchModel,
    mutation,
    scope,
    handleScopeChange,
    visibleQuestionError,
    question,
    setQuestion,
    templateId,
    setTemplateId,
    retryPrefillQuery,
    retryConfirmed,
    setRetryConfirmed,
    unknownRiskConfirmed,
    setUnknownRiskConfirmed,
    submitError,
    submit,
    canSubmitWithDefault,
    submitLabel,
  } = control;
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => void requestClose(nextOpen)}>
      <SheetContent side="right" size="form" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{retryOfRunId ? '再次生成研究' : '新建研究'}</SheetTitle>
          <SheetDescription>
            选择真实研究对象并描述需要回答的问题。研究只读取授权数据，不会修改账本或生成订单。
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6">
          <FieldGroup>
            <ResearchDefaultModelField model={researchModel} disabled={mutation.isPending} />
            <Field>
              <FieldLabel>研究范围</FieldLabel>
              <ToggleGroup
                value={[scope]}
                onValueChange={handleScopeChange}
                aria-label="选择研究范围"
                className="grid grid-cols-2 sm:grid-cols-4"
              >
                {scopeOptions.map((item) => (
                  <ToggleGroupItem key={item.value} value={item.value} className="w-full">
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>账户、持仓和策略研究都会写入精确对象 ID。</FieldDescription>
            </Field>
            <NewResearchAccountField control={control} />
            <NewResearchPositionFields control={control} />
            <NewResearchStrategyField control={control} />
            <Field invalid={Boolean(visibleQuestionError)}>
              <FieldLabel htmlFor="ai-question">研究问题</FieldLabel>
              <Textarea
                id="ai-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={6}
                maxLength={2000}
                placeholder="例如：当前组合最主要的风险是什么？请列出证据、反例和数据缺口。"
                className="font-sans"
                aria-invalid={Boolean(visibleQuestionError)}
              />
              <div className="flex items-center justify-between gap-2">
                <FieldDescription>问题会保存在任务中，后续可从失败任务重试。</FieldDescription>
                <span className="text-xs text-muted-foreground">{question.length}/2000</span>
              </div>
              <FieldError>{visibleQuestionError}</FieldError>
            </Field>
          </FieldGroup>
          <section className="flex flex-col gap-2" aria-labelledby="ai-template-title">
            <div>
              <h2 id="ai-template-title" className="text-sm font-medium">
                常用问题
              </h2>
              <p className="text-xs text-muted-foreground">点击后仍可编辑，不会自动提交。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {researchQuestionTemplates.map((template) => (
                <Button
                  key={template.id}
                  type="button"
                  size="sm"
                  variant={templateId === template.id ? 'secondary' : 'outline'}
                  onClick={() => {
                    setQuestion(template.question);
                    setTemplateId(template.id);
                  }}
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </section>
          <NewResearchReadBoundary control={control} />
          {retryOfRunId && retryPrefillQuery.isPending && (
            <Alert>
              <Spinner aria-hidden="true" />
              <AlertTitle>正在核对来源任务</AlertTitle>
              <AlertDescription>服务端正在确认来源类型、终态和研究对象访问状态。</AlertDescription>
            </Alert>
          )}
          {retryOfRunId && retryPrefillQuery.isError && (
            <Alert variant="destructive">
              <AlertTitle>无法再次生成</AlertTitle>
              <AlertDescription>
                来源任务无效、状态不允许或不可访问。请返回列表重新选择失败任务。
              </AlertDescription>
            </Alert>
          )}
          {retryPrefillQuery.data && (
            <Alert
              variant={
                retryPrefillQuery.data.sourceOutcome === 'unknown' ? 'destructive' : 'default'
              }
            >
              <AlertTitle>
                {retryPrefillQuery.data.sourceOutcome === 'unknown'
                  ? '来源结果状态未知'
                  : '确认再次生成'}
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>新任务会获得独立 ID、执行期限和预算；原任务的结果、计量事实与预留保持不变。</p>
                <div className="flex items-center justify-between gap-3">
                  <span>我已核对预填的问题、研究对象和问题模板</span>
                  <Switch
                    variant="risk"
                    checked={retryConfirmed}
                    onCheckedChange={setRetryConfirmed}
                    aria-label="确认再次生成的预填内容"
                  >
                    <SwitchThumb variant="risk" aria-hidden="true" />
                  </Switch>
                </div>
                {retryPrefillQuery.data.requiresUnknownOutcomeAcknowledgement && (
                  <div className="flex items-center justify-between gap-3">
                    <span>我理解原请求可能仍在外部执行，并确认创建独立的新请求</span>
                    <Switch
                      variant="risk"
                      checked={unknownRiskConfirmed}
                      onCheckedChange={setUnknownRiskConfirmed}
                      aria-label="确认未知外部结果风险"
                    >
                      <SwitchThumb variant="risk" aria-hidden="true" />
                    </Switch>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          {submitError && (
            <Alert variant="destructive">
              <AlertTitle>研究启动失败</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
              <Button type="button" size="sm" variant="outline" onClick={() => void submit()}>
                重试提交
              </Button>
            </Alert>
          )}
        </div>
        <SheetFooter>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmitWithDefault}
            className="w-full"
          >
            {mutation.isPending && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
