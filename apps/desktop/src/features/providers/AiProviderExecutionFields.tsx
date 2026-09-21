import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';
import { modelsFromText } from './ai-provider.actions.js';
import { aiContractOptions, newAiProviderExecutionRouteDraft } from './ai-provider-execution.js';
import type { AiProviderExecutionRouteDraft, ProviderDraft } from './providers.types.js';

const modeOptions = [
  { value: 'json_validated', label: 'JSON 输出后严格校验' },
  { value: 'native_schema', label: '原生结构化输出' },
] as const;

const declarationOptions = [
  { value: 'none', label: '暂不声明（保存后未就绪）' },
  { value: 'trusted_catalog', label: '可信模型目录' },
  { value: 'manual', label: '人工声明' },
] as const;

const freeEvidenceOptions = [
  { value: 'none', label: '无免费依据' },
  { value: 'trusted_catalog', label: '可信目录免费依据' },
  { value: 'controlled_local', label: '受控本地验证依据' },
] as const;

const updateRoute = (
  routes: AiProviderExecutionRouteDraft[],
  key: string,
  update: Partial<AiProviderExecutionRouteDraft>,
) => routes.map((route) => (route.key === key ? { ...route, ...update } : route));

export function AiProviderExecutionFields({
  draft,
  onUpdateDraft,
}: {
  draft: ProviderDraft;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
}) {
  const models = modelsFromText(draft.modelsText);
  const setRoute = (key: string, update: Partial<AiProviderExecutionRouteDraft>) =>
    onUpdateDraft((current) => ({
      ...current,
      executionRoutes: updateRoute(current.executionRoutes, key, update),
    }));

  return (
    <FieldGroup>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">执行路由与能力声明</h3>
          <p className="text-xs text-muted-foreground">
            未配置或证据不足的路由仍可保存，但发送前会保持阻断。
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={models.length === 0 || draft.executionRoutes.length >= 96}
          onClick={() =>
            onUpdateDraft((current) => ({
              ...current,
              executionRoutes: [
                ...current.executionRoutes,
                newAiProviderExecutionRouteDraft(models[0]),
              ],
            }))
          }
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          添加执行路由
        </Button>
      </div>

      {draft.executionRoutes.length === 0 && (
        <Alert>
          <AlertTitle>尚未配置执行路由</AlertTitle>
          <AlertDescription>
            Provider
            配置可以保存并测试连接，但研究与策略生成不会使用它。添加路由后可查看接入就绪阻断原因。
          </AlertDescription>
        </Alert>
      )}

      {draft.executionRoutes.map((route, index) => (
        <Card key={route.key} size="sm">
          <CardHeader>
            <CardTitle>执行路由 {index + 1}</CardTitle>
            <CardDescription>模型、生成模式和契约的组合必须唯一。</CardDescription>
            <CardAction>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`删除执行路由 ${index + 1}`}
                onClick={() =>
                  onUpdateDraft((current) => ({
                    ...current,
                    executionRoutes: current.executionRoutes.filter(
                      (item) => item.key !== route.key,
                    ),
                  }))
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel>执行模型</FieldLabel>
                  <Select
                    items={models.map((model) => ({ label: model, value: model }))}
                    value={route.model || null}
                    onValueChange={(value) => setRoute(route.key, { model: value ?? '' })}
                  >
                    <SelectTrigger aria-label={`执行路由 ${index + 1} 的模型`} className="w-full">
                      <SelectValue placeholder="选择已配置模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {models.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>生成模式</FieldLabel>
                  <Select
                    items={modeOptions}
                    value={route.mode}
                    onValueChange={(value) => value && setRoute(route.key, { mode: value })}
                  >
                    <SelectTrigger
                      aria-label={`执行路由 ${index + 1} 的生成模式`}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {modeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>生成契约</FieldLabel>
                  <Select
                    items={aiContractOptions}
                    value={route.contractId}
                    onValueChange={(value) => value && setRoute(route.key, { contractId: value })}
                  >
                    <SelectTrigger
                      aria-label={`执行路由 ${index + 1} 的生成契约`}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {aiContractOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>能力声明来源</FieldLabel>
                  <Select
                    items={declarationOptions}
                    value={route.declarationSource}
                    onValueChange={(value) =>
                      value && setRoute(route.key, { declarationSource: value })
                    }
                  >
                    <SelectTrigger
                      aria-label={`执行路由 ${index + 1} 的能力声明来源`}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {declarationOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>

              {route.declarationSource !== 'none' && (
                <FieldGroup className="sm:grid sm:grid-cols-2">
                  <Field>
                    <FieldLabel>声明来源引用</FieldLabel>
                    <Input
                      aria-label={`执行路由 ${index + 1} 的声明来源引用`}
                      value={route.declarationSourceRef}
                      onChange={(event) =>
                        setRoute(route.key, { declarationSourceRef: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>声明来源版本</FieldLabel>
                    <Input
                      aria-label={`执行路由 ${index + 1} 的声明来源版本`}
                      value={route.declarationSourceVersion}
                      onChange={(event) =>
                        setRoute(route.key, { declarationSourceVersion: event.target.value })
                      }
                    />
                  </Field>
                  {route.declarationSource === 'manual' && (
                    <Field>
                      <FieldLabel>声明者</FieldLabel>
                      <Input
                        aria-label={`执行路由 ${index + 1} 的声明者`}
                        value={route.declaredBy}
                        onChange={(event) =>
                          setRoute(route.key, { declaredBy: event.target.value })
                        }
                      />
                    </Field>
                  )}
                </FieldGroup>
              )}

              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel>首输出超时（毫秒）</FieldLabel>
                  <Input
                    aria-label={`执行路由 ${index + 1} 的首输出超时`}
                    type="number"
                    min={1}
                    max={120000}
                    value={route.firstOutputTimeoutMs}
                    onChange={(event) =>
                      setRoute(route.key, { firstOutputTimeoutMs: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>输出空闲超时（毫秒）</FieldLabel>
                  <Input
                    aria-label={`执行路由 ${index + 1} 的输出空闲超时`}
                    type="number"
                    min={1}
                    max={120000}
                    value={route.outputIdleTimeoutMs}
                    onChange={(event) =>
                      setRoute(route.key, { outputIdleTimeoutMs: event.target.value })
                    }
                  />
                </Field>
              </FieldGroup>

              <Field>
                <FieldLabel>允许的上游（每行一个，可选）</FieldLabel>
                <Textarea
                  aria-label={`执行路由 ${index + 1} 允许的上游`}
                  value={route.allowedUpstreamsText}
                  rows={2}
                  onChange={(event) =>
                    setRoute(route.key, { allowedUpstreamsText: event.target.value })
                  }
                />
              </Field>

              <Field>
                <FieldLabel>免费依据</FieldLabel>
                <Select
                  items={freeEvidenceOptions}
                  value={route.freeEvidenceSource}
                  onValueChange={(value) =>
                    value && setRoute(route.key, { freeEvidenceSource: value })
                  }
                >
                  <SelectTrigger aria-label={`执行路由 ${index + 1} 的免费依据`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {freeEvidenceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {route.freeEvidenceSource !== 'none' && (
                <FieldGroup className="sm:grid sm:grid-cols-2">
                  <Field>
                    <FieldLabel>免费依据引用</FieldLabel>
                    <Input
                      aria-label={`执行路由 ${index + 1} 的免费依据引用`}
                      value={route.freeEvidenceSourceRef}
                      onChange={(event) =>
                        setRoute(route.key, { freeEvidenceSourceRef: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>免费依据版本</FieldLabel>
                    <Input
                      aria-label={`执行路由 ${index + 1} 的免费依据版本`}
                      value={route.freeEvidenceSourceVersion}
                      onChange={(event) =>
                        setRoute(route.key, { freeEvidenceSourceVersion: event.target.value })
                      }
                    />
                  </Field>
                </FieldGroup>
              )}
            </FieldGroup>
          </CardContent>
        </Card>
      ))}
    </FieldGroup>
  );
}
