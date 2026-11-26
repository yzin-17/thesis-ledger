import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { ExperimentBudgetFields } from './ExperimentBudgetFields.js';
import { ExperimentDiscoveryInstrumentField } from './ExperimentDiscoveryInstrumentField.js';
import { ExperimentResearchVersionChoice } from './ExperimentResearchVersionChoice.js';
import { OptimizationPricePreparation } from './OptimizationPricePreparation.js';
import { StrategyExperimentConfigurationReview } from './StrategyExperimentConfigurationReview.js';
import { StrategyExperimentDateFields } from './StrategyExperimentDateFields.js';
import { objectiveLabels } from './StrategyOptimizationExperimentPanel.js';
import { StrategyOptimizationModelSelector } from './StrategyOptimizationModelSelector.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import type { StrategyRecord } from './strategy.types.js';
import { nextExperimentDay, useStrategyExperimentCreatePage } from './useExperimentCreatePage.js';
export { experimentCostPolicy, nextExperimentDay } from './useExperimentCreatePage.js';

export function StrategyExperimentCreatePage(props: { strategies: StrategyRecord[] }) {
  const control = useStrategyExperimentCreatePage(props);
  const {
    markTouched,
    createMutation,
    step,
    stepTitle,
    stepDescription,
    lockedVersionId,
    selectedVersion,
    convertingVersion,
    versions,
    setStep,
    next,
    preparedConfig,
    validateStep,
  } = control;
  if (lockedVersionId && !selectedVersion && versions.length > 0)
    return (
      <Alert variant="destructive">
        <AlertTitle>无法锁定实验来源</AlertTitle>
        <AlertDescription>指定的正式策略版本不可用，请重新选择来源。</AlertDescription>
      </Alert>
    );
  return (
    <div className="mx-auto max-w-5xl space-y-5" onChange={markTouched}>
      <header className="flex flex-col gap-2">
        <Link
          to={strategyCenterPath.experiments}
          className="inline-flex min-h-8 items-center gap-2 self-start text-sm text-muted-foreground hover:text-foreground focus-visible:outline-ring aria-disabled:pointer-events-none aria-disabled:opacity-50"
          aria-disabled={createMutation.isPending}
          onClick={(event) => {
            if (createMutation.isPending) event.preventDefault();
          }}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回 AI 实验
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">新建 AI 实验</h2>
        <p className="text-sm text-muted-foreground">前三步只保留输入，最后确认时才创建实验。</p>
      </header>
      <ol className="grid grid-cols-3 gap-2" aria-label="创建实验步骤">
        {['策略与目标', '模型与数据', '预算与确认'].map((label, index) => (
          <li
            key={label}
            className={`rounded-md border px-3 py-3 text-sm ${step === index + 1 ? 'border-foreground bg-muted font-medium' : 'text-muted-foreground'}`}
          >
            <span className="mr-2">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <section className="flex flex-col gap-5" aria-label={stepTitle}>
        <header className="flex flex-col gap-1">
          <h3 className="text-xl font-medium">{stepTitle}</h3>
          <p className="text-sm text-muted-foreground">{stepDescription}</p>
        </header>
        <div className="flex flex-col gap-5">
          <ExperimentCreateStep1 control={control} />
          <ExperimentCreateStep2 control={control} />
          <ExperimentCreateStep3 control={control} />
          <div className="flex justify-between border-t pt-4">
            <Button
              variant="outline"
              disabled={step === 1 || createMutation.isPending}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              上一步
            </Button>
            {step < 3 ? (
              <Button disabled={convertingVersion} onClick={next}>
                下一步
              </Button>
            ) : (
              <Button
                disabled={!preparedConfig || createMutation.isPending}
                aria-busy={createMutation.isPending}
                onClick={() => {
                  if (validateStep(3)) createMutation.mutate();
                }}
              >
                {createMutation.isPending && (
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                )}
                {createMutation.isPending ? '创建中…' : '创建实验'}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ExperimentCreateStep1({
  control,
}: {
  control: ReturnType<typeof useStrategyExperimentCreatePage>;
}) {
  return (
    <>
      {control.step === 1 ? (
        <FieldGroup className="max-w-2xl gap-5">
          {control.lockedVersionId ? (
            <Alert>
              <AlertTitle>来源已锁定</AlertTitle>
              <AlertDescription>
                {control.selectedVersion
                  ? `${control.selectedVersion.strategy.name} v${control.selectedVersion.version.version}`
                  : control.lockedVersionId}
              </AlertDescription>
            </Alert>
          ) : (
            <ToggleGroup
              value={[control.sourceMode]}
              onValueChange={(values) => {
                const value = values[0];
                if (value === 'existing' || value === 'discovery') {
                  control.setSourceMode(value);
                  control.markTouched();
                }
              }}
              aria-label="选择实验来源"
            >
              <ToggleGroupItem value="existing">优化已有策略</ToggleGroupItem>
              <ToggleGroupItem value="discovery">从零探索</ToggleGroupItem>
            </ToggleGroup>
          )}
          {control.sourceMode === 'existing' ? (
            <Field invalid={Boolean(control.fieldErrors.source)}>
              <FieldLabel>基线策略版本</FieldLabel>
              <Select
                disabled={Boolean(control.lockedVersionId) || control.convertingVersion}
                value={control.strategyVersionId}
                onValueChange={(value) => {
                  if (value) {
                    control.setStrategyVersionId(value);
                    control.setSelectedParameters([]);
                    control.markTouched();
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {control.selectedVersion
                      ? `${control.selectedVersion.strategy.name} · v${control.selectedVersion.version.version}`
                      : '选择明确版本'}
                  </SelectValue>
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
              {control.fieldErrors.source ? (
                <FieldError>{control.fieldErrors.source}</FieldError>
              ) : (
                <FieldDescription>实验期间即使策略新增版本，基线也不会改变。</FieldDescription>
              )}
            </Field>
          ) : (
            <ExperimentDiscoveryInstrumentField
              discovery={control.discovery}
              error={control.fieldErrors.source}
              onChange={control.markTouched}
            />
          )}
          {control.sourceMode === 'existing' ? (
            <Field invalid={Boolean(control.fieldErrors.source)}>
              <FieldLabel>允许 AI 修改的参数</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {(control.parameters.data ?? []).map((parameter) => (
                  <Button
                    key={parameter.parameterId}
                    type="button"
                    size="sm"
                    variant={
                      control.selectedParameters.includes(parameter.parameterId)
                        ? 'default'
                        : 'outline'
                    }
                    disabled={!parameter.optimizationRange}
                    onClick={() => {
                      control.setSelectedParameters((current) =>
                        current.includes(parameter.parameterId)
                          ? current.filter((item) => item !== parameter.parameterId)
                          : [...current, parameter.parameterId],
                      );
                      control.markTouched();
                    }}
                  >
                    {parameter.label}
                  </Button>
                ))}
              </div>
            </Field>
          ) : null}
          {control.sourceMode === 'existing' && (
            <ExperimentResearchVersionChoice
              entry={control.selectedVersion}
              disabled={control.createMutation.isPending || control.convertingVersion}
              onBusyChange={control.setConvertingVersion}
              onAdopt={(version) => {
                if (!control.selectedVersion) return;
                control.adoptVersion(control.selectedVersion.strategy, version);
                control.setStrategyVersionId(version.id);
                control.setSelectedParameters([]);
                control.setPreparedConfig(null);
                control.setFieldErrors({});
                control.markTouched();
              }}
            />
          )}
          <Field>
            <FieldLabel>优化目标</FieldLabel>
            <Select
              value={control.objective}
              onValueChange={(value) => value && control.setObjective(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{objectiveLabels[control.objective]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(objectiveLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      ) : null}
    </>
  );
}
function ExperimentCreateStep2({
  control,
}: {
  control: ReturnType<typeof useStrategyExperimentCreatePage>;
}) {
  return (
    <>
      {control.step === 2 ? (
        <>
          <StrategyOptimizationModelSelector
            routes={control.capabilities.data?.providers ?? []}
            selectedModels={control.selectedModels}
            onSelectedModelsChange={(value) => {
              control.setSelectedModels(value);
              control.markTouched();
            }}
            reasoningEfforts={control.reasoningEfforts}
            onReasoningEffortsChange={(value) => {
              control.setReasoningEfforts(value);
              control.markTouched();
            }}
          />
          {control.fieldErrors.models ? (
            <p className="text-sm text-destructive" role="alert">
              {control.fieldErrors.models}
            </p>
          ) : null}
          {control.fieldErrors.cost ? (
            <Alert variant="destructive">
              <AlertTitle>费用配置不可用</AlertTitle>
              <AlertDescription>{control.fieldErrors.cost}</AlertDescription>
            </Alert>
          ) : null}
          <StrategyExperimentDateFields
            values={{
              startDate: control.startDate,
              developmentEnd: control.developmentEnd,
              validationEnd: control.validationEnd,
              endDate: control.endDate,
            }}
            onChange={(field, value) => {
              const setters = {
                startDate: control.setStartDate,
                developmentEnd: control.setDevelopmentEnd,
                validationEnd: control.setValidationEnd,
                endDate: control.setEndDate,
              };
              setters[field](value);
            }}
            validationStart={nextExperimentDay(control.developmentEnd)}
            testStart={nextExperimentDay(control.validationEnd)}
            error={control.fieldErrors.dates}
          />
        </>
      ) : null}
    </>
  );
}
function ExperimentCreateStep3({
  control,
}: {
  control: ReturnType<typeof useStrategyExperimentCreatePage>;
}) {
  return (
    <>
      {control.step === 3 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field>
              <FieldLabel>初始资金（{control.currency}）</FieldLabel>
              <Input
                type="number"
                min="1"
                value={control.initialCash}
                onChange={(event) => control.setInitialCash(event.target.value)}
              />
            </Field>
            <ExperimentBudgetFields
              value={{
                maxAiCalls: control.maxAiCalls,
                maxBacktestRuns: control.maxBacktestRuns,
                maxInputTokens: control.maxInputTokens,
                maxOutputTokens: control.maxOutputTokens,
                maxDurationSeconds: control.maxDurationSeconds,
              }}
              onChange={(field, value) => {
                const setters = {
                  maxAiCalls: control.setMaxAiCalls,
                  maxBacktestRuns: control.setMaxBacktestRuns,
                  maxInputTokens: control.setMaxInputTokens,
                  maxOutputTokens: control.setMaxOutputTokens,
                  maxDurationSeconds: control.setMaxDurationSeconds,
                };
                setters[field](value);
                control.setFieldErrors((current) => {
                  const next = { ...current };
                  delete next.budget;
                  return next;
                });
              }}
            />
            <Field>
              <FieldLabel>
                费用上限{control.knownCurrencies[0] ? `（${control.knownCurrencies[0]}）` : ''}
              </FieldLabel>
              <Input
                value={control.maxCost}
                disabled={control.hasUnknownCost || control.mixedCurrencies}
                onChange={(event) => control.setMaxCost(event.target.value)}
                placeholder={control.hasUnknownCost ? '费用未知时不可设置' : '可选'}
              />
            </Field>
          </div>
          {control.hasUnknownCost ? (
            <Alert>
              <AlertTitle>存在未知费用或币种</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>金额上限已禁用且不会提交。调用、Token、回测次数和时长限制仍然有效。</p>
                <Button
                  type="button"
                  variant={control.acknowledgeUnknownCost ? 'default' : 'outline'}
                  onClick={() => {
                    control.setAcknowledgeUnknownCost((value) => !value);
                    control.markTouched();
                  }}
                >
                  {control.acknowledgeUnknownCost ? '已确认未知费用' : '确认后允许创建'}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <OptimizationPricePreparation
            dailyOrders={control.sourceMode === 'existing' && strategyEditorVariant('execution', control.selectedVersion?.version.schema?.execution) === 'dailyBarOrders'}
            target={control.preparationTarget}
            startDate={control.startDate}
            endDate={control.endDate}
            currency={control.currency}
            initialCash={control.initialCash}
            onPrepared={control.setPreparedConfig}
          />
          <StrategyExperimentConfigurationReview
            label={control.reviewLabel}
            modelCount={control.selectedRoutes.length}
            currency={control.currency}
            startDate={control.startDate}
            developmentEnd={control.developmentEnd}
            validationStart={nextExperimentDay(control.developmentEnd)}
            validationEnd={control.validationEnd}
            testStart={nextExperimentDay(control.validationEnd)}
            endDate={control.endDate}
            submitIntentId={control.submitIntentId}
          />
          {control.fieldErrors.budget ? (
            <p className="text-sm text-destructive" role="alert">
              {control.fieldErrors.budget}
            </p>
          ) : null}
          {control.fieldErrors.cost ? (
            <p className="text-sm text-destructive" role="alert">
              {control.fieldErrors.cost}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
import { strategyEditorVariant } from '@thesis-ledger/domain';
