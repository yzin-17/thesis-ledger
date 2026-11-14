import { useMemo, useState } from 'react';
import { AiProviderTimeoutFields } from './AiProviderTimeoutFields.js';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle, RefreshCw, Search } from 'lucide-react';
import {
  mergeModelOptions,
  modelReasoningBadgeLabels,
  modelsFromText,
} from './ai-provider.actions.js';
import { withAiProviderModels } from './ai-provider-model-selection.js';
import { AiProviderExecutionFields } from './AiProviderExecutionFields.js';
import { AiProviderModelPricingFields } from './AiProviderModelPricingFields.js';
import { AiProviderUpstreamFields } from './AiProviderUpstreamFields.js';
import { AiProviderModelCatalogFields } from './AiProviderModelCatalogFields.js';
import type {
  AiAuthMode,
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

export function AiProviderEditorFields(props: {
  draft: ProviderDraft;
  credentialInputOpen: boolean;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  onResetTest: () => void;
  onSetCredentialInputOpen: (open: boolean) => void;
  availableModels?: string[];
  modelDetails?: AiProviderModelDetail[];
  modelCatalogState?: 'idle' | 'loading';
  onFetchModels?: () => void;
  onTestModel?: (model: string) => void;
  onTestPurpose?: (
    model: string,
    purpose: ProviderDraft['executionRoutes'][number]['contractId'],
    mode: ProviderDraft['executionRoutes'][number]['mode'],
  ) => void;
  section?: 'all' | 'connection' | 'model';
  onAuthModeChange?: (value: AiAuthMode) => void | Promise<void>;
}) {
  const control = useAiProviderEditorFields(props);
  const {
    showConnection,
    draft,
    onUpdateDraft,
    showModel,
    selectedModels,
    onTestModel,
    onTestPurpose,
    onAuthModeChange,
  } = control;

  return (
    <FieldGroup>
      {showConnection && (
        <>
          <AiProviderUpstreamFields draft={draft} onUpdateDraft={onUpdateDraft} />
          <Field>
            <FieldLabel htmlFor="ai-base-url">API Base URL</FieldLabel>
            <Input
              id="ai-base-url"
              aria-label="API Base URL"
              type="url"
              value={draft.baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(event) =>
                onUpdateDraft((current) => ({ ...current, baseUrl: event.target.value }))
              }
              required
            />
          </Field>
          <AiProviderModelCatalogFields draft={draft} onUpdateDraft={onUpdateDraft} />
        </>
      )}
      {showModel && <AiModelSelectionField control={control} />}
      {showModel && (
        <>
          <AiProviderModelPricingFields
            models={selectedModels}
            draft={draft}
            onUpdateDraft={onUpdateDraft}
          />
          <AiProviderExecutionFields
            draft={draft}
            onUpdateDraft={onUpdateDraft}
            {...(onTestModel ? { onTestModel } : {})}
            {...(onTestPurpose ? { onTestPurpose } : {})}
          />
        </>
      )}
      {showConnection && (
        <>
          <Field>
            <FieldLabel htmlFor="ai-auth-mode">认证方式</FieldLabel>
            <Select
              items={[
                { value: 'api_key', label: 'API Key' },
                { value: 'none', label: '无需认证' },
              ]}
              value={draft.authMode}
              onValueChange={(value) => {
                if (value) void onAuthModeChange(value);
              }}
            >
              <SelectTrigger id="ai-auth-mode" aria-label="认证方式" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="none">无需认证</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {draft.authMode === 'none' ? (
              <FieldDescription>
                不会读取已保存或环境中的 Key，也不会发送 Authorization、x-api-key 等认证头。
              </FieldDescription>
            ) : (
              <FieldDescription>新建或切回 API Key 模式时需要提供有效 Key。</FieldDescription>
            )}
          </Field>
          <AiCredentialField control={control} />
          <AiProviderTimeoutFields draft={draft} onUpdateDraft={onUpdateDraft} />
        </>
      )}
    </FieldGroup>
  );
}

function useAiProviderEditorFields({
  draft,
  credentialInputOpen,
  onUpdateDraft,
  onResetTest,
  onSetCredentialInputOpen,
  availableModels = [],
  modelDetails = [],
  modelCatalogState = 'idle',
  onFetchModels = () => undefined,
  onTestModel,
  onTestPurpose,
  section = 'all',
  onAuthModeChange = (value: AiAuthMode) =>
    onUpdateDraft((current) => ({ ...current, authMode: value })),
}: {
  draft: ProviderDraft;
  credentialInputOpen: boolean;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  onResetTest: () => void;
  onSetCredentialInputOpen: (open: boolean) => void;
  availableModels?: string[];
  modelDetails?: AiProviderModelDetail[];
  modelCatalogState?: 'idle' | 'loading';
  onFetchModels?: () => void;
  onTestModel?: (model: string) => void;
  onTestPurpose?: (
    model: string,
    purpose: ProviderDraft['executionRoutes'][number]['contractId'],
    mode: ProviderDraft['executionRoutes'][number]['mode'],
  ) => void;
  section?: 'all' | 'connection' | 'model';
  onAuthModeChange?: (value: AiAuthMode) => void | Promise<void>;
}) {
  const modelAnchor = useComboboxAnchor();
  const [manualModel, setManualModel] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const showConnection = section !== 'model';
  const showModel = section !== 'connection';
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
    onUpdateDraft((current) => withAiProviderModels(current, models, modelDetails));
  };

  const addManualModel = () => {
    const model = manualModel.trim();
    if (!model || selectedModelSet.has(model) || selectedModels.length >= MAX_SELECTED_MODELS)
      return;
    updateModels([...selectedModels, model]);
    setManualModel('');
  };

  return {
    showConnection,
    draft,
    onUpdateDraft,
    showModel,
    modelCatalogState,
    onFetchModels,
    modelOptions,
    modelSearch,
    setModelSearch,
    selectedModels,
    updateModels,
    modelAnchor,
    selectedModelSet,
    modelDetailsById,
    availableModels,
    manualModel,
    setManualModel,
    addManualModel,
    onTestModel,
    onTestPurpose,
    onAuthModeChange,
    credentialInputOpen,
    onResetTest,
    onSetCredentialInputOpen,
  };
}

