import { Badge } from '@/components/ui/badge';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { InfoIcon } from 'lucide-react';
import type { ProviderDraft } from './providers.types.js';

const costCurrencyOptions = [
  { value: 'USD', label: 'USD · 美元' },
  { value: 'CNY', label: 'CNY · 人民币' },
  { value: 'HKD', label: 'HKD · 港元' },
] as const;
const unsetCostCurrency = '__unset__';
const costDescription = '按每 1,000 Token 计算。留空不是零费用，表示费用未知，不表示免费。';

function CostFieldLabel({ htmlFor, label }: { htmlFor: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <HoverCard>
        <HoverCardTrigger
          delay={150}
          closeDelay={100}
          render={<button type="button" />}
          className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5"
          aria-label={`${label}说明`}
          aria-description={costDescription}
          data-pricing-help
        >
          <InfoIcon aria-hidden="true" />
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          className="w-64 min-w-0 p-3 text-xs leading-5"
        >
          {costDescription}
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

const pricingLabel = (pricing: ProviderDraft['modelPricing'][string] | undefined) => {
  if (!pricing) return '未填写';
  const hasInput = pricing.costPer1kInput.trim() !== '';
  const hasOutput = pricing.costPer1kOutput.trim() !== '';
  const hasCurrency = pricing.costCurrency.trim() !== '';
  return hasInput && hasOutput && hasCurrency ? '价格完整' : '未填写完整';
};

export function AiProviderModelPricingFields({
  models,
  draft,
  onUpdateDraft,
}: {
  models: readonly string[];
  draft: ProviderDraft;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
}) {
  return (
    <FieldGroup>
      <div>
        <h3 className="text-sm font-medium">模型价格</h3>
        <p className="text-xs text-muted-foreground">
          单价按每 1,000 Token 计算。系统只按你填写的价格估算，留空表示费用未知，不表示免费。
        </p>
      </div>
      {models.length === 0 ? (
        <p className="text-xs text-muted-foreground">先选择至少一个模型，再填写模型价格。</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          {models.map((model) => {
            const pricing = draft.modelPricing[model] ?? {
              costPer1kInput: '',
              costPer1kOutput: '',
              costCurrency: '',
            };
            const currencies =
              pricing.costCurrency &&
              !costCurrencyOptions.some(({ value }) => value === pricing.costCurrency)
                ? [
                    ...costCurrencyOptions,
                    { value: pricing.costCurrency, label: pricing.costCurrency },
                  ]
                : costCurrencyOptions;
            const update = (next: Partial<typeof pricing>) =>
              onUpdateDraft((current) => ({
                ...current,
                modelPricing: {
                  ...current.modelPricing,
                  [model]: { ...pricing, ...next },
                },
              }));
            return (
              <div
                key={model}
                className="grid min-w-0 gap-3 border-b p-3 last:border-b-0 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(10rem,1.5fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_minmax(8rem,1fr)]"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate font-mono text-xs" title={model}>
                    {model}
                  </p>
                  <Badge variant="outline">{pricingLabel(draft.modelPricing[model])}</Badge>
                </div>
                <Field>
                  <CostFieldLabel htmlFor={`ai-model-${model}-input-cost`} label="输入单价" />
                  <Input
                    id={`ai-model-${model}-input-cost`}
                    aria-label={`${model} 每千输入费用`}
                    type="number"
                    min={0}
                    step="any"
                    value={pricing.costPer1kInput}
                    onChange={(event) => update({ costPer1kInput: event.target.value })}
                  />
                </Field>
                <Field>
                  <CostFieldLabel htmlFor={`ai-model-${model}-output-cost`} label="输出单价" />
                  <Input
                    id={`ai-model-${model}-output-cost`}
                    aria-label={`${model} 每千输出费用`}
                    type="number"
                    min={0}
                    step="any"
                    value={pricing.costPer1kOutput}
                    onChange={(event) => update({ costPer1kOutput: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`ai-model-${model}-currency`}>币种</FieldLabel>
                  <Select
                    value={pricing.costCurrency || null}
                    onValueChange={(value) =>
                      update({
                        costCurrency: value === unsetCostCurrency ? '' : (value ?? ''),
                      })
                    }
                  >
                    <SelectTrigger
                      id={`ai-model-${model}-currency`}
                      aria-label={`${model} 费用币种`}
                      className="w-full"
                    >
                      <SelectValue placeholder="未设置" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={unsetCostCurrency}>未设置</SelectItem>
                        {currencies.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            );
          })}
        </div>
      )}
    </FieldGroup>
  );
}
