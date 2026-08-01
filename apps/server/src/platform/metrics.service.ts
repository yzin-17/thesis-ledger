import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<
    string,
    { count: number; totalMs: number; errors: number }
  >();

  increment(name: string, value = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  observe(name: string, durationMs: number, error = false) {
    const current = this.durations.get(name) ?? { count: 0, totalMs: 0, errors: 0 };
    current.count += 1;
    current.totalMs += durationMs;
    if (error) current.errors += 1;
    this.durations.set(name, current);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      durations: Object.fromEntries(
        [...this.durations.entries()].map(([name, value]) => [
          name,
          { ...value, averageMs: value.count === 0 ? 0 : value.totalMs / value.count },
        ]),
      ),
    };
  }
}
