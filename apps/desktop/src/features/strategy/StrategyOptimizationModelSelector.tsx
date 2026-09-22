import type { OptimizationReasoningEffort } from '@thesis-ledger/schemas';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OptimizationCapabilities } from './strategy-optimization.api.js';

export const routeKey = (provider: string, model: string) => JSON.stringify([provider, model]);
export const limitSelectedModels = (models: string[]) => models.slice(0, 3);
export const isReasoningEffortValid = (
  reasoning: OptimizationCapabilities['providers'][number]['reasoning'] | undefined,
  effort: OptimizationReasoningEffort | undefined,
) => {
  if (effort === undefined) return true;
  return Boolean(
    reasoning?.supportedEfforts?.includes(effort) &&
    !(reasoning.mandatory === true && effort === 'none'),
  );
};
const reasoningLabels: Record<OptimizationReasoningEffort, string> = {
  none: 'none',
  minimal: '最小',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最大',
};

export function StrategyOptimizationModelSelector({
  routes,
  selectedModels,
  onSelectedModelsChange,
  reasoningEfforts,
  onReasoningEffortsChange,
}: {
  routes: OptimizationCapabilities['providers'];
  selectedModels: string[];
  onSelectedModelsChange: (value: string[]) => void;
  reasoningEfforts: Record<string, OptimizationReasoningEffort | undefined>;
  onReasoningEffortsChange: (
    updater: (
      current: Record<string, OptimizationReasoningEffort | undefined>,
    ) => Record<string, OptimizationReasoningEffort | undefined>,
  ) => void;
}) {
  const modelAnchor = useComboboxAnchor();
  const selectedRoutes = routes.filter((route) =>
    selectedModels.includes(routeKey(route.provider, route.model)),
  );
  const reasoningOptions = (route: OptimizationCapabilities['providers'][number]) => {
    const supported = route.reasoning?.supportedEfforts;
    if (!supported) return [];
    return supported.filter((effort) => !(route.reasoning?.mandatory && effort === 'none'));
  };
  const hasInvalidReasoningSelection = selectedRoutes.some((route) => {
    const key = routeKey(route.provider, route.model);
    return !isReasoningEffortValid(route.reasoning, reasoningEfforts[key]);
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-muted-foreground">
        模型（最多 3 个；可搜索，严格 Provider + Model，不自动 fallback）
      </div>
      <Combobox
        items={routes.map((route) => routeKey(route.provider, route.model))}
        multiple
        autoHighlight
        value={selectedModels}
        onValueChange={(value) => onSelectedModelsChange(limitSelectedModels(value))}
        onOpenChange={(open, eventDetails) => {
          if (!open && eventDetails.reason === 'item-press') eventDetails.cancel();
        }}
      >
        <ComboboxChips ref={modelAnchor}>
          <ComboboxValue>
            {(values) => (
              <>
                {(values as string[]).map((key) => {
                  const route = routes.find((item) => routeKey(item.provider, item.model) === key);
                  return (
                    <ComboboxChip key={key} className="font-mono">
                      <span className="max-w-72 truncate">
                        {route ? `${route.provider}:${route.model}` : key}
                      </span>
                    </ComboboxChip>
                  );
                })}
                <ComboboxChipsInput aria-label="搜索并选择模型" placeholder="搜索并选择模型" />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={modelAnchor} positionMethod="fixed">
          <ComboboxEmpty>没有匹配的模型</ComboboxEmpty>
          <ComboboxList>
            {(key: string) => {
              const route = routes.find((item) => routeKey(item.provider, item.model) === key);
              if (!route) return null;
              return (
                <ComboboxItem
                  key={key}
                  value={key}
                  disabled={!selectedModels.includes(key) && selectedModels.length >= 3}
                  className="font-mono text-xs"
                >
                  {route.provider}:{route.model}
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p className="text-sm text-muted-foreground">
        可选项来自 Provider 页面已启用并配置的模型；若当前只有一个模型，不会凭空出现更多模型。已选择{' '}
        {selectedModels.length}/3 个模型；路由按结构化 Provider/Model 保存。
      </p>
      {selectedRoutes.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {selectedRoutes.map((route) => {
            const key = routeKey(route.provider, route.model);
            const options = reasoningOptions(route);
            const configuredEffort = reasoningEfforts[key];
            const selectedEffort =
              configuredEffort && options.includes(configuredEffort) ? configuredEffort : undefined;
            const hasDeclaredCapabilities = route.reasoning?.supportedEfforts !== undefined;
            const defaultEffort = route.reasoning?.defaultEffort;
            return (
              <Field key={key} className="rounded-md border p-2 text-sm">
                <FieldLabel>
                  {route.provider}:{route.model} 的推理强度
                </FieldLabel>
                {hasDeclaredCapabilities && options.length > 0 ? (
                  <>
                    <Select
                      items={[
                        { label: '由模型默认决定', value: '__default__' },
                        ...options.map((effort) => ({
                          label: reasoningLabels[effort],
                          value: effort,
                        })),
                      ]}
                      value={selectedEffort ?? '__default__'}
                      onValueChange={(value) => {
                        onReasoningEffortsChange((current) => {
                          const next = { ...current };
                          if (value === '__default__') delete next[key];
                          else next[key] = value as OptimizationReasoningEffort;
                          return next;
                        });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="由模型默认决定" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__default__">由模型默认决定</SelectItem>
                          {options.map((effort) => (
                            <SelectItem key={effort} value={effort}>
                              {reasoningLabels[effort]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      未显式选择时由模型决定
                      {defaultEffort ? `（Provider 默认：${reasoningLabels[defaultEffort]}）` : ''}
                    </FieldDescription>
                  </>
                ) : (
                  <FieldDescription>
                    由模型默认决定
                    {defaultEffort ? `（Provider 默认：${reasoningLabels[defaultEffort]}）` : ''}
                    {hasDeclaredCapabilities ? '' : '（Provider 未声明可选强度，显式指定将被拒绝）'}
                  </FieldDescription>
                )}
              </Field>
            );
          })}
        </div>
      ) : null}
      {hasInvalidReasoningSelection ? (
        <p className="text-sm text-destructive">
          所选模型的推理强度不可用，请按 Provider 能力配置选择。
        </p>
      ) : null}
    </div>
  );
}
