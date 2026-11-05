import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const aiTraceReferenceSchema = z
  .object({
    version: z.literal('ai-execution-trace-v1'),
    traceId: z.uuid(),
  })
  .strict();
export type AiTraceReference = z.infer<typeof aiTraceReferenceSchema>;
export const createAiTraceReference = (): AiTraceReference => ({
  version: 'ai-execution-trace-v1',
  traceId: randomUUID(),
});

export type AiTraceStage =
  | 'business.execution'
  | 'sdk.generate'
  | 'http.request'
  | 'upstream.response'
  | 'business.result'
  | 'business.persistence'
  | 'business.final_state';

export type AiTraceArtifact = {
  file: string;
  bytes: number;
  sha256: string;
  originalBytes: number;
  originalSha256: string;
  redacted: boolean;
};
export type AiTraceNode = {
  id: string;
  stage: AiTraceStage;
  parentId: string | null;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  input: AiTraceArtifact | null;
  output: AiTraceArtifact | null;
  reason?: string;
};
export type AiTraceManifest = AiTraceReference & {
  runId: string;
  ownerId: string;
  executionAttempt: number;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'incomplete';
  captureStatus: 'complete' | 'incomplete';
  nativeFetches: number;
  nodes: AiTraceNode[];
  artifacts: AiTraceArtifact[];
  issues: string[];
};

export class AiTraceUnavailableError extends Error {
  constructor(
    readonly reason: string,
    readonly requestDispatched = false,
  ) {
    super('输入输出诊断不可用');
    this.name = 'AiTraceUnavailableError';
  }
}
