import { randomUUID } from 'node:crypto';
import {
  aiGenerationContracts,
  type AiAdapter,
  type AiAuthMode,
  type AiGenerationContractRef,
  type AiGenerationMode,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import type { AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
import type { AiCompatibilityExtensionProfile } from './ai-provider-upstream.js';

const connectionProbeSchema = z.object({ ok: z.literal(true) }).strict();
const CONNECTION_PROBE_MAX_OUTPUT_TOKENS = 1_024;
/**
 * 连接探针保持单次中性（不注入 reasoningEffort），但用途探针必须真正产出契约实例：
 * 推理模型的思考 token 与正文共用同一个输出预算，预算过小时正文在产出前就被截断。
 * 实测（35B 推理模型，三个契约）：research 思考 2423～3726、parameter_optimization 约 500、
 * strategy_discovery 3377～4096+；1024 上限下 research / strategy_discovery 均报
 * `Provider 结束原因为 length`，因此按“对必须推理的模型预先给出安全输出预算”给用途探针更宽的边界。
 */
const PURPOSE_PROBE_MAX_OUTPUT_TOKENS = 8_192;

type ProbeInput = {
  sdk: AiSdkGenerationAdapter;
  adapter: AiAdapter;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  providerId: string;
  baseURL: string;
  authMode: AiAuthMode;
  apiKey: string;
  model: string;
  timeoutMs: number;
  requestId?: string;
  signal?: AbortSignal;
  purpose?: AiGenerationContractRef['id'];
  mode?: AiGenerationMode;
};

const contractForPurpose = (purpose: AiGenerationContractRef['id'] | undefined) => {
  if (purpose === 'parameter_optimization') return aiGenerationContracts.parameterOptimization;
  if (purpose === 'strategy_discovery') return aiGenerationContracts.strategyDiscovery;
  return aiGenerationContracts.research;
};

/**
 * `json_validated` 由应用侧把文本按 JSON 解析并按契约校验（见 ai-sdk-generation.adapter 的
 * `parseJsonText`），因此探针必须显式要求纯 JSON 输出；`native_schema` 由 SDK 上传 schema，
 * 同样的指令不冲突。沿用生产链路（研究 / 参数优化 / 策略发现 system prompt）既有的“只输出 JSON”约定。
 *
 * 内联契约 JSON Schema 是因为契约带 `superRefine` 语义约束（例如 sizing 金额必须大于 0），
 * 只给 schema 而不给取值要求时模型会输出 0 或占位符而被契约拒绝。
 */
const probeMessages = (purpose: AiGenerationContractRef['id'] | undefined) => {
  if (purpose === undefined)
    return [{ role: 'user', content: 'Return exactly this JSON object: {"ok":true}.' }];
  const schema = z.toJSONSchema(contractForPurpose(purpose).schema, { io: 'output' });
  return [
    {
      role: 'system',
      content:
        '只返回一个满足给定 JSON Schema 的 JSON 对象。不要输出 Markdown、代码围栏、解释或任何其他文本，' +
        '不要输出 Schema 之外的字段。',
    },
    {
      role: 'user',
      content:
        '返回下面契约的最小可用实例：必须满足 Schema 的全部约束（required、minItems、minLength、枚举），' +
        '数组只保留满足最小长度所需的元素，字符串尽量短；带默认值的字段可以省略。' +
        '所有数值字段必须是大于 0 的有限数值，不要使用 0、空字符串、null 或占位符；' +
        `枚举字段只能取 Schema 列出的取值。\n${JSON.stringify(schema)}`,
    },
  ];
};

export const runProviderConnectionTest = async ({
  sdk,
  adapter,
  compatibilityExtensionProfile,
  providerId,
  baseURL,
  authMode,
  apiKey,
  model,
  timeoutMs,
  requestId,
  signal,
  purpose,
  mode = 'json_validated',
}: ProbeInput) => {
  const started = Date.now();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const result = await sdk.generate({
    requestId: requestId ?? randomUUID(),
    adapter,
    ...(compatibilityExtensionProfile === undefined ? {} : { compatibilityExtensionProfile }),
    providerId,
    baseURL,
    authMode,
    apiKey,
    model,
    messages: probeMessages(purpose),
    contract: purpose ? contractForPurpose(purpose).ref : aiGenerationContracts.research.ref,
    schema: purpose
      ? (contractForPurpose(purpose).schema as z.ZodTypeAny)
      : connectionProbeSchema,
    mode,
    transport: 'single',
    maxOutputTokens:
      purpose === undefined ? CONNECTION_PROBE_MAX_OUTPUT_TOKENS : PURPOSE_PROBE_MAX_OUTPUT_TOKENS,
    timeout: { totalMs: timeoutMs },
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  });
  return { result, latencyMs: Date.now() - started };
};
