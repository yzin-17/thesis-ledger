import { expect, it } from 'vitest';
import { AiAdaptiveObservation } from '../../src/ai/adaptive/ai-adaptive-observation.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';

it('实际模型与请求别名不同的有效阶段保留在隔离分组', () => {
  let now = 0;
  const observer = new AiAdaptiveObservation('request', 'router-alias', () => now);
  now = 10;
  observer.progress({ type: 'text', at: '' });
  now = 20;
  observer.failed(
    new AiSdkGenerationError({
      code: 'schema_invalid',
      phase: 'validation',
      externalResult: 'complete',
      requestId: null,
      summary: 'invalid',
      diagnostic: {
        version: 'ai-failure-diagnostic-v1',
        errorClass: 'schema',
        generationMode: 'native_schema',
        finishReason: 'stop',
        actualModel: 'resolved-model',
        outputCharacters: null,
        outputSha256: null,
        jsonStatus: 'missing',
        jsonRootType: null,
        structuralPreview: null,
        truncated: false,
      },
    }),
  );
  expect(observer.snapshot()).toMatchObject({
    actualModel: 'resolved-model',
    firstMs: 10,
    completionMs: 20,
    completionCensored: false,
    outcome: 'invalid',
  });
  expect(observer.profile('base')).not.toBe('base');
});

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
it('JSON失败仍保留已完整观测的首输出、间隔和调用完成时间', () => {
  let now = 0;
  const observer = new AiAdaptiveObservation('request', 'fixed', () => now);
  now = 10;
  observer.progress({ type: 'reasoning', at: '' });
  now = 15;
  observer.progress({ type: 'text', at: '' });
  now = 20;
  observer.failed(
    new AiSdkGenerationError({
      code: 'schema_invalid',
      phase: 'validation',
      externalResult: 'complete',
      requestId: null,
      summary: 'invalid JSON',
    }),
  );
  now = 100;
  expect(observer.snapshot()).toMatchObject({
    outcome: 'invalid',
    firstMs: 10,
    maxGapMs: 5,
    firstCensored: false,
    gapCensored: false,
    completionMs: 20,
    completionCensored: false,
  });
});
it('非流式只记录完成阶段，不伪造流式截尾样本', () => {
  let now = 0;
  const observer = new AiAdaptiveObservation('request', 'fixed', () => now, 'single');
  now = 30;
  expect(observer.snapshot()).toMatchObject({
    firstMs: null,
    maxGapMs: null,
    firstCensored: false,
    gapCensored: false,
    completionCensored: true,
    completionLowerBoundMs: 30,
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