function AiModelSelectionField({
  control,
}: {
  control: ReturnType<typeof useAiProviderEditorFields>;
}) {
  return (
    <>
      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel id="ai-models-label">模型列表</FieldLabel>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-busy={control.modelCatalogState === 'loading'}
            disabled={control.modelCatalogState === 'loading' || !control.draft.baseUrl.trim()}
            onClick={control.onFetchModels}
          >
            {control.modelCatalogState === 'loading' ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
            )}
            {control.modelCatalogState === 'loading' ? '获取中…' : '从接口获取'}
          </Button>
        </div>
        <Combobox
          items={control.modelOptions.filter((model) =>
            model.toLocaleLowerCase().includes(control.modelSearch.trim().toLocaleLowerCase()),
          )}
          filter={null}
          inputValue={control.modelSearch}
          onInputValueChange={(value, details) => {
            if (details.reason === 'input-change' || details.reason === 'clear-press')
              control.setModelSearch(value);
          }}
          multiple
          autoHighlight
          value={control.selectedModels}
          onValueChange={(value) => {
            control.updateModels(value);
            control.setModelSearch('');
          }}
          onOpenChange={(open, eventDetails) => {
            if (!open && eventDetails.reason === 'item-press') {
              eventDetails.cancel();
            } else if (!open) control.setModelSearch('');
          }}
        >
          <ComboboxChips ref={control.modelAnchor}>
            <ComboboxValue>
              {(values) => (
                <>
                  {(values as string[]).map((model) => (
                    <ComboboxChip key={model} className="font-mono" removeLabel={`移除 ${model}`}>
                      <span className="max-w-72 truncate">{model}</span>
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    id="ai-models"
                    aria-labelledby="ai-models-label"
                    aria-required="true"
                    placeholder={
                      control.modelOptions.length > 0 ? '搜索并选择模型' : '请先从接口获取模型'
                    }
                  />
                </>
              )}
            </ComboboxValue>
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </ComboboxChips>
          <ComboboxContent
            anchor={control.modelAnchor}
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
                    !control.selectedModelSet.has(model) &&
                    control.selectedModels.length >= MAX_SELECTED_MODELS
                  }
                  className="font-mono text-xs"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 pr-6">
                    <span className="min-w-0 truncate">{model}</span>
                    <ModelReasoningBadges
                      reasoning={
                        control.modelDetailsById.has(model)
                          ? control.modelDetailsById.get(model)?.reasoning
                          : control.draft.modelReasoning[model]
                      }
                    />
                  </div>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          已选择 {control.selectedModels.length}/{MAX_SELECTED_MODELS} 个；已获取{' '}
          {control.availableModels.length} 个可用模型。
        </FieldDescription>
        <div className="flex items-center gap-2">
          <Input
            aria-label="手动模型 ID"
            value={control.manualModel}
            placeholder="目录不可用时手动填写模型 ID"
            onChange={(event) => control.setManualModel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              control.addManualModel();
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              !control.manualModel.trim() ||
              control.selectedModelSet.has(control.manualModel.trim()) ||
              control.selectedModels.length >= MAX_SELECTED_MODELS
            }
            onClick={control.addManualModel}
          >
            添加模型
          </Button>
        </div>
      </Field>
    </>
  );
}
function AiCredentialField({ control }: { control: ReturnType<typeof useAiProviderEditorFields> }) {
  if (control.draft.authMode === 'none') {
    return null;
  }
  if (control.credentialInputOpen) {
    return (
      <Field>
        <FieldLabel htmlFor="ai-api-key">API Key</FieldLabel>
        <Input
          id="ai-api-key"
          aria-label="API Key"
          type="password"
          autoComplete="off"
          value={control.draft.credentialsRef}
          onChange={(event) =>
            control.onUpdateDraft((current) => ({ ...current, credentialsRef: event.target.value }))
          }
          placeholder="输入 API Key"
        />
        <FieldDescription>保存后不会回显；编辑时留空会保留已保存的 Key。</FieldDescription>
      </Field>
    );
  }
  return (
    <Field>
      <FieldLabel>API Key</FieldLabel>
      <FieldDescription>已配置且不会回显。</FieldDescription>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          control.onResetTest();
          control.onSetCredentialInputOpen(true);
        }}
      >
        更换 API Key
      </Button>
    </Field>
  );
}
