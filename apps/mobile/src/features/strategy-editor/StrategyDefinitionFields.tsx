import { useState } from 'react';
import { Pressable, Text, View, Switch } from 'react-native';
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
  type StrategyDefinitionDraft,
  type StrategyDefinitionPath,
  type StrategyEditorField,
} from '@thesis-ledger/domain';
import { strategySchema } from '@thesis-ledger/schemas';
import { Action, Choices, Copy, Field, Section } from '../../components/MobilePrimitives';
import { useMobileRuntime } from '../../app/MobileRuntime';

type Control = {
  draft: StrategyDefinitionDraft;
  locked: boolean;
  edit: (path: StrategyDefinitionPath, value: unknown) => void;
  apply: (next: () => StrategyDefinitionDraft) => void;
  issues: { path: PropertyKey[]; message: string }[];
};
const label = (value: string) => strategyEditorLabels[value] ?? value;

export function StrategyDefinitionFields({
  definition,
  locked,
  onChange,
}: {
  definition: StrategyDefinitionDraft;
  locked: boolean;
  onChange: (next: StrategyDefinitionDraft) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const parsed = strategySchema.safeParse(definition);
  const apply = (next: () => StrategyDefinitionDraft) => {
    try {
      onChange(next());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '配置修改失败');
    }
  };
  const control: Control = {
    draft: definition,
    locked,
    apply,
    edit: (path, value) => apply(() => editStrategyDefinition(definition, path, value)),
    issues: parsed.success ? [] : parsed.error.issues,
  };
  const known = new Set([
    'schemaVersion',
    'name',
    'description',
    'executionInstrument',
    'primaryTimeframe',
    ...strategyEditorFields('root', definition).map((field) => field.key),
  ]);
  const unknown = Object.fromEntries(Object.entries(definition).filter(([key]) => !known.has(key)));
  return (
    <View style={{ gap: 20 }}>
      {error && <Copy>{error}</Copy>}
      {Object.keys(unknown).length > 0 && <UnknownValue value={unknown} />}
      {strategyEditorFields('root', definition).map((field) => (
        <EditorField key={field.key} field={field} path={[field.key]} control={control} />
      ))}
    </View>
  );
}

