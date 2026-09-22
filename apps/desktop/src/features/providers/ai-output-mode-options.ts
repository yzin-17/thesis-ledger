import type { AiGenerationMode, AiUpstreamFormat } from '@thesis-ledger/schemas';

export const aiOutputPolicyOptions = [
  { value: 'auto', label: '自动选择（推荐）' },
  { value: 'manual', label: '手动指定' },
] as const;
export const aiOutputModeOptions = [
  {
    value: 'native_schema',
    label: '按固定字段生成',
    description: '要求接口按系统规定的字段生成，需服务支持。',
  },
  {
    value: 'json_mode',
    label: '按 JSON 格式生成',
    description: '要求接口返回 JSON，由应用检查字段是否符合要求。',
  },
  {
    value: 'json_validated',
    label: '通过提示词生成',
    description: '不发送专门的格式参数，通过文字要求模型返回规定内容。',
  },
] as const satisfies ReadonlyArray<{ value: AiGenerationMode; label: string; description: string }>;
export const aiOutputModeOptionsFor = (protocol: AiUpstreamFormat) =>
  aiOutputModeOptions.map((option) => ({
    ...option,
    disabled: option.value === 'json_mode' && protocol === 'anthropic-messages',
  }));
export const aiOutputModeLabel = (mode: AiGenerationMode) =>
  aiOutputModeOptions.find((option) => option.value === mode)?.label ?? mode;
