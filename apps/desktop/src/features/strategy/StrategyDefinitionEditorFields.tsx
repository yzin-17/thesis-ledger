import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  appendStrategyEditorItem,
  changeStrategyEditorVariant,
  editStrategyDefinition,
  strategyDraftRecord,
  strategyDraftValue,
  strategyEditorFields,
  strategyEditorInitial,
  strategyEditorLabels,
  strategyEditorVariant,
  strategyEditorVariants,
  useStrategyExecutionForSource,
  strategyEditorArrayOptions,
  toggleStrategyEditorArrayItem,
  moveStrategyEditorItem,
  type StrategyDefinitionPath,
  type StrategyEditorField,
} from '@thesis-ledger/domain';
import { strategySchema, type InstrumentDirectory } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StrategySchema } from './strategy.types.js';
import { strategyInstrumentLabel } from './strategy-instrument-display.js';
import { strategyTimeframeLabel } from './strategy-display-labels.js';

type Control = {
  draft: StrategySchema;
  instrumentDirectory?: InstrumentDirectory | undefined;
  edit: (path: StrategyDefinitionPath, value: unknown) => void;
  apply: (next: () => StrategySchema) => void;
  issues: { path: PropertyKey[]; message: string }[];
};
const label = (value: string) => strategyEditorLabels[value] ?? value;
const matches = (left: readonly PropertyKey[], right: StrategyDefinitionPath) =>
  left.length === right.length && left.every((key, i) => key === right[i]);

function editorItemTitle(
  fieldLabel: string,
  context: string,
  item: unknown,
  index: number,
  directory: InstrumentDirectory | undefined,
) {
  const row = strategyDraftRecord(item);
  const id = typeof row.id === 'string' && row.id ? ` · ${row.id}` : '';
  const prefix = `${fieldLabel} ${index + 1}${id}`;
  if (context !== 'source') return prefix;
  const { symbol } = strategyDraftRecord(row.asset);
  if (typeof symbol !== 'string' || !symbol.trim()) return prefix;
  const instrument = strategyInstrumentLabel(directory, symbol);
  const period = strategyTimeframeLabel(row.timeframe, '');
  return `${prefix} · ${instrument}${period ? ` / ${period}` : ''}`;
}

export function StrategyDefinitionEditorFields({
  schema,
  instrumentDirectory,
  onChange,
}: {
  schema: StrategySchema;
  instrumentDirectory?: InstrumentDirectory | undefined;
  onChange: (next: StrategySchema) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const parsed = strategySchema.safeParse(schema);
  const apply = (next: () => StrategySchema) => {
    try {
      onChange(next());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '配置修改失败');
    }
  };
  const control: Control = {
    draft: schema,
    instrumentDirectory,
    apply,
    edit: (path, value) => apply(() => editStrategyDefinition(schema, path, value)),
    issues: parsed.success ? [] : parsed.error.issues,
  };
  const known = new Set([
    'schemaVersion',
    'name',
    'description',
    'executionInstrument',
    'primaryTimeframe',
    ...strategyEditorFields('root', schema).map((field) => field.key),
  ]);
  const unknown = Object.fromEntries(Object.entries(schema).filter(([key]) => !known.has(key)));
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {Object.keys(unknown).length > 0 && <UnknownValue value={unknown} />}
      {strategyEditorFields('root', schema).map((field) => (
        <EditorField key={field.key} field={field} path={[field.key]} control={control} />
      ))}
    </div>
  );
}

