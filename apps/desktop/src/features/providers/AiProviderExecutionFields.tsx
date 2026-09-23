import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { useState } from 'react';
import { modelsFromText } from './ai-provider.actions.js';
import { aiContractOptions, newAiProviderExecutionRouteDraft } from './ai-provider-execution.js';
import { aiOutputModeLabel } from './ai-output-mode-options.js';
import { AiGenerationSettings } from './AiGenerationSettings.js';
import type { AiProviderExecutionRouteDraft, ProviderDraft } from './providers.types.js';

const seconds = (value: string) => (value.trim() ? String(Number(value) / 1000) : '');
const milliseconds = (value: string) =>
  value.trim() ? String(Math.round(Number(value) * 1000)) : '';
const selectionFor = (draft: ProviderDraft, model: string) => {
  const defaults = draft.modelDefaults[model];
  const route = draft.executionRoutes.find((item) => item.model === model);
  return {
    mode: defaults?.mode ?? route?.mode ?? ('native_schema' as const),
    outputPolicy: defaults?.outputPolicy ?? route?.outputPolicy ?? ('auto' as const),
  };
};

export function AiProviderExecutionFields({
  draft,
  onUpdateDraft,
  onTestPurpose,
}: {
  draft: ProviderDraft;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  onTestModel?: (model: string) => void;
  onTestPurpose?: (
    model: string,
    purpose: AiProviderExecutionRouteDraft['contractId'],
    mode: AiProviderExecutionRouteDraft['mode'],
  ) => void;
}) {
  const [active, setActive] = useState<Record<string, string>>({});
  const models = modelsFromText(draft.modelsText);
  const updateRoute = (key: string, update: Partial<AiProviderExecutionRouteDraft>) =>
    onUpdateDraft((current) => ({
      ...current,
      executionRoutes: current.executionRoutes.map((route) =>
        route.key === key ? { ...route, ...update } : route,
      ),
    }));
  return (
    <FieldGroup>
      <div>
        <h3 className="text-sm font-medium">模型用途</h3>
        <p className="text-xs text-muted-foreground">
          勾选需要的任务，点击“测试并保存”后即可使用。
        </p>
      </div>
      {models.length === 0 ? <p className="text-sm text-muted-foreground">请先选择模型。</p> : null}
      {models.map((model) => {
        const routes = draft.executionRoutes.filter((route) => route.model === model);
        const enabled = routes.filter((route) => route.enabled);
        const selected = enabled.find((route) => route.contractId === active[model]) ?? enabled[0];
        const defaults = selectionFor(draft, model);
        const title =
          aiContractOptions.find((option) => option.value === selected?.contractId)?.label ?? '';
        return (
          <Card key={model} size="sm">
            <CardHeader>
              <CardTitle className="truncate font-mono text-sm" title={model}>
                {model}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>用于哪些任务</FieldLabel>
                  <div className="flex flex-wrap gap-4">
                    {aiContractOptions.map((option) => {
                      const route = routes.find((item) => item.contractId === option.value);
                      return (
                        <FieldLabel
                          key={option.value}
                          className="flex w-fit items-center gap-2 text-sm font-normal"
                        >
                          <Checkbox
                            aria-label={`${model} ${option.label}用途`}
                            checked={route?.enabled ?? false}
                            onCheckedChange={() =>
                              onUpdateDraft((current) => ({
                                ...current,
                                executionRoutes: route
                                  ? current.executionRoutes.map((item) =>
                                      item.key === route.key
                                        ? { ...item, enabled: !item.enabled }
                                        : item,
                                    )
                                  : [
                                      ...current.executionRoutes,
                                      {
                                        ...newAiProviderExecutionRouteDraft(model),
                                        ...selectionFor(current, model),
                                        contractId: option.value,
                                      },
                                    ],
                              }))
                            }
                          />
                          {option.label}
                        </FieldLabel>
                      );
                    })}
                  </div>
                </Field>
                <AiGenerationSettings
                  value={defaults}
                  protocol={draft.upstreamFormat}
                  label={`${model} 默认`}
                  onChange={(selection) =>
                    onUpdateDraft((current) => ({
                      ...current,
                      modelDefaults: { ...current.modelDefaults, [model]: selection },
                      executionRoutes: current.executionRoutes.map((route) =>
                        route.model === model && !route.modeOverridden
                          ? { ...route, ...selection }
                          : route,
                      ),
                    }))
                  }
                />
                {routes.some((route) => route.enabled && route.modeOverridden) ? (
                  <p className="text-xs text-muted-foreground">
                    部分用途已单独设置，不受模型默认设置影响。
                  </p>
                ) : null}
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm">各用途的单独设置</summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                      {enabled.map((route) => (
                        <Button
                          type="button"
                          key={route.key}
                          size="sm"
                          variant={selected?.key === route.key ? 'secondary' : 'ghost'}
                          onClick={() =>
                            setActive((current) => ({ ...current, [model]: route.contractId }))
                          }
                        >
                          {
                            aiContractOptions.find((option) => option.value === route.contractId)
                              ?.label
                          }
                        </Button>
                      ))}
                    </div>
                    {selected ? (
                      <>
                        <Field>
                          <FieldLabel className="flex w-fit items-center gap-2 text-sm font-normal">
                            <Checkbox
                              checked={!selected.modeOverridden}
                              aria-label={`${model} ${title}跟随模型设置`}
                              onCheckedChange={(checked) =>
                                updateRoute(
                                  selected.key,
                                  checked
                                    ? { ...defaults, modeOverridden: false }
                                    : { modeOverridden: true },
                                )
                              }
                            />
                            跟随模型设置
                          </FieldLabel>
                        </Field>
                        {selected.modeOverridden ? (
                          <AiGenerationSettings
                            value={{
                              mode: selected.mode,
                              outputPolicy: selected.outputPolicy ?? 'manual',
                            }}
                            protocol={draft.upstreamFormat}
                            label={`${model} ${title}`}
                            onChange={(selection) => updateRoute(selected.key, selection)}
                          />
                        ) : null}
                        {draft.updatedAt ? (
                          <p className="text-xs text-muted-foreground">
                            记录的具体方式：{aiOutputModeLabel(selected.mode)}
                            。配置变更后需重新验证。
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">尚未启用用途。</p>
                    )}
                  </div>
                </details>
                {selected ? (
                  <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm">高级连接设置 · {title}</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ['firstOutputTimeoutMs', '等待首次输出'],
                          ['outputIdleTimeoutMs', '允许输出中断多久'],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key}>
                          <FieldLabel>{label}</FieldLabel>
                          <InputGroup>
                            <InputGroupInput
                              aria-label={`${model} ${title}${label}`}
                              type="number"
                              min={1}
                              max={120}
                              value={seconds(selected[key])}
                              onChange={(event) =>
                                updateRoute(selected.key, {
                                  [key]: milliseconds(event.target.value),
                                })
                              }
                            />
                            <InputGroupAddon align="inline-end">秒</InputGroupAddon>
                          </InputGroup>
                          <p className="text-xs text-muted-foreground">
                            留空使用服务默认值；修改后重新验证。
                          </p>
                        </Field>
                      ))}
                    </div>
                    {onTestPurpose ? (
                      <Button
                        className="mt-3"
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onTestPurpose(model, selected.contractId, selected.mode)}
                      >
                        单次诊断（不保存）
                      </Button>
                    ) : null}
                  </details>
                ) : null}
              </FieldGroup>
            </CardContent>
          </Card>
        );
      })}
    </FieldGroup>
  );
}
