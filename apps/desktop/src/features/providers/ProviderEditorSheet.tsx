import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle } from 'lucide-react';
import {
  providerCapabilityOptions,
  providerCredentialLabel,
  providerCredentialPlaceholder,
  providerTypeLabel,
} from './providers.types.js';

import type { ProviderDraft } from './providers.types.js';

const saveProviderLabel = (saving: boolean, editing: boolean) => {
  if (saving) return '保存中…';
  return editing ? '保存修改' : '保存 Provider';
};

export const ProviderEditorSheet = ({
  open,
  editingProviderName,
  providerDraft,
  credentialInputOpen,
  providerTestState,
  savingProviderDraft,
  onOpenChange,
  onUpdateDraft,
  onResetTest,
  onSetCredentialInputOpen,
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
  onOpenChange: (open: boolean) => void;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  onResetTest: () => void;
  onSetCredentialInputOpen: (open: boolean) => void;
  onClose: () => void;
  onTest: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) => {
  const credentialLabel = providerCredentialLabel(providerDraft.name, providerDraft.type);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby="provider-form-description"
        className="h-[100dvh] w-[620px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
      >
        <div className="panel-heading">
          <SheetTitle>{editingProviderName ? '更新 Provider' : '新增或更新 Provider'}</SheetTitle>
          <SheetDescription id="provider-form-description">
            凭证用于连接 Provider；已配置凭证不会回显，编辑时留空保存不会删除当前凭证。
          </SheetDescription>
        </div>
        <form
          key={editingProviderName ?? 'new-provider'}
          className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
          onSubmit={onSave}
        >
          <label>
            名称
            <Input
              value={providerDraft.name}
              onChange={(event) =>
                onUpdateDraft((current) => ({ ...current, name: event.target.value }))
              }
              readOnly={Boolean(editingProviderName)}
              required
              maxLength={80}
            />
          </label>
          <label>
            类型
            <Select
              value={providerDraft.type}
              onValueChange={(value) =>
                value && onUpdateDraft((current) => ({ ...current, type: value }))
              }
            >
              <SelectTrigger className="w-full">
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
          </label>
          <label>
            能力（可多选）
            <Select
              multiple
              items={providerCapabilityOptions}
              value={providerDraft.capabilities}
              onValueChange={(value) =>
                onUpdateDraft((current) => ({ ...current, capabilities: value }))
              }
            >
              <SelectTrigger className="w-full">
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
          </label>
          <label>
            优先级
            <Input
              type="number"
              min={0}
              step={1}
              value={providerDraft.priority}
              onChange={(event) =>
                onUpdateDraft((current) => ({ ...current, priority: Number(event.target.value) }))
              }
              required
            />
          </label>
          {credentialInputOpen ? (
            <label>
              {credentialLabel}
              <Input
                type="password"
                autoComplete="off"
                value={providerDraft.credentialsRef}
                onChange={(event) =>
                  onUpdateDraft((current) => ({ ...current, credentialsRef: event.target.value }))
                }
                placeholder={providerCredentialPlaceholder(credentialLabel)}
              />
            </label>
          ) : (
            <div className="provider-credential-field">
              <span className="provider-credential-label">凭证</span>
              <div className="provider-credential-summary">
                <span className="provider-credential-state" role="status">
                  <span aria-hidden="true">✓</span>
                  已配置
                </span>
                <Button
                  className="text-button"
                  type="button"
                  variant="link"
                  onClick={() => {
                    onResetTest();
                    onSetCredentialInputOpen(true);
                  }}
                >
                  更换凭证
                </Button>
              </div>
            </div>
          )}
          {credentialLabel === '飞书 Webhook' && (
            <p className="form-help">测试连接会发送一条“ThesisLedger 连接测试”通知。</p>
          )}
          <div className="form-actions">
            <Button
              className="secondary"
              type="button"
              variant="outline"
              disabled={savingProviderDraft}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              className="secondary"
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
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