function EditorGroup({
  title,
  children,
  defaultOpen = true,
  primary = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  primary?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="min-w-0">
      <CollapsibleTrigger
        className={`group flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left font-semibold hover:bg-muted focus-visible:outline-ring ${primary ? 'text-base' : 'text-sm'}`}
      >
        <span className="min-w-0 wrap-anywhere">{title}</span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex min-w-0 flex-col gap-4 px-2 pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function EditorField({
  field,
  path,
  control,
}: {
  field: StrategyEditorField;
  path: StrategyDefinitionPath;
  control: Control;
}) {
  const id = useId();
  const value = strategyDraftValue(control.draft, path);
  const errors = control.issues.filter((issue) => matches(issue.path, path));
  const context = field.context ?? '';
  const remove = field.optional && value !== undefined && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      onClick={() => control.edit(path, undefined)}
    >
      移除{field.label}
    </Button>
  );
  if (field.optional && value === undefined)
    return (
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() =>
          control.edit(path, field.kind === 'object' ? strategyEditorInitial(context) : '')
        }
      >
        添加{field.label}
      </Button>
    );
  if (field.kind === 'boolean')
    return (
      <Field invalid={errors.length > 0}>
        <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
        <Switch
          id={id}
          variant="risk"
          checked={value === true}
          aria-label={field.label}
          aria-invalid={errors.length > 0}
          onCheckedChange={(checked) => control.edit(path, checked)}
        >
          <SwitchThumb variant="risk" />
        </Switch>
        {errors.map((issue, i) => (
          <FieldError key={i}>{issue.message}</FieldError>
        ))}
      </Field>
    );
  if (field.kind === 'object')
    return (
      <EditorGroup title={field.label} primary={path.length === 1}>
        <EditorObject context={context} path={path} control={control} />
        {remove}
        {errors.map((issue, i) => (
          <p key={i} role="alert" className="text-sm text-destructive">
            {issue.message}
          </p>
        ))}
      </EditorGroup>
    );
  if (field.kind === 'array' && (context === 'seriesField' || context === 'requestType'))
    return (
      <Field invalid={errors.length > 0}>
        <FieldLabel>{field.label}</FieldLabel>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {strategyEditorArrayOptions(context).map((option) => {
            const optionId = `${id}-${option}`;
            const labelId = `${optionId}-label`;
            const toggle = () => control.apply(
              () => toggleStrategyEditorArrayItem(control.draft, path, option),
            );
            return (
              <Field key={option}>
                <FieldLabel id={labelId} htmlFor={optionId}
                  className="flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-2 font-normal hover:bg-muted"
                  onClick={(event) => {
                    if (event.target instanceof Element && event.target.closest('[data-slot="checkbox"], input')) return;
                    toggle();
                  }}>
                  <Checkbox id={optionId} aria-labelledby={labelId}
                    checked={Array.isArray(value) && value.includes(option)}
                    onCheckedChange={toggle}
                  />
                  {label(option)}
                </FieldLabel>
              </Field>
            );
          })}
        </div>
        {Array.isArray(value) &&
          value.some((item) => !strategyEditorArrayOptions(context).includes(String(item))) && (
            <UnknownValue value={value} />
          )}
        {errors.map((issue, i) => (
          <FieldError key={i}>{issue.message}</FieldError>
        ))}
      </Field>
    );
  if (field.kind === 'array')
    return (
      <EditorGroup title={field.label} primary={path.length === 1}>
        {Array.isArray(value)
          ? value.map((item, index) => (
              <EditorGroup
                key={index}
                title={editorItemTitle(field.label, context, item, index, control.instrumentDirectory)}
              >
                <EditorObject context={context} path={[...path, index]} control={control} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    onClick={() =>
                      control.apply(() => moveStrategyEditorItem(control.draft, path, index, -1))
                    }
                  >
                    上移{field.label} {index + 1}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === value.length - 1}
                    onClick={() =>
                      control.apply(() => moveStrategyEditorItem(control.draft, path, index, 1))
                    }
                  >
                    下移{field.label} {index + 1}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => control.edit([...path, index], undefined)}
                  >
                    删除{field.label} {index + 1}
                  </Button>
                </div>
              </EditorGroup>
            ))
          : value !== undefined && <UnknownValue value={value} />}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() =>
            control.apply(() => appendStrategyEditorItem(control.draft, path, context))
          }
        >
          添加{field.label}
        </Button>
        {errors.map((issue, i) => (
          <p key={i} role="alert" className="text-sm text-destructive">
            {issue.message}
          </p>
        ))}
      </EditorGroup>
    );
  let choices = field.choices;
  if (field.key === 'sourceId')
    choices = (Array.isArray(control.draft.signalSources) ? control.draft.signalSources : [])
      .map((source) => strategyDraftRecord(source).id)
      .filter(
        (sourceId): sourceId is string => typeof sourceId === 'string' && sourceId.length > 0,
      );
  const stringValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return (
    <Field invalid={errors.length > 0}>
      <FieldLabel htmlFor={id} title={path.join('.')}>
        {field.label}
      </FieldLabel>
      {choices ? (
        <EditorChoice
          id={id}
          value={stringValue}
          values={choices}
          labels={field.choiceLabels}
          onChange={(next) =>
            control.edit(
              path,
              field.kind === 'integer' && /^\d+$/.test(next) && Number.isSafeInteger(Number(next))
                ? Number(next)
                : next,
            )
          }
        />
      ) : (
        <Input
          id={id}
          value={stringValue}
          aria-invalid={errors.length > 0}
          inputMode={field.kind === 'integer' ? 'numeric' : 'text'}
          onChange={(event) => {
            const text = event.target.value;
            control.edit(
              path,
              field.kind === 'integer' && /^\d+$/.test(text) && Number.isSafeInteger(Number(text))
                ? Number(text)
                : text,
            );
          }}
        />
      )}
      {field.help && <FieldDescription>{field.help}</FieldDescription>}
      {errors.map((issue, i) => (
        <FieldError key={i}>{issue.message}</FieldError>
      ))}
      {remove}
    </Field>
  );
}

