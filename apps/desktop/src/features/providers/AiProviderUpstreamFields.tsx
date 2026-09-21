import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  aiChatImplementationLabel,
  aiChatImplementationOptions,
  aiUpstreamFormatLabel,
  aiUpstreamFormatOptions,
  withAiUpstreamFormat,
} from './ai-provider.actions.js';
import type { ProviderDraft } from './providers.types.js';

export function AiProviderUpstreamFields({
  draft,
  onUpdateDraft,
}: {
  draft: ProviderDraft;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="ai-upstream-format">上游格式</FieldLabel>
        <Select
          items={aiUpstreamFormatOptions}
          value={draft.upstreamFormat}
          onValueChange={(value) => {
            if (!value) return;
            onUpdateDraft((current) => withAiUpstreamFormat(current, value));
          }}
        >
          <SelectTrigger id="ai-upstream-format" aria-label="上游格式" className="w-full">
            <SelectValue>{aiUpstreamFormatLabel(draft.upstreamFormat)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {aiUpstreamFormatOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          切换格式会保留名称、地址、凭证和模型；离开 Chat 时会清除仅适用于 Chat 的实现选择。
        </FieldDescription>
      </Field>
      {draft.upstreamFormat === 'chat-completions' && (
        <Field>
          <FieldLabel htmlFor="ai-chat-implementation">高级选项 · Chat 实现</FieldLabel>
          <Select
            items={aiChatImplementationOptions}
            value={draft.chatImplementation ?? 'compatible'}
            onValueChange={(value) => {
              if (!value) return;
              onUpdateDraft((current) => ({ ...current, chatImplementation: value }));
            }}
          >
            <SelectTrigger
              id="ai-chat-implementation"
              aria-label="Chat 实现"
              className="w-full"
            >
              <SelectValue>
                {aiChatImplementationLabel(draft.chatImplementation ?? 'compatible')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {aiChatImplementationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
    </>
  );
}
