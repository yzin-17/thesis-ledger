import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { createStoredAiProvider } from '../../src/ai/ai-provider-runtime.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import { routeSnapshotsFromProviderRow } from '../../src/ai/ai-provider-readiness.persistence.js';
import { tradePlanWireCapture } from './trade-plan-wire.fixture.js';
import { tradePlanProvider } from './trade-plan-provider.fixture.js';
import { aiGenerationContracts } from '@thesis-ledger/schemas';

/** 同批次复用已实际完成的私有资格，严格就绪检查仍核对当前合同及配置指纹。 */
export async function restoreExpressionQualification(
  source: Parameters<typeof createStoredAiProvider>[0],
  entry: Parameters<typeof tradePlanProvider>[2],
  capture: (name: string, value: unknown) => void,
): Promise<Awaited<ReturnType<typeof tradePlanProvider>>> {
  const row = { ...source, updatedAt: new Date(source.updatedAt), encryptedCredentials: null };
  const settings = parseAiProviderSettings(row.settings);
  if (!settings || settings.authMode !== 'none' || settings.models.length !== 1)
    throw new Error('私有资格配置无效');
  const contract = {
    discovery: aiGenerationContracts.strategyDiscovery,
    authoring: aiGenerationContracts.authoringGeneration,
    'authoring-modification': aiGenerationContracts.authoringModification,
    'authoring-analysis': aiGenerationContracts.authoringAnalysis,
  }[entry!];
  const provider = await createStoredAiProvider(
    row,
    {
      readCredential: () => {
        throw new Error('禁止读取凭证');
      },
    },
    30000,
  );
  if (!provider) throw new Error('私有 Provider 装配失败');
  const registry = new AiProviderRegistry();
  registry.replace([provider], routeSnapshotsFromProviderRow(row, settings, row.health));
  const model = settings.models[0]!;
  const resolved = registry.strictReadyContract({
    providerId: row.name,
    model,
    contract: contract.ref,
    budgetAuthorized: true,
  });
  const adapter = new AiSdkGenerationAdapter();
  const generate = adapter.generate.bind(adapter);
  let calls = 0;
  adapter.generate = async (request) => {
    const call = ++calls;
    capture(`request-${call}.json`, {
      contract: request.contract,
      messages: request.messages,
      mode: request.mode,
      maxOutputTokens: request.maxOutputTokens,
    });
    const result = await generate({
      ...request,
      httpClient: tradePlanWireCapture(request, capture, call),
    });
    capture(`response-${call}.json`, result);
    return result;
  };
  return { adapter, model, resolved, row };
}

/** 每个用途只创建一次私有资格；同批受控目录复用现有回执，不调用新的探针。 */
export async function expressionQualifiedProvider(input: {
  directory: string;
  entry: NonNullable<Parameters<typeof tradePlanProvider>[2]>;
  qualificationRoot: string | undefined;
  providerRow: Parameters<typeof tradePlanProvider>[0];
  capture: (name: string, value: unknown) => void;
}) {
  mkdirSync(resolve(input.directory, input.entry), { mode: 0o700 });
  const cached = input.qualificationRoot
    ? resolve(input.qualificationRoot, input.entry + '.json')
    : null;
  if (cached && existsSync(cached))
    return restoreExpressionQualification(
      JSON.parse(readFileSync(cached, 'utf8')),
      input.entry,
      input.capture,
    );
  if (process.env.STRATEGY_EXPRESSION_REQUIRE_CACHED_QUALIFICATION === '1')
    throw new Error('私有资格缺失，禁止新增探针');
  const provider = await tradePlanProvider(input.providerRow, input.capture, input.entry);
  if (cached) writeFileSync(cached, JSON.stringify(provider.row), { flag: 'wx', mode: 0o600 });
  return provider;
}
