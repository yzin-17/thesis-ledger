import {
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

export function parseBacktestModelConfiguration(text: string) {
  if (!text.trim()) return { model: undefined, error: null };
  try {
    const parsed = backtestExecutionModelSchemaV3.safeParse(JSON.parse(text));
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
}: {
  text: string;
  confirmed: boolean;
  onChange: (text: string) => void;
  onConfirm: (model: BacktestExecutionModelV3) => void;
  onInvalidate?: () => void;
}) {
  const { model, error } = parseBacktestModelConfiguration(text);
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
        填写执行模型，核对价格、数量、成本和交易时序假设后确认。
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
      {model && (
        <>
          <BacktestBrokerCommissionEditor
            key={JSON.stringify(model)} model={model} onChange={onChange}
            onDraftChange={invalidateModelDraft}
          />
          <BacktestResearchLotSizeEditor
            key={`lot-${JSON.stringify(model)}`} model={model} onChange={onChange} onDraftChange={invalidateModelDraft}
          />
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
