import type { AuthoringModificationTarget } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AuthoringSelect } from './AuthoringSelect.js';
import { AuthoringModelField } from './AuthoringModelField.js';
import { AuthoringSaveReview } from './AuthoringSaveReview.js';
import type { AuthoringEditorModel } from './use-authoring-editor.js';

export function AuthoringInputPanel({ model }: { model: AuthoringEditorModel }) {
  const { content, draft, busy, editing } = model;
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
          placeholder="例如：用日线观察 600519.SH，收盘价上穿 20 日均线时买入，下穿时退出……"
          className="min-h-36"
        />
        <FieldDescription>
          说明标的、买卖时机、仓位、风险和费用；不确定的条件可以在分析后补齐。
        </FieldDescription>
      </Field>
      <AuthoringModelField model={model} kind="analyze" />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!model.controls.analyze} onClick={() => model.submit('analyze')}>
          分析描述
        </Button>
      </div>
    </FieldGroup>
  );
}
export function AuthoringModificationPanel({ model }: { model: AuthoringEditorModel }) {
  const disabled = !model.editing || model.busy || model.active;
  return (
    <details className="border-b pb-5">
      <summary className="cursor-pointer text-sm font-medium">用自然语言局部修改</summary>
      <p className="mt-3 text-xs text-muted-foreground">选择修改范围，生成建议后审核实际差异。</p>
      <FieldGroup className="mt-4">
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
        <AuthoringModelField model={model} kind="modify" />
        <Button
          className="self-start"
          disabled={!model.controls.modify}
          onClick={() => model.submit('modify')}
        >
          生成修改建议
        </Button>
      </FieldGroup>
    </details>
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
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-xl font-semibold">保存为策略 v1</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          先审核当前修订。保存后可从策略库发起回测。
        </p>
      </div>
      <FieldGroup>
        <Button
          className="self-start"
          variant="outline"
          disabled={!canReview}
          onClick={model.reviewCurrent}
        >
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
              className="self-start"
              disabled={busy || active || !model.reviewed || !currentReview}
              onClick={model.save}
            >
              确认保存策略 v1
            </Button>
          </>
        )}
      </FieldGroup>
    </section>
  );
}
