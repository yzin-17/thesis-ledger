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
  const fields =
    provider.credentialSchema?.methods.find((item) => item.method === draft.method)?.fields ?? [];
  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => {
        const labelId = `credential-${provider.providerId}-${field.name}`;
        const retained = canRetainCredentialField(provider, draft.method, field.name);
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <span id={labelId} className="text-sm font-medium">
              {credentialFieldLabels[field.name] ?? field.name}
            </span>
            <Input
              aria-labelledby={labelId}
              type={field.secret ? 'password' : 'text'}
              value={draft.values[field.name] ?? ''}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              placeholder={retained ? '已保存，留空保留' : '请输入'}
              onChange={(event) =>
                onChange({
                  ...draft,
                  values: { ...draft.values, [field.name]: event.target.value },
                })
              }
            />
          </div>
        );
      })}
    </div>
  );
}
