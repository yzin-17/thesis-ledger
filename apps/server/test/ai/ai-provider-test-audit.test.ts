import { describe, expect, it, vi } from 'vitest';
import { researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import {
  createConfigStub,
  createDbRow,
  createHealthStub,
  validSettings,
} from './ai-provider-management.fixtures.js';

const requestId = '93d88c31-91e9-4014-a727-c6fd03734f78';
const model = 'selected-model';
const usage = { status: 'reported', inputTokens: 17, outputTokens: 156 } as const;

const storedProvider = (mode: 'native_schema' | 'json_mode' = 'native_schema') =>
  createDbRow('audit-provider', {
    settings: {
      ...validSettings('http://127.0.0.1:9/v1', [model]),
      authMode: 'api_key',
      modelPricing: {
        [model]: {
          costPer1kInput: 0,
          costPer1kOutput: 0,
          costCurrency: 'USD',
          pricingVersion: 'test-pricing-v1',
          updatedAt: '2026-10-30T00:00:00.000Z',
          source: 'user',
        },
      },
      executionRoutes: [{ model, mode, enabled: true, contract: researchGenerationV2Contract.ref }],
    },
  });

describe('AI Provider 测试审计归因', () => {
  it.each(['success', 'failure', 'cancelled'] as const)(
    '连接 %s 不借用已配置的研究输出方式或合同',
    async (outcome) => {
      const configs = createConfigStub([storedProvider()]);
      const health = createHealthStub();
      const sdk = {
        generate: vi.fn(async (input: Record<string, unknown>) => {
          void input;
          if (outcome === 'cancelled') {
            service.cancelTest('audit-provider', requestId);
            throw (input.signal as AbortSignal).reason;
          }
          if (outcome !== 'success') throw new Error('controlled test failure');
          return {
            output: { ok: true },
            actualModel: 'reported-model',
            usage,
            providerCost: '0',
            providerCostCurrency: 'USD',
          };
        }),
      };
      const service: AiProviderService = new AiProviderService(
        configs.service as never,
        health as never,
        new AiProviderRegistry(),
        sdk as never,
      );

      const result = await service.testSaved('audit-provider', {
        model,
        testKind: 'connection',
        requestId,
      });

      if (outcome === 'cancelled') expect(result.status).toBe('cancelled');
      expect(sdk.generate).toHaveBeenCalledOnce();
      expect(sdk.generate.mock.calls[0]?.[0]).toMatchObject({
        model,
        mode: 'json_validated',
        transport: 'single',
      });
      expect(result).toMatchObject({ testKind: 'connection', mode: 'json_validated', model });
      expect(result.actualModel).toBe(outcome === 'success' ? 'reported-model' : null);
      const records = outcome === 'cancelled' ? health.recordHistory : health.record;
      expect(records).toHaveBeenCalledOnce();
      const details = records.mock.calls[0]?.[6];
      expect(details).toMatchObject({
        kind: 'ai_provider_test',
        testKind: 'connection',
        mode: 'json_validated',
        model,
        actualModel: outcome === 'success' ? 'reported-model' : null,
      });
      expect(details).not.toHaveProperty('contract');
      expect(details).not.toHaveProperty('purpose');
      if (outcome === 'success') {
        expect(details).toMatchObject({
          usage,
          cost: { amount: '0', source: 'provider_reported' },
        });
      } else {
        expect(details).toMatchObject({ usage: { inputTokens: null, outputTokens: null } });
      }
      expect(configs.service.saveAi).not.toHaveBeenCalled();
    },
  );

  it.each(['native_schema', 'json_mode'] as const)(
    '%s 用途测试保留实际调用的输出方式和准确合同',
    async (mode) => {
      const configs = createConfigStub([storedProvider(mode)]);
      const health = createHealthStub();
      const sdk = {
        generate: vi.fn(async (input: Record<string, unknown>) => {
          void input;
          return { output: { ok: true }, usage };
        }),
      };
      const service = new AiProviderService(
        configs.service as never,
        health as never,
        new AiProviderRegistry(),
        sdk as never,
      );

      const result = await service.testSaved('audit-provider', {
        model,
        testKind: 'generation',
        purpose: 'research',
      });
      expect(result.status).toBe('healthy');
      expect(result.actualModel).toBeNull();

      expect(sdk.generate).toHaveBeenCalledOnce();
      expect(sdk.generate.mock.calls[0]?.[0]).toMatchObject({
        model,
        mode,
        transport: 'stream',
        contract: researchGenerationV2Contract.ref,
      });
      expect(health.record.mock.calls[0]?.[6]).toMatchObject({
        testKind: 'generation',
        purpose: 'research',
        mode,
        contract: researchGenerationV2Contract.ref,
        usage,
      });
    },
  );
});
