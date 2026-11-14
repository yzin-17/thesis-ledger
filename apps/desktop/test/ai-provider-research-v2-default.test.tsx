import { describe, expect, it } from 'vitest';
import {
  aiProviderExecutionRouteDraftFromConfig,
  aiProviderExecutionRouteInputFromDraft,
  newAiProviderExecutionRouteDraft,
} from '../src/features/providers/ai-provider-execution.js';

describe('Provider 研究合同默认版本', () => {
  it('新建的研究用途默认为 V2，并保存准确的研究 V2 合同', () => {
    const draft = newAiProviderExecutionRouteDraft('openrouter/free');
    expect(draft.contractId).toBe('research');
    expect(draft.contractVersion).toBeUndefined();
    expect(aiProviderExecutionRouteInputFromDraft(draft).contract).toEqual({
      id: 'research',
      version: 'research-generation-v2',
    });
  });

  it('现有 V1 用途回显并按原版本保存，不会被默认版本覆盖', () => {
    const saved = aiProviderExecutionRouteDraftFromConfig({
      model: 'legacy',
      mode: 'json_validated',
      outputPolicy: 'manual',
      enabled: true,
      modeOverridden: true,
      contract: { id: 'research', version: 'research-generation-v1' },
    });
    expect(saved.contractVersion).toBe('research-generation-v1');
    expect(aiProviderExecutionRouteInputFromDraft(saved).contract.version).toBe(
      'research-generation-v1',
    );
  });

  it('缺少显式合同版本的新建草稿也不会退回 V1', () => {
    const draft = newAiProviderExecutionRouteDraft('example-model');
    const withoutVersion = { ...draft };
    delete withoutVersion.contractVersion;
    expect(aiProviderExecutionRouteInputFromDraft(withoutVersion).contract.version).toBe(
      'research-generation-v2',
    );
  });
});