function EditorChoice({
  id,
  value,
  values,
  onChange,
  labels,
}: {
  id?: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
  labels?: Readonly<Record<string, string>> | undefined;
}) {
  const options = value && !values.includes(value) ? [value, ...values] : values;
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{(labels?.[value] ?? label(value)) || '请选择'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels?.[option] ?? label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditorObject({
  context,
  path,
  control,
}: {
  context: string;
  path: StrategyDefinitionPath;
  control: Control;
}) {
  const value = strategyDraftValue(control.draft, path);
  const row = strategyDraftRecord(value);
  const variants = strategyEditorVariants(context);
  const fields = strategyEditorFields(context, value);
  const discriminator = context === 'execution' ? 'mode' : 'type';
  const known = new Set([
    ...fields.map((field) => field.key),
    discriminator,
    ...(['stop', 'trailing', 'trigger', 'action', 'protectionActivation'].includes(context)
      ? ['kind']
      : []),
  ]);
  const unknown = Object.fromEntries(Object.entries(row).filter(([key]) => !known.has(key)));
  return (
    <>
      {Object.keys(variants).length > 0 && (
        <Field>
          <FieldLabel>规则类型</FieldLabel>
          <EditorChoice
            value={strategyEditorVariant(context, row)}
            values={Object.keys(variants)}
            onChange={(variant) =>
              control.edit(path, changeStrategyEditorVariant(context, row, variant))
            }
          />
        </Field>
      )}
      {context === 'source' && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              control.apply(() =>
                useStrategyExecutionForSource(control.draft, Number(path[1]), 'asset'),
              )
            }
          >
            使用执行标的
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              control.apply(() =>
                useStrategyExecutionForSource(control.draft, Number(path[1]), 'timeframe'),
              )
            }
          >
            使用主周期
          </Button>
        </div>
      )}
      {fields.map((field) => (
        <EditorField key={field.key} field={field} path={[...path, field.key]} control={control} />
      ))}
      {value === undefined && (
        <Button
          type="button"
          variant="outline"
          onClick={() => control.edit(path, strategyEditorInitial(context))}
        >
          补全配置
        </Button>
      )}
      {value !== undefined &&
        (value === null || typeof value !== 'object' || Array.isArray(value)) && (
          <UnknownValue value={value} />
        )}
      {Object.keys(unknown).length > 0 && <UnknownValue value={unknown} />}
    </>
  );
}

function UnknownValue({ value }: { value: unknown }) {
  return (
    <div className="min-w-0 space-y-2 text-sm">
      <p className="text-muted-foreground">未识别的内容已保留，可在高级 JSON 中修正。</p>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap wrap-anywhere">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
