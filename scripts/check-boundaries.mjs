import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const violations = [];

const serverLedgerPrefix = 'apps/server/src/ledger/';
const serverImportsPrefix = 'apps/server/src/imports/';
const serverProvidersPrefix = 'apps/server/src/providers/';
const serverBacktestPrefix = 'apps/server/src/backtest/';
const serverBacktestTestPrefix = 'apps/server/test/backtest/';
const forbiddenFeatureDependencies = [
  [
    'apps/desktop/src/features/market-detail/',
    'apps/desktop/src/features/market-data/InstrumentCatalogPanel',
    '行情详情不得反向依赖目录页面编排',
  ],
  [
    'apps/desktop/src/features/market-data/InstrumentCatalogPanel.tsx',
    'apps/desktop/src/features/account-data/',
    '目录行情入口不得依赖账户写入编排',
  ],
  [
    'apps/server/src/integration/dsa/',
    'apps/server/src/market/',
    'DSA 协议适配器不得反向依赖 Market 投影或编排',
  ],
  [
    'apps/server/src/backtest/backtest-v3-runner.ts',
    'apps/server/src/backtest/backtest-nav-',
    '场内 Runner 不得转发 NAV 编排，资产执行由各自 Runner 拥有',
  ],
  ['packages/domain/src/', 'packages/schemas/src/', '领域内核不得依赖 JSON 解析合同'],
  [
    'packages/schemas/src/backtest-strategy.ts',
    'packages/schemas/src/backtest-run',
    '策略合同不得依赖运行编排合同',
  ],
  [
    'packages/schemas/src/backtest-strategy.ts',
    'packages/schemas/src/backtest-result',
    '策略合同不得依赖运行结果',
  ],
  [
    'packages/schemas/src/monetary-values.ts',
    'packages/schemas/src/ledger-contract',
    '金额原语不得反向依赖账本命令',
  ],
  [
    'packages/schemas/src/monetary-values.ts',
    'packages/schemas/src/backtest-',
    '金额原语不得依赖回测编排',
  ],
  [
    serverBacktestPrefix,
    'apps/server/src/integration/dsa/dsa-nav-client',
    'backtest NAV preparation must consume the Market reader',
  ],
  [
    'apps/server/src/integration/dsa/',
    serverBacktestPrefix,
    'DSA source adapters must not depend on backtest preparation or orchestration',
  ],
  [
    'apps/server/src/market/',
    serverBacktestPrefix,
    'market facts must not depend on backtest preparation or orchestration',
  ],
  [
    serverProvidersPrefix,
    'apps/server/src/ai/',
    'provider storage must not depend on AI orchestration',
  ],
  [
    'apps/server/src/ai/',
    'apps/server/src/strategy-optimization/',
    'AI adapters must not depend on strategy orchestration',
  ],
  [serverLedgerPrefix, serverImportsPrefix, 'ledger must not depend on imports adapter'],
  [
    serverProvidersPrefix,
    'apps/server/src/notifications/',
    'providers must not own or import notification feature',
  ],
  [serverLedgerPrefix, 'apps/server/src/cash-plans/', 'ledger must not depend on cash plans'],
  [
    'apps/server/src/cash-plans/',
    'apps/server/src/automation/',
    'cash plans must not depend on automation orchestration',
  ],
  [
    'apps/server/src/notifications/',
    'apps/server/src/risk/',
    'notification outbox must not depend on risk callers',
  ],
  [
    'apps/server/src/notifications/',
    'apps/server/src/cash-plans/',
    'notification outbox must not depend on cash plan callers',
  ],
  [serverBacktestPrefix, serverLedgerPrefix, 'backtest must not depend on real ledger facts'],
  [
    serverBacktestPrefix,
    'apps/server/src/portfolio/',
    'backtest must not read portfolio projection',
  ],
  [serverBacktestPrefix, 'apps/server/src/journal/', 'backtest must not write journal projection'],
  [serverLedgerPrefix, serverBacktestPrefix, 'real ledger must not consume backtest results'],
  [
    'apps/server/src/portfolio/',
    serverBacktestPrefix,
    'portfolio projection must not consume backtest results',
  ],
  [
    'apps/server/src/journal/',
    serverBacktestPrefix,
    'journal projection must not consume backtest results',
  ],
  [
    'apps/server/src/ai/',
    serverBacktestPrefix,
    'general AI research must not consume backtest results directly',
  ],
];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (['.ts', '.tsx'].includes(extname(entry.name))) await inspect(path);
  }
}