function Group({
  title,
  children,
  primary = false,
}: {
  title: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const { theme } = useMobileRuntime();
  return (
    <Section variant="content">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? '收起' : '展开'}${title}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => ({
          minHeight: 44,
          paddingVertical: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          backgroundColor: pressed ? theme.surfaceHover : 'transparent',
        })}
      >
        <Text
          style={{
            flexShrink: 1,
            color: theme.textPrimary,
            fontSize: primary ? 18 : 16,
            fontWeight: primary ? '700' : '600',
          }}
        >
          {title}
        </Text>
        <Text style={{ color: theme.textSecondary }}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open && children}
    </Section>
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
  const value = strategyDraftValue(control.draft, path);
  const context = field.context ?? '';
  const errors = control.issues
    .filter(
      (issue) => issue.path.length === path.length && issue.path.every((key, i) => key === path[i]),
    )
    .map((issue) => issue.message)
    .join('；');
  const remove = field.optional && value !== undefined && (
    <Action
      label={`移除${field.label}`}
      disabled={control.locked}
      onPress={() => control.edit(path, undefined)}
    />
  );
  if (field.optional && value === undefined)
    return (
      <Action
        label={`添加${field.label}`}
        disabled={control.locked}
        onPress={() =>
          control.edit(path, field.kind === 'object' ? strategyEditorInitial(context) : '')
        }
      />
    );
  if (field.kind === 'boolean')
    return (
      <View style={{ gap: 8 }}>
        <Copy>{field.label}</Copy>
        <Switch
          accessibilityLabel={field.label}
          value={value === true}
          disabled={control.locked}
          onValueChange={(checked) => control.edit(path, checked)}
        />
        {errors ? <Copy>{errors}</Copy> : null}
      </View>
    );
  if (field.kind === 'object')
    return (
      <Group title={field.label} primary={path.length === 1}>
        <EditorObject context={context} path={path} control={control} />
        {remove}
        {errors ? <Copy>{errors}</Copy> : null}
      </Group>
    );
  if (field.kind === 'array' && (context === 'seriesField' || context === 'requestType'))
    return <ArrayChoices field={field} path={path} control={control} />;
  if (field.kind === 'array')
    return (
      <Group title={field.label} primary={path.length === 1}>
        {Array.isArray(value)
          ? value.map((item, index) => (
              <Group
                key={index}
                title={`${field.label} ${index + 1}${strategyDraftRecord(item).id ? ` · ${String(strategyDraftRecord(item).id)}` : ''}`}
              >
                <EditorObject context={context} path={[...path, index]} control={control} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Action
                    label={`上移${field.label} ${index + 1}`}
                    disabled={control.locked || index === 0}
                    onPress={() =>
                      control.apply(() => moveStrategyEditorItem(control.draft, path, index, -1))
                    }
                  />
                  <Action
                    label={`下移${field.label} ${index + 1}`}
                    disabled={control.locked || index === value.length - 1}
                    onPress={() =>
                      control.apply(() => moveStrategyEditorItem(control.draft, path, index, 1))
                    }
                  />
                </View>
                <Action
                  label={`删除${field.label} ${index + 1}`}
                  disabled={control.locked}
                  onPress={() => control.edit([...path, index], undefined)}
                />
              </Group>
            ))
          : value !== undefined && <UnknownValue value={value} />}
        <Action
          label={`添加${field.label}`}
          disabled={control.locked}
          onPress={() =>
            control.apply(() => appendStrategyEditorItem(control.draft, path, context))
          }
        />
        {errors ? <Copy>{errors}</Copy> : null}
      </Group>
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
    <View style={{ gap: 8 }}>
      {choices ? (
        <EditorChoice
          title={field.label}
          value={stringValue}
          values={choices}
          labels={field.choiceLabels}
          locked={control.locked}
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
        <Field
          label={field.label}
          value={stringValue}
          editable={!control.locked}
          error={errors || undefined}
          onChange={(next) =>
            control.edit(
              path,
              field.kind === 'integer' && /^\d+$/.test(next) && Number.isSafeInteger(Number(next))
                ? Number(next)
                : next,
            )
          }
        />
      )}
      {field.help && <Copy muted>{field.help}</Copy>}
      {choices && errors ? <Copy>{errors}</Copy> : null}
      {remove}
    </View>
  );
}
function EditorChoice({
  title,
  value,
  values,
  locked,
  onChange,
  labels,
}: {
  title: string;
  value: string;
  values: readonly string[];
  locked: boolean;
  onChange: (next: string) => void;
  labels?: Readonly<Record<string, string>> | undefined;
}) {
  const options = value && !values.includes(value) ? [value, ...values] : values;
  return (
    <Choices
      label={title}
      value={value}
      disabled={locked}
      onChange={onChange}
      options={options.map((option) => ({
        value: option,
        label: labels?.[option] ?? label(option),
      }))}
    />
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
  const fields = strategyEditorFields(context, value);
  const variants = strategyEditorVariants(context);
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
        <EditorChoice
          title="规则类型"
          value={strategyEditorVariant(context, row)}
          values={Object.keys(variants)}
          locked={control.locked}
          onChange={(variant) =>
            control.edit(path, changeStrategyEditorVariant(context, row, variant))
          }
        />
      )}
      {context === 'source' && (
        <>
          <Action
            label="使用执行标的"
            disabled={control.locked}
            onPress={() =>
              control.apply(() =>
                useStrategyExecutionForSource(control.draft, Number(path[1]), 'asset'),
              )
            }
          />
          <Action
            label="使用主周期"
            disabled={control.locked}
            onPress={() =>
              control.apply(() =>
                useStrategyExecutionForSource(control.draft, Number(path[1]), 'timeframe'),
              )
            }
          />
        </>
      )}
      {fields.map((field) => (
        <EditorField key={field.key} field={field} path={[...path, field.key]} control={control} />
      ))}
      {value === undefined && (
        <Action
          label="补全配置"
          disabled={control.locked}
          onPress={() => control.edit(path, strategyEditorInitial(context))}
        />
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
    <>
      <Copy muted>未识别的内容已保留，可在高级 JSON 中修正。</Copy>
      <Copy>{JSON.stringify(value, null, 2)}</Copy>
    </>
  );
}

function ArrayChoices({
  field,
  path,
  control,
}: {
  field: StrategyEditorField;
  path: StrategyDefinitionPath;
  control: Control;
}) {
  const { theme } = useMobileRuntime();
  const value = strategyDraftValue(control.draft, path);
  const options = strategyEditorArrayOptions(field.context ?? '');
  const errors = control.issues.filter(
    (issue) => issue.path.length === path.length && issue.path.every((key, i) => key === path[i]),
  );
  return (
    <View style={{ gap: 8 }}>
      <Copy>{field.label}</Copy>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const checked = Array.isArray(value) && value.includes(option);
          return (
            <Pressable
              key={option}
              accessibilityRole="checkbox"
              accessibilityLabel={label(option)}
              accessibilityState={{ checked, disabled: control.locked }}
              disabled={control.locked}
              onPress={() =>
                control.apply(() => toggleStrategyEditorArrayItem(control.draft, path, option))
              }
              style={({ pressed }) => ({
                minHeight: 44,
                paddingHorizontal: 12,
                justifyContent: 'center',
                borderWidth: 1,
                borderRadius: 6,
                borderColor: checked ? theme.textPrimary : theme.border,
                backgroundColor: checked || pressed ? theme.surfaceHover : theme.surface1,
                opacity: control.locked ? 0.5 : 1,
              })}
            >
              <Text style={{ color: theme.textPrimary }}>
                {checked ? '✓ ' : ''}
                {label(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {value !== undefined &&
        (!Array.isArray(value) || value.some((item) => !options.includes(String(item)))) && (
          <UnknownValue value={value} />
        )}
      {errors.map((issue, index) => (
        <Copy key={index}>{issue.message}</Copy>
      ))}
    </View>
  );
}
