import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiProviderEditorFields } from './AiProviderEditorFields.js';
import {
  providerCapabilityOptions,
  providerCapabilityLabel,
  providerCredentialLabel,
  providerCredentialPlaceholder,
  providerTypeLabel,
} from './providers.types.js';

import type { AiAuthMode, AiProviderModelDetail, ProviderDraft } from './providers.types.js';

const saveProviderLabel = (saving: boolean, editing: boolean, ai: boolean) => {
  if (ai) return saving ? '正在检查并保存…' : '测试并保存';
  if (saving) return '保存中…';
  return editing ? '保存修改' : '保存提供方';
};

const providerTestLabel = (testing: boolean) => {
  if (testing) return '测试中…';
  return '测试连接';
};

const providerSheetTitle = (editingProviderName: string | null) => {
  if (editingProviderName) return '更新提供方';
  return '新增或更新提供方';
};

export function ProviderEditorSheet(props: {
  open: boolean;
  editingProviderName: string | null;
  providerDraft: ProviderDraft;
  credentialInputOpen: boolean;
  providerTestState: 'idle' | 'testing' | 'success' | 'warning' | 'error';
  savingProviderDraft: boolean;
  availableAiModels?: string[];
  aiModelDetails?: AiProviderModelDetail[];
  aiModelCatalogState?: 'idle' | 'loading';
  onOpenChange: (open: boolean) => void;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  onResetTest: () => void;
  onSetCredentialInputOpen: (open: boolean) => void;
  onAuthModeChange: (value: AiAuthMode) => void | Promise<void>;
  onTypeChange: (type: string) => void;
  onFetchAiModels?: () => void;
  onTestModel?: (model: string) => void;
  onTestPurpose?: (
    model: string,
    purpose: ProviderDraft['executionRoutes'][number]['contractId'],
    mode: ProviderDraft['executionRoutes'][number]['mode'],
  ) => void;
  onCancelTest?: () => void;
  onClose: () => void;
  onTest: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const control = useProviderEditorSheet(props);
  const { open, requestClose, editingProviderName, onSave } = control;

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => void requestClose(nextOpen)}>
      <SheetContent
        side="right"
        aria-describedby="provider-form-description"
        size="form"
        className="h-[100dvh] min-h-0 overflow-hidden p-6"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
          <SheetHeader>
            <SheetTitle>{providerSheetTitle(editingProviderName)}</SheetTitle>
            <SheetDescription id="provider-form-description">
              凭证用于连接服务；已有凭证不会回显，留空保存将继续使用。
            </SheetDescription>
          </SheetHeader>
          <form
            key={editingProviderName ?? 'new-provider'}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-6"
            onSubmit={onSave}
          >
            <SheetBody>
              <ProviderEditorContents control={control} />
            </SheetBody>
            <ProviderEditorActions control={control} />
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function useProviderEditorSheet({
  open,
  editingProviderName,
  providerDraft,
  credentialInputOpen,
  providerTestState,
  savingProviderDraft,
  availableAiModels = [],
  aiModelDetails = [],
  aiModelCatalogState = 'idle',
  onOpenChange,
  onUpdateDraft,
  onResetTest,
  onSetCredentialInputOpen,
  onAuthModeChange,
  onTypeChange,
  onFetchAiModels = () => undefined,
  onTestModel,
  onTestPurpose,
  onCancelTest,
  onClose,
  onTest,
  onSave,
}: {
  open: boolean;
  editingProviderName: string | null;
  providerDraft: ProviderDraft;
  credentialInputOpen: boolean;
  providerTestState: 'idle' | 'testing' | 'success' | 'warning' | 'error';
  savingProviderDraft: boolean;
  availableAiModels?: string[];
  aiModelDetails?: AiProviderModelDetail[];
  aiModelCatalogState?: 'idle' | 'loading';
  onOpenChange: (open: boolean) => void;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  onResetTest: () => void;
  onSetCredentialInputOpen: (open: boolean) => void;
  onAuthModeChange: (value: AiAuthMode) => void | Promise<void>;
  onTypeChange: (type: string) => void;
  onFetchAiModels?: () => void;
  onTestModel?: (model: string) => void;
  onTestPurpose?: (
    model: string,
    purpose: ProviderDraft['executionRoutes'][number]['contractId'],
    mode: ProviderDraft['executionRoutes'][number]['mode'],
  ) => void;
  onCancelTest?: () => void;
  onClose: () => void;
  onTest: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const requestClose = useDraftCloseGuard({
    open,
    draft: providerDraft,
    busy: savingProviderDraft || providerTestState === 'testing',
    onOpenChange: (nextOpen) => (nextOpen ? onOpenChange(true) : onClose()),
  });
  const credentialLabel = providerCredentialLabel(providerDraft.type);

  return {
    open,
    requestClose,
    editingProviderName,
    onSave,
    providerDraft,
    onUpdateDraft,
    onTypeChange,
    credentialInputOpen,
    onResetTest,
    onSetCredentialInputOpen,
    onAuthModeChange,
    availableAiModels,
    aiModelDetails,
    aiModelCatalogState,
    onFetchAiModels,
    onTestModel,
    onTestPurpose,
    credentialLabel,
    savingProviderDraft,
    providerTestState,
    onCancelTest,
    onTest,
  };
}

function ProviderEditorContents({
  control,
}: {
  control: ReturnType<typeof useProviderEditorSheet>;
}) {
  return (
    <>
      <FieldGroup className="w-full max-w-none content-start">
        <Field>
          <FieldLabel htmlFor="provider-name">名称</FieldLabel>
          <Input
            id="provider-name"
            aria-label="名称"
            value={control.providerDraft.name}
            onChange={(event) =>
              control.onUpdateDraft((current) => ({ ...current, name: event.target.value }))
            }
            readOnly={Boolean(control.editingProviderName)}
            required
            maxLength={80}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-type">类型</FieldLabel>
          <Select
            value={control.providerDraft.type}
            onValueChange={(value) => value && control.onTypeChange(value)}
          >
            <SelectTrigger id="provider-type" aria-label="类型" className="w-full">
              <SelectValue>{providerTypeLabel(control.providerDraft.type)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="notification">通知</SelectItem>
                <SelectItem value="market">行情</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
                <SelectItem value="vision">图像</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-capabilities">能力（可多选）</FieldLabel>
          <MultiSelect
            id="provider-capabilities"
            label="能力（可多选）"
            options={[
              ...providerCapabilityOptions,
              ...control.providerDraft.capabilities
                .filter(
                  (value) => !providerCapabilityOptions.some((option) => option.value === value),
                )
                .map((value) => ({ value, label: providerCapabilityLabel(value) })),
            ]}
            value={control.providerDraft.capabilities}
            onValueChange={(value) =>
              control.onUpdateDraft((current) => ({ ...current, capabilities: value }))
            }
            placeholder="搜索提供方能力"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-priority">优先级</FieldLabel>
          <Input
            id="provider-priority"
            aria-label="优先级"
            type="number"
            min={0}
            step={1}
            value={control.providerDraft.priority}
            onChange={(event) =>
              control.onUpdateDraft((current) => ({
                ...current,
                priority: Number(event.target.value),
              }))
            }
            required
          />
        </Field>
        {control.providerDraft.type === 'ai' && (
          <Tabs defaultValue="connection" className="w-full">
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="connection">连接配置</TabsTrigger>
              <TabsTrigger value="model">模型与用途</TabsTrigger>
            </TabsList>
            <TabsContent value="connection">
              <AiProviderEditorFields
                section="connection"
                draft={control.providerDraft}
                credentialInputOpen={control.credentialInputOpen}
                onUpdateDraft={control.onUpdateDraft}
                onResetTest={control.onResetTest}
                onSetCredentialInputOpen={control.onSetCredentialInputOpen}
                onAuthModeChange={control.onAuthModeChange}
                availableModels={control.availableAiModels}
                modelDetails={control.aiModelDetails}
                modelCatalogState={control.aiModelCatalogState}
                onFetchModels={control.onFetchAiModels}
                {...(control.onTestModel ? { onTestModel: control.onTestModel } : {})}
                {...(control.onTestPurpose ? { onTestPurpose: control.onTestPurpose } : {})}
              />
            </TabsContent>
            <TabsContent value="model">
              <AiProviderEditorFields
                section="model"
                draft={control.providerDraft}
                credentialInputOpen={control.credentialInputOpen}
                onUpdateDraft={control.onUpdateDraft}
                onResetTest={control.onResetTest}
                onSetCredentialInputOpen={control.onSetCredentialInputOpen}
                onAuthModeChange={control.onAuthModeChange}
                availableModels={control.availableAiModels}
                modelDetails={control.aiModelDetails}
                modelCatalogState={control.aiModelCatalogState}
                onFetchModels={control.onFetchAiModels}
                {...(control.onTestModel ? { onTestModel: control.onTestModel } : {})}
                {...(control.onTestPurpose ? { onTestPurpose: control.onTestPurpose } : {})}
              />
            </TabsContent>
          </Tabs>
        )}
        {control.providerDraft.type !== 'ai' && (
          <>
            {control.credentialInputOpen ? (
              <Field>
                <FieldLabel htmlFor="provider-credential">{control.credentialLabel}</FieldLabel>
                <Input
                  id="provider-credential"
                  aria-label={control.credentialLabel}
                  type="password"
                  autoComplete="off"
                  value={control.providerDraft.credentialsRef}
                  onChange={(event) =>
                    control.onUpdateDraft((current) => ({
                      ...current,
                      credentialsRef: event.target.value,
                    }))
                  }
                  placeholder={providerCredentialPlaceholder(control.credentialLabel)}
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel>凭证</FieldLabel>
                <FieldDescription>已配置且不会回显。</FieldDescription>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    control.onResetTest();
                    control.onSetCredentialInputOpen(true);
                  }}
                >
                  更换凭证
                </Button>
              </Field>
            )}
          </>
        )}
        {control.credentialLabel === '飞书 Webhook' && (
          <Field>
            <FieldDescription>测试连接会发送一条“ThesisLedger 连接测试”通知。</FieldDescription>
          </Field>
        )}
      </FieldGroup>
    </>
  );
}
function ProviderEditorActions({
  control,
}: {
  control: ReturnType<typeof useProviderEditorSheet>;
}) {
  return (
    <>
      <SheetFooter>
        <Button
          type="button"
          variant="outline"
          disabled={control.savingProviderDraft}
          onClick={() => void control.requestClose(false)}
        >
          取消
        </Button>
        {control.providerDraft.type === 'ai' &&
        (control.providerTestState === 'testing' || control.savingProviderDraft) &&
        control.onCancelTest ? (
          <Button type="button" variant="outline" onClick={control.onCancelTest}>
            取消测试
          </Button>
        ) : null}
        {control.providerDraft.type !== 'ai' ? (
          <Button
            disabled={control.providerTestState === 'testing' || control.savingProviderDraft}
            aria-busy={control.providerTestState === 'testing'}
            type="button"
            variant="outline"
            onClick={control.onTest}
          >
            {control.providerTestState === 'testing' && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {providerTestLabel(control.providerTestState === 'testing')}
          </Button>
        ) : null}
        <Button
          disabled={control.providerTestState === 'testing' || control.savingProviderDraft}
          type="submit"
          variant="default"
        >
          {control.savingProviderDraft && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {saveProviderLabel(
            control.savingProviderDraft,
            Boolean(control.editingProviderName),
            control.providerDraft.type === 'ai' && control.providerDraft.enabled,
          )}
        </Button>
      </SheetFooter>
    </>
  );
}
