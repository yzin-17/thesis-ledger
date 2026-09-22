import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
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
  providerCredentialLabel,
  providerCredentialPlaceholder,
  providerTypeLabel,
} from './providers.types.js';

import type { AiAuthMode, AiProviderModelDetail, ProviderDraft } from './providers.types.js';

const saveProviderLabel = (saving: boolean, editing: boolean, ai: boolean) => {
  if (ai) return saving ? '正在检查并保存…' : '测试并保存';
  if (saving) return '保存中…';
  return editing ? '保存修改' : '保存 Provider';
};

const providerTestLabel = (testing: boolean) => {
  if (testing) return '测试中…';
  return '测试连接';
};

const providerSheetTitle = (
  editingProviderName: string | null,
  takingOverEnvironmentName: string | null,
) => {
  if (takingOverEnvironmentName) return '接管部署 Provider';
  if (editingProviderName) return '更新 Provider';
  return '新增或更新 Provider';
};

export const ProviderEditorSheet = ({
  open,
  editingProviderName,
  providerDraft,
  credentialInputOpen,
  takingOverEnvironmentName,
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
  takingOverEnvironmentName: string | null;
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
}) => {
  const requestClose = useDraftCloseGuard({
    open,
    draft: providerDraft,
    busy: savingProviderDraft || providerTestState === 'testing',
    onOpenChange: (nextOpen) => (nextOpen ? onOpenChange(true) : onClose()),
  });
  const credentialLabel = providerCredentialLabel(providerDraft.type);
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
            <SheetTitle>
              {providerSheetTitle(editingProviderName, takingOverEnvironmentName)}
            </SheetTitle>
            <SheetDescription id="provider-form-description">
              凭证用于连接 Provider；已配置凭证不会回显，编辑时留空保存不会删除当前凭证。
            </SheetDescription>
          </SheetHeader>
          <form
            key={editingProviderName ?? 'new-provider'}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-6"
            onSubmit={onSave}
          >
            <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
              <FieldGroup className="w-full max-w-none content-start">
                <Field>
                  <FieldLabel htmlFor="provider-name">名称</FieldLabel>
                  <Input
                    id="provider-name"
                    aria-label="名称"
                    value={providerDraft.name}
                    onChange={(event) =>
                      onUpdateDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    readOnly={Boolean(editingProviderName) || Boolean(takingOverEnvironmentName)}
                    required
                    maxLength={80}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="provider-type">类型</FieldLabel>
                  <Select
                    value={providerDraft.type}
                    onValueChange={(value) => value && onTypeChange(value)}
                  >
                    <SelectTrigger id="provider-type" aria-label="类型" className="w-full">
                      <SelectValue>{providerTypeLabel(providerDraft.type)}</SelectValue>
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
                  <Select
                    multiple
                    items={providerCapabilityOptions}
                    value={providerDraft.capabilities}
                    onValueChange={(value) =>
                      onUpdateDraft((current) => ({ ...current, capabilities: value }))
                    }
                  >
                    <SelectTrigger
                      id="provider-capabilities"
                      aria-label="能力（可多选）"
                      className="w-full"
                    >
                      <SelectValue placeholder="选择能力" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {providerCapabilityOptions.map((capability) => (
                          <SelectItem key={capability.value} value={capability.value}>
                            {capability.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="provider-priority">优先级</FieldLabel>
                  <Input
                    id="provider-priority"
                    aria-label="优先级"
                    type="number"
                    min={0}
                    step={1}
                    value={providerDraft.priority}
                    onChange={(event) =>
                      onUpdateDraft((current) => ({
                        ...current,
                        priority: Number(event.target.value),
                      }))
                    }
                    required
                  />
                </Field>
                {providerDraft.type === 'ai' && (
                  <Tabs defaultValue="connection" className="w-full">
                    <TabsList variant="line" className="w-full">
                      <TabsTrigger value="connection">连接配置</TabsTrigger>
                      <TabsTrigger value="model">模型与用途</TabsTrigger>
                    </TabsList>
                    <TabsContent value="connection" className="pt-4">
                      <AiProviderEditorFields
                        section="connection"
                        draft={providerDraft}
                        credentialInputOpen={credentialInputOpen}
                        takingOverEnvironmentName={takingOverEnvironmentName}
                        onUpdateDraft={onUpdateDraft}
                        onResetTest={onResetTest}
                        onSetCredentialInputOpen={onSetCredentialInputOpen}
                        onAuthModeChange={onAuthModeChange}
                        availableModels={availableAiModels}
                        modelDetails={aiModelDetails}
                        modelCatalogState={aiModelCatalogState}
                        onFetchModels={onFetchAiModels}
                        {...(onTestModel ? { onTestModel } : {})}
                        {...(onTestPurpose ? { onTestPurpose } : {})}
                      />
                    </TabsContent>
                    <TabsContent value="model" className="pt-4">
                      <AiProviderEditorFields
                        section="model"
                        draft={providerDraft}
                        credentialInputOpen={credentialInputOpen}
                        takingOverEnvironmentName={takingOverEnvironmentName}
                        onUpdateDraft={onUpdateDraft}
                        onResetTest={onResetTest}
                        onSetCredentialInputOpen={onSetCredentialInputOpen}
                        onAuthModeChange={onAuthModeChange}
                        availableModels={availableAiModels}
                        modelDetails={aiModelDetails}
                        modelCatalogState={aiModelCatalogState}
                        onFetchModels={onFetchAiModels}
                        {...(onTestModel ? { onTestModel } : {})}
                        {...(onTestPurpose ? { onTestPurpose } : {})}
                      />
                    </TabsContent>
                  </Tabs>
                )}
                {providerDraft.type !== 'ai' && (
                  <>
                    {credentialInputOpen ? (
                      <Field>
                        <FieldLabel htmlFor="provider-credential">{credentialLabel}</FieldLabel>
                        <Input
                          id="provider-credential"
                          aria-label={credentialLabel}
                          type="password"
                          autoComplete="off"
                          value={providerDraft.credentialsRef}
                          onChange={(event) =>
                            onUpdateDraft((current) => ({
                              ...current,
                              credentialsRef: event.target.value,
                            }))
                          }
                          placeholder={providerCredentialPlaceholder(credentialLabel)}
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
                            onResetTest();
                            onSetCredentialInputOpen(true);
                          }}
                        >
                          更换凭证
                        </Button>
                      </Field>
                    )}
                  </>
                )}
                {credentialLabel === '飞书 Webhook' && (
                  <Field>
                    <FieldDescription>
                      测试连接会发送一条“ThesisLedger 连接测试”通知。
                    </FieldDescription>
                  </Field>
                )}
              </FieldGroup>
            </div>
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                disabled={savingProviderDraft}
                onClick={() => void requestClose(false)}
              >
                取消
              </Button>
              {providerDraft.type === 'ai' &&
              (providerTestState === 'testing' || savingProviderDraft) &&
              onCancelTest ? (
                <Button type="button" variant="outline" onClick={onCancelTest}>
                  取消测试
                </Button>
              ) : null}
              {providerDraft.type !== 'ai' ? (
                <Button
                  disabled={providerTestState === 'testing' || savingProviderDraft}
                  aria-busy={providerTestState === 'testing'}
                  type="button"
                  variant="outline"
                  onClick={onTest}
                >
                  {providerTestState === 'testing' && (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {providerTestLabel(providerTestState === 'testing')}
                </Button>
              ) : null}
              <Button
                disabled={providerTestState === 'testing' || savingProviderDraft}
                type="submit"
                variant="default"
              >
                {savingProviderDraft && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {saveProviderLabel(
                  savingProviderDraft,
                  Boolean(editingProviderName),
                  providerDraft.type === 'ai' && providerDraft.enabled,
                )}
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
};
