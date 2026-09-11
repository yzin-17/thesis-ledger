type QueueItem = {
  modelKey: string;
  resolve: (release: () => void) => void;
};

export class OptimizationModelConcurrencyGate {
  private active = 0;
  private readonly activeByModel = new Map<string, number>();
  private readonly queue: QueueItem[] = [];

  constructor(
    private readonly maxGlobal = 2,
    private readonly maxPerModel = 1,
  ) {}

  async withSlot<T>(modelKey: string, task: () => Promise<T>): Promise<T> {
    const release = await this.acquire(modelKey);
    try {
      return await task();
    } finally {
      release();
    }
  }

  private acquire(modelKey: string) {
    return new Promise<() => void>((resolve) => {
      this.queue.push({ modelKey, resolve });
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.maxGlobal) {
      const index = this.queue.findIndex(
        ({ modelKey }) => (this.activeByModel.get(modelKey) ?? 0) < this.maxPerModel,
      );
      if (index < 0) return;
      const [item] = this.queue.splice(index, 1);
      if (!item) return;
      this.active += 1;
      this.activeByModel.set(item.modelKey, (this.activeByModel.get(item.modelKey) ?? 0) + 1);
      let released = false;
      item.resolve(() => {
        if (released) return;
        released = true;
        this.active -= 1;
        const remaining = (this.activeByModel.get(item.modelKey) ?? 1) - 1;
        if (remaining <= 0) this.activeByModel.delete(item.modelKey);
        else this.activeByModel.set(item.modelKey, remaining);
        this.drain();
      });
    }
  }
}

export const optimizationModelConcurrency = new OptimizationModelConcurrencyGate(2, 1);
