import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { parseRequestOptionsText, requestOptionsTextFor } from './ai-provider-request-options.js';
import type { ProviderDraft } from './providers.types.js';

export function AiProviderRequestOptionsFields({
  draft,
  model,
  onUpdateDraft,
}: {
  draft: ProviderDraft;
  model: string;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
}) {
  const value = requestOptionsTextFor(draft, model);
  let error: string | undefined;
  try {
    parseRequestOptionsText(value);
  } catch (failure) {
    error = failure instanceof Error ? failure.message : '请求参数无效';
  }
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm">模型请求参数</summary>
      <Field className="mt-3" data-invalid={error ? true : undefined}>
        <FieldLabel>请求参数 JSON</FieldLabel>
        <FieldDescription>
          按模型文档填写 body 中的额外参数及 headers 中的非认证请求头。outputTokenLimit 可填
          budget（预算上限）或 upstream（上游默认，仅零价格模型）。留空清除参数。
        </FieldDescription>
        <Textarea
          aria-label={`${model} 请求参数 JSON`}
          aria-invalid={Boolean(error)}
          value={value}
          rows={6}
          placeholder={'{"body": {"temperature": 0.2}, "outputTokenLimit": "budget"}'}
          onChange={(event) =>
            onUpdateDraft((current) => ({
              ...current,
              modelRequestOptionsText: {
                ...current.modelRequestOptionsText,
                [model]: event.target.value,
              },
            }))
          }
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    </details>
  );
}
