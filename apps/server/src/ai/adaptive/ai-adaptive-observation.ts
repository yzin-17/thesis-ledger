import {
  AiSdkGenerationError,
  type AiSdkGenerationResult,
  type AiSdkProgress,
} from '../ai-sdk-generation.adapter.js';
import { adaptiveModelIsFixed, type AdaptiveObservation } from './ai-adaptive-policy.js';

/** 单次发送的纯观测器；头、保活与空delta不会形成语义输出样本。 */
export class AiAdaptiveObservation {
  private readonly started: number;
  private firstMs: number | null = null;
  private last: number | null = null;
  private maxGapMs: number | null = null;
  private outcome: AdaptiveObservation['outcome'] = 'unknown';
  private complete = false;
  private actualMatches = true;
  constructor(
    private readonly requestId: string,
    private readonly model: string,
    private readonly now = Date.now,
  ) {
    this.started = now();
  }
  progress(progress: AiSdkProgress) {
    if (progress.type === 'heartbeat') return;
    const now = this.now();
    this.firstMs ??= now - this.started;
    if (this.last !== null) this.maxGapMs = Math.max(this.maxGapMs ?? 0, now - this.last);
    this.last = now;
  }
  succeeded(result: AiSdkGenerationResult<unknown>) {
    this.firstMs ??= result.timeToFirstEventMs;
    this.actualMatches = result.actualModel === null || result.actualModel === this.model;
    this.outcome = 'success';
    this.complete = true;
  }
  failed(error: unknown) {
    if (!(error instanceof AiSdkGenerationError)) return;
    const actual = error.fact.diagnostic?.actualModel;
    this.actualMatches = actual === undefined || actual === null || actual === this.model;
    this.complete = error.fact.externalResult === 'complete';
    if (error.fact.externalResult === 'rejected_before_generation') this.outcome = 'rejected';
    else if (this.complete) this.outcome = 'invalid';
  }
  snapshot(): AdaptiveObservation | null {
    if (!adaptiveModelIsFixed(this.model) || !this.actualMatches) return null;
    const now = this.now();
    let maxGapMs = this.maxGapMs;
    if (this.complete && this.last !== null) maxGapMs = Math.max(maxGapMs ?? 0, now - this.last);
    const firstCensored = this.outcome !== 'rejected' && this.firstMs === null;
    const gapCensored = !this.complete && this.outcome !== 'rejected' && this.last !== null;
    return {
      requestId: this.requestId,
      at: now,
      firstMs: this.firstMs,
      maxGapMs,
      firstCensored,
      gapCensored,
      outcome: this.outcome,
      ...(firstCensored ? { firstLowerBoundMs: now - this.started } : {}),
      ...(gapCensored ? { gapLowerBoundMs: now - this.last! } : {}),
    };
  }
}
