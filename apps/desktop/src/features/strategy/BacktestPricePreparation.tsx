import { createClientRequestId } from '../../lib/client-request-id';
import { PreparedPriceSources } from './PreparedPriceSources.js';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useRef, useState } from 'react';
import { formatDateTime } from '@/lib/date-display';
import {
  backtestRunPreparationRequestV3Schema,
  positiveDecimalStringSchema,
  type BacktestExecutionModelV3,
  type BacktestRunPreparationRequestV3,
  type BacktestRunPreparationResultV3,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useBacktestExecutionModel } from './use-backtest-execution-model.js';
import { useBacktestPreparation } from './strategy.preparation.js';
import { BacktestPreflightDiagnostics } from './BacktestPreflightDiagnostics.js';
import { BacktestLifecycleResearchChoice } from './BacktestLifecycleResearchChoice.js';
import { BacktestLifecyclePreparationDisclosure } from './BacktestLifecyclePreparationDisclosure.js';
import { AnnouncementPreparationStatus } from './AnnouncementPreparationStatus.js';
import { BacktestHistoryChoice, backtestHistoryLabels as histories } from './BacktestHistoryChoice.js';
import {
  BacktestKnownCashResearchChoice,
  useKnownCashResearchChoice,
} from './BacktestKnownCashResearchChoice.js';
export type PreparedBacktest = Extract<BacktestRunPreparationResultV3, { status: 'prepared' }>;
const ruleModes = {
  'require-events': '要求完整公司行动',
  'rules-only': '只研究原价与规则',
} as const;

