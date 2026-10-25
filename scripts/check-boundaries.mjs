import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { mobileBoundaryViolation } from './mobile-boundaries.mjs';

const root = new URL('..', import.meta.url).pathname;
const violations = [];

const serverLedgerPrefix = 'apps/server/src/ledger/';
const serverImportsPrefix = 'apps/server/src/imports/';
const serverProvidersPrefix = 'apps/server/src/providers/';
const serverBacktestPrefix = 'apps/server/src/backtest/';
const serverBacktestTestPrefix = 'apps/server/test/backtest/';
const forbiddenFeatureDependencies = [
  ...['research', 'providers', 'ledger', 'backtest'].map((feature) => [
    'apps/server/src/ai/adaptive/',
    `apps/server/src/${feature}/`,
    'AI 自适应策略只消费固定请求与执行预算，不得反向读取业务编排或 Provider 配置',
  ]),
  ['apps/server/src/ai/adaptive/', 'apps/server/src/platform/prisma', 'AI 自适应缓存不得操作业务数据库或自行扩大请求授权'],
  ['apps/server/src/ai/adaptive/', 'apps/server/src/ai/provider-registry', 'AI 自适应策略不得自行重新选择Provider或模型'],
  ['apps/server/src/ai/adaptive/', 'apps/server/src/ai/ai-execution-state.store', 'AI 自适应策略不得直接改写业务执行账本'],
  ...['research', 'ledger', 'market', 'backtest', 'providers', 'notifications'].map((feature) => [
    'apps/server/src/ai/trace/',
    `apps/server/src/${feature}/`,
    'AI trace 只观察执行边界，不得反向依赖业务编排或 Provider 配置层',
  ]),
  [
    'apps/desktop/src/features/portfolio/portfolio-mode-context.tsx',
    'apps/desktop/src/app/',
    '账户模式上下文不得反向依赖应用路由或页面编排',
  ],
  [
    'apps/desktop/src/features/shared/navigation-guard.tsx',
    'apps/desktop/src/features/portfolio/',
    'UI 转换保护不得拥有账户模式或组合领域状态',
  ],
  [
    'apps/server/src/market/market-known-cash-selector-v3.ts',
    'apps/server/src/backtest/',
    '方案观察选择不得依赖回测记账或冻结编排',
  ],
  [
    'packages/schemas/src/market-known-cash-record-v3.ts',
    'packages/schemas/src/backtest-',
    '通用现金方案观察不得反向依赖回测编排合同',
  ],
  [
    'packages/schemas/src/market-cash-assessment-v3.ts',
    'packages/schemas/src/backtest-',
    '标准分红质量记录不得依赖回测编排',
  ],
  ...['market', 'integration', 'providers'].map((feature) => [
    'apps/server/src/backtest/backtest-known-cash-selection-v3.ts',
    `apps/server/src/${feature}/`,
    '冻结现金选择只消费标准记录与研究参数，不得读取最新来源',
  ]),
  [
    'apps/server/src/market/market-split-acquisition-v3.ts',
    'apps/server/src/backtest/',
    '拆分采集只使用市场事实与原selector，不依赖回测冻结编排',
  ],
  [
    'packages/schemas/src/market-split-acquisition-v3.ts',
    'packages/schemas/src/backtest-',
    '拆分采集信封不得反向依赖现金研究或回测编排合同',
  ],
  ...['market', 'integration', 'providers'].map((feature) => [
    'apps/server/src/backtest/backtest-known-cash-research-v3.ts',
    `apps/server/src/${feature}/`,
    '已知现金方案冻结投影只消费绑定输入，不得读取最新来源',
  ]),
  ...['market', 'integration', 'providers'].map((feature) => [
    'apps/server/src/backtest/backtest-known-cash-preparation-v3.ts',
    `apps/server/src/${feature}/`,
    '现金准备接缝只消费注入的标准读取端口，不得解析或直接读取供应商',
  ]),
  [
    'apps/server/src/market/market-lifecycle-reader-v3.ts',
    'apps/server/src/backtest/',
    '生命周期事实读取不得依赖回测预热或研究编排',
  ],
  [
    'apps/server/src/market/market-status-composition-reader-v1.ts',
    'apps/server/src/backtest/',
    '标准功能组合不得反向依赖冻结或回测编排',
  ],
  [
    'packages/schemas/src/market-status-composition-v1.ts',
    'packages/schemas/src/backtest-',
    '标准功能组合不得依赖研究冻结合同',
  ],
  ...['strategy-authoring', 'ai', 'backtest', 'market', 'journal', 'strategy-optimization'].map(
    (feature) => [
      'apps/server/src/identity/',
      `apps/server/src/${feature}/`,
      '可信身份不得反向依赖消费身份的业务编排',
    ],
  ),
  ['apps/server/src/ai/', 'apps/server/src/strategy-authoring/', '通用 AI 不得反向依赖策略编写'],
  [
    'packages/schemas/src/strategy-provenance.ts',
    'packages/schemas/src/strategy-authoring',
    '正式版本通用来源不得反向依赖编写快照',
  ],
  [
    'apps/server/src/backtest/',
    'apps/server/src/strategy-authoring/',
    '策略执行与正式版本不得反向依赖编写编排',
  ],
  [
    'apps/server/src/market/',
    'apps/server/src/strategy-authoring/',
    '行情事实不得反向依赖编写编排',
  ],
  [
    'packages/schemas/src/backtest-strategy.ts',
    'packages/schemas/src/strategy-authoring',
    '策略定义不得依赖编写合同',
  ],
  [
    'apps/server/src/market/market-period-',
    'apps/server/src/backtest/',
    '周期展示应消费日历事实，不得依赖 Backtest 编排',
  ],
  ['apps/server/src/ai/', 'apps/server/src/journal/', 'AI 执行层不得反向依赖 Journal 业务编排'],
  [
    'apps/server/src/journal/journal-review',
    'apps/server/src/journal/journal-legacy',
    '正式复盘不得消费旧 number 兼容分析',
  ],
  [
    'apps/server/src/journal/journal-period-review',
    'apps/server/src/journal/journal-legacy',
    '正式周期解读不得消费旧 number 兼容分析',
  ],
  [
    'apps/desktop/src/features/journal/review/',
    'apps/desktop/src/features/journal/journal.api',
    '正式桌面复盘不得依赖旧 number API 编排',
  ],
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
    'packages/domain/src/trade-projection.ts',
    'packages/domain/src/journal-review',
    '交易生命周期投影不得反向依赖复盘消费规则',
  ],
  [
    'packages/domain/src/trade-costs.ts',
    'packages/domain/src/journal-review',
    '交易成本分配不得反向依赖复盘消费规则',
  ],
  [
    'packages/schemas/src/trade-api.ts',
    'packages/schemas/src/journal-review',
    '交易事实契约不得反向依赖复盘契约',
  ],
  [
    'packages/schemas/src/journal-review',
    'packages/schemas/src/api',
    '复盘事实契约不得依赖旧 number 分析及候选兼容入口',
  ],
  [
    'packages/schemas/src/journal-period-review.ts',
    'packages/schemas/src/api',
    '周期复盘契约不得依赖旧 number 分析合同',
  ],
  [
    'packages/domain/src/journal-analysis',
    'packages/domain/src/behavior',
    '正式复盘不得反向调用旧 number 分析',
  ],
  [
    'packages/domain/src/journal-period-analysis',
    'packages/domain/src/behavior',
    '正式周期复盘不得调用旧 number 分析',
  ],
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
  ['apps/server/src/market/', serverBacktestPrefix, '市场事实与公告准备不得反向依赖回测编排'],
  ['apps/server/src/market/', 'apps/server/src/research/', '市场事实不得反向依赖研究产品编排'],
  ['apps/server/src/ai/', 'apps/server/src/research/', 'AI 执行适配不得反向依赖研究产品编排'],
  ...['market', 'integration', 'providers', 'notifications'].map((feature) => [
    'apps/server/src/research/research-report-comparison.ts',
    `apps/server/src/${feature}/`,
    '冻结报告比较只消费已授权产物，不得请求最新数据或发送通知',
  ]),
  ...[
    'research-observation.store.ts',
    'research-observation-method.ts',
    'research-observation-statistics.ts',
  ].flatMap((file) =>
    ['market', 'ai', 'integration', 'providers', 'notifications'].map((feature) => [
      `apps/server/src/research/${file}`,
      `apps/server/src/${feature}/`,
      '观察存储和确定性计算不得发起模型、来源或账本调用',
    ]),
  ),
  ...['market', 'integration', 'providers', 'ledger', 'notifications', 'platform'].map(
    (feature) => [
      'apps/server/src/ai/research-experiment-driver.ts',
      `apps/server/src/${feature}/`,
      '离线实验驱动只消费固定输入和显式受控适配器，不得读取生产业务或配置',
    ],
  ),
  ...[
    'apps/server/src/ai/ai.module.ts',
    'apps/server/src/ai/ai.controller.ts',
    'apps/server/src/ai/ai-research.executor.ts',
    'apps/server/src/research/',
  ].map((source) => [
    source,
    'apps/server/src/ai/research-experiment-',
    '受控离线实验不得注册到生产研究路径',
  ]),
  [
    'apps/server/src/research/',
    'apps/server/src/integration/',
    '研究产品必须通过 Market 消费数据事实',
  ],
  ['apps/server/src/research/', 'apps/server/src/providers/', '研究准备不得直接配置或测试数据来源'],
  ['apps/server/src/research/', 'apps/server/src/notifications/', '研究准备不得隐式发送通知'],
  [
    serverProvidersPrefix,
    'apps/server/src/ai/',
    'provider storage must not depend on AI orchestration',
  ],
  [
    'apps/server/src/ai/ai-provider-configuration-transaction.ts',
    'apps/server/src/ai/ai-provider.service',
    'AI 配置事务边界不得反向依赖 Provider 应用编排',
  ],
  [
    'apps/server/src/ai/',
    'apps/server/src/strategy-optimization/',
    'AI adapters must not depend on strategy orchestration',
  ],
  [serverLedgerPrefix, serverImportsPrefix, 'ledger must not depend on imports adapter'],
  [
    'apps/server/src/ledger/execution-write-admission.ts',
    'apps/server/src/integration/',
    '成交写入准入只接稳定事实，不直接消费来源适配器',
  ],
  [
    'apps/server/src/ledger/execution-write-admission.ts',
    'apps/server/src/providers/',
    '成交写入准入不得自行读取 Provider 或凭证',
  ],
  ['apps/server/src/risk/', 'apps/server/src/automation/', '风险上下文不得反向依赖扫描编排'],
  ['apps/server/src/risk/', 'apps/server/src/performance/', '风险估值不得依赖收益页面或快照编排'],
  [serverLedgerPrefix, 'apps/server/src/journal/', '交易事实投影不得反向依赖复盘消费与持久化'],
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
    'apps/server/src/strategy-optimization/',
    '回测版本及所属用户契约不得反向依赖优化分组消费层',
  ],
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
  const imports = [...source.matchAll(/(?:from\s+|(?:import|require)\s*\(|import\s*)['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  const file = relative(root, path).replaceAll('\\', '/');
  const isServerSource = file.startsWith('apps/server/src/');
  const isMarketFeature = file.startsWith('apps/server/src/market/');
  if (
    isServerSource &&
    /\b(?:AI_PROVIDER_CONFIGS_JSON|AI_PROVIDER_ID|AI_BASE_URL|AI_API_KEY|AI_MODEL|AI_FIXTURE_ENABLED|aiProviderConfigsJson|aiProviderId|aiBaseUrl|aiApiKey|aiModel|aiFixtureEnabled|createConfiguredAiProviders|parseConfiguredAiProviderInputs)\b/u.test(
      source,
    )
  ) {
    violations.push(`${file} -> 退役的 AI 部署配置入口 (AI Provider 只能消费数据库配置)`);
  }
  const isDsaBoundary = file.startsWith('apps/server/src/integration/dsa/');
  if (
    (isServerSource || file.startsWith('packages/schemas/src/')) &&
    imports.some((specifier) => /daily-stock-analysis|data_provider\//u.test(specifier))
  ) {
    violations.push(`${file} -> 数据源实现 (产品只消费标准能力合同)`);
  }
  if (
    file === 'apps/server/src/market/market-basic-price-fallback.ts' &&
    /\.providerId\s*(?:===|!==|==|!=)\s*['"][^'"]+['"]/u.test(source)
  ) {
    violations.push(`${file} -> 供应商名称备用判断 (应使用标准能力事实与消费者要求)`);
  }
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
    !isMarketFeature &&
    !isDsaBoundary &&
    /\.\s*marketNewsV3\s*\(|\breadDsaNewsFeedV3\s*\(|\.dataCapabilities\s*\.\s*news\s*\(/u.test(
      source,
    )
  ) {
    violations.push(
      `${file} -> DsaClient news (必须通过 MarketNewsReader 或 MarketNewsFeedReader)`,
    );
  }
  if (
    isServerSource &&
    (/\/api\/v2\/thesis-ledger\/market\/bars/u.test(source) ||
      /\b(?:prisma|client)\.marketBarSeries(?:Fact|Coverage)\b/u.test(source))
  ) {
    violations.push(`${file} -> 旧 BarSeries 事实链路 (必须使用现行精确窗口)`);
  }
  for (const specifier of imports) {
    const mobileViolation = mobileBoundaryViolation(file, specifier);
    if (mobileViolation) violations.push(`${file} -> ${specifier} (${mobileViolation})`);
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
      !file.startsWith(serverBacktestTestPrefix) &&
      ![
        'apps/server/src/strategy-authoring/authoring-queue.ts',
        'apps/server/src/strategy-authoring/authoring.worker.ts',
      ].includes(file)
    ) {
      violations.push(`${file} -> ${specifier} (BullMQ 只能由回测或编写队列适配器消费)`);
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
