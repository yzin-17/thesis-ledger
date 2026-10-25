import { randomUUID } from 'node:crypto';
import type {
  AiTraceArtifact,
  AiTraceManifest,
  AiTraceNode,
  AiTraceStage,
} from './ai-trace-contract.js';
import { AiTraceUnavailableError } from './ai-trace-contract.js';
import type { AiTraceFileLabel, AiTraceFiles } from './ai-trace-file-store.js';
import { currentAiTrace, withAiTraceScope } from './ai-trace-context.js';
import { traceErrorSnapshot } from './ai-trace-error.js';

type NodeOptions<T> = {
  sdkRequestId?: string;
  output?: (value: T) => unknown;
  error?: (error: unknown) => unknown;
};
const plannedStages: AiTraceStage[] = [
  'business.execution',
  'sdk.generate',
  'http.request',
  'upstream.response',
  'business.result',
  'business.persistence',
  'business.final_state',
];

/** 每个节点只暴露输入、输出和原操作；存储、关联、脱敏及失败隔离集中在此。 */
export class AiExecutionTrace {
  private readonly secrets = new Set<string>();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly dispatches = new Map<string, number>();
  private readonly responseClosers = new Map<string, Array<() => Promise<void>>>();
  private writes = Promise.resolve();

  constructor(
    readonly manifest: AiTraceManifest,
    private readonly files: AiTraceFiles,
  ) {}

  addSecret(secret: string) {
    if (secret) this.secrets.add(secret);
  }

  issue(reason: string) {
    this.manifest.captureStatus = 'incomplete';
    if (!this.manifest.issues.includes(reason) && this.manifest.issues.length < 32)
      this.manifest.issues.push(reason);
  }

  private persist() {
    const snapshot = structuredClone(this.manifest);
    this.writes = this.writes
      .then(() => this.files.writeManifest(snapshot))
      .catch(() => {
        this.issue('manifest_write_failed');
      });
    return this.writes;
  }

  async artifact(
    node: AiTraceNode,
    label: AiTraceFileLabel,
    value: unknown,
    text = false,
  ): Promise<AiTraceArtifact> {
    const artifact = await this.files.writeArtifact(node.id, label, value, this.secrets, text);
    this.manifest.artifacts.push(artifact);
    return artifact;
  }

  async begin(stage: AiTraceStage, input: unknown, parentId = currentAiTrace()?.nodeId ?? null) {
    if (this.manifest.nodes.length >= 64) throw new AiTraceUnavailableError('node_limit');
    const node: AiTraceNode = {
      id: randomUUID(),
      stage,
      parentId,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      input: null,
      output: null,
    };
    this.manifest.nodes.push(node);
    try {
      node.input = await this.artifact(node, 'input', input);
    } catch {
      this.issue('input_write_failed');
      await this.persist();
      throw new AiTraceUnavailableError('input_write_failed');
    }
    await this.persist();
    return node;
  }

  async end(node: AiTraceNode, status: 'succeeded' | 'failed', output: unknown) {
    node.status = status;
    node.completedAt = new Date().toISOString();
    try {
      node.output = await this.artifact(node, 'output', output);
    } catch {
      this.issue('output_write_failed');
    }
    await this.persist();
  }

  async runNode<T>(
    stage: AiTraceStage,
    input: unknown,
    work: () => Promise<T>,
    options: NodeOptions<T> = {},
  ): Promise<T> {
    const parent = currentAiTrace();
    let node: AiTraceNode;
    try {
      node = await this.begin(stage, input);
    } catch (error) {
      // 派发前的 trace 预检失败阻止模型请求；业务结算始终保留原操作。
      if (stage === 'sdk.generate' || stage === 'business.execution') throw error;
      this.issue('node_capture_failed');
      return work();
    }
    try {
      const result = await withAiTraceScope(
        {
          trace: this,
          nodeId: node.id,
          sdkRequestId: options.sdkRequestId ?? parent?.sdkRequestId,
        },
        work,
      );
      let output: unknown;
      try {
        output = options.output ? options.output(result) : result;
      } catch {
        output = { observationFailed: true };
        this.issue('output_projection_failed');
      }
      await this.end(node, 'succeeded', output);
      return result;
    } catch (error) {
      let output: unknown;
      try {
        output = options.error ? options.error(error) : traceErrorSnapshot(error);
      } catch {
        output = { observationFailed: true };
        this.issue('error_projection_failed');
      }
      await this.end(node, 'failed', output);
      throw error;
    }
  }

  track(promise: Promise<unknown>) {
    const observed = promise.catch(() => {
      this.issue('response_capture_failed');
    });
    this.pending.add(observed);
    void observed.finally(() => this.pending.delete(observed));
  }

  registerResponse(requestId: string, close: () => Promise<void>) {
    const closers = this.responseClosers.get(requestId) ?? [];
    closers.push(close);
    this.responseClosers.set(requestId, closers);
  }

  async completeSdkRequest(requestId: string) {
    const closers = this.responseClosers.get(requestId) ?? [];
    this.responseClosers.delete(requestId);
    await Promise.all(
      closers.map((close) =>
        Promise.resolve()
          .then(close)
          .catch(() => {
            this.issue('response_close_failed');
          }),
      ),
    );
  }

  wasDispatched(requestId: string) {
    return (this.dispatches.get(requestId) ?? 0) > 0;
  }

  beforeDispatch(requestId: string) {
    const previous = this.dispatches.get(requestId) ?? 0;
    if (previous >= 1) throw new AiTraceUnavailableError('duplicate_http_dispatch', true);
    if (this.manifest.captureStatus !== 'complete')
      throw new AiTraceUnavailableError('capture_preflight_failed');
    this.dispatches.set(requestId, previous + 1);
    this.manifest.nativeFetches++;
  }

  async finish(status: AiTraceManifest['status']) {
    await Promise.all([...this.pending]);
    for (const stage of plannedStages) {
      if (!this.manifest.nodes.some((node) => node.stage === stage)) {
        this.manifest.nodes.push({
          id: randomUUID(),
          stage,
          parentId: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'skipped',
          input: null,
          output: null,
          reason: 'not_reached',
        });
      }
    }
    for (const node of this.manifest.nodes) {
      if (node.status === 'running') {
        node.status = 'failed';
        node.reason = 'interrupted';
        this.issue('unfinished_node');
      }
    }
    this.manifest.status = status;
    this.manifest.completedAt = new Date().toISOString();
    await this.persist();
    await this.writes;
  }
}
