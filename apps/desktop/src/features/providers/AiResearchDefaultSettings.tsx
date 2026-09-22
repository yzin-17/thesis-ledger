import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateAiRoutingSettingsMutation } from './ai-provider.mutations.js';
import type { AiRoutingSettings } from './ai-provider.api.js';

const candidateKey = (providerId: string, model: string) => `${providerId}\u0000${model}`;

export function AiResearchDefaultSettings({
  settings,
}: {
  settings: AiRoutingSettings | undefined;
}) {
  const updateMutation = useUpdateAiRoutingSettingsMutation();
  const [draftKey, setDraftKey] = useState<string | undefined>();
  const currentKey = settings?.researchDefault
    ? candidateKey(settings.researchDefault.providerId, settings.researchDefault.model)
    : 'none';
  const selectedKey = draftKey ?? currentKey;
  const candidates = settings?.candidates ?? [];
  const candidateByKey = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [
          candidateKey(candidate.providerId, candidate.model),
          candidate,
        ]),
      ),
    [candidates],
  );
  const selectedCandidate = candidateByKey.get(selectedKey);

  useEffect(() => {
    setDraftKey(undefined);
  }, [settings?.revision]);

  const save = () => {
    if (settings?.revision === undefined) return;
    const candidate = selectedKey === 'none' ? undefined : candidateByKey.get(selectedKey);
    if (selectedKey !== 'none' && !candidate) return;
    void updateMutation.mutateAsync({
      researchDefault: candidate
        ? { providerId: candidate.providerId, model: candidate.model }
        : null,
      expectedRevision: settings.revision,
    });
  };

  const isDirty = selectedKey !== currentKey;
  return (
    <section className="panel" aria-labelledby="ai-research-default-title">
      <div className="panel-heading">
        <h2 id="ai-research-default-title">研究默认模型</h2>
        <p>新建研究只使用这里明确选择的 Provider 和模型，不会按列表顺序自动替换。</p>
      </div>
      <div className="space-y-4 p-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            尚未配置研究报告用途。请先在 AI Provider 的“模型与用途”中勾选研究报告。
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="ai-research-default">研究默认模型</FieldLabel>
            <Select value={selectedKey} onValueChange={(value) => setDraftKey(value ?? 'none')}>
              <SelectTrigger id="ai-research-default" className="w-full">
                <SelectValue placeholder="尚未选择研究默认模型">
                  {selectedCandidate
                    ? `${selectedCandidate.providerName} / ${selectedCandidate.model}`
                    : '尚未选择研究默认模型'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">尚未选择研究默认模型</SelectItem>
                  {candidates.map((candidate) => {
                    const key = candidateKey(candidate.providerId, candidate.model);
                    return (
                      <SelectItem key={key} value={key}>
                        {candidate.providerName} / {candidate.model}
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {selectedCandidate?.priceConfigured
                ? '价格已填写；研究任务仍会按本次预算授权判断是否可执行。'
                : '价格尚未填写，可以保存默认，但研究生成会在费用准入阶段阻断。'}
            </FieldDescription>
          </Field>
        )}
        {updateMutation.error ? (
          <p className="text-sm text-destructive">
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : '研究默认模型保存失败，请刷新后重试。'}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={
              !isDirty || (!selectedCandidate && selectedKey !== 'none') || updateMutation.isPending
            }
            onClick={save}
          >
            {updateMutation.isPending ? '保存中…' : '保存默认模型'}
          </Button>
          {settings?.researchDefault ? (
            <Button
              type="button"
              variant="outline"
              disabled={updateMutation.isPending}
              onClick={() => setDraftKey('none')}
            >
              清除默认
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
