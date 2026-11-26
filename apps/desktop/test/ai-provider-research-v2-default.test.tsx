import { describe, expect, it } from 'vitest';
import {
  aiProviderExecutionRouteDraftFromConfig,
  aiProviderExecutionRouteInputFromDraft,
  newAiProviderExecutionRouteDraft,
} from '../src/features/providers/ai-provider-execution.js';

describe('Provider 研究合同默认版本', () => {
  it('新建的研究用途默认保存现行报告生成合同', () => {
    const draft = newAiProviderExecutionRouteDraft('openrouter/free');
    expect(draft.contractId).toBe('research');
    expect(draft.contractVersion).toBeUndefined();
    expect(aiProviderExecutionRouteInputFromDraft(draft).contract).toEqual({
      id: 'research',
      version: 'research-report-generation-v1',
    });
  });

  it('现有研究用途回显并保存精确合同', () => {
    const saved = aiProviderExecutionRouteDraftFromConfig({
      model: 'existing',
      mode: 'json_validated',
      outputPolicy: 'manual',
      enabled: true,
      modeOverridden: true,
      contract: { id: 'research', version: 'research-report-generation-v1' },
    });
    expect(saved.contractVersion).toBe('research-report-generation-v1');
    expect(aiProviderExecutionRouteInputFromDraft(saved).contract.version).toBe(
      'research-report-generation-v1',
    );
  });

  it('保存时拒绝显式指定的旧研究合同', () => {
    const draft = newAiProviderExecutionRouteDraft('example-model');
    expect(() => aiProviderExecutionRouteInputFromDraft({
      ...draft, contractVersion: 'research-generation-v2',
    })).toThrow();
  });
});
