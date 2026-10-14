import { Link } from 'react-router';
import type { AuthoringModificationTarget } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AuthoringConfirmation } from './AuthoringConfirmation.js';
import { AuthoringClarification } from './AuthoringClarification.js';
import { AuthoringSelect } from './AuthoringSelect.js';
import { AuthoringSaveReview } from './AuthoringSaveReview.js';
import type { AuthoringEditorModel } from './use-authoring-editor.js';

export function AuthoringInputPanel({ model }: { model: AuthoringEditorModel }) {
  const { content, draft, busy, active, editing, models, selected } = model;
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>策略名称</FieldLabel>
        <Input
          aria-label="策略名称"
          disabled={!editing || busy}
          value={content.title}
          onChange={(event) => draft.edit({ ...content, title: event.target.value })}
          maxLength={200}
        />
      </Field>
      <Field>
        <FieldLabel>描述你的策略</FieldLabel>
        <Textarea
          aria-label="描述你的策略"
          disabled={!editing || busy}
          value={content.description}
          onChange={(event) => draft.edit({ ...content, description: event.target.value })}
          rows={6}
          maxLength={12000}
          placeholder="写明标的、信号、仓位、退出、风险及执行与费用要求"
        />
      </Field>
      <Field>
        <FieldLabel>编写模型</FieldLabel>
        <AuthoringSelect
          label="编写模型"
          value={model.modelKey}
          disabled={busy || active}
          onChange={(value) => {
            model.setModelKey(value);
            model.setCostAcknowledged(false);
          }}
          options={(models.data ?? []).map((item) => ({
            value: item.key,
            label: `${item.providerId} / ${item.model} · ${item.pricingLabel}`,
          }))}
        />
        <FieldDescription>
          {selected?.pricingLabel ?? '请明确选择模型；不会自动回退到研究用途。'}
        </FieldDescription>
      </Field>
      {models.error && (
        <Alert variant="destructive">
          <AlertTitle>模型配置不可用</AlertTitle>
          <AlertDescription>{models.error.message}</AlertDescription>
        </Alert>
      )}
      {selected && !selected.available.analyze && (
        <Alert>
          <AlertTitle>当前模型未验证编写用途</AlertTitle>
          <AlertDescription>
            <Link to="/providers">前往 AI 配置</Link>验证分析、生成和修改用途。
          </AlertDescription>
        </Alert>
      )}
      {selected?.costUnknown && (
        <Field className="flex-row items-center">
          <Checkbox
            aria-label="确认所选模型费用未知"
            checked={model.costAcknowledged}
            onCheckedChange={(checked) => model.setCostAcknowledged(Boolean(checked))}
            disabled={busy || active}
          />
          <FieldLabel>我确认所选模型费用未知，仍要发起本次调用</FieldLabel>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!model.controls.analyze} onClick={() => model.submit('analyze')}>
          分析描述
        </Button>
        <Button disabled={!model.controls.generate} onClick={() => model.submit('generate')}>
          生成草稿
        </Button>
      </div>
    </FieldGroup>
  );
}
export function AuthoringRuleTabs({ model }: { model: AuthoringEditorModel }) {
  const disabled = !model.editing || model.busy;
  return (
    <Tabs defaultValue="clarification">
      <TabsList variant="line" className="flex-wrap">
        <TabsTrigger value="clarification">问题与需求</TabsTrigger>
        <TabsTrigger value="confirmation">交易条件</TabsTrigger>
      </TabsList>
      <TabsContent value="clarification">
        <AuthoringClarification
          content={model.content}
          onChange={model.draft.edit}
          disabled={disabled}
        />
      </TabsContent>
      <TabsContent value="confirmation">
        <AuthoringConfirmation
          content={model.content}
          onChange={model.draft.edit}
          disabled={disabled}
        />
      </TabsContent>
    </Tabs>
  );
}
export function AuthoringModificationPanel({ model }: { model: AuthoringEditorModel }) {
  const disabled = !model.editing || model.busy || model.active;
  return (
    <Card>
      <CardHeader>
        <CardTitle>自然语言局部修改</CardTitle>
        <CardDescription>
          先选定唯一范围，再审核实际差异。固定止损填写一个明确百分比。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>修改范围</FieldLabel>
            <AuthoringSelect
              label="修改范围"
              value={model.target}
              onChange={(value) => model.setTarget(value as AuthoringModificationTarget)}
              disabled={disabled}
              options={[
                { value: 'risk', label: '固定止损' },
                { value: 'entry', label: '入场规则' },
                { value: 'exit', label: '退出规则' },
                { value: 'sizing', label: '仓位' },
                { value: 'cost', label: '交易成本' },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel>修改想法</FieldLabel>
            <Textarea
              aria-label="修改想法"
              disabled={disabled}
              value={model.intent}
              onChange={(event) => model.setIntent(event.target.value)}
              placeholder="止损改为 3%，其他不变"
            />
          </Field>
          <Button disabled={!model.controls.modify} onClick={() => model.submit('modify')}>
            生成修改建议
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
export function AuthoringSavePanel({ model }: { model: AuthoringEditorModel }) {
  const { review, draft, busy, active, content } = model;
  const currentReview = Boolean(
    review && !draft.dirty && review.revision === draft.query.data?.revision,
  );
  const canReview =
    !busy &&
    !active &&
    model.generationReady &&
    Boolean(content.definitionText) &&
    Boolean(content.title.trim());
  return (
    <Card>
      <CardHeader>
        <CardTitle>确认保存为策略 v1</CardTitle>
        <CardDescription>请逐项审核当前实际定义。保存后由你主动发起回测。</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Button variant="outline" disabled={!canReview} onClick={model.reviewCurrent}>
            审核当前修订
          </Button>
          {review && (
            <>
              <AuthoringSaveReview definition={review.definition} revision={review.revision} />
              <Field className="flex-row items-center">
                <Checkbox
                  aria-label="确认已审核当前实际定义"
                  checked={model.reviewed}
                  disabled={busy || !currentReview}
                  onCheckedChange={(checked) => model.setReviewed(Boolean(checked))}
                />
                <FieldLabel>我已审核当前定义、需求覆盖和交易条件</FieldLabel>
              </Field>
              <Button
                disabled={busy || active || !model.reviewed || !currentReview}
                onClick={model.save}
              >
                确认保存策略 v1
              </Button>
            </>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
