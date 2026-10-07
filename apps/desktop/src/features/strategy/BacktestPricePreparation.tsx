import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/date-display';
import {
  backtestRunPreparationRequestV3Schema,
  type BacktestExecutionModelV3,
  type BacktestRunPreparationRequestV3,
  type BacktestRunPreparationResultV3,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BacktestModelConfiguration } from './BacktestModelConfiguration.js';
import { useBacktestPreparation } from './strategy.preparation.js';
import { BacktestPreflightDiagnostics } from './BacktestPreflightDiagnostics.js';

export type PreparedBacktest = Extract<BacktestRunPreparationResultV3, { status: 'prepared' }>;
const histories = {
  'fixed-provider-snapshot': '固定供应商快照',
  'point-in-time': '严格历史时点',
} as const;

export function BacktestPricePreparation({
  strategyVersionId,
  adjustment,
  period,
  initialCash,
  currency,
  onPrepared,
  initialModel,
}: {
  strategyVersionId: string;
  adjustment: 'none' | 'qfq' | 'hfq';
  period: { start: string; end: string };
  initialCash: string;
  currency: 'CNY' | 'HKD' | 'USD';
  onPrepared: (prepared: PreparedBacktest | null) => void;
  initialModel?: BacktestExecutionModelV3;
}) {
  const [text, setText] = useState(() =>
    initialModel ? JSON.stringify(initialModel, null, 2) : '',
  );
  const [model, setModel] = useState<BacktestExecutionModelV3>();
  const [history, setHistory] = useState<keyof typeof histories>('fixed-provider-snapshot');
  const [evidence, setEvidence] = useState('');
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
    text,
    model,
    history,
    evidence,
  });
  const query = useBacktestPreparation(key, submitted);
  const result = query.data;
  useEffect(() => {
    onPrepared(result?.status === 'prepared' ? result : null);
  }, [result, onPrepared]);
  useEffect(() => () => onPrepared(null), [onPrepared]);

  const prepare = () => {
    const timezones = { CNY: 'Asia/Shanghai', HKD: 'Asia/Hong_Kong', USD: 'America/New_York' };
    const parsed = backtestRunPreparationRequestV3Schema.safeParse({
      contractVersion: 3,
      requestId: crypto.randomUUID(),
      freezeTimePolicy:
        history === 'fixed-provider-snapshot' ? 'after-acquisition' : 'requested-time',
      strategyVersionId,
      adjustment,
      accountingBasis: adjustment === 'none' ? 'raw-events' : 'normalized-series',
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
    setSubmitted({ key, request: parsed.data });
  };

  return (
    <FieldGroup>
      <BacktestModelConfiguration
        version={3}
        text={text}
        confirmed={Boolean(model)}
        onChange={(value) => {
          setText(value);
          setModel(undefined);
        }}
        onConfirm={setModel}
      />
      <Field>
        <FieldLabel>历史输入性质</FieldLabel>
        <ToggleGroup
          value={[history]}
          aria-label="历史输入性质"
          onValueChange={(values) => {
            const value = values[0];
            if (value === 'fixed-provider-snapshot' || value === 'point-in-time') setHistory(value);
          }}
        >
          {Object.entries(histories).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">
          固定复权序列可能包含后来事件的影响；严格历史时点需要可验证的重建证据。
        </p>
      </Field>
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
      {history === 'fixed-provider-snapshot' && (
        <p className="text-sm text-muted-foreground">
          准备完成时冻结本次取得的行情，并显示实际冻结时间。
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={!model || query.isFetching}
        onClick={prepare}
      >
        {query.isFetching ? '正在准备并预检…' : '准备并核对配置'}
      </Button>
      {error && <FieldError>{error}</FieldError>}
      {query.stale && <FieldError>路由配置已经改变，请重新准备。</FieldError>}
      {query.error && (
        <FieldError>
          {query.error instanceof Error ? query.error.message : '配置准备失败，请重试'}
        </FieldError>
      )}
      {result?.status === 'blocked' && (
        <BacktestPreflightDiagnostics diagnostics={result.diagnostics} />
      )}
      {result?.status === 'prepared' && (
        <Alert>
          <AlertTitle>配置已准备，运行预检通过</AlertTitle>
          <AlertDescription>
            <p>冻结时间：{formatDateTime(result.runConfig.dataAsOf)}</p>
            <p>
              实际来源：{result.actualSource.provenance.providerId} /{' '}
              {result.actualSource.provenance.upstreamSource}（
              {result.actualSource.provenance.routeIndex === 0 ? '主源' : '备用源'}）
            </p>
            <p>
              {adjustment === 'none'
                ? '不复权 · 原始份额'
                : `${adjustment === 'qfq' ? '前复权' : '后复权'} · 归一化份额`}{' '}
              · {histories[result.runConfig.executionPriceProtocol.history.basis]}
            </p>
            <p>已检查执行行情和所需依赖。创建时仍会重新校验，预检通过不代表回测已完成。</p>
          </AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  );
}
