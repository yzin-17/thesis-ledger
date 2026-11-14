import { Spinner } from '@/components/ui/spinner';
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
  model: ResearchDefaultModelFieldState;
  disabled?: boolean;
}) {
  const { query, selected, currentDefault } = model;
  const { locked, hasError, canSave, canClear, canReload } = defaultModelControls(model, disabled);
  const selectedLabel = defaultModelSelectedLabel(model);
  const errorMessage = defaultModelErrorMessage(model);

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
      {query.isPending && (
        <FieldDescription>
          <Spinner aria-label="正在读取研究默认模型" />
        </FieldDescription>
      )}
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
          aria-busy={model.saving}
          type="button"
          size="sm"
          variant="outline"
          disabled={!canSave}
          onClick={model.save}
        >
          {model.saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {model.saving ? '保存中…' : '保存默认模型'}
        </Button>
        {currentDefault && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canClear}
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
            disabled={!canReload}
            onClick={model.reload}
          >
            {query.isFetching && <Spinner data-icon="inline-start" aria-hidden="true" />}
            重新读取模型
          </Button>
        )}
      </div>
    </Field>
  );
}

type ModelState = ReturnType<typeof useResearchDefaultModel>;
type ModelOption = Pick<ModelState['options'][number], 'value' | 'label' | 'priceConfigured'>;
type ResearchDefaultModelFieldState = Pick<
  ModelState,
  'selectedKey' | 'currentDefault' | 'dirty' | 'saving' | 'error' | 'choose' | 'save' | 'reload'
> & {
  query: Pick<ModelState['query'], 'isPending' | 'isError' | 'isFetching'>;
  options: Pick<ModelOption, 'value' | 'label'>[];
  selected: ModelOption | undefined;
};

function defaultModelControls(model: ResearchDefaultModelFieldState, disabled: boolean) {
  const locked = disabled || model.saving || model.query.isPending || model.query.isError;
  return {
    locked,
    hasError: model.query.isError || Boolean(model.error),
    canSave: Boolean(!locked && model.dirty && (model.selected || model.selectedKey === 'none')),
    canClear: !locked && model.selectedKey !== 'none',
    canReload: !disabled && !model.saving && !model.query.isFetching,
  };
}

function defaultModelSelectedLabel(model: ResearchDefaultModelFieldState) {
  if (model.selected) return model.selected.label;
  if (model.selectedKey !== 'none' && model.currentDefault)
    return model.currentDefault.providerId + ' / ' + model.currentDefault.model;
  return '尚未选择研究默认模型';
}

function defaultModelErrorMessage(model: ResearchDefaultModelFieldState) {
  const fallback = '研究默认模型保存失败，请重新读取后重试。';
  if (model.query.isError) return '研究默认模型读取失败，请重新读取后再提交。';
  if (model.error instanceof ThesisLedgerApiError) return model.error.payload?.message ?? fallback;
  if (model.error instanceof Error) return model.error.message;
  return fallback;
}
