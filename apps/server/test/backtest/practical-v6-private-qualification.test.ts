import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import { restoreExpressionQualification } from './strategy-expression-qualification.fixture.js';

const source = process.env.PRACTICAL_V6_QUALIFICATION_SOURCE;
const output = process.env.PRACTICAL_V6_QUALIFICATION_OUTPUT;
it.skipIf(!source || !output)(
  '按实际通过历史恢复三份私有资格，保留原时点、指纹且不调用模型',
  async () => {
    expect(resolve(source!)).toContain('/var/acceptance/');
    expect(resolve(output!)).toContain('/var/acceptance/');
    mkdirSync(output!, { recursive: true, mode: 0o700 });
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw new Error('恢复私有资格禁止联网');
    };
    try {
      for (const entry of ['discovery', 'authoring', 'authoring-modification'] as const) {
        const row = JSON.parse(readFileSync(resolve(source!, 'provider.json'), 'utf8'));
        const settings = parseAiProviderSettings(row.settings)!;
        const history = JSON.parse(
          readFileSync(resolve(source!, entry, 'qualification.json'), 'utf8'),
        );
        const passed = history.filter(
          (item: unknown[]) => (item.at(-1) as { status?: string }).status === 'passed',
        );
        expect(passed).toHaveLength(1);
        const fact = passed[0][6];
        const contract = {
          discovery: aiGenerationContracts.strategyDiscovery,
          authoring: aiGenerationContracts.authoringGeneration,
          'authoring-modification': aiGenerationContracts.authoringModification,
        }[entry];
        const request = JSON.parse(readFileSync(resolve(source!, entry, 'request-1.json'), 'utf8'));
        expect(request.contract).toEqual(contract.ref);
        expect(fact.purpose).toBe(contract.ref.id);
        expect(fact.mode).toBe('native_schema');
        expect(fact.model).toBe(settings.models[0]);
        const route = settings.executionRoutes!.find(
          (route) => route.model === fact.model && route.contract.id === fact.purpose,
        )!;
        row.encryptedCredentials = null;
        row.settings = {
          ...settings,
          executionRoutes: [
            { ...route, contract: contract.ref, outputPolicy: 'manual', modeOverridden: true },
          ],
          generationValidation: [
            {
              fingerprint: fact.fingerprint,
              model: fact.model,
              purpose: fact.purpose,
              mode: fact.mode,
              requestId: fact.requestId,
              checkedAt: passed[0][4],
              latencyMs: passed[0][2],
            },
          ],
        };
        const restored = await restoreExpressionQualification(row, entry, () => {
          throw new Error('禁止生成');
        });
        expect(restored.model).toBe(fact.model);
        writeFileSync(resolve(output!, entry + '.json'), JSON.stringify(row, null, 2), {
          flag: 'wx',
          mode: 0o600,
        });
      }
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  },
);
