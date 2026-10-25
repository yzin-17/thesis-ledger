import { expect, it } from 'vitest';
import { AiAdaptiveObservation } from '../../src/ai/adaptive/ai-adaptive-observation.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';

it('首块前失败记录等待下界，不能当成准确首输出样本', () => {
  let now = 0;
  const observer = new AiAdaptiveObservation('request', 'fixed', () => now);
  now = 30_000;
  observer.progress({ type: 'heartbeat', at: '' });
  expect(observer.snapshot()).toMatchObject({
    firstMs: null,
    firstCensored: true,
    firstLowerBoundMs: 30_000,
  });
});
it('输出后中断分别保留准确首输出与停顿下界', () => {
  let now = 0;
  const observer = new AiAdaptiveObservation('request', 'fixed', () => now);
  now = 45_000;
  observer.progress({ type: 'reasoning', at: '' });
  now = 47_000;
  observer.progress({ type: 'text', at: '' });
  now = 50_000;
  observer.failed(
    new AiSdkGenerationError({
      code: 'transport_unknown',
      phase: 'stream',
      externalResult: 'unknown',
      requestId: null,
      summary: 'disconnected',
    }),
  );
  expect(observer.snapshot()).toMatchObject({
    firstMs: 45_000,
    firstCensored: false,
    maxGapMs: 2000,
    gapCensored: true,
    gapLowerBoundMs: 3000,
  });
});
