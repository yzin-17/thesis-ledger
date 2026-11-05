import {
  AiSdkGenerationError,
  type AiSdkGenerationResult,
  type AiSdkProgress,
} from '../ai-sdk-generation.adapter.js';
import { createHash } from 'node:crypto';
import { ADAPTIVE_RULE, type AdaptiveObservation } from './ai-adaptive-policy.js';

const safeModel = (value: string | null | undefined) =>
  value && /^[A-Za-z0-9_@.:/+-]{1,200}$/u.test(value) && !/(?:sk-|bearer|api[_-]?key)/iu.test(value)
    ? value
    : null;

/** 单次发送的纯观测器；头、保活与空delta不会形成语义输出样本。 */
export class AiAdaptiveObservation {
  private readonly started: number;
  private readonly clock: () => number;
  private completionMs: number | null = null;
  private firstMs: number | null = null;
  private last: number | null = null;
  private maxGapMs: number | null = null;
  private outcome: AdaptiveObservation['outcome'] = 'unknown';
  private complete = false;
  private actualModel: string | null = null;
  constructor(
    private readonly requestId: string,
    private readonly model: string,
    private readonly now = Date.now,
    private readonly transport: 'single' | 'stream' = 'stream',
  ) {
    this.clock = now === Date.now ? () => performance.now() : now;
    this.started = this.clock();
  }
  progress(progress: AiSdkProgress) {
    if (progress.type === 'heartbeat') return;
    const now = this.clock();
    this.firstMs ??= now - this.started;
    if (this.last !== null) this.maxGapMs = Math.max(this.maxGapMs ?? 0, now - this.last);
    this.last = now;
  }
  succeeded(result: AiSdkGenerationResult<unknown>) {
    this.firstMs ??= result.timeToFirstEventMs;
    this.actualModel = safeModel(result.actualModel);
    this.outcome = 'success';
    this.complete = true;
    this.completionMs = this.clock() - this.started;
  }
  failed(error: unknown) {
    if (!(error instanceof AiSdkGenerationError)) return;
    const actual = error.fact.diagnostic?.actualModel;
    this.actualModel = safeModel(actual);
    this.complete = error.fact.externalResult === 'complete';
    if (this.complete) this.completionMs = this.clock() - this.started;
    if (error.fact.externalResult === 'rejected_before_generation') this.outcome = 'rejected';
    else if (this.complete) this.outcome = 'invalid';
  }
  profile(base: string) {
    if (!this.actualModel || this.actualModel === this.model) return base;
    return createHash('sha256')
      .update(
        JSON.stringify({ version: ADAPTIVE_RULE.version, base, actualModel: this.actualModel }),
      )
      .digest('hex');
  }
  snapshot(): AdaptiveObservation {
    const now = this.now();
    const elapsed = this.clock();
    let maxGapMs = this.maxGapMs;
    if (this.complete && this.last !== null)
      maxGapMs = Math.max(maxGapMs ?? 0, this.started + this.completionMs! - this.last);
    const firstCensored =
      this.transport === 'stream' && this.outcome !== 'rejected' && this.firstMs === null;
    const gapCensored =
      this.transport === 'stream' &&
      !this.complete &&
      this.outcome !== 'rejected' &&
      this.last !== null;
    return {
      requestId: this.requestId,
      actualModel: this.actualModel,
      at: now,
      firstMs: this.firstMs,
      maxGapMs,
      firstCensored,
      gapCensored,
      completionMs: this.completionMs,
      completionCensored: !this.complete && this.outcome !== 'rejected',
      ...(!this.complete && this.outcome !== 'rejected'
        ? { completionLowerBoundMs: elapsed - this.started }
        : {}),
      outcome: this.outcome,
      ...(firstCensored ? { firstLowerBoundMs: elapsed - this.started } : {}),
      ...(gapCensored ? { gapLowerBoundMs: elapsed - this.last! } : {}),
    };
  }
}
