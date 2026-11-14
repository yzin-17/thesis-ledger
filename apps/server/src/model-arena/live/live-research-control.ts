import type { LiveDatabase } from './live-storage.js';

export const liveResearchLeaseMs = 60000;
const heartbeatMs = 5000;

// 执行租约只检测执行者失联，不充当模型研究时限。
export class LiveResearchControl {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private closed = false;
  readonly signal = this.controller.signal;
  constructor(private readonly db: LiveDatabase, private readonly id: string,
    private readonly attempt: number, private readonly deadline: Date | null) {}

  async start() {
    await this.renew();
    this.signal.throwIfAborted();
    if (this.deadline) {
      this.deadlineTimer = setTimeout(() => this.abort('cycle_deadline'), Math.max(1, this.deadline.getTime() - Date.now()));
      this.deadlineTimer.unref();
    }
    this.schedule();
  }
  abort(reason: string) { this.controller.abort(new Error(reason)); }
  async close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    await this.pending;
  }
  private schedule() {
    if (this.closed || this.signal.aborted) return;
    this.timer = setTimeout(() => {
      this.pending = this.renew().finally(() => { this.pending = undefined; this.schedule(); });
    }, heartbeatMs);
    this.timer.unref();
  }
  private async renew() {
    const now = new Date();
    if (this.deadline && this.deadline <= now) { this.abort('cycle_deadline'); return; }
    const lease = new Date(Math.min(now.getTime() + liveResearchLeaseMs, this.deadline?.getTime() ?? Infinity));
    try {
      const rows = await this.db.$queryRaw<{ id: string }[]>`UPDATE "ArenaLiveCycle" c SET "leaseUntil"=${lease}
        WHERE c.id=${this.id}::uuid AND c.state='running' AND c.attempt=${this.attempt}
          AND c."leaseUntil">${now} AND (c."deadlineAt" IS NULL OR c."deadlineAt">${now})
          AND EXISTS(SELECT 1 FROM "ArenaLiveMatch" m WHERE m.id=c."matchId" AND m.state='running')
        RETURNING c.id`;
      if (!rows.length) this.abort('cycle_not_active');
    } catch { this.abort('research_control_unavailable'); }
  }
}
