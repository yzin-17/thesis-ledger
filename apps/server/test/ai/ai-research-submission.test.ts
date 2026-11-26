import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { AiRunService } from '../../src/ai/ai-run.service.js';
import { sealAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';

function setup(hasDefault: boolean) {
  const frozen = sealAiFrozenResearchV2(submissionV2Fixture().frozen);
  const create = vi.fn(async ({ data }: { data: object }) => ({ id: randomUUID(), ...data }));
  const transaction = {
    aiRun: { create, findUnique: vi.fn().mockResolvedValue(null) },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = { $transaction: (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) };
  const routing = { read: vi.fn().mockResolvedValue({
    researchDefault: hasDefault ? { providerId: 'selected-provider', model: 'selected-model' } : null,
    revision: frozen.researchSettingsRevision,
  }) };
  const providers = { strictReadyContract: vi.fn().mockReturnValue({
    provider: { id: 'selected-provider' },
    execution: {
      adapter: 'openai-compatible',
      mode: 'json_validated',
      readiness: { configurationFingerprint: 'selected-fingerprint' },
    },
  }) };
  const service = new AiRunService(prisma as never, providers as never, routing as never);
  const access = { async assertSubmission() {}, async assertSnapshot() {} };
  return { service, frozen, create, transaction, routing, providers, access };
}

afterEach(() => vi.unstubAllEnvs());

it('配置事务冻结提交选择和具名执行合同', async () => {
  vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
  const fixture = setup(true);
  const owner = randomUUID();
  await fixture.service.startResearchV2(owner, fixture.frozen, fixture.access);
  expect(fixture.routing.read).toHaveBeenCalledWith(fixture.transaction);
  expect(fixture.providers.strictReadyContract).toHaveBeenCalledWith(expect.objectContaining({
    providerId: 'selected-provider', model: 'selected-model', contract: researchGenerationV2Contract.ref,
  }));
  expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    provider: 'selected-provider',
    model: 'selected-model',
    researchOwnerId: owner,
    modelMetadata: expect.objectContaining({
      frozenResearch: fixture.frozen,
      sdkExecution: expect.objectContaining({ contract: researchGenerationV2Contract.ref }),
      researchRoutes: [expect.objectContaining({ configurationFingerprint: 'selected-fingerprint' })],
    }),
  }) }));
});

it('尚未设置默认模型时不创建任务', async () => {
  vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
  const fixture = setup(false);
  await expect(fixture.service.startResearchV2(randomUUID(), fixture.frozen, fixture.access))
    .rejects.toThrow('请先选择研究默认模型');
  expect(fixture.create).not.toHaveBeenCalled();
});
