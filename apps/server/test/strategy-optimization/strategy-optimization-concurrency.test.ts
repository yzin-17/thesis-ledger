import { describe, expect, it } from 'vitest';
import { OptimizationModelConcurrencyGate } from '../../src/strategy-optimization/strategy-optimization-concurrency.js';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('optimization model concurrency', () => {
  it('caps global concurrency at two and same-model concurrency at one', async () => {
    const gate = new OptimizationModelConcurrencyGate(2, 1);
    const a1 = deferred();
    const a2 = deferred();
    const b1 = deferred();
    const started: string[] = [];

    const first = gate.withSlot('alpha:model-a', async () => {
      started.push('a1');
      await a1.promise;
    });
    const second = gate.withSlot('alpha:model-a', async () => {
      started.push('a2');
      await a2.promise;
    });
    const third = gate.withSlot('beta:model-b', async () => {
      started.push('b1');
      await b1.promise;
    });

    await Promise.resolve();
    expect(started).toEqual(['a1', 'b1']);
    a1.resolve();
    await first;
    await Promise.resolve();
    expect(started).toEqual(['a1', 'b1', 'a2']);
    a2.resolve();
    b1.resolve();
    await Promise.all([second, third]);
  });
});
