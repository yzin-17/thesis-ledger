import { explicitlyAllowsStale, hasStaleMarketData } from '../market/freshness.js';
import type { AiTool, ToolPermission } from './contracts.js';
import {
  invokeAiTool,
  toolFailureFacts,
  type AiToolExecutionContext,
} from './timeout/ai-tool-invocation.js';

export interface AiToolCallAuditInput {
  runId: string;
  tool: string;
  permission: ToolPermission;
  status: 'ok' | 'unavailable' | 'denied';
  inputSummary: string;
  outputSummary?: string;
  provider?: string;
  durationMs?: number;
  marketTime?: string;
  availableAt?: string;
  fetchedAt?: string;
}

export interface AiToolAuditRecorder {
  recordToolCall(input: AiToolCallAuditInput): unknown;
}

export class ToolPermissionError extends Error {}

export const assertToolPermission = (tool: AiTool, allowed: ReadonlySet<ToolPermission>) => {
  if (!allowed.has(tool.permission)) throw new ToolPermissionError(`无权调用工具 ${tool.name}`);
};

export const executeToolSafely = async (
  tool: AiTool,
  input: unknown,
  allowed: ReadonlySet<ToolPermission>,
  timeoutMs?: number,
  context?: AiToolExecutionContext,
) => {
  assertToolPermission(tool, allowed);
  const startedAt = Date.now();
  try {
    const data = await invokeAiTool(tool, input, timeoutMs, context);
    if (hasStaleMarketData(data) && !explicitlyAllowsStale(input))
      throw new Error('AI 默认拒绝陈旧或部分市场数据');
    return {
      status: 'ok' as const,
      data,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'unavailable' as const,
      data: null,
      error: error instanceof Error ? error.message : 'Tool 调用失败',
      durationMs: Date.now() - startedAt,
      ...toolFailureFacts(error),
    };
  }
};

const summarize = (value: unknown) => {
  try {
    const text = JSON.stringify(value, (_key, entry: unknown) =>
      typeof entry === 'bigint' ? entry.toString() : entry,
    );
    return (text ?? String(value)).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
};

const provenance = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const data = value as Record<string, unknown>;
  return {
    ...(typeof data.provider === 'string' ? { provider: data.provider } : {}),
    ...(typeof data.marketTime === 'string' ? { marketTime: data.marketTime } : {}),
    ...(typeof data.availableAt === 'string' ? { availableAt: data.availableAt } : {}),
    ...(typeof data.fetchedAt === 'string' ? { fetchedAt: data.fetchedAt } : {}),
  };
};

export const executeAuditedTool = async (
  recorder: AiToolAuditRecorder,
  runId: string,
  tool: AiTool,
  input: unknown,
  allowed: ReadonlySet<ToolPermission>,
  timeoutMs?: number,
  context?: AiToolExecutionContext,
) => {
  const startedAt = Date.now();
  let status: AiToolCallAuditInput['status'] = 'ok';
  let data: unknown = null;
  let errorMessage: string | undefined;
  let failure: ReturnType<typeof toolFailureFacts> | undefined;

  try {
    assertToolPermission(tool, allowed);
    data = await invokeAiTool(tool, input, timeoutMs, context);
    if (hasStaleMarketData(data) && !explicitlyAllowsStale(input))
      throw new Error('AI 默认拒绝陈旧或部分市场数据');
  } catch (error) {
    status = error instanceof ToolPermissionError ? 'denied' : 'unavailable';
    failure = toolFailureFacts(error);
    errorMessage = error instanceof Error ? error.message : 'Tool 调用失败';
  }

  const durationMs = Date.now() - startedAt;
  const observed = provenance(data);
  const completedAt = new Date().toISOString();
  const outputSummary =
    status === 'ok' ? summarize(data) : JSON.stringify({ ...failure, summary: errorMessage });
  const audit = await recorder.recordToolCall({
    runId,
    tool: tool.name,
    permission: tool.permission,
    status,
    inputSummary: summarize(input),
    ...(outputSummary === undefined ? {} : { outputSummary }),
    durationMs,
    ...observed,
    fetchedAt: observed.fetchedAt ?? completedAt,
  });

  const toolCallId =
    audit && typeof audit === 'object' && 'id' in audit && typeof audit.id === 'string'
      ? audit.id
      : undefined;
  return status === 'ok'
    ? { status, data, durationMs, ...(toolCallId ? { toolCallId } : {}) }
    : {
        status,
        data: null,
        error: errorMessage ?? 'Tool 调用失败',
        durationMs,
        ...failure,
        ...(toolCallId ? { toolCallId } : {}),
      };
};
