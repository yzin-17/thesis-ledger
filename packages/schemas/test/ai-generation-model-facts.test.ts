import { describe, expect, it } from 'vitest';
import { aiGenerationOutcomeSchema } from '../src/index.js';

const completed = {
  status: 'complete',
  finishReason: 'stop',
  contract: { id: 'research', version: 'research-generation-v2' },
  schemaAccepted: true,
};

describe('SDK 完成事实的实际模型', () => {
  it('兼容没有实际模型的历史完成事实，并保留新的精确模型', () => {
    expect(aiGenerationOutcomeSchema.parse(completed)).toEqual(completed);
    expect(
      aiGenerationOutcomeSchema.parse({ ...completed, actualModel: 'resolved/model' }),
    ).toEqual({ ...completed, actualModel: 'resolved/model' });
  });

  it.each(['', null, 'x'.repeat(201)])('拒绝无效实际模型 %j', (actualModel) => {
    expect(aiGenerationOutcomeSchema.safeParse({ ...completed, actualModel }).success).toBe(false);
  });
});
