import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AiGenerationMode, AiUpstreamFormat } from '@thesis-ledger/schemas';
import { aiOutputModeOptionsFor, aiOutputPolicyOptions } from './ai-output-mode-options.js';

type Selection = { mode: AiGenerationMode; outputPolicy: 'auto' | 'manual' };
export function AiGenerationSettings({
  value,
  protocol,
  label,
  onChange,
}: {
  value: Selection;
  protocol: AiUpstreamFormat;
  label: string;
  onChange: (value: Selection) => void;
}) {
  const modes = aiOutputModeOptionsFor(protocol);
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>生成方式</FieldLabel>
        <Select
          items={aiOutputPolicyOptions}
          value={value.outputPolicy}
          onValueChange={(policy) => policy && onChange({ ...value, outputPolicy: policy })}
        >
          <SelectTrigger aria-label={`${label}生成方式`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {aiOutputPolicyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          {value.outputPolicy === 'auto'
            ? '保存时优先检查按固定字段生成的方式；已通过且未变化的用途不会重复调用。'
            : '指定要验证的方式，通过后才能用于已启用的任务。'}
        </FieldDescription>
      </Field>
      {value.outputPolicy === 'manual' ? (
        <Field>
          <FieldLabel>指定方式</FieldLabel>
          <Select
            items={modes}
            value={value.mode}
            onValueChange={(mode) => mode && onChange({ ...value, mode })}
          >
            <SelectTrigger aria-label={`${label}指定方式`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {modes.map((option) => (
                  <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {modes.find((option) => option.value === value.mode)?.description}
          </FieldDescription>
        </Field>
      ) : null}
      <p className="text-xs text-muted-foreground">
        所有方式都会检查最终结果，不会在任务失败后自动换方式重试。
      </p>
    </div>
  );
}
