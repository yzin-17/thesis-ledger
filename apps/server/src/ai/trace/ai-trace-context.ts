import { AsyncLocalStorage } from 'node:async_hooks';
import type { AiTraceReference, AiTraceStage } from './ai-trace-contract.js';
import type { AiExecutionTrace } from './ai-execution-trace.js';

const requestedTrace = new AsyncLocalStorage<AiTraceReference>();
type Scope = {
  trace: AiExecutionTrace;
  nodeId?: string | undefined;
  sdkRequestId?: string | undefined;
};
const activeTrace = new AsyncLocalStorage<Scope>();

export const currentAiTraceReference = () => requestedTrace.getStore();
export const withAiTraceReference = <T>(reference: AiTraceReference, work: () => T) =>
  requestedTrace.run(reference, work);
export const currentAiTrace = () => activeTrace.getStore();
export const withAiTraceScope = <T>(scope: Scope, work: () => T) => activeTrace.run(scope, work);

/** 未选中 trace 时直接调用原操作，不创建文件或替换返回值。 */
export function traceAiOperation<T>(
  stage: AiTraceStage,
  input: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const scope = currentAiTrace();
  if (!scope) return work();
  return scope.trace.runNode(stage, input, work);
}
