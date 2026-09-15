import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LoaderCircle, RefreshCw, Search } from 'lucide-react';
import {
  mergeModelOptions,
  mergeSelectedModelReasoning,
  modelReasoningBadgeLabels,
  modelsFromText,
  modelsToText,
} from './ai-provider.actions.js';
import type {
  AiProviderModelDetail,
  AiProviderModelReasoning,
  ProviderDraft,
} from './providers.types.js';

const MAX_SELECTED_MODELS = 32;

export const ModelReasoningBadges = ({
  reasoning,
}: {
  reasoning?: AiProviderModelReasoning | undefined;
}) => (
  <>
    {modelReasoningBadgeLabels(reasoning).map((label) => (
      <Badge key={label} variant="outline">
        {label}
      </Badge>
    ))}
  </>
);

export function AiProviderEditorFields({
  draft,
  credentialInputOpen,
  takingOverEnvironmentName,
  onUpdateDraft,
  onResetTest,
  onSetCredentialInputOpen,
  availableModels = [],
  modelDetails = [],
  modelCatalogState = 'idle',
  onFetchModels = () => undefined,
}: {
  draft: ProviderDraft;
  credentialInputOpen: boolean;
  takingOverEnvironmentName: string | null;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  onResetTest: () => void;
  onSetCredentialInputOpen: (open: boolean) => void;
  availableModels?: string[];
  modelDetails?: AiProviderModelDetail[];
  modelCatalogState?: 'idle' | 'loading';
  onFetchModels?: () => void;
}) {
  const modelAnchor = useComboboxAnchor();
  const selectedModels = useMemo(() => modelsFromText(draft.modelsText), [draft.modelsText]);
  const selectedModelSet = useMemo(() => new Set(selectedModels), [selectedModels]);
  const modelOptions = useMemo(
    () => mergeModelOptions(selectedModels, availableModels),
    [availableModels, selectedModels],
  );
  const modelDetailsById = useMemo(
    () => new Map(modelDetails.map((detail) => [detail.id, detail])),
    [modelDetails],
  );

  const updateModels = (models: string[]) => {
    const modelsText = modelsToText(models, MAX_SELECTED_MODELS);
    const selectedModels = modelsFromText(modelsText);
    onUpdateDraft((current) => ({
      ...current,
      modelsText,
      modelReasoning: mergeSelectedModelReasoning(
        selectedModels,
        current.modelReasoning,
        modelDetails,
      ),
    }));
  };

  return (
    <FieldGroup>
      {takingOverEnvironmentName && (
        <Field>
          <FieldDescription>
            正在接管部署配置 {takingOverEnvironmentName}。保存会创建同名数据库记录，必须提供新的 API
            Key。
          </FieldDescription>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="ai-base-url">API Base URL</FieldLabel>
        <Input
          id="ai-base-url"
          aria-label="API Base URL"
          type="url"
          value={draft.baseUrl}
          placeholder="https://openrouter.ai/api/v1"
          onChange={(event) =>
            onUpdateDraft((current) => ({ ...current, baseUrl: event.target.value }))
          }
          required
        />
      </Field>
      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel id="ai-models-label">模型列表</FieldLabel>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-busy={modelCatalogState === 'loading'}
            disabled={modelCatalogState === 'loading' || !draft.baseUrl.trim()}
            onClick={onFetchModels}
          >
            {modelCatalogState === 'loading' ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
            )}
            {modelCatalogState === 'loading' ? '获取中…' : '从接口获取'}
          </Button>
        </div>
        <Combobox
          items={modelOptions}
          multiple
          autoHighlight
          value={selectedModels}
          onValueChange={updateModels}
          onOpenChange={(open, eventDetails) => {
            if (!open && eventDetails.reason === 'item-press') {
              eventDetails.cancel();
            }
          }}
        >
          <ComboboxChips ref={modelAnchor}>
            <ComboboxValue>
              {(values) => (
                <>
                  {(values as string[]).map((model) => (
                    <ComboboxChip key={model} className="font-mono">
                      <span className="max-w-72 truncate">{model}</span>
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    id="ai-models"
                    aria-labelledby="ai-models-label"
                    aria-required="true"
                    placeholder={modelOptions.length > 0 ? '搜索并选择模型' : '请先从接口获取模型'}
                  />
                </>
              )}
            </ComboboxValue>
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </ComboboxChips>
          <ComboboxContent
            anchor={modelAnchor}
            collisionAvoidance={{ side: 'none', align: 'shift', fallbackAxisSide: 'none' }}
            positionMethod="fixed"
          >
            <ComboboxEmpty>没有匹配的模型</ComboboxEmpty>
            <ComboboxList>
              {(model: string) => (
                <ComboboxItem
                  key={model}
                  value={model}
                  disabled={
                    !selectedModelSet.has(model) && selectedModels.length >= MAX_SELECTED_MODELS
                  }
                  className="font-mono text-xs"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 pr-6">
                    <span className="min-w-0 truncate">{model}</span>
                    <ModelReasoningBadges
                      reasoning={
                        modelDetailsById.has(model)
                          ? modelDetailsById.get(model)?.reasoning
                          : draft.modelReasoning[model]
                      }
                    />
                  </div>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          已选择 {selectedModels.length}/{MAX_SELECTED_MODELS} 个；已获取 {availableModels.length}{' '}
          个可用模型。
        </FieldDescription>
      </Field>
      {credentialInputOpen ? (
        <Field>
          <FieldLabel htmlFor="ai-api-key">API Key</FieldLabel>
          <Input
            id="ai-api-key"
            aria-label="API Key"
            type="password"
            autoComplete="off"
            value={draft.credentialsRef}
            onChange={(event) =>
              onUpdateDraft((current) => ({ ...current, credentialsRef: event.target.value }))
            }
            placeholder="输入 API Key"
            required={Boolean(takingOverEnvironmentName)}
          />
          <FieldDescription>保存后不会回显；编辑时留空会保留已保存的 Key。</FieldDescription>
        </Field>
      ) : (
        <Field>
          <FieldLabel>API Key</FieldLabel>
          <FieldDescription>已配置且不会回显。</FieldDescription>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onResetTest();
              onSetCredentialInputOpen(true);
            }}
          >
            更换 API Key
          </Button>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="ai-timeout">超时（毫秒）</FieldLabel>
        <Input
          id="ai-timeout"
          aria-label="超时（毫秒）"
          type="number"
          min={1}
          max={120000}
          step={1}
          value={draft.timeoutMs}
          onChange={(event) =>
            onUpdateDraft((current) => ({ ...current, timeoutMs: event.target.value }))
          }
        />
      </Field>
      <FieldGroup className="sm:grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ai-input-cost">每千输入费用（可选）</FieldLabel>
          <Input
            id="ai-input-cost"
            aria-label="每千输入费用（可选）"
            type="number"
            min={0}
            step="any"
            value={draft.costPer1kInput}
            onChange={(event) =>
              onUpdateDraft((current) => ({ ...current, costPer1kInput: event.target.value }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-output-cost">每千输出费用（可选）</FieldLabel>
          <Input
            id="ai-output-cost"
            aria-label="每千输出费用（可选）"
            type="number"
            min={0}
            step="any"
            value={draft.costPer1kOutput}
            onChange={(event) =>
              onUpdateDraft((current) => ({ ...current, costPer1kOutput: event.target.value }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-cost-currency">费用币种（可选）</FieldLabel>
          <Input
            id="ai-cost-currency"
            aria-label="费用币种（可选）"
            value={draft.costCurrency}
            onChange={(event) =>
              onUpdateDraft((current) => ({ ...current, costCurrency: event.target.value }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-pricing-version">定价版本（可选）</FieldLabel>
          <Input
            id="ai-pricing-version"
            aria-label="定价版本（可选）"
            value={draft.pricingVersion}
            onChange={(event) =>
              onUpdateDraft((current) => ({ ...current, pricingVersion: event.target.value }))
            }
          />
        </Field>
      </FieldGroup>
    </FieldGroup>
  );
}
