import { createClientRequestId } from '../../lib/client-request-id';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/date-display';
import { useQuery } from '@tanstack/react-query';
import { AnnouncementPreparationStatus } from './AnnouncementPreparationStatus.js';
import {
  optimizationRunPreparationRequestSchema,
  type OptimizationPreparationTarget,
  type OptimizationRunPreparationRequest,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useOptimizationExecutionModel } from './use-optimization-execution-model.js';
import { OptimizationExecutionSettings } from './OptimizationExecutionSettings.js';
import { PreparedPriceSources } from './PreparedPriceSources.js';
import { backtestHistoryLabels as histories } from './BacktestHistoryChoice.js';
import {
  prepareOptimizationConfiguration,
  type PreparedOptimizationConfiguration,
} from './optimization.preparation.js';
import { usePreparationRouteStale } from './strategy.preparation.js';
import { BacktestDailyMatchingFields, BacktestDailyMatchingDisclosure, useBacktestDailyMatching } from './BacktestDailyMatching.js';
const adjustmentLabels = { qfq: '前复权', hfq: '后复权', none: '不复权' } as const;

export function OptimizationPricePreparation(props: {
  dailyOrders?: boolean;
  target: OptimizationPreparationTarget;
  startDate: string;
  endDate: string;
  currency: 'CNY' | 'HKD' | 'USD';
  initialCash: string;
  onPrepared: (value: PreparedOptimizationConfiguration | null) => void;
}) {
  const control = useOptimizationPricePreparation(props);
  const {
    warmupBudget,
    onPrepared,
    setWarmupBudget,
    resolution,
    target,
    history,
    query,
    prepare,
    model,
    result,
    error,
    stale,
  } = control;

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
        <FieldLabel>策略收益研究</FieldLabel>
        <p className="text-sm">后复权计算指标与模拟收益；具体价格条件使用不复权参考价。</p>
        <p className="text-xs text-muted-foreground">
          准备时冻结两套行情，基线和所有候选复用相同版本。
        </p>
      </Field>
      <OptimizationExecutionSettings
        resolution={resolution}
        discovery={target.sourceMode === 'discovery'}
      />
      <BacktestDailyMatchingFields control={control.matching} unit="研究单位" optional={!control.matching.required} disabled={query.isFetching || result?.status === 'preparing'} />
      <Field>
        <FieldLabel>历史数据使用方式</FieldLabel>
        <p className="text-sm">{histories[history]}</p>
        <p className="text-xs text-muted-foreground">
          准备完成后冻结；复权历史可能包含后来公司行动的影响，不代表当时可见的数据版本。
        </p>
      </Field>
      <Button
        aria-busy={query.isFetching}
        type="button"
        variant="outline"
        onClick={() => prepare()}
        disabled={
          !model ||
          !control.matching.valid ||
          resolution.loading ||
          Boolean(resolution.message) ||
          query.isFetching ||
          result?.status === 'preparing'
        }
      >
        {query.isFetching && <Spinner data-icon="inline-start" aria-hidden="true" />}
        {query.isFetching ? '正在准备实验配置…' : '准备实验配置'}
      </Button>
      {error && (
        <Field invalid>
          <FieldError>{error}</FieldError>
        </Field>
      )}
      {stale && (
        <Field invalid>
          <FieldError>路由配置已经改变，请重新准备实验配置。</FieldError>
        </Field>
      )}
      {query.error && (
        <Field invalid>
          <FieldError>
            {query.error instanceof Error ? query.error.message : '实验配置准备失败'}
          </FieldError>
        </Field>
      )}
      <AnnouncementPreparationStatus result={result} />
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
            <BacktestDailyMatchingDisclosure policy={result.runConfig.dailyOrderMatching} unit="研究单位" />
            <p>
              {adjustmentLabels[result.runConfig.executionPriceProtocol.priceBasis.adjustment]} ·{' '}
              {histories[result.runConfig.executionPriceProtocol.history.basis]}
            </p>
            <PreparedPriceSources value={result} />
            <p>
              已检查基线行情窗口；各候选与切分仍需核对冻结事实。此操作未调用模型，也未创建实验。
            </p>
          </AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  );
}

function useOptimizationPricePreparation({
  dailyOrders = false,
  target,
  startDate,
  endDate,
  currency,
  initialCash,
  onPrepared,
}: {
  dailyOrders?: boolean;
  target: OptimizationPreparationTarget;
  startDate: string;
  endDate: string;
  currency: 'CNY' | 'HKD' | 'USD';
  initialCash: string;
  onPrepared: (value: PreparedOptimizationConfiguration | null) => void;
}) {
  const adjustment = 'hfq' as const;
  const history = 'fixed-provider-snapshot' as const;
  const [warmupBudget, setWarmupBudget] = useState('60');
  const matching = useBacktestDailyMatching(dailyOrders);
  const resolution = useOptimizationExecutionModel({
    target,
    startDate,
    endDate,
    currency,
    adjustment,
  });
  const model = resolution.model;
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    key: string;
    request: OptimizationRunPreparationRequest;
  } | null>(null);
  const key = JSON.stringify({
    dailyMatching: matching.signature,
    target,
    startDate,
    endDate,
    currency,
    initialCash,
    adjustment,
    history,
    warmupBudget,
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
    refetchInterval: (query) => (query.state.data?.status === 'preparing' ? 2000 : false),
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
    if (!model || resolution.loading || resolution.message) {
      setError(resolution.message ?? '正在准备模拟成交设置，请稍候。');
      return;
    }
    const timezones = { CNY: 'Asia/Shanghai', HKD: 'Asia/Hong_Kong', USD: 'America/New_York' };
    const parsed = optimizationRunPreparationRequestSchema.safeParse({
      target,
      intent: {
        contractVersion: 1,
        requestId: createClientRequestId(),
        freezeTimePolicy: 'after-acquisition',
        warmupBudgetSessions: warmupBudget.trim() === '' ? undefined : Number(warmupBudget),
        adjustment,
        priceResearch: 'price-research-v1',
        priceResearchReference: 'freeze',
        accountingBasis: 'normalized-series',
        history: { basis: history },
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
          ...(matching.policy ? { dailyOrderMatching: matching.policy } : {}),
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

  return {
    warmupBudget,
    matching,
    onPrepared,
    setWarmupBudget,
    resolution,
    target,
    history,
    query,
    prepare,
    model,
    result,
    error,
    stale,
  };
}
