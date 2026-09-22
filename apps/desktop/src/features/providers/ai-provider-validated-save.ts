import { aiProviderValidationPlanSchema } from '@thesis-ledger/schemas';
import type { ConfirmDialogOptions } from '@/components/ui/confirm-dialog';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import { saveAiProvider } from './ai-provider.api.js';
import type { AiProviderInput } from './ai-provider.actions.js';
import type { ProviderRecord } from './providers.types.js';

const post = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  cache: 'no-store',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
  ...(signal ? { signal } : {}),
});
export const cancelValidatedSave = (name: string, operationId: string) =>
  requestDesktopJson(
    `/ai/providers/${encodeURIComponent(name)}/validation/cancel`,
    post({ operationId }),
  );

export const saveWithValidation = async (
  input: AiProviderInput,
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>,
  operationId: string,
  signal?: AbortSignal,
  client?: DesktopRequestClient,
): Promise<ProviderRecord> => {
  const plan = aiProviderValidationPlanSchema.parse(
    await requestDesktopJson<unknown>('/ai/providers/validation-plan', post(input, signal), client),
  );
  if (signal?.aborted) throw new Error('验证已取消，原配置未修改');
  if (plan.pending.length === 0) return saveAiProvider(input, client);
  const costs = plan.estimatedCosts
    .map((cost) => `${cost.currency} ${Number(cost.amount).toFixed(6)}`)
    .join('、');
  const approved = await confirm({
    title: '测试并保存？',
    description: `需验证 ${plan.pending.length} 个模型用途，最多 ${plan.maxCalls} 次调用，单次最多输出 ${plan.maxOutputTokensPerCall} Token，总期限 ${plan.maxDurationSeconds} 秒。按填写单价估算 ${costs}，实际费用以服务报告为准。优先检查接口结构化能力；测试失败不会覆盖原配置。`,
    confirmLabel: '授权测试并保存',
  });
  if (!approved || signal?.aborted) throw new Error('未执行验证，原配置未修改');
  return requestDesktopJson<ProviderRecord>(
    '/ai/providers/test-and-save',
    post(
      {
        provider: input,
        authorization: {
          operationId,
          planFingerprint: plan.planFingerprint,
          maxCalls: plan.maxCalls,
          authorized: true,
          allowTextFallback: false,
        },
      },
      signal,
    ),
    client,
  );
};
