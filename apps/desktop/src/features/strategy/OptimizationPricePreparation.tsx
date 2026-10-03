import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/date-display';
import { useQuery } from '@tanstack/react-query';
import {
  optimizationRunPreparationRequestSchema,
  type BacktestExecutionModelV3,
  type OptimizationPreparationTarget,
  type OptimizationRunPreparationRequest,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BacktestModelConfiguration } from './BacktestModelConfiguration.js';
import {
  prepareOptimizationConfiguration,
  type PreparedOptimizationConfiguration,
} from './optimization.preparation.js';
import { usePreparationRouteStale } from './strategy.preparation.js';

const adjustments = { none: '不复权', qfq: '前复权', hfq: '后复权' } as const;
const histories = {
  'fixed-provider-snapshot': '固定供应商快照',
  'point-in-time': '严格历史时点',
} as const;

export function OptimizationPricePreparation({
  target,
  startDate,
  endDate,
  currency,
  initialCash,
  onPrepared,
}: {
  target: OptimizationPreparationTarget;
  startDate: string;
  endDate: string;
  currency: 'CNY' | 'HKD' | 'USD';
  initialCash: string;
  onPrepared: (value: PreparedOptimizationConfiguration | null) => void;
}) {
  const [adjustment, setAdjustment] = useState<keyof typeof adjustments>('qfq');
  const [history, setHistory] = useState<keyof typeof histories>('fixed-provider-snapshot');
  const [evidence, setEvidence] = useState('');
  const [warmupBudget, setWarmupBudget] = useState('60');
  const [text, setText] = useState('');
  const [model, setModel] = useState<BacktestExecutionModelV3>();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    key: string;
    request: OptimizationRunPreparationRequest;
  } | null>(null);
  const key = JSON.stringify({
    target,
    startDate,
    endDate,
    currency,
    initialCash,
    adjustment,
    history,
    evidence,
    warmupBudget,
    text,
    model,
  });
  const query = useQuery({
    queryKey: ['optimization-run-preparation', key, submitted?.request.intent.requestId],
    enabled: submitted !== null && submitted.key === key,
    queryFn: ({ signal }) => {
      if (!submitted || submitted.key !== key) throw new Error('请重新准备当前配置');
      return prepareOptimizationConfiguration(submitted.request, signal);
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const stale = usePreparationRouteStale(
    query.data?.status === 'prepared' ? query.data.routeRevisions : null,
    query.dataUpdatedAt,
  );
  const result = submitted?.key === key && !stale ? query.data : undefined;
  useEffect(() => {
    onPrepared(
      result?.status === 'prepared' && submitted
        ? { target: submitted.request.target, result }
        : null,
    );
  }, [result, submitted, onPrepared]);
  useEffect(() => () => onPrepared(null), [onPrepared]);
  const prepare = () => {
    const timezones = { CNY: 'Asia/Shanghai', HKD: 'Asia/Hong_Kong', USD: 'America/New_York' };
    const parsed = optimizationRunPreparationRequestSchema.safeParse({
      target,
      intent: {
        contractVersion: 3,
        requestId: crypto.randomUUID(),
        freezeTimePolicy:
          history === 'fixed-provider-snapshot' ? 'after-acquisition' : 'requested-time',
        warmupBudgetSessions: warmupBudget.trim() === '' ? undefined : Number(warmupBudget),
        adjustment,
        accountingBasis: adjustment === 'none' ? 'raw-events' : 'normalized-series',
        history:
          history === 'point-in-time'
            ? { basis: history, reconstructionEvidenceRef: evidence.trim() }
            : { basis: history },
        runConfig: {
          startDate,
          endDate,
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
      },
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('；'));
      return;
    }
    setError(null);
    onPrepared(null);
    setSubmitted({ key, request: parsed.data });
  };
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>候选预热预算（交易日）</FieldLabel>
        <Input
          aria-label="候选预热预算（交易日）"
          type="number"
          min={0}
          max={504}
          step={1}
          value={warmupBudget}
          onChange={(event) => {
            onPrepared(null);
            setWarmupBudget(event.target.value);
          }}
        />
        <p className="text-sm text-muted-foreground">
          准备时一次冻结所需行情，候选超过预算将停止，不自动重新取价。
        </p>
      </Field>
      <Field>
        <FieldLabel>实验价格口径</FieldLabel>
        <ToggleGroup
          aria-label="实验价格口径"
          value={[adjustment]}
          onValueChange={(values) => {
            const value = values[0];
            if (value === 'none' || value === 'qfq' || value === 'hfq') {
              onPrepared(null);
              setAdjustment(value);
            }
          }}
        >
          {Object.entries(adjustments).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <BacktestModelConfiguration
        version={3}
        text={text}
        confirmed={Boolean(model)}
        onChange={(value) => {
          onPrepared(null);
          setText(value);
          setModel(undefined);
        }}
        onConfirm={setModel}
      />
      <Field>
        <FieldLabel>历史输入性质</FieldLabel>
        <ToggleGroup
          aria-label="实验历史输入性质"
          value={[history]}
          onValueChange={(values) => {
            const value = values[0];
            if (value === 'fixed-provider-snapshot' || value === 'point-in-time') {
              onPrepared(null);
              setHistory(value);
            }
          }}
        >
          {Object.entries(histories).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      {history === 'point-in-time' && (
        <Field>
          <FieldLabel>历史重建证据引用</FieldLabel>
          <Input
            aria-label="历史重建证据引用"
            value={evidence}
            onChange={(event) => {
              onPrepared(null);
              setEvidence(event.target.value);
            }}
          />
        </Field>
      )}
      {history === 'fixed-provider-snapshot' && (
        <p className="text-sm text-muted-foreground">
          准备完成时冻结本次取得的行情，并显示实际冻结时间。
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={prepare}
        disabled={!model || query.isFetching}
      >
        {query.isFetching ? '正在准备实验配置…' : '准备实验配置'}
      </Button>
      {error && <FieldError>{error}</FieldError>}
      {stale && <FieldError>路由配置已经改变，请重新准备实验配置。</FieldError>}
      {query.error && (
        <FieldError>
          {query.error instanceof Error ? query.error.message : '实验配置准备失败'}
        </FieldError>
      )}
      {result?.status === 'blocked' && (
        <Alert variant="destructive">
          <AlertTitle>实验配置暂不可用</AlertTitle>
          <AlertDescription>
            {result.diagnostics.map((diagnostic, index) => (
              <p key={index}>
                {diagnostic.message}{' '}
                {diagnostic.suggestedActions.map((action) => action.description).join('；')}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}
      {result?.status === 'prepared' && (
        <Alert>
          <AlertTitle>实验配置已准备</AlertTitle>
          <AlertDescription>
            <p>冻结时间：{formatDateTime(result.runConfig.dataAsOf)}</p>
            <p>
              {adjustments[result.runConfig.executionPriceProtocol.priceBasis.adjustment]} ·{' '}
              {histories[result.runConfig.executionPriceProtocol.history.basis]}
            </p>
            <p>
              实际来源：{result.actualSource.provenance.providerId} /{' '}
              {result.actualSource.provenance.upstreamSource} ·{' '}
              {result.actualSource.provenance.routeIndex === 0 ? '主源' : '备用源'}
            </p>
            <p>
              已检查基线行情窗口；各候选与切分仍需核对冻结事实。此操作未调用模型，也未创建实验。
            </p>
          </AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  );
}
