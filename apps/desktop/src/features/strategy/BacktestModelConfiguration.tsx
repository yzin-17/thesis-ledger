import {
  backtestExecutionModelSchema,
  backtestExecutionModelSchemaV3,
  type BacktestExecutionModelV3,
} from '@thesis-ledger/schemas';
import { useEffect, useState } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { BacktestModelDisclosure } from './BacktestModelDisclosure.js';
import { BacktestBrokerCommissionEditor } from './BacktestBrokerCommissionEditor.js';
import { BacktestResearchLotSizeEditor } from './BacktestResearchLotSizeEditor.js';

export function parseBacktestModelConfiguration(text: string, version: 2 | 3 = 2) {
  if (!text.trim()) return { model: undefined, error: null };
  try {
    const parsed = (
      version === 3 ? backtestExecutionModelSchemaV3 : backtestExecutionModelSchema
    ).safeParse(JSON.parse(text));
    if (parsed.success) return { model: parsed.data, error: null };
    return {
      model: undefined,
      error: parsed.error.issues
        .map((issue) => `${issue.path.join('.')}：${issue.message}`)
        .join('；'),
    };
  } catch {
    return { model: undefined, error: '执行模型配置必须是有效的 JSON。' };
  }
}

export function BacktestModelConfiguration({
  text,
  confirmed,
  onChange,
  onConfirm,
  onInvalidate,
  version = 2,
}: {
  text: string;
  confirmed: boolean;
  onChange: (text: string) => void;
  onConfirm: (model: BacktestExecutionModelV3) => void;
  onInvalidate?: () => void;
  version?: 2 | 3;
}) {
  const { model, error } = parseBacktestModelConfiguration(text, version);
  const [modelDraftPending, setModelDraftPending] = useState(false);
  useEffect(() => setModelDraftPending(false), [text]);
  const invalidateModelDraft = () => { setModelDraftPending(true); onInvalidate?.(); };
  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel htmlFor="backtest-model">执行模型配置</FieldLabel>
      <Textarea
        id="backtest-model"
        aria-label="执行模型配置"
        aria-invalid={Boolean(error)}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription>
        {version === 3
          ? '填写与所选口径匹配的执行模型，确认价格、数量、成本及交易时序假设。复权研究需要显式归一化模型，原有真实价格模型不会自动转换。'
          : '粘贴完整的 execution-model-v1 配置，检查范围与假设后确认。留空时，数据源必须提供覆盖本次区间的历史执行规则；系统不会自动补充预设。'}
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
      {model && (
        <>
          {version === 3 && <BacktestBrokerCommissionEditor
            key={JSON.stringify(model)} model={model} onChange={onChange}
            onDraftChange={invalidateModelDraft}
          />}
          {version === 3 && <BacktestResearchLotSizeEditor
            key={`lot-${JSON.stringify(model)}`} model={model} onChange={onChange} onDraftChange={invalidateModelDraft}
          />}
          <BacktestModelDisclosure disclosure={{ model }} />
          <Button
            type="button"
            variant="outline"
            disabled={confirmed || modelDraftPending}
            onClick={() => onConfirm(model)}
          >
            {confirmed ? '已确认执行模型' : '确认以上范围与假设'}
          </Button>
        </>
      )}
    </Field>
  );
}
