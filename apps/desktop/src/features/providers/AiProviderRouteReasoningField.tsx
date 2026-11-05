import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AiProviderExecutionRouteDraft, AiProviderModelReasoning } from './providers.types.js';

const labels = {
  none: '关闭',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '更高',
  max: '最高',
} as const;

export function AiProviderRouteReasoningField({
  route,
  reasoning,
  onChange,
}: {
  route: AiProviderExecutionRouteDraft;
  reasoning: AiProviderModelReasoning | undefined;
  onChange: (update: Partial<AiProviderExecutionRouteDraft>) => void;
}) {
  if (route.reasoningEnabled !== undefined) return null;
  const efforts =
    reasoning?.supportedEfforts?.filter((effort) => !(reasoning.mandatory && effort === 'none')) ??
    [];
  if (!efforts.length && route.reasoningEffort === undefined) return null;
  const options = [
    { value: 'default', label: '使用模型默认值' },
    ...efforts.map((effort) => ({ value: effort, label: labels[effort] })),
  ];
  const value = route.reasoningEffort ?? 'default';
  return (
    <Field>
      <FieldLabel>推理强度</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next === 'default') onChange({ reasoningEffort: undefined });
          else if (efforts.includes(next as keyof typeof labels))
            onChange({ reasoningEffort: next as keyof typeof labels });
        }}
      >
        <SelectTrigger aria-label={`${route.model} 用途推理强度`}>
          <SelectValue>
            {options.find((option) => option.value === value)?.label ??
              labels[route.reasoningEffort!]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>用途测试和执行使用同一设置；修改后重新验证。</FieldDescription>
    </Field>
  );
}
