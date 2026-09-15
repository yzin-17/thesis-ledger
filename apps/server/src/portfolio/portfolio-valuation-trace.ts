import { StructuredLogger, currentTraceId } from '../platform/structured-logger.js';

/** Small trace seam for valuation phase evidence without coupling the service to log timing. */
export class PortfolioValuationTrace {
  private readonly logger = new StructuredLogger('thesis-ledger.portfolio');
  private readonly startedAt = Date.now();
  private phaseStartedAt = this.startedAt;

  constructor(
    private readonly accountId: string | undefined,
    private readonly mode: 'actual' | 'shadow',
  ) {}

  mark(stage: string) {
    const now = Date.now();
    this.logger.log({
      operation: 'portfolio.valuation',
      stage,
      traceId: currentTraceId() ?? 'unknown',
      accountId: this.accountId ?? 'all',
      mode: this.mode,
      durationMs: now - this.phaseStartedAt,
      totalDurationMs: now - this.startedAt,
    });
    this.phaseStartedAt = now;
  }
}
