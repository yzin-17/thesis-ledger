import { authoringStrategyV6Schema, type AuthoringContent } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { strategyVersionSummary } from '../strategy/strategy-version-summary.model.js';
import { StrategyDefinitionFields } from '../strategy/StrategyDefinitionFields.js';
import { editAuthoringDefinition } from './authoring-definition-edit.model.js';

type Parameter = { path: string[]; label: string; value: string | number };
const parameterLabels: Record<string, string> = {
  period: '周期（根）',
  fastPeriod: '快线周期（根）',
  slowPeriod: '慢线周期（根）',
  signalPeriod: '信号线周期（根）',
  value: '常量',
};
function parameters(value: unknown, path: string[] = []): Parameter[] {
  if (!value || typeof value !== 'object') return [];
  const results: Parameter[] = [];
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    const parent = path.at(-1);
    if (
      (parent === 'params' || key === 'value') &&
      (typeof child === 'number' || typeof child === 'string')
    )
      results.push({
        path: next,
        label: `${path[0] === 'entry' ? '入场' : '退出'} · ${parameterLabels[key] ?? '参数'} · ${next.join('.')}`,
        value: child,
      });
    else results.push(...parameters(child, next));
  }
  return results;
}
export function AuthoringDefinition({
  content,
  onChange,
  disabled,
}: {
  content: AuthoringContent;
  onChange: (next: AuthoringContent) => void;
  disabled: boolean;
}) {
  const parsed = authoringStrategyV6Schema.safeParse(content.definitionText);
  const edit = (definitionText: string) =>
    onChange(editAuthoringDefinition(content, definitionText));
  const updateParameter = (path: string[], value: string, previous: string | number) => {
    if (!parsed.success) return;
    const changed = structuredClone(parsed.data) as Record<string, unknown>;
    let current = changed;
    for (const key of path.slice(0, -1)) current = current[key] as Record<string, unknown>;
    current[path.at(-1)!] =
      typeof previous === 'number' && value.trim() && Number.isFinite(Number(value))
        ? Number(value)
        : value;
    edit(JSON.stringify(changed, null, 2));
  };
  let preview = null;
  if (parsed.success) {
    const summary = strategyVersionSummary({ id: 'draft', version: 0, schema: parsed.data });
    if (summary.kind === 'ready') preview = <StrategyDefinitionFields fields={summary.sections} />;
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="text-xl font-semibold">当前实际定义</h3>
      {preview}
      {!content.definitionText && (
        <p className="text-sm text-muted-foreground">
          可在高级定义编辑中补充定义，或返回确认条件重新生成。
        </p>
      )}
      {!parsed.success && content.definitionText && (
        <Alert variant="destructive">
          <AlertTitle>{content.definitionText ? '定义需要修正' : '尚未生成定义'}</AlertTitle>
          <AlertDescription>
            {content.definitionText
              ? parsed.error.issues[0]?.message
              : '完成条件和需求确认后生成草稿。'}
          </AlertDescription>
        </Alert>
      )}
      {parsed.success && parameters(parsed.data).length > 0 && (
        <section className="flex max-w-3xl flex-col gap-4">
          <div>
            <h3 className="text-xl font-semibold">指标参数与常量</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              这里直接编辑当前定义。修改后需重新审核需求和交易条件。
            </p>
          </div>
          <FieldGroup className="grid sm:grid-cols-2">
            {parameters(parsed.data).map((parameter) => (
              <Field key={parameter.label}>
                <FieldLabel>{parameter.label}</FieldLabel>
                <Input
                  aria-label={`编辑 ${parameter.label}`}
                  disabled={disabled}
                  value={parameter.value}
                  onChange={(event) =>
                    updateParameter(parameter.path, event.target.value, parameter.value)
                  }
                />
              </Field>
            ))}
          </FieldGroup>
        </section>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">高级定义编辑</summary>
        <FieldGroup className="mt-3">
          <Field>
            <FieldLabel>策略定义 JSON</FieldLabel>
            <Textarea
              aria-label="策略定义 JSON"
              value={content.definitionText}
              disabled={disabled}
              rows={20}
              maxLength={65536}
              onChange={(event) => edit(event.target.value)}
            />
            <FieldDescription>
              无效文本也会保存到草稿；修正并重新审核后才能保存为正式策略。
            </FieldDescription>
          </Field>
        </FieldGroup>
      </details>
    </div>
  );
}
