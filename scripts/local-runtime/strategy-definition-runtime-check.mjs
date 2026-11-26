// 核对目标 Server／Worker 的实际产物；只读模块和受控定义，不连接业务数据库。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const output = resolve(process.argv[2] ?? '');
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'));
mkdirSync(output, { mode: 0o700 });
const definitions = ['backtest-v2.exchange.json', 'backtest-v2.cn-nav.json'].map((name) =>
  JSON.parse(readFileSync(resolve(root, 'packages/schemas/fixtures', name), 'utf8')),
);
const areas = {
  domain: [
    'index.js',
    'strategy-definition-draft.js',
    'strategy-definition-editor.js',
    'backtest-strategy-coordinate.js',
    'backtest-strategy-plan-readback.js',
    'backtest-expression-display.js',
    'backtest-trade-plan-display.js',
  ],
  schemas: [
    'index.js',
    'strategy-definition-upgrade.js',
    'strategy-risk-eligibility.js',
    'backtest-strategy.js',
    'backtest-values.js',
    'strategy-authoring-generation.js',
    'strategy-authoring-operation-schema.js',
  ],
  server: [
    'backtest/strategy-definition-write.js',
    'backtest/strategy-creation.service.js',
    'backtest/strategy-version-publication.js',
    'backtest/backtest-snapshot-v3-input-plan.js',
    'backtest/backtest-nav-preparation.service.js',
    'backtest/backtest-nav-run.service.js',
    'backtest/backtest-nav-run-execution.js',
    'strategy-authoring/authoring-save.service.js',
    'strategy-authoring/authoring-semantics.js',
    'strategy-authoring/authoring-prompt.js',
    'strategy-authoring/authoring-operation-schema.js',
    'strategy-optimization/strategy-optimization-discovery.js',
    'strategy-optimization/strategy-optimization-adoption.js',
    'strategy-optimization/strategy-optimization-candidate.service.js',
  ],
};
const hashes = Object.entries(areas).flatMap(([area, paths]) =>
  paths.map((path) => ({
    area,
    path,
    sha256: createHash('sha256')
      .update(
        readFileSync(
          resolve(root, area === 'server' ? 'apps/server/dist/src' : `packages/${area}/dist`, path),
        ),
      )
      .digest('hex'),
  })),
);
const code = `
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { upgradeStrategyDefinitionTo3, strategySchema } from '@thesis-ledger/schemas';
import { parseStrategyDefinitionDraft, patchStrategyDefinitionDraft, renameStrategySource,
  removeStrategySource, backtestStrategyPlanReadback, isPriceResearchStrategyDefinition
} from '@thesis-ledger/domain';
import { requireNewStrategyDefinition } from '/app/apps/server/dist/src/backtest/strategy-definition-write.js';
import { hashCanonicalManifest } from '/app/apps/server/dist/src/backtest/backtest-snapshot.js';
const input = ${JSON.stringify({ hashes, definitions })};
const require = createRequire(resolve('package.json'));
const locations = {
  domain: dirname(require.resolve('@thesis-ledger/domain')),
  schemas: dirname(require.resolve('@thesis-ledger/schemas')),
  server: '/app/apps/server/dist/src',
};
for (const file of input.hashes) assert.equal(createHash('sha256')
  .update(readFileSync(resolve(locations[file.area], file.path))).digest('hex'), file.sha256, file.path);
const cases = [];
for (const definition of input.definitions) {
  const before = structuredClone(definition), oldHash = hashCanonicalManifest(definition);
  const upgraded = upgradeStrategyDefinitionTo3(definition);
  assert.equal(upgraded.schemaVersion, '3');
  assert.deepEqual(requireNewStrategyDefinition(upgraded), upgraded);
  assert.throws(() => requireNewStrategyDefinition(definition), error =>
    error.getResponse().code === 'STRATEGY_DEFINITION_UPGRADE_REQUIRED');
  assert.equal(isPriceResearchStrategyDefinition(upgraded), false);
  assert.deepEqual(definition, before);
  assert.equal(hashCanonicalManifest(definition), oldHash);
  const expected = definition.execution.mode === 'nav' ? 'native-nav' : 'run';
  assert(upgraded.signalSources.every(source => source.priceCoordinate === expected));
  assert.deepEqual(strategySchema.parse(upgraded), upgraded);
  assert(backtestStrategyPlanReadback(upgraded).length > 0);
  const id = upgraded.signalSources[0].id;
  let draft = parseStrategyDefinitionDraft(JSON.stringify({ ...upgraded,
    extension: { precise: '0.000000000000000001', sourceId: id } }));
  draft = patchStrategyDefinitionDraft(draft, ['description'], '受控运行核对');
  draft = renameStrategySource(draft, 0, 'runtime-source');
  assert.equal(draft.extension.precise, '0.000000000000000001');
  assert.equal(draft.extension.sourceId, 'runtime-source');
  assert.throws(() => removeStrategySource(draft, 0), /来源仍被引用/);
  assert.throws(() => parseStrategyDefinitionDraft('[]'), /JSON 对象/);
  cases.push({ mode: definition.execution.mode, coordinate: expected, oldHashUnchanged: true });
}
console.log(JSON.stringify({ status: 'passed', modules: input.hashes.length, cases,
  databaseWrites: 0, modelCalls: 0 }));
`;
const infra = resolve(root, '../thesis-ledger-infra');
const runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env')).runtime;
const receipts = [];
for (const service of ['thesis-ledger', 'backtest-worker']) {
  const name = `thesis-ledger-dev-${service}-1`;
  const [container] = JSON.parse(runtime.dockerSync(['inspect', name]));
  assert.equal(container.Config.Labels['com.docker.compose.service'], service);
  assert.equal(container.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
  assert(container.State.Running);
  const result = JSON.parse(
    await runtime.docker(['exec', '-i', '--workdir', '/app', name, 'node', '--input-type=module'], {
      input: code,
      timeout: 30000,
    }),
  );
  receipts.push({ service, containerId: container.Id, image: container.Image, ...result });
}
writeFileSync(resolve(output, 'receipt.json'), JSON.stringify({ hashes, receipts }, null, 2), {
  mode: 0o600,
  flag: 'wx',
});
console.log(
  JSON.stringify({
    status: 'passed',
    output,
    modules: hashes.length,
    services: receipts.map((item) => item.service),
    databaseWrites: 0,
    modelCalls: 0,
  }),
);
