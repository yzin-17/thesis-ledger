import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AiProviderExecutionRouteDraft } from './providers.types.js';

const choices = [
  { value: 'research-generation-v1', label: '研究报告 V1' },
  { value: 'research-generation-v2', label: '证据研究 V2' },
] as const;

export function AiProviderResearchVersionField({
  route,
  onChange,
}: {
  route: AiProviderExecutionRouteDraft;
  onChange: (update: Partial<AiProviderExecutionRouteDraft>) => void;
}) {
  if (route.contractId !== 'research') return null;
  const value = route.contractVersion ?? 'research-generation-v1';
  return (
    <Field>
      <FieldLabel>研究合同版本</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          const selected = choices.find((choice) => choice.value === next);
          if (selected) onChange({ contractVersion: selected.value });
        }}
      >
        <SelectTrigger aria-label={`${route.model} 研究合同版本`}>
          <SelectValue>
            {choices.find((choice) => choice.value === value)?.label ?? '请选择版本'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
