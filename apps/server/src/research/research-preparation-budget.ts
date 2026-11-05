import { BadRequestException, RequestTimeoutException } from '@nestjs/common';

const maximum = 30_000;
export class ResearchPreparationBudget {
  readonly signal: AbortSignal;
  readonly deadlineAt: number;
  private readonly timeout = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  constructor(signal?: AbortSignal) {
    const duration = Number(process.env.AI_RESEARCH_PREPARATION_TIMEOUT_MS ?? maximum);
    if (!Number.isInteger(duration) || duration < 1 || duration > maximum)
      throw new BadRequestException('研究准备预算必须为 1～30000 毫秒');
    this.deadlineAt = Date.now() + duration;
    this.signal = signal ? AbortSignal.any([signal, this.timeout.signal]) : this.timeout.signal;
    this.timer = setTimeout(() => this.timeout.abort('preparation_deadline'), duration);
    this.timer.unref?.();
  }
  assertActive() {
    if (this.timeout.signal.aborted || Date.now() >= this.deadlineAt)
      throw new RequestTimeoutException({
        code: 'RESEARCH_PREPARATION_TIMEOUT',
        message: '研究材料准备超时，未继续提交',
      });
    if (this.signal.aborted)
      throw new BadRequestException({
        code: 'RESEARCH_PREPARATION_CANCELLED',
        message: '研究材料准备已取消',
      });
  }
  remainingMs() {
    this.assertActive();
    return Math.max(1, this.deadlineAt - Date.now());
  }
  run<T>(work: () => Promise<T>): Promise<T> {
    this.assertActive();
    return new Promise((resolve, reject) => {
      const aborted = () => {
        try {
          this.assertActive();
        } catch (error) {
          reject(error instanceof Error ? error : new Error('研究准备已取消', { cause: error }));
        }
      };
      this.signal.addEventListener('abort', aborted, { once: true });
      work()
        .then(resolve, reject)
        .finally(() => this.signal.removeEventListener('abort', aborted));
    });
  }
  close() {
    clearTimeout(this.timer);
  }
}
