import { authoringStrategySchema, type AuthoringContent } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { strategyVersionSummary } from '../strategy/strategy-version-summary.model.js';
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
  const parsed = authoringStrategySchema.safeParse(content.definitionText);
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
    if (summary.kind === 'ready')
      preview = (
        <div className="grid gap-4 sm:grid-cols-2">
          {summary.sections.map((section) => (
            <Card key={section.label}>
              <CardHeader>
                <CardDescription>{section.label}</CardDescription>
                <CardTitle>{section.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
          <Card>
            <CardHeader>
              <CardDescription>交易成本</CardDescription>
              <CardTitle>
                佣金 {parsed.data.cost.commissionRate} · 滑点 {parsed.data.cost.slippageRate}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      );
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="text-lg font-semibold">当前实际定义</h3>
      {preview}
      {!parsed.success && (
        <Alert variant="destructive">
          <AlertTitle>{content.definitionText ? '定义需要修正' : '尚未生成定义'}</AlertTitle>
          <AlertDescription>
            {content.definitionText
              ? parsed.error.issues[0]?.message
              : '完成条件和需求确认后生成草稿。'}
          </AlertDescription>
        </Alert>
      )}
      {parsed.success && (
        <Card>
          <CardHeader>
            <CardTitle>指标参数与常量</CardTitle>
            <CardDescription>
              这里直接编辑当前定义。修改后需重新审核需求和交易条件。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
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
          </CardContent>
        </Card>
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