import {useStrategySubmission} from './use-strategy-submission.js';
import { BacktestSubmissionFeedback } from './BacktestSubmissionFeedback.js';
export function BacktestPricePreparation({
  strategyVersionId,
  adjustment,
  period,
  initialCash,
  currency,
  onPrepared,
  initialModel,
  onDirtyChange, onSubmitted,
  formId,
  onReadyChange,
  onBusyChange,
  priceResearch = false,
}: {
  strategyVersionId: string;
  adjustment: 'none' | 'qfq' | 'hfq';
  period: { start: string; end: string };
  initialCash: string;
  currency: 'CNY' | 'HKD' | 'USD';
  onPrepared: (prepared: PreparedBacktest | null) => void;
  initialModel?: BacktestExecutionModelV3;
  onSubmitted?: ()=>void;
  onDirtyChange?: (dirty: boolean) => void;
  formId?: string;
  onReadyChange?: (ready: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  priceResearch?: boolean;
}) {
  const resolution = useBacktestExecutionModel({ strategyVersionId, period, currency, adjustment, initialModel });
  const model = resolution.model;
  const automatic = useStrategySubmission(onSubmitted);
  useEffect(() => {
    onBusyChange?.(automatic.isPending);
  }, [automatic.isPending, onBusyChange]);
  useEffect(() => {
    onReadyChange?.(Boolean(model) && !resolution.loading && !automatic.isPending);
  }, [model, resolution.loading, automatic.isPending, onReadyChange]);
  const [history, setHistory] = useState<keyof typeof histories>('fixed-provider-snapshot');
  const [evidence, setEvidence] = useState('');
  const [lifecycleResearch, setLifecycleResearch] = useState(false);
  const cashChoice = useKnownCashResearchChoice();
  const [ruleMode, setRuleMode] = useState<keyof typeof ruleModes>('require-events');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    key: string;
    request: BacktestRunPreparationRequestV3;
  } | null>(null);
  const key = JSON.stringify({
    strategyVersionId,
    adjustment,
    period,
    initialCash,
    currency,
    model,
    history,
    evidence,
    ruleMode,
    lifecycleResearch,
    knownCashResearch: cashChoice.fingerprint,
    priceResearch,
  });
  const query = useBacktestPreparation(key, submitted);
  const draftKey = JSON.stringify({ strategyVersionId, adjustment, period, initialCash, currency,
    history, evidence, ruleMode, lifecycleResearch, knownCashResearch: cashChoice.fingerprint });
  const initialKey = useRef(draftKey);
  useEffect(() => {
    if (draftKey !== initialKey.current) onDirtyChange?.(true);
  }, [draftKey, onDirtyChange]);
  const cashResearch =
    adjustment === 'none' &&
    history === 'fixed-provider-snapshot' &&
    model?.scope.market === 'CN' &&
    model.scope.instrumentType === 'ETF';
  const lifecycleEligible =
    history === 'fixed-provider-snapshot' &&
    model?.scope.market === 'CN' &&
    model.scope.instrumentType === 'STOCK';
  const result = query.data;
  const ruleEligible =
    adjustment === 'none' &&
    history === 'fixed-provider-snapshot' &&
    model?.scope.instrumentType === 'STOCK';
  const ruleResearch = ruleEligible && ruleMode === 'rules-only';
  const priceLabels = { none: '不复权 · 原始份额', qfq: '前复权 · 归一化份额', hfq: '后复权 · 归一化份额' };
  const priceLabel = priceResearch ? '后复权 · 策略收益研究' : priceLabels[adjustment];
  useEffect(() => {
    onPrepared(result?.status === 'prepared' ? result : null);
  }, [result, onPrepared]);
  useEffect(() => () => onPrepared(null), [onPrepared]);

  const prepare = (run=false) => {
    if (automatic.isPending) return;
    if (!positiveDecimalStringSchema.safeParse(initialCash).success) {
      setError('初始资金必须是大于 0 的有效金额。');
      return;
    }
    if (!model || resolution.loading) {
      setError(resolution.message ?? '正在准备回测执行设置，请稍候。');
      return;
    }
    const timezones = { CNY: 'Asia/Shanghai', HKD: 'Asia/Hong_Kong', USD: 'America/New_York' };
    const parsed = backtestRunPreparationRequestV3Schema.safeParse({
      contractVersion: 3,
      requestId: createClientRequestId(),
      freezeTimePolicy:
        history === 'fixed-provider-snapshot' ? 'after-acquisition' : 'requested-time',
      strategyVersionId,
      adjustment,
      ...(priceResearch ? { priceResearch: 'price-research-v1' } : {}),
      ...(lifecycleEligible && lifecycleResearch
        ? { lifecycleResearch: 'listed-bars-warmup-v1' }
        : {}),
      accountingBasis: adjustment === 'none' ? 'raw-events' : 'normalized-series',
      ...(cashResearch ? { cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1' } : {}),
      ...(cashResearch && currency === 'CNY' && cashChoice.controls.selected
        ? { knownCashResearch: cashChoice.policy }
        : {}),
      ...(ruleResearch ? { marketRuleResearch: 'raw-prices-no-corporate-actions-v1' } : {}),
      history:
        history === 'point-in-time'
          ? { basis: history, reconstructionEvidenceRef: evidence.trim() }
          : { basis: history },
      runConfig: {
        startDate: period.start,
        endDate: period.end,
        dataAsOf: new Date().toISOString(),
        baseCurrency: currency,
        initialCash: { [currency]: initialCash },
        valuationPolicy: {
          baseTimezone: timezones[currency],
          dailyValuationTime: '16:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
        executionModel: model,
      },
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('；'));
      return;
    }
    setError(null);
    onPrepared(null);
    if(run){automatic.mutate({signature:key,input:{kind:'ordinary',preparation:parsed.data}});return;}
    setSubmitted({ key, request: parsed.data });
  };

  return (
    <form id={formId} onSubmit={(event) => { event.preventDefault(); prepare(true); }}>
    <fieldset disabled={automatic.isPending} className="min-w-0">
    <FieldGroup>
      <Field>
        <FieldLabel>回测执行设置</FieldLabel>
        {resolution.loading && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner aria-hidden="true" />正在准备回测执行设置…</p>}
        {model && <FieldDescription>{resolution.retained ? '沿用本次记录的回测执行设置。' : '费用与成交方式沿用当前策略，执行设置已自动准备。'}</FieldDescription>}
        {resolution.policy === 'research-defaults' && <p className="text-sm font-medium">研究默认规则</p>}
        <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
          {resolution.notes.map((note) => <li key={note}>{note}</li>)}
          <li>历史数据：{histories[history]}；准备完成时冻结。</li>
        </ul>
        {resolution.message && (
          <Alert variant="destructive">
            <AlertTitle>回测设置暂不可用</AlertTitle>
            <AlertDescription>
              <p>{resolution.message}</p>
              <Button type="button" variant="outline" onClick={resolution.retry}>
                重新准备执行设置
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </Field>
      {!priceResearch && <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">高级回测选项</summary>
        <div className="mt-4 flex flex-col gap-4">
      <BacktestHistoryChoice value={history} onChange={setHistory} />
        {cashResearch && !cashChoice.controls.selected && (
          <p className="text-xs text-muted-foreground">
            按已核验公告计算现金分红：除息日确认权益，发放日按开盘到账模型结算；拆分未纳入。
          </p>
        )}
      {cashResearch && currency === 'CNY' && (
        <BacktestKnownCashResearchChoice {...cashChoice.controls} />
      )}
      {lifecycleEligible && (
        <BacktestLifecycleResearchChoice
          selected={lifecycleResearch}
          onChange={setLifecycleResearch}
        />
      )}
      {history === 'point-in-time' && (
        <Field>
          <FieldLabel>历史重建证据引用</FieldLabel>
          <Input
            aria-label="历史重建证据引用"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
          />
        </Field>
      )}
      {ruleEligible && (
        <Field>
          <FieldLabel>公司行动处理</FieldLabel>
          <ToggleGroup
            value={[ruleMode]}
            aria-label="公司行动处理"
            onValueChange={(values) => {
              const value = values[0];
              if (value === 'require-events' || value === 'rules-only') setRuleMode(value);
            }}
          >
            {Object.entries(ruleModes).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>
            只研究原价与规则时，保留实际份额，明确不纳入分红、拆合股等公司行动；未知收费与状态仍按本次模型披露。
          </FieldDescription>
        </Field>
      )}
      {history === 'fixed-provider-snapshot' && (
        <p className="text-sm text-muted-foreground">
          准备完成时冻结本次取得的行情，并显示实际冻结时间。
        </p>
      )}
        </div>
      </details>}
      {!formId && <Button type="button" aria-busy={automatic.isPending} disabled={!model || resolution.loading || automatic.isPending || query.isFetching} onClick={()=>prepare(true)}>{automatic.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}{automatic.isPending ? '正在提交…' : '准备并开始回测'}</Button>}
      {!formId && <Button
        aria-busy={query.isFetching}
        type="button"
        variant="outline"
        disabled={!model || query.isFetching || result?.status === 'preparing'}
        onClick={()=>prepare()}
      >
        {query.isFetching && <Spinner data-icon="inline-start" aria-hidden="true" />}
        {query.isFetching ? '正在准备并预检…' : '准备并核对配置'}
      </Button>}
      {error && <Field invalid><FieldError>{error}</FieldError></Field>}
      <AnnouncementPreparationStatus result={result} />
      {query.stale && <Field invalid><FieldError>路由配置已经改变，请重新准备。</FieldError></Field>}
      {query.error && (
        <Field invalid><FieldError>
          {query.error instanceof Error ? query.error.message : '配置准备失败，请重试'}
        </FieldError></Field>
      )}
      {result?.status === 'blocked' && (
        <BacktestPreflightDiagnostics diagnostics={result.diagnostics} />
      )}
      {result?.status === 'prepared' && (
        <BacktestLifecyclePreparationDisclosure config={result.runConfig} />
      )}
      {result?.status === 'prepared' && (
        <Alert>
          <AlertTitle>配置已准备，运行预检通过</AlertTitle>
          <AlertDescription>
            <p>冻结时间：{formatDateTime(result.runConfig.dataAsOf)}</p>
            <PreparedPriceSources value={result} />
            <p>
              {priceLabel}{' '}
              · {histories[result.runConfig.executionPriceProtocol.history.basis]}
            </p>
            <p>已检查执行行情和所需依赖。创建时仍会重新校验，预检通过不代表回测已完成。</p>
            {result.runConfig.knownCashPreparation && (
              <p>
                现金资料实际来源：
                {result.runConfig.knownCashPreparation.input.source.target.providerId} /{' '}
                {result.runConfig.knownCashPreparation.input.source.target.upstreamSource}；分红记录{' '}
                {result.runConfig.knownCashPreparation.input.records.length} 条，忽略空占位{' '}
                {result.runConfig.knownCashPreparation.input.ignoredEmptyRows}{' '}
                条。覆盖未知，零条不证明零分红；按登记资格和计划发放日模拟税前现金。
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </FieldGroup>
    </fieldset>
    <BacktestSubmissionFeedback receipt={automatic.receipt} error={automatic.error ?? automatic.confirm.error} onRetry={automatic.retry} onConfirm={() => automatic.confirm.mutate()} confirming={automatic.confirm.isPending} />
    </form>
  );
}
