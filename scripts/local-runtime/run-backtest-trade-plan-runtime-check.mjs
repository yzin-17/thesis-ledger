// 复用正式锁和 Docker 连接，向两个既有容器传入独立冻结输入，不替换应用文件。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backtestStrategyPlanReadback } from '../../packages/domain/dist/index.js';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  output = resolve(process.argv[2] ?? '');
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'));
mkdirSync(output, { mode: 0o700 });
const cases = process.argv.slice(3);
assert(cases.length > 0, '需要捕获目录／样本名');
const samples = cases.map((value) => {
  const split = value.lastIndexOf(':'),
    directory = resolve(value.slice(0, split)),
    id = value.slice(split + 1);
  assert(directory.startsWith(resolve(root, 'var/acceptance') + '/'));
  assert(/^[a-z-]+$/.test(id));
  const sample = JSON.parse(readFileSync(resolve(directory, id + '.json'), 'utf8'));
  assert.equal(sample.category, 'passed');
  const snapshot = resolve(directory, id + '-snapshot');
  const files = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = resolve(path, entry.name);
      assert(!entry.isSymbolicLink());
      if (entry.isDirectory()) visit(file);
      else
        files.push({
          path: relative(snapshot, file),
          base64: readFileSync(file).toString('base64'),
        });
    }
  };
  visit(snapshot);
  assert(files.length > 0 && files.length <= 100);
  return {
    capture: relative(root, directory),
    id,
    configuration: sample.configuration,
    readback: backtestStrategyPlanReadback(sample.configuration),
    capturedReadback: sample.readback,
    result: sample.result,
    runId: sample.result.runId,
    files,
  };
});
const hashInputs = {
  domain: [
    'backtest-daily-engine.js',
    'backtest-daily-ledger.js',
    'backtest-daily-matching.js',
    'backtest-daily-venue.js',
    'backtest-daily-order-display.js',
    'backtest-daily-order-expressions.js',
    'backtest-daily-order-price.js',
    'backtest-daily-order-prompt.js',
    'backtest-daily-order-result-display.js',
    'backtest-daily-order-settings.js',
    'backtest-daily-order-submission.js',
    'backtest-order-affordability.js',
    'backtest-order-charges.js',
    'backtest-order-protection.js',
    'backtest-order-state.js',
    'backtest-order-settled-ownership.js',
    'backtest-trades.js',
    'index.js',
    'strategy-definition-draft.js',
    'strategy-definition-editor.js',
    'strategy-protection-editor.js',
    'backtest-strategy-coordinate.js',
    'backtest-trade-plan-runtime.js',
    'backtest-trade-plan-contract.js',
    'backtest-trade-protection.js',
    'backtest-expression-display.js',
    'backtest-simulation.js',
    'backtest-trade-loss-pause.js',
    'backtest-trade-plan-calendar.js',
    'backtest-trade-volatility.js',
    'backtest-trade-volatility-action.js',
    'backtest-trade-plan-allocation.js',
    'backtest-trade-monthly-action.js',
    'backtest-trade-month-end.js',
    'backtest-trade-monthly-display.js',
    'backtest-indicators.js',
    'backtest-trade-plan-sizing.js',
    'backtest-sizing.js',
    'backtest-sizing-risk-adapter.js',
    'backtest-investment-budget.js',
    'backtest-normalized-budget.js',
    'backtest-price-research-sizing.js',
    'execution-rules.js',
    'backtest-trade-plan-display.js',
    'backtest-strategy-plan-readback.js',
    'backtest-engine.js',
    'backtest-session-clock.js',
    'backtest-session-vwap.js',
    'backtest-series.js',
    'backtest-simulation-evaluator.js',
    'backtest-rule-compatibility.js',
  ],
  schemas: [
    'backtest-daily-order-result.js',
    'backtest-daily-order-validation.js',
    'backtest-daily-orders.js',
    'index.js',
    'strategy-definition-upgrade.js',
    'strategy-risk-eligibility.js',
    'backtest-trade-plan.js',
    'backtest-trade-plan-generation.js',
    'backtest-trade-monthly-rebalance.js',
    'strategy-discovery-generation.js',
    'strategy-authoring-generation.js',
    'strategy-authoring-operation-schema.js',
    'strategy-authoring-modification.js',
    'strategy-authoring.js',
    'strategy-authoring-definition.js',
    'ai-execution.js',
    'backtest-strategy.js',
    'backtest-expression.js',
    'backtest-indicators.js',
    'backtest-values.js',
    'backtest-data.js',
    'backtest-expression-validation.js',
    'backtest-session-expression.js',
    'backtest-price-research-strategy.js',
    'market-data-wire-v3.js',
    'backtest-daily-tradability.js',
  ],
  server: [
    'ai/ai-generation-order-slots.js',
    'ai/ai-generation-order-validation.js',
    'backtest/backtest-snapshot-v3-dependency-validation.js',
    'backtest/strategy-definition-write.js',
    'backtest/strategy-creation.service.js',
    'backtest/strategy-version-publication.js',
    'backtest/backtest-nav-preparation.service.js',
    'backtest/backtest-nav-run.service.js',
    'backtest/backtest-nav-run-execution.js',
    'strategy-authoring/authoring-save.service.js',
    'strategy-authoring/authoring-semantics.js',
    'strategy-optimization/strategy-optimization-adoption.js',
    'strategy-optimization/strategy-optimization-candidate.service.js',
    'backtest/backtest-v3-runner.js',
    'backtest/backtest-v2-execution-exchange.js',
    'backtest/backtest-exchange-sizing.js',
    'backtest/backtest-trade-plan-execution.js',
    'backtest/backtest-trade-plan-calendar-range.js',
    'backtest/backtest-settlement-calendar.js',
    'strategy-authoring/authoring-prompt.js',
    'strategy-authoring/authoring-operation-schema.js',
    'strategy-authoring/authoring-attempt.js',
    'strategy-authoring/authoring-analysis-prompt.js',
    'strategy-authoring/authoring-model-policy.js',
    'strategy-authoring/authoring-modification.js',
    'strategy-optimization/strategy-optimization-discovery.js',
    'strategy-optimization/strategy-optimization-prompt.js',
    'backtest/backtest-intraday-bar-session.js',
    'backtest/backtest-daily-bar-session.js',
    'backtest/backtest-exchange-source-series.js',
    'backtest/backtest-session-series.js',
    'backtest/backtest-benchmark-valuation-closes.js',
    'backtest/backtest-v2-execution-shared.js',
    'backtest/backtest-v3-execution-bar-rows.js',
    'backtest/backtest-v3-research-clock.js',
    'backtest/backtest-adjusted-indicators.js',
    'backtest/backtest-atr-input.js',
    'backtest/backtest-dependency-price.js',
    'backtest/backtest-dependency-events.js',
    'ai/ai-generation-schema-prompt.js',
    'ai/ai-generation-json-schema.js',
    'ai/ai-generation-schema-references.js',
    'ai/ai-sdk-generation.adapter.js',
    'ai/ai-generation-output.js',
    'ai/ai-native-strategy-schema.js',
    'ai/authoring-connection-probe.js',
    'ai/strategy-discovery-connection-probe.js',
    'backtest/backtest-snapshot-v3-input-plan.js',
    'backtest/backtest-snapshot-v3-builder.js',
    'backtest/backtest-snapshot-v3-calendar-alignment.js',
    'backtest/backtest-snapshot-v3-execution-bars.js',
    'backtest/backtest-snapshot-v3-tradability.js',
    'backtest/backtest-v3-tradability.js',
    'backtest/backtest-v3-benchmark.js',
    'backtest/backtest-v3-benchmark-identity.js',
    'backtest/backtest-run-preparation.js',
    'backtest/backtest-creation-guard.service.js',
    'backtest/backtest-v3-run-lifecycle.js',
    'backtest/backtest-price-research-input.js',
    'backtest/backtest-research-read-options-v3.js',
    'market/market-bar-reader-v3.js',
    'market/market-window-selector-v3.js',
    'market/market-window-response-v3.js',
    'market/market-window-evidence-v3.repository.js',
  ],
};
const hashes = Object.entries(hashInputs).flatMap(([area, paths]) =>
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
const infra = resolve(root, '../thesis-ledger-infra'),
  runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env')).runtime;
let code = readFileSync(
  resolve(root, 'scripts/local-runtime/backtest-trade-plan-runtime-check.mjs'),
  'utf8',
);
code = code.replaceAll("from '../../apps/server/dist/", "from '/app/apps/server/dist/");
const receipts = [];
for (const service of ['thesis-ledger', 'backtest-worker']) {
  const name = `thesis-ledger-dev-${service}-1`,
    [container] = JSON.parse(runtime.dockerSync(['inspect', name]));
  assert.equal(container.Config.Labels['com.docker.compose.service'], service);
  assert.equal(container.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
  assert(container.State.Running);
  assert.equal(container.State.Health?.Status, 'healthy');
  let result;
  try {
    result = JSON.parse(
      await runtime.docker(
        ['exec', '-i', '--workdir', '/app', name, 'node', '--input-type=module'],
        {
          input:
            code +
            '\nconsole.log(JSON.stringify(await checkTradePlanRuntime(' +
            JSON.stringify({ hashes, samples }) +
            ')));',
          timeout: 600000,
        },
      ),
    );
  } catch (error) {
    writeFileSync(
      resolve(output, service + '-failure.json'),
      JSON.stringify(
        {
          service,
          message: error.message,
          stdout: error.stdout,
          stderr: error.stderr,
        },
        null,
        2,
      ),
      { mode: 0o600, flag: 'wx' },
    );
    throw error;
  }
  assert.equal(result.status, 'passed');
  receipts.push({ service, containerId: container.Id, image: container.Image, ...result });
}
const response = await fetch('http://127.0.0.1:3000/api/v1/ai/providers/lmstudio/readiness', {
  signal: AbortSignal.timeout(10000),
});
assert(response.ok);
const routes = await response.json();
assert(Array.isArray(routes));
const expectedVersions = {
  strategy_discovery: 'strategy-discovery-v5',
  strategy_authoring_generation: 'authoring-generation-v5',
  strategy_authoring_modification: 'authoring-modification-v5',
};
const qualification = [
  'strategy_discovery',
  'strategy_authoring_generation',
  'strategy_authoring_modification',
].map((purpose) => {
  const route = routes.find((r) => r.contract.id === purpose);
  assert.equal(route?.contract.version, expectedVersions[purpose]);
  assert.equal(route?.readiness.state, 'ready');
  assert.equal(route.mode, 'native_schema');
  assert.equal(route.liveValidation.status, 'passed');
  return {
    purpose,
    contract: route.contract,
    mode: route.mode,
    readiness: route.readiness,
    liveValidation: route.liveValidation,
  };
});
writeFileSync(
  resolve(output, 'receipt.json'),
  JSON.stringify({ hashes, qualification, receipts }, null, 2),
  {
    mode: 0o600,
    flag: 'wx',
  },
);
console.log(
  JSON.stringify({
    status: 'passed',
    services: receipts.map((r) => r.service),
    cases: samples.map((s) => s.id),
    databaseWrites: 0,
    modelCalls: 0,
  }),
);
