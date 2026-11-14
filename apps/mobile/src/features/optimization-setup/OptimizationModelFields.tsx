import { View } from 'react-native';
import type { StrategyOptimizationCapabilitiesRead } from '@thesis-ledger/schemas';
import { Choices, Copy } from '../../components/MobilePrimitives';
import { MultiSelect, type MultiSelectOption } from '../../components/MultiSelect';

export function OptimizationModelFields({ providers, models, onModelsChange, efforts, onEffortsChange, disabled }: {
  providers: StrategyOptimizationCapabilitiesRead['providers'];
  models: string[];
  onModelsChange: (value: string[]) => void;
  efforts: Record<string, string>;
  onEffortsChange: (value: Record<string, string>) => void;
  disabled: boolean;
}) {
  const options: MultiSelectOption[] = providers.map((item) => ({
    value: JSON.stringify([item.provider, item.model]), label: `${item.provider} / ${item.model}`,
    description: item.costStatus === 'unknown' ? '费用未知' : `价格已配置 · ${item.costCurrency ?? '币种未记录'}`,
  }));
  for (const value of models) {
    if (options.some((item) => item.value === value)) continue;
    let label = '模型标识无效';
    try {
      const pair: unknown = JSON.parse(value);
      if (Array.isArray(pair) && pair.length === 2 && pair.every((item) => typeof item === 'string')) label = pair.join(' / ');
    } catch { /* 保留不可解析的选择，允许用户移除。 */ }
    options.push({ value, label, description: '当前不可用，请重新选择', disabled: true });
  }
  return <View style={{ gap: 12 }}>
    <MultiSelect label="搜索实验模型" options={options} value={models}
      onChange={onModelsChange} disabled={disabled} maxSelected={3} />
    {providers.filter((item) => models.includes(JSON.stringify([item.provider, item.model]))).map((item) => {
      const key = JSON.stringify([item.provider, item.model]);
      return <View key={key} style={{ gap: 8 }}>
        <Copy>{item.provider} / {item.model}</Copy>
        <Copy>{item.costStatus === 'unknown' ? '费用未知' : `价格已配置 · ${item.costCurrency ?? '币种未记录'}`}</Copy>
        {item.reasoning && <Choices label="模型推理强度" value={efforts[key] ?? 'auto'} disabled={disabled}
          onChange={(value) => onEffortsChange({ ...efforts, [key]: value })}
          options={[{ value: 'auto', label: '使用已配置默认' }, ...(item.reasoning.supportedEfforts ?? []).map((value) => ({
            value, label: ({ none: '无推理', minimal: '极简', low: '低', medium: '中', high: '高', xhigh: '很高', max: '最高' } as Record<string, string>)[value] ?? '其他可用强度',
          }))]} />}
      </View>;
    })}
  </View>;
}