async function inspect(path) {
  const source = await readFile(path, 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  const file = relative(root, path).replaceAll('\\', '/');
  const isServerSource = file.startsWith('apps/server/src/');
  const isMarketFeature = file.startsWith('apps/server/src/market/');
  const isDsaBoundary = file.startsWith('apps/server/src/integration/dsa/');
  if (
    file.includes('/src/') &&
    /\b(?:barSchemaV1|BarInputV1|BarV1|QuoteV1|QuantCapabilityContract|QuantCapabilityDeclaration)\b/u.test(
      source,
    )
  ) {
    violations.push(`${file} -> 退役的 Market V1/Quant 合同 (现行来源适配由 DSA 拥有)`);
  }
  if (
    file === 'apps/server/src/strategy-optimization/strategy-optimization-read.service.ts' &&
    /\bbacktestJob\.findMany\b/u.test(source)
  ) {
    violations.push(`${file} -> BacktestJob 直接分组读取 (必须消费当前冻结记录查询边界)`);
  }
  if (
    isServerSource &&
    /\bfundNavPoint\.(?:findMany|findFirst|findUnique|count|aggregate)\b/u.test(source)
  ) {
    violations.push(`${file} -> FundNavPoint 回读 (无当前合同证据的投影不得补版本作为 Data 返回)`);
  }
  if (
    isServerSource &&
    !isMarketFeature &&
    /\bmarketBarWindowEvidenceV3\s*\.|\bMarketWindowEvidenceV3Repository\b/u.test(source)
  ) {
    violations.push(`${file} -> MarketBarWindowEvidenceV3 (归档事实与重建核验只能由 Market 拥有)`);
  }
  if (
    isServerSource &&
    !isMarketFeature &&
    /prisma\.marketBar\.(?:find|count|groupBy|aggregate)\b|import\s+(?:type\s+)?\{[^}]*\bMarketBar\b/u.test(
      source,
    )
  ) {
    violations.push(`${file} -> MarketBar (行情事实只能由 MarketBarReader 读取)`);
  }
  if (
    isServerSource &&
    !isMarketFeature &&
    !isDsaBoundary &&
    /\b(?:this\.)?dsa\.(?:marketBarsV2|marketBarsV3|backtestBars)\s*\(/u.test(source)
  ) {
    violations.push(`${file} -> DsaClient market bars (必须通过 MarketBarReader)`);
  }
  if (
    isServerSource &&
    (/\/api\/v2\/thesis-ledger\/market\/bars/u.test(source) ||
      /\b(?:prisma|client)\.marketBarSeries(?:Fact|Coverage)\b/u.test(source))
  ) {
    violations.push(`${file} -> 旧 BarSeries 事实链路 (必须使用现行精确窗口)`);
  }
  for (const specifier of imports) {
    if (
      /(?:^|\/)(?:ledger-v2|backtest-v2|backtest-analytics-v2|backtest-v2-execution)\.js$/u.test(
        specifier,
      )
    ) {
      violations.push(`${file} -> ${specifier} (必须消费现行领域合同)`);
    }
    if (
      specifier === 'bullmq' &&
      !file.startsWith(serverBacktestPrefix) &&
      !file.startsWith(serverBacktestTestPrefix)
    ) {
      violations.push(`${file} -> ${specifier} (BullMQ adapter must remain in backtest boundary)`);
    }
    if (!specifier.startsWith('.')) continue;
    const target = relative(root, resolve(dirname(path), specifier)).replaceAll('\\', '/');
    if (
      file.startsWith('packages/') &&
      (target.startsWith('apps/') || target.startsWith('services/'))
    ) {
      violations.push(`${file} -> ${specifier}`);
    }
    const sourceApp = file.match(/^apps\/([^/]+)/)?.[1];
    const targetApp = target.match(/^apps\/([^/]+)/)?.[1];
    if (sourceApp && targetApp && sourceApp !== targetApp) {
      violations.push(`${file} -> ${specifier}`);
    }
    if (file.startsWith('apps/') && target.startsWith('services/')) {
      violations.push(`${file} -> ${specifier}`);
    }
    for (const [sourcePrefix, targetPrefix, reason] of forbiddenFeatureDependencies) {
      if (file.startsWith(sourcePrefix) && target.startsWith(targetPrefix)) {
        violations.push(`${file} -> ${specifier} (${reason})`);
      }
    }
  }
}

await walk(join(root, 'apps'));
await walk(join(root, 'packages'));
await walk(join(root, 'services'));
if (violations.length > 0) {
  console.error(`发现跨层非法导入:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Import boundaries: OK');
}
