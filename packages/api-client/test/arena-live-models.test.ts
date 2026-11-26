import { describe, expect, it } from 'vitest';
import { aiGenerationContracts, type AiProviderRecord } from '@thesis-ledger/schemas';
import { arenaLiveModels } from '../src/arena-live-setup.js';

const model = '@cf/google/gemma-4-26b-a4b-it';
const route: NonNullable<AiProviderRecord['executionRoutes']>[number] = {
  model,
  adapter: 'openai-compatible',
  mode: 'json_validated',
  contract: { id: 'arena_live_research', version: 'arena-live-research-v4' },
  liveValidation: {
    status: 'passed',
    checkedAt: '2026-11-15T00:00:00Z',
    requestId: '00000000-0000-4000-8000-000000000001',
  },
  readiness: {
    state: 'blocked',
    reasons: ['budget_not_authorized'],
    configurationFingerprint: 'fixture',
    evaluatedAt: '2026-11-15T00:00:00Z',
  },
};
const provider: AiProviderRecord = {
  name: 'cloudflare',
  type: 'ai',
  enabled: true,
  priority: 100,
  capabilities: ['chat'],
  health: 'healthy',
  executionRoutes: [route],
  modelPricing: {
    [model]: { costPer1kInput: 0.001, costPer1kOutput: 0.002, costCurrency: 'USD' },
  },
};

describe('自主研究参赛模型', () => {
  it('服务端支持且已验证的 Cloudflare V4 可选并去重，不受客户端合同版本影响', () => {
    expect(arenaLiveModels([{ ...provider, executionRoutes: [route, route] }])).toEqual([
      { providerId: 'cloudflare', model },
    ]);
  });

  it.each(['arena-live-research-v2', 'arena-live-research-v3'] as const)(
    '服务端不支持的历史合同 %s 即使曾验证通过也不可选',
    (version) => {
      expect(
        arenaLiveModels([
          {
            ...provider,
            executionRoutes: [
              {
                ...route,
                contract: { ...route.contract, version },
                readiness: {
                  ...route.readiness,
                  reasons: ['budget_not_authorized', 'adapter_contract_evidence_missing'],
                },
              },
            ],
          },
        ]),
      ).toEqual([]);
    },
  );

  it('保留停用、其他用途、未验证、其他阻断原因和缺价格的筛选', () => {
    const invalid: AiProviderRecord[] = [
      { ...provider, enabled: false },
      { ...provider, modelPricing: {} },
      { ...provider, modelPricing: { [model]: { costPer1kInput: 0.001, costCurrency: 'USD' } } },
      { ...provider, modelPricing: { [model]: { costPer1kInput: 0.001, costPer1kOutput: 0.002 } } },
      {
        ...provider,
        executionRoutes: [{ ...route, contract: aiGenerationContracts.arenaDecision.ref }],
      },
      {
        ...provider,
        executionRoutes: [
          { ...route, liveValidation: { status: 'not_run', requestId: null, checkedAt: null } },
        ],
      },
      {
        ...provider,
        executionRoutes: [
          { ...route, liveValidation: { ...route.liveValidation, status: 'failed' } },
        ],
      },
      {
        ...provider,
        executionRoutes: [
          {
            ...route,
            readiness: { ...route.readiness, reasons: ['budget_not_authorized', 'provider_down'] },
          },
        ],
      },
    ];
    expect(arenaLiveModels(invalid)).toEqual([]);
  });

  it('服务端就绪的路线继续可选，零价格仍是有效价格', () => {
    expect(
      arenaLiveModels([
        {
          ...provider,
          executionRoutes: [
            { ...route, readiness: { ...route.readiness, state: 'ready', reasons: [] } },
          ],
        },
      ]),
    ).toEqual([{ providerId: 'cloudflare', model }]);
    expect(
      arenaLiveModels([
        {
          ...provider,
          modelPricing: { [model]: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' } },
        },
      ]),
    ).toEqual([{ providerId: 'cloudflare', model }]);
  });
});
