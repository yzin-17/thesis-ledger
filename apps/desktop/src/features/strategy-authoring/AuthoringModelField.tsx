import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { AuthoringSelect } from './AuthoringSelect.js';
import type { AuthoringEditorModel } from './use-authoring-editor.js';

export function AuthoringModelField({
  model,
  kind,
}: {
  model: AuthoringEditorModel;
  kind: 'analyze' | 'generate' | 'modify';
}) {
  const { models, selected, busy, active, editing } = model;
  return (
    <>
      <Field>
        <FieldLabel>编写模型</FieldLabel>
        <AuthoringSelect
          label="编写模型"
          value={model.modelKey}
          disabled={!editing || busy || active}
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
          {selected?.pricingLabel ?? '选择模型后发起本次编写调用。'}
        </FieldDescription>
      </Field>
      {models.error && (
        <Alert variant="destructive">
          <AlertTitle>模型配置不可用</AlertTitle>
          <AlertDescription>{models.error.message}</AlertDescription>
        </Alert>
      )}
      {selected && !selected.available[kind] && (
        <Alert>
          <AlertTitle>当前模型尚未验证此用途</AlertTitle>
          <AlertDescription>
            <Link to="/providers">前往 AI 配置</Link>验证编写用途，或选择其他模型。
          </AlertDescription>
        </Alert>
      )}
      {selected?.costUnknown && (
        <Field className="flex-row items-center">
          <Checkbox
            aria-label="确认所选模型费用未知"
            checked={model.costAcknowledged}
            onCheckedChange={(checked) => model.setCostAcknowledged(Boolean(checked))}
            disabled={!editing || busy || active}
          />
          <FieldLabel>我确认所选模型费用未知，仍要发起本次调用</FieldLabel>
        </Field>
      )}
    </>
  );
}
