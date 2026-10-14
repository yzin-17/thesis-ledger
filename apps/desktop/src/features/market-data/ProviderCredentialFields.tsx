import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProviderCredentialDraft, ProviderManifest } from './market-data.types.js';
import { canRetainCredentialField, credentialFieldLabels } from './provider-credentials.js';

export function ProviderCredentialFields({
  provider,
  draft,
  disabled,
  onChange,
}: {
  provider: ProviderManifest;
  draft: ProviderCredentialDraft;
  disabled: boolean;
  onChange: (draft: ProviderCredentialDraft) => void;
}) {
  const [editingFields, setEditingFields] = useState<string[]>([]);
  const fields =
    provider.credentialSchema?.methods.find((item) => item.method === draft.method)?.fields ?? [];
  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => {
        const labelId = `credential-${provider.providerId}-${field.name}`;
        const label = credentialFieldLabels[field.name] ?? field.name;
        const retained = canRetainCredentialField(provider, draft.method, field.name);
        const editing = editingFields.includes(field.name);
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <span id={labelId} className="text-sm font-medium">
              {label}
            </span>
            {retained && !editing ? (
              <div className="flex items-center gap-3">
                <Badge variant="secondary">已配置</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  aria-label={`更换 ${label}`}
                  onClick={() => setEditingFields((current) => [...current, field.name])}
                >
                  更换
                </Button>
              </div>
            ) : (
              <Input
                aria-labelledby={labelId}
                type={field.secret ? 'password' : 'text'}
                value={draft.values[field.name] ?? ''}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                placeholder={retained ? '请输入新值' : '请输入'}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    values: { ...draft.values, [field.name]: event.target.value },
                  })
                }
              />
            )}
            {retained && editing && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={disabled}
                aria-label={`取消更换 ${label}`}
                onClick={() => {
                  setEditingFields((current) => current.filter((name) => name !== field.name));
                  onChange({ ...draft, values: { ...draft.values, [field.name]: '' } });
                }}
              >
                取消更换
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
