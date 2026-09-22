import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { modelsFromText } from './ai-provider.actions.js';
import { aiContractOptions, newAiProviderExecutionRouteDraft } from './ai-provider-execution.js';
import { aiOutputModeOptionsFor } from './ai-output-mode-options.js';
import type { AiProviderExecutionRouteDraft, ProviderDraft } from './providers.types.js';

const updateRoute = (routes: AiProviderExecutionRouteDraft[], key: string, update: Partial<AiProviderExecutionRouteDraft>) =>
  routes.map((route) => (route.key === key ? { ...route, ...update } : route));
const timeoutSeconds = (value: string) => {
  if (!value.trim()) return '';
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) ? String(milliseconds / 1_000) : value;
};
const timeoutMilliseconds = (value: string) => {
  if (!value.trim()) return '';
  const seconds = Number(value);
  return Number.isFinite(seconds) ? String(Math.round(seconds * 1_000)) : value;
};
const timeoutDescription = (value: string, providerDefault: string) => {
  if (value.trim()) return '用途覆盖';
  if (!providerDefault.trim()) return '跟随 Provider 默认';
  return `Provider 默认：${timeoutSeconds(providerDefault)} 秒`;
};
export function AiProviderExecutionFields({
  draft, onUpdateDraft, onTestModel, onTestPurpose,
}: {
  draft: ProviderDraft;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  onTestModel?: (model: string) => void;
  onTestPurpose?: (model: string, purpose: AiProviderExecutionRouteDraft['contractId'], mode: AiProviderExecutionRouteDraft['mode']) => void;
}) {
  const [activePurposeByModel, setActivePurposeByModel] = useState<Partial<Record<string, AiProviderExecutionRouteDraft['contractId']>>>({});
  const models = modelsFromText(draft.modelsText);
  const modeOptions = aiOutputModeOptionsFor(draft.upstreamFormat);
  const purposeModeOptions = [{ value: 'inherit', label: '跟随默认', disabled: false }, ...modeOptions] as const;
  const routesForModel = (model: string) => draft.executionRoutes.filter((route) => route.model === model);
  const setRoute = (key: string, update: Partial<AiProviderExecutionRouteDraft>) =>
    onUpdateDraft((current) => ({ ...current, executionRoutes: updateRoute(current.executionRoutes, key, update) }));
  const setDefaultMode = (model: string, mode: AiProviderExecutionRouteDraft['mode']) =>
    onUpdateDraft((current) => ({
      ...current,
      modelDefaults: { ...current.modelDefaults, [model]: { mode } },
      executionRoutes: current.executionRoutes.map((route) =>
        route.model === model && !route.modeOverridden ? { ...route, mode } : route,
      ),
    }));
  const toggleUsage = (model: string, contractId: AiProviderExecutionRouteDraft['contractId']) =>
    onUpdateDraft((current) => {
      const existing = current.executionRoutes.find((route) => route.model === model && route.contractId === contractId);
      if (existing) {
        const nextEnabled = !existing.enabled;
        const enabledRoutes = current.executionRoutes.filter((route) =>
          route.model === model && (route.key === existing.key ? nextEnabled : route.enabled),
        );
        setActivePurposeByModel((active) =>
          !nextEnabled && active[model] === contractId
            ? { ...active, [model]: enabledRoutes[0]?.contractId }
            : active,
        );
        return { ...current, executionRoutes: updateRoute(current.executionRoutes, existing.key, { enabled: nextEnabled }) };
      }
      const hasActivePurpose = current.executionRoutes.some(
        (route) => route.model === model && route.enabled,
      );
      if (!hasActivePurpose) setActivePurposeByModel((active) => ({ ...active, [model]: contractId }));
      return {
        ...current,
        executionRoutes: [
          ...current.executionRoutes,
          { ...newAiProviderExecutionRouteDraft(model), mode: current.modelDefaults[model]?.mode ?? 'json_validated', contractId },
        ],
      };
    });

  return (
    <FieldGroup>
      <div>
        <h3 className="text-sm font-medium">模型用途</h3>
        <p className="text-xs text-muted-foreground">选择模型可以参与的业务任务。</p>
      </div>
      {models.length === 0 ? (
        <Alert><AlertTitle>尚未选择模型</AlertTitle><AlertDescription>选择模型后，再配置研究报告、参数优化或策略发现用途。</AlertDescription></Alert>
      ) : models.map((model) => {
        const routes = routesForModel(model);
        const enabledRoutes = routes.filter((route) => route.enabled);
        const activeRoute = enabledRoutes.find((route) => route.contractId === activePurposeByModel[model]) ?? enabledRoutes[0] ?? null;
        const defaultMode = draft.modelDefaults[model]?.mode ?? 'json_validated';
        const labelForActiveRoute = activeRoute
          ? (aiContractOptions.find((option) => option.value === activeRoute.contractId)?.label ?? activeRoute.contractId)
          : '';
        return (
          <Card key={model} size="sm">
            <CardHeader>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <CardTitle className="min-w-0 truncate font-mono text-sm" title={model}>{model}</CardTitle>
                {onTestModel ? <Button type="button" size="sm" variant="outline" onClick={() => onTestModel(model)}>测试模型</Button> : null}
              </div>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-0 md:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.4fr)]">
                <div className="flex flex-col gap-4 border-b pb-4 md:border-r md:border-b-0 md:pr-5">
                <Field>
                  <FieldLabel>业务用途</FieldLabel>
                  <div className="flex max-w-xl flex-col gap-1">
                    {aiContractOptions.map((option) => {
                      const route = routes.find((item) => item.contractId === option.value);
                      const enabled = route?.enabled ?? false;
                      const active = activeRoute?.contractId === option.value;
                      return (
                        <div key={option.value} className="flex min-h-9 items-center gap-2">
                          <Checkbox aria-label={`${option.label}用途`} checked={enabled} onCheckedChange={() => toggleUsage(model, option.value)} />
                          <Button type="button" variant="ghost" size="sm" className="h-auto min-w-0 justify-start px-1.5 font-normal" disabled={!enabled} onClick={() => setActivePurposeByModel((state) => ({ ...state, [model]: option.value }))}>{option.label}</Button>
                          {active ? <span className="text-xs text-muted-foreground">当前配置</span> : null}
                          {enabled ? <Button type="button" variant="ghost" size="sm" className="ml-auto h-auto px-1.5 text-muted-foreground" onClick={() => setActivePurposeByModel((state) => ({ ...state, [model]: option.value }))}>配置 &gt;</Button> : null}
                        </div>
                      );
                    })}
                  </div>
                </Field>
                <Field className="max-w-sm">
                  <FieldLabel>默认配置</FieldLabel>
                  <p className="text-xs font-medium">输出方式</p>
                  <Select items={modeOptions} value={defaultMode} onValueChange={(value) => value && setDefaultMode(model, value)}>
                    <SelectTrigger aria-label={`${model} 默认输出方式`} className="w-80 max-w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{modeOptions.map((option) => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">用途可覆盖默认值；所有方式均校验完整结果。</p>
                </Field>
                </div>
                <div className="flex min-w-0 flex-col gap-3 pt-4 md:pl-5 md:pt-0">
                {activeRoute ? (
                    <section className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="truncate text-sm font-medium">{labelForActiveRoute}配置</h4>
                        {onTestPurpose ? <Button type="button" size="sm" variant="outline" onClick={() => onTestPurpose(model, activeRoute.contractId, activeRoute.mode)}>测试</Button> : null}
                      </div>
                      <div className="flex flex-row flex-wrap items-start gap-x-4 gap-y-3">
                        <Field className="w-52 max-w-full">
                          <FieldLabel>输出方式</FieldLabel>
                          <Select items={purposeModeOptions} value={activeRoute.modeOverridden ? activeRoute.mode : 'inherit'} onValueChange={(value) => {
                            if (!value) return;
                            if (value === 'inherit') setRoute(activeRoute.key, { mode: defaultMode, modeOverridden: false });
                            else setRoute(activeRoute.key, { mode: value as AiProviderExecutionRouteDraft['mode'], modeOverridden: true });
                          }}>
                            <SelectTrigger aria-label={`${model} ${activeRoute.contractId} 输出方式`}><SelectValue /></SelectTrigger>
                            <SelectContent className="min-w-52"><SelectGroup>{purposeModeOptions.map((option) => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
                          </Select>
                        </Field>
                        <Field className="w-52 max-w-full">
                          <FieldLabel>首输出等待</FieldLabel>
                          <InputGroup><InputGroupInput aria-label={`${model} ${activeRoute.contractId} 首输出等待秒数`} type="number" min={1} max={120} step={1} value={timeoutSeconds(activeRoute.firstOutputTimeoutMs)} onChange={(event) => setRoute(activeRoute.key, { firstOutputTimeoutMs: timeoutMilliseconds(event.target.value) })} /><InputGroupAddon align="inline-end">秒</InputGroupAddon></InputGroup>
                          <p className="text-xs text-muted-foreground">{timeoutDescription(activeRoute.firstOutputTimeoutMs, draft.firstOutputTimeoutMs)}</p>
                        </Field>
                        <Field className="w-52 max-w-full">
                          <FieldLabel>输出空闲等待</FieldLabel>
                          <InputGroup><InputGroupInput aria-label={`${model} ${activeRoute.contractId} 输出空闲等待秒数`} type="number" min={1} max={120} step={1} value={timeoutSeconds(activeRoute.outputIdleTimeoutMs)} onChange={(event) => setRoute(activeRoute.key, { outputIdleTimeoutMs: timeoutMilliseconds(event.target.value) })} /><InputGroupAddon align="inline-end">秒</InputGroupAddon></InputGroup>
                          <p className="text-xs text-muted-foreground">{timeoutDescription(activeRoute.outputIdleTimeoutMs, draft.outputIdleTimeoutMs)}</p>
                        </Field>
                      </div>
                    </section>
                ) : <p className="text-xs text-muted-foreground">尚未启用业务用途。模型仍可单独测试。</p>}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        );
      })}
    </FieldGroup>
  );
}
