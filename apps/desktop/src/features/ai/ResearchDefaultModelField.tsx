import { Button } from '@/components/ui/button';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { useResearchDefaultModel } from './use-research-default-model.js';

export function ResearchDefaultModelField({
  model,
  disabled = false,
}: {
  model: ReturnType<typeof useResearchDefaultModel>;
  disabled?: boolean;
}) {
  const { query, selected, currentDefault } = model;
  const locked = disabled || model.saving || query.isPending || query.isError;
  const hasError = query.isError || Boolean(model.error);
  let selectedLabel = '尚未选择研究默认模型';
  if (selected) selectedLabel = selected.label;
  else if (model.selectedKey !== 'none' && currentDefault)
    selectedLabel = `${currentDefault.providerId} / ${currentDefault.model}`;
  let errorMessage = '研究默认模型保存失败，请重新读取后重试。';
  if (query.isError) errorMessage = '研究默认模型读取失败，请重新读取后再提交。';
  else if (model.error instanceof ThesisLedgerApiError)
    errorMessage = model.error.payload?.message ?? errorMessage;
  else if (model.error instanceof Error) errorMessage = model.error.message;

  return (
    <Field>
      <FieldLabel htmlFor="ai-research-default">研究默认模型</FieldLabel>
      <Select value={model.selectedKey} onValueChange={model.choose} disabled={locked}>
        <SelectTrigger id="ai-research-default" className="w-full">
          <SelectValue placeholder="尚未选择研究默认模型">{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="none">尚未选择研究默认模型</SelectItem>
            {model.options.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>保存后用于本次及后续研究；不会按提供方列表顺序自动替换。</FieldDescription>
      {query.isPending && <FieldDescription>正在读取研究默认模型…</FieldDescription>}
      {!query.isPending && !query.isError && model.options.length === 0 && (
        <FieldDescription>
          暂无可选模型，请在数据与自动化的 AI 提供方中配置“研究报告”用途。
        </FieldDescription>
      )}
      {selected && (
        <FieldDescription>
          {selected.priceConfigured
            ? '价格已填写；研究任务仍会按本次预算授权判断是否可执行。'
            : '价格尚未填写，可以保存默认，但研究生成会在费用准入阶段阻断。'}
        </FieldDescription>
      )}
      {model.dirty && (
        <FieldDescription role="status">模型选择尚未保存，请先保存默认模型。</FieldDescription>
      )}
      {hasError && <FieldError>{errorMessage}</FieldError>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked || !model.dirty || (!selected && model.selectedKey !== 'none')}
          onClick={model.save}
        >
          {model.saving ? '保存中…' : '保存默认模型'}
        </Button>
        {currentDefault && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={locked || model.selectedKey === 'none'}
            onClick={() => model.choose('none')}
          >
            清除默认
          </Button>
        )}
        {hasError && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || model.saving || query.isFetching}
            onClick={model.reload}
          >
            重新读取模型
          </Button>
        )}
      </div>
    </Field>
  );
}
