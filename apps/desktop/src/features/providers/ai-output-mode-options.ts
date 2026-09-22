import type { AiGenerationMode, AiUpstreamFormat } from '@thesis-ledger/schemas';

export const aiOutputModeOptions = [
  { value: 'json_validated', label: '文本 JSON（应用校验）' },
  { value: 'native_schema', label: '接口结构化输出' },
  { value: 'json_mode', label: '接口 JSON（语法约束）' },
] as const satisfies ReadonlyArray<{ value: AiGenerationMode; label: string }>;

export const aiOutputModeOptionsFor = (upstreamFormat: AiUpstreamFormat) =>
  aiOutputModeOptions.map((option) => ({
    ...option,
    disabled: option.value === 'json_mode' && upstreamFormat === 'anthropic-messages',
  }));
