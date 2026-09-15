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
import { AiProviderEditorFields } from './AiProviderEditorFields.js';
import {
  providerCapabilityOptions,
  providerCredentialLabel,
  providerCredentialPlaceholder,
  providerDraftForType,
  providerTypeLabel,
} from './providers.types.js';

import type { AiProviderModelDetail, ProviderDraft } from './providers.types.js';

const saveProviderLabel = (saving: boolean, editing: boolean) => {
  if (saving) return '保存中…';
  return editing ? '保存修改' : '保存 Provider';
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
  onAiTypeSelected,
  onFetchAiModels = () => undefined,
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
  onAiTypeSelected: () => void;
  onFetchAiModels?: () => void;
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
                    disabled={providerDraft.type === 'ai'}
                    onValueChange={(value) => {
                      if (value === 'ai') {
                        onAiTypeSelected();
                        return;
                      }
                      if (value) onUpdateDraft((current) => providerDraftForType(value, current));
                    }}
                  >
                    <SelectTrigger id="provider-type" aria-label="类型" className="w-full">
                      <SelectValue>{providerTypeLabel(providerDraft.type)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="notification">通知</SelectItem>
                        <SelectItem value="market">行情</SelectItem>
                        <SelectItem value="ai">人工智能</SelectItem>
                        <SelectItem value="vision">图像</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {providerDraft.type === 'ai' && (
                  <AiProviderEditorFields
                    draft={providerDraft}
                    credentialInputOpen={credentialInputOpen}
                    takingOverEnvironmentName={takingOverEnvironmentName}
                    onUpdateDraft={onUpdateDraft}
                    onResetTest={onResetTest}
                    onSetCredentialInputOpen={onSetCredentialInputOpen}
                    availableModels={availableAiModels}
                    modelDetails={aiModelDetails}
                    modelCatalogState={aiModelCatalogState}
                    onFetchModels={onFetchAiModels}
                  />
                )}
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
                {providerTestState === 'testing' ? '测试中…' : '测试连接'}
              </Button>
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
                {saveProviderLabel(savingProviderDraft, Boolean(editingProviderName))}
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
};
