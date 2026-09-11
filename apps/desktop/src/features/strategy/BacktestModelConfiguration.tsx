import { backtestExecutionModelSchema, type BacktestExecutionModel } from '@thesis-ledger/schemas';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { BacktestModelDisclosure } from './BacktestModelDisclosure.js';

export function parseBacktestModelConfiguration(text: string) {
  if (!text.trim()) return { model: undefined, error: null };
  try {
    const parsed = backtestExecutionModelSchema.safeParse(JSON.parse(text));
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
}: {
  text: string;
  confirmed: boolean;
  onChange: (text: string) => void;
  onConfirm: (model: BacktestExecutionModel) => void;
}) {
  const { model, error } = parseBacktestModelConfiguration(text);
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
        粘贴完整的 execution-model-v1
        配置，检查范围与假设后确认。留空沿用旧执行规则；当前没有默认预设，关键事实缺失会阻止运行。
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
      {model && (
        <>
          <BacktestModelDisclosure disclosure={{ model }} />
          <Button
            type="button"
            variant="outline"
            disabled={confirmed}
            onClick={() => onConfirm(model)}
          >
            {confirmed ? '已确认执行模型' : '确认以上范围与假设'}
          </Button>
        </>
      )}
    </Field>
  );
}
