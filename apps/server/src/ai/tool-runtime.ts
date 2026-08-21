import { explicitlyAllowsStale, hasStaleMarketData } from '../market/freshness.js';
import type { AiTool, ToolPermission } from './contracts.js';

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
  timeoutMs = 10_000,
) => {
  assertToolPermission(tool, allowed);
  const startedAt = Date.now();
  try {
    const data = await tool.execute(input, AbortSignal.timeout(timeoutMs));
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
      durationMs: timeoutMs,
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
  timeoutMs = 10_000,
) => {
  const startedAt = Date.now();
  let status: AiToolCallAuditInput['status'] = 'ok';
  let data: unknown = null;
  let errorMessage: string | undefined;

  try {
    assertToolPermission(tool, allowed);
    data = await tool.execute(input, AbortSignal.timeout(timeoutMs));
    if (hasStaleMarketData(data) && !explicitlyAllowsStale(input))
      throw new Error('AI 默认拒绝陈旧或部分市场数据');
  } catch (error) {
    status = error instanceof ToolPermissionError ? 'denied' : 'unavailable';
    errorMessage = error instanceof Error ? error.message : 'Tool 调用失败';
  }

  const durationMs = Date.now() - startedAt;
  const observed = provenance(data);
  const completedAt = new Date().toISOString();
  const outputSummary = status === 'ok' ? summarize(data) : errorMessage;
  await recorder.recordToolCall({
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

  return status === 'ok'
    ? { status, data, durationMs }
    : { status, data: null, error: errorMessage ?? 'Tool 调用失败', durationMs };
};
