import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture')) throw new Error('需要专属隔离库');
it.skipIf(!url)('13个固定配置含逐次分档从正式提交、持久化与恢复回放到中文回读，逐笔等同实时领域结果', async () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const scripts = resolve(root, 'scripts/local-runtime');
  const { prepareFixedContingentCaptures } = await import(pathToFileURL(resolve(scripts, 'arena-contingent-fixed-captures.mjs')).href);
  const { replayAdvancedContingentCaptures } = await import(pathToFileURL(resolve(scripts, 'arena-contingent-advanced-replay.mjs')).href);
  const base = mkdtempSync(resolve(root, 'var/acceptance/arena-fixed-runtime-'));
  const capture = resolve(base, 'input'), output = resolve(base, 'replay'); mkdirSync(output);
  prepareFixedContingentCaptures(capture);
  const result = await replayAdvancedContingentCaptures({ databaseUrl: url, capture, output });
  expect(result.status).toBe('passed'); expect(result.modelCalls).toBe(0);
  expect(result.results).toHaveLength(13); expect(result.results.every((r: { runtimeMatchesDomain: boolean }) => r.runtimeMatchesDomain)).toBe(true);
}, 60000);
