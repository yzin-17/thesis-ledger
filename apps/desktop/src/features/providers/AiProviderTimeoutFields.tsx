import { AI_MAX_TIMEOUT_MS } from '@thesis-ledger/schemas';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ProviderDraft } from './providers.types.js';
export function AiProviderTimeoutFields({
  draft,
  onUpdateDraft,
}: {
  draft: ProviderDraft;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="ai-timeout">非流式完成等待（毫秒）</FieldLabel>
        <Input
          id="ai-timeout"
          aria-label="非流式完成等待（毫秒）"
          type="number"
          min={1}
          max={AI_MAX_TIMEOUT_MS}
          step={1}
          value={draft.timeoutMs}
          placeholder="留空跟随任务预算"
          onChange={(event) =>
            onUpdateDraft((current) => ({ ...current, timeoutMs: event.target.value }))
          }
        />
        <FieldDescription>
          保留旧 timeoutMs 的完成等待含义；不限制流式研究。留空使用任务余量。
        </FieldDescription>
      </Field>
      <FieldGroup className="sm:grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ai-first-output-timeout">首输出等待默认（毫秒）</FieldLabel>
          <Input
            id="ai-first-output-timeout"
            aria-label="首输出等待默认（毫秒）"
            type="number"
            min={1}
            max={AI_MAX_TIMEOUT_MS}
            step={1}
            value={draft.firstOutputTimeoutMs}
            onChange={(event) =>
              onUpdateDraft((current) => ({
                ...current,
                firstOutputTimeoutMs: event.target.value,
              }))
            }
          />
          <FieldDescription>用途未覆盖时生效；清空表示使用系统默认。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-output-idle-timeout">输出空闲等待默认（毫秒）</FieldLabel>
          <Input
            id="ai-output-idle-timeout"
            aria-label="输出空闲等待默认（毫秒）"
            type="number"
            min={1}
            max={AI_MAX_TIMEOUT_MS}
            step={1}
            value={draft.outputIdleTimeoutMs}
            onChange={(event) =>
              onUpdateDraft((current) => ({
                ...current,
                outputIdleTimeoutMs: event.target.value,
              }))
            }
          />
          <FieldDescription>用途未覆盖时生效；清空表示使用系统默认。</FieldDescription>
        </Field>
      </FieldGroup>
    </>
  );
}
