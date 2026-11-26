import { settledStatuses } from './useOptimizationExperimentPanel.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ExperimentBudgetFields } from './ExperimentBudgetFields.js';
import { ExperimentDiscoveryInstrumentField } from './ExperimentDiscoveryInstrumentField.js';
import { ExperimentResearchVersionChoice } from './ExperimentResearchVersionChoice.js';
import { OptimizationPricePreparation } from './OptimizationPricePreparation.js';
import { StrategyOptimizationExperimentResults } from './StrategyOptimizationExperimentResults.js';
import { StrategyOptimizationModelSelector } from './StrategyOptimizationModelSelector.js';
import type { StrategyRecord } from './strategy.types.js';
import {
  addDays,
  objectiveLabels,
  useStrategyOptimizationExperimentPanel,
} from './useOptimizationExperimentPanel.js';
export { addDays, objectiveLabels } from './useOptimizationExperimentPanel.js';

export function StrategyOptimizationExperimentPanel(props: { strategies: StrategyRecord[] }) {
  const control = useStrategyOptimizationExperimentPanel(props);
  const {
    capabilities,
    sourceMode,
    setSourceMode,
    versions,
    selectedModels,
    setSelectedModels,
    reasoningEfforts,
    setReasoningEfforts,
    hasUnknownCost,
    acknowledgeUnknownCost,
    parameters,
    selectedParameters,
    toggleParameter,
    maxAiCalls,
    maxBacktestRuns,
    maxInputTokens,
    maxOutputTokens,
    maxDurationSeconds,
    setMaxAiCalls,
    setMaxBacktestRuns,
    setMaxInputTokens,
    setMaxOutputTokens,
    setMaxDurationSeconds,
    maxCost,
    setMaxCost,
    createMutation,
    preparedConfig,
    hasInvalidReasoningSelection,
    feedback,
    experiments,
    compare,
    selectedExperimentId,
    invalidate,
    setFeedback,
    setSelectedExperimentId,
    cloneMutation,
    cancelMutation,
  } = control;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI 策略实验</CardTitle>
          <CardDescription>
            AI 实验先产生候选，采纳后成为正式策略，再由同一确定性编译器生成风险规则。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!capabilities.data?.aiOptimizationEnabled ? (
            <p className="text-sm text-muted-foreground">AI 优化功能当前已关闭。</p>
          ) : null}
          <ToggleGroup
            value={[sourceMode]}
            onValueChange={(value) => {
              const nextMode = value[0];
              if (nextMode === 'existing' || nextMode === 'discovery') setSourceMode(nextMode);
            }}
            aria-label="选择 AI 实验模式"
            className="w-fit"
          >
            <ToggleGroupItem value="existing">优化现有策略</ToggleGroupItem>
            <ToggleGroupItem value="discovery">从零探索策略</ToggleGroupItem>
          </ToggleGroup>
          <Alert>
            <AlertTitle>实验关系</AlertTitle>
            <AlertDescription>
              手动创建和从实验采纳的正式策略都可生成风险规则。
            </AlertDescription>
          </Alert>
          {sourceMode === 'discovery' ? <OptimizationDiscoveryFields control={control} /> : null}
          <OptimizationSourceAndObjective control={control} />
          <StrategyOptimizationModelSelector
            routes={capabilities.data?.providers ?? []}
            selectedModels={selectedModels}
            onSelectedModelsChange={setSelectedModels}
            reasoningEfforts={reasoningEfforts}
            onReasoningEffortsChange={setReasoningEfforts}
          />
          <OptimizationUnknownCostChoice control={control} />
          {sourceMode === 'existing' ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">允许 AI 修改的参数</div>
              <div className="flex flex-wrap gap-2">
                {(parameters.data ?? []).map((parameter) => (
                  <Button
                    key={parameter.parameterId}
                    type="button"
                    size="sm"
                    variant={
                      selectedParameters.includes(parameter.parameterId) ? 'default' : 'outline'
                    }
                    disabled={!parameter.optimizationRange}
                    onClick={() => toggleParameter(parameter.parameterId)}
                  >
                    {parameter.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <OptimizationDateFields control={control} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <ExperimentBudgetFields
              value={{
                maxAiCalls,
                maxBacktestRuns,
                maxInputTokens,
                maxOutputTokens,
                maxDurationSeconds,
              }}
              onChange={(field, value) => {
                const setters = {
                  maxAiCalls: setMaxAiCalls,
                  maxBacktestRuns: setMaxBacktestRuns,
                  maxInputTokens: setMaxInputTokens,
                  maxOutputTokens: setMaxOutputTokens,
                  maxDurationSeconds: setMaxDurationSeconds,
                };
                setters[field](value);
              }}
            />
            <Field className="space-y-1 text-sm">
              <FieldLabel>
                <span className="text-muted-foreground">模型费用上限（可选）</span>
              </FieldLabel>
              <Input
                inputMode="decimal"
                value={maxCost}
                onChange={(event) => setMaxCost(event.target.value)}
                placeholder="如 5.00"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            预算为服务端硬上限；模型调用前预留保守输入 Token 与单次输出额度，完成后按提供方实际
            用量结算。
          </p>
          <OptimizationPreparationFields control={control} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                !preparedConfig ||
                createMutation.isPending ||
                !capabilities.data?.aiOptimizationEnabled ||
                hasInvalidReasoningSelection ||
                (hasUnknownCost && !acknowledgeUnknownCost)
              }
              onClick={() => createMutation.mutate()}
            >
              {optimizationCreateLabel(createMutation.isPending, sourceMode)}
            </Button>
            {feedback ? <span className="text-sm text-muted-foreground">{feedback}</span> : null}
          </div>
        </CardContent>
      </Card>

      <StrategyOptimizationExperimentResults
        experimentsRefreshing={experiments.isRefetching && !!experiments.data}
        candidatesRefreshing={compare.isRefetching && !!compare.data}
        experiments={experiments.data?.items ?? []}
        compare={compare.data}
        settledStatuses={settledStatuses}
        selectedExperimentId={selectedExperimentId}
        versions={versions}
        onInvalidate={invalidate}
        onFeedback={setFeedback}
        onSelectExperiment={setSelectedExperimentId}
        onCloneExperiment={(id) => cloneMutation.mutate(id)}
        clonePending={cloneMutation.isPending}
        onCancelExperiment={(id) => cancelMutation.mutate(id)}
      />
    </div>
  );
}

function OptimizationSourceAndObjective({
  control,
}: {
  control: ReturnType<typeof useStrategyOptimizationExperimentPanel>;
}) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {control.sourceMode === 'existing' ? (
          <Field className="space-y-1 text-sm">
            <FieldLabel>
              <span className="text-muted-foreground">基线策略版本</span>
            </FieldLabel>
            <Select
              items={control.versions.map(({ strategy, version }) => ({
                label: `${strategy.name} · v${version.version}`,
                value: version.id,
              }))}
              value={control.strategyVersionId}
              onValueChange={(value) => {
                if (!value) return;
                control.setStrategyVersionId(value);
                control.setSelectedParameters([]);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {control.versions.map(({ strategy, version }) => (
                    <SelectItem key={version.id} value={version.id}>
                      {strategy.name} · v{version.version}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            探索模式不需要基线策略或参数授权；Server 会创建实验专用隐藏 v0 种子。
          </div>
        )}
        <Field className="space-y-1 text-sm">
          <FieldLabel>
            <span className="text-muted-foreground">优化目标</span>
          </FieldLabel>
          <Select
            items={[
              { label: '收益 / 回撤平衡', value: 'balanced' },
              { label: '优先收益', value: 'return' },
              { label: '优先低回撤', value: 'drawdown' },
              { label: '优先低换手', value: 'lowTurnover' },
            ]}
            value={control.objective}
            onValueChange={(value) => value && control.setObjective(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{objectiveLabels[control.objective]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="balanced">收益 / 回撤平衡</SelectItem>
                <SelectItem value="return">优先收益</SelectItem>
                <SelectItem value="drawdown">优先低回撤</SelectItem>
                <SelectItem value="lowTurnover">优先低换手</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </>
  );
}

function OptimizationUnknownCostChoice({
  control,
}: {
  control: ReturnType<typeof useStrategyOptimizationExperimentPanel>;
}) {
  return (
    <>
      {control.hasUnknownCost ? (
        <div className="space-y-2 rounded-md border border-caution/40 bg-caution/5 p-3">
          <div className="text-sm font-medium">所选模型存在未知费用</div>
          <p className="text-xs text-muted-foreground">
            系统仍会限制调用、Token、回测和计算时长，但没有价格表时不能保证费用上限。
          </p>
          <Button
            type="button"
            size="sm"
            variant={control.acknowledgeUnknownCost ? 'default' : 'outline'}
            onClick={() => control.setAcknowledgeUnknownCost((current) => !current)}
          >
            {control.acknowledgeUnknownCost ? '已确认未知费用' : '确认后允许创建'}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function OptimizationDateFields({
  control,
}: {
  control: ReturnType<typeof useStrategyOptimizationExperimentPanel>;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground">
          时间切分（三段连续、不重叠；验证集/封存测试集从前一段结束日后一天自动开始）
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel>开发集开始</FieldLabel>
            <DateInput
              type="date"
              value={control.startDate}
              onChange={(event) => control.setStartDate(event.target.value)}
              aria-label="开发集开始"
            />
          </Field>
          <Field>
            <FieldLabel>开发集结束</FieldLabel>
            <DateInput
              type="date"
              value={control.developmentEnd}
              onChange={(event) => control.setDevelopmentEnd(event.target.value)}
              aria-label="开发集结束"
            />
          </Field>
          <Field>
            <FieldLabel>验证集结束</FieldLabel>
            <DateInput
              type="date"
              value={control.validationEnd}
              onChange={(event) => control.setValidationEnd(event.target.value)}
              aria-label="验证集结束"
            />
            <FieldDescription>验证集开始：{addDays(control.developmentEnd, 1)}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>封存测试结束</FieldLabel>
            <DateInput
              type="date"
              value={control.endDate}
              onChange={(event) => control.setEndDate(event.target.value)}
              aria-label="封存测试结束"
            />
            <FieldDescription>封存测试开始：{addDays(control.validationEnd, 1)}</FieldDescription>
          </Field>
        </div>
      </div>
    </>
  );
}
function OptimizationPreparationFields({
  control,
}: {
  control: ReturnType<typeof useStrategyOptimizationExperimentPanel>;
}) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
        <Field className="space-y-1 text-sm">
          <FieldLabel>
            <span className="text-muted-foreground">初始资金（{control.currency}）</span>
          </FieldLabel>
          <Input
            value={control.initialCash}
            onChange={(event) => control.setInitialCash(event.target.value)}
          />
        </Field>
        {control.sourceMode === 'existing' && (
          <ExperimentResearchVersionChoice
            entry={control.selectedVersion ?? null}
            disabled={control.convertingVersion || control.createMutation.isPending}
            onBusyChange={control.setConvertingVersion}
            onAdopt={(version) => {
              if (!control.selectedVersion) return;
              control.adoptVersion(control.selectedVersion.strategy, version);
              control.setStrategyVersionId(version.id);
              control.setSelectedParameters([]);
              control.setPreparedConfig(null);
            }}
          />
        )}
        {(control.sourceMode === 'discovery' ||
          isPriceResearchStrategyDefinition(control.selectedVersion?.version.schema)) && (
          <OptimizationPricePreparation
            dailyOrders={control.sourceMode === 'existing' && strategyEditorVariant('execution', control.selectedVersion?.version.schema?.execution) === 'dailyBarOrders'}
            target={control.preparationTarget}
            startDate={control.startDate}
            endDate={control.endDate}
            currency={control.currency}
            initialCash={control.initialCash}
            onPrepared={control.setPreparedConfig}
          />
        )}
      </div>
    </>
  );
}
function optimizationCreateLabel(pending: boolean, sourceMode: 'existing' | 'discovery') {
  if (pending) return '创建中…';
  if (sourceMode === 'discovery') return '创建探索实验';
  return '创建优化实验';
}

function OptimizationDiscoveryFields({
  control,
}: {
  control: ReturnType<typeof useStrategyOptimizationExperimentPanel>;
}) {
  return (
    <>
      <FieldGroup className="max-w-2xl">
        <ExperimentDiscoveryInstrumentField discovery={control.discovery} />
        <Field>
          <FieldLabel>主周期</FieldLabel>
          <Select
            value={control.discoveryAssetType === 'fund' ? '1d' : control.discoveryTimeframe}
            onValueChange={(value) => value && control.setDiscoveryTimeframe(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {['1d', '60m', '30m', '15m', '5m', '1m'].map((item) => (
                  <SelectItem
                    key={item}
                    value={item}
                    disabled={control.discoveryAssetType === 'fund' && item !== '1d'}
                  >
                    {item}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    </>
  );
}
import { isPriceResearchStrategyDefinition, strategyEditorVariant } from '@thesis-ledger/domain';
