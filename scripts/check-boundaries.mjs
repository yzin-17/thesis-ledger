import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { boundarySourceFiles } from './boundary-source-inventory.mjs';
import { mobileBoundaryViolation } from './mobile-boundaries.mjs';
import { aiCatalogBoundaryViolation } from './ai-catalog-boundaries.mjs';
import { instrumentDisplayBoundaryViolation } from './instrument-display-boundaries.mjs';
import { browserRequestIdBoundaryViolation } from './browser-request-id-boundaries.mjs';
import { dateInputBoundaryViolation } from './date-input-boundaries.mjs';
import { marketSessionBoundaryViolation } from './market-session-boundaries.mjs';
import { marketWindowConsumerBoundaryViolation } from './market-window-consumer-boundaries.mjs';
import {
  draftCloseSnapshotBoundaryViolation,
  navigationDraftSnapshotBoundaryViolation,
} from './draft-close-boundaries.mjs';
const root = new URL('..', import.meta.url).pathname;
const violations = [];
const serverLedgerPrefix = 'apps/server/src/ledger/';
const serverImportsPrefix = 'apps/server/src/imports/';
const serverProvidersPrefix = 'apps/server/src/providers/';
const serverBacktestPrefix = 'apps/server/src/backtest/';
const serverBacktestTestPrefix = 'apps/server/test/backtest/';
const forbiddenFeatureDependencies = [
  ['apps/desktop/src/features/risk/RiskCenter.tsx', 'apps/desktop/src/features/risk/RiskNotificationProviderPicker', '通知提供方选择归单条规则创建和编辑，通知记录页不得恢复全局配置入口'],
  [
    'apps/server/src/backtest/strategy-version-publication.ts',
    'apps/server/src/strategy-optimization/',
    '正式版本分配属于 Backtest，采纳只能单向消费发布锁',
  ],
  ['apps/desktop/src/components/ui/multi-select.tsx', 'apps/desktop/src/features/', '通用多选组件只接收选项和值，不得依赖业务查询与保存'],
  ['apps/mobile/src/components/MultiSelect.tsx', 'apps/mobile/src/features/', '原生通用多选组件不得反向依赖领域消费者'],
  [
    'packages/schemas/src/optimization-budget',
    'apps/',
    '实验预算边界属于公共合同，不得反向依赖界面实现',
  ],
  [
    'apps/server/src/backtest/backtest-instrument-series.service.ts',
    'apps/server/src/market/',
    '回测标的走势必须只读本次冻结产物，不得重新读取 Market 行情',
  ],
  [
    'apps/server/src/backtest/backtest-instrument-series.service.ts',
    'apps/server/src/integration/',
    '回测标的走势不得调用远程 Provider 适配器',
  ],
  ['packages/schemas/src/rule-source-monitor', 'apps/', '资料快照与差异合同不得依赖应用实现'],
  [
    'apps/desktop/src/features/market-data/RuleSourceVersion',
    'apps/server/',
    '资料版本界面只消费公共合同，不得引用服务端抓取或存储实现',
  ],
  [
    'packages/schemas/src/market-routing',
    'apps/',
    '分级路由公共契约不得依赖应用实现，编译与持久化由 Server Market 持有',
  ],
  [
    'apps/desktop/src/features/market-data/routing-',
    'apps/server/',
    '路由客户端只消费公共契约和预览接口，不得引用服务端编译实现',
  ],
  ...['market', 'integration', 'providers'].map((feature) => [
    'apps/server/src/quality/',
    `apps/server/src/${feature}/`,
    'Quality只拥有通用质量问题记录，不得反向依赖来源协议或行情执行',
  ]),
  [
    'apps/server/src/market/',
    'apps/server/src/automation/',
    'Market拥有监测事实，自动化只能单向读取，禁止反向依赖',
  ],
  [
    'apps/server/src/automation/automation-read',
    'apps/server/src/integration/',
    '自动化读取监测记录必须消费Market边界，不得直连DSA',
  ],
  [
    'apps/server/src/market/',
    'apps/server/src/watchlist/',
    '交易时段与报价时效属于 Market，自选只能单向消费',
  ],
  [
    'apps/desktop/src/components/ui/info-tip.tsx',
    'apps/desktop/src/features/',
    '通用图标说明属于 UI 层，不得依赖业务 feature',
  ],
  [
    'apps/server/src/platform/api-rate-limit',
    'apps/server/src/identity/',
    '平台限流只接收已验证主体投影，不得反向依赖身份业务；组合由根启动入口负责',
  ],
  [
    'apps/server/src/watchlist/',
    'apps/server/src/integration/',
    '自选报价与日历只消费 Market 领域边界，不得直连 DSA 绕过控制和缓存',
  ],
  [
    'apps/server/src/market/',
    'apps/server/src/risk/',
    'Market拥有行情观察事实，必须由Risk单向消费，禁止行情反向编排风险',
  ],
  [
    'apps/server/src/risk/risk-monitoring.service.ts',
    'apps/server/src/integration/',
    '自动监控只消费已取得的数据，不得隐式扩展远程行情调用',
  ],
  [
    'apps/server/src/risk/risk-market-demand.service.ts',
    'apps/server/src/integration/',
    '风险只登记行情需求，来源能力和后台执行属于 Market/DSA',
  ],
  [
    'apps/server/src/risk/strategy-risk-monitoring.service.ts',
    'apps/server/src/market/',
    '策略自动监控通过 Risk 应用执行器取数，后台窗口缓存与来源执行由 Market 维护',
  ],
  [
    'apps/server/src/risk/strategy-risk-monitoring.service.ts',
    'apps/server/src/integration/',
    '策略自动监控不得直连外部适配器绕过行情来源控制',
  ],

  ...[
    'InstrumentSymbolField.tsx',
    'InstrumentMultiSelect.tsx',
    'InstrumentSearchCombobox.tsx',
    'InstrumentOptionField.tsx',
    'instrument-picker.queries.ts',
    'MarketReferenceCodeField.tsx',
    'MarketReferenceContractField.tsx',
  ].flatMap((file) =>
    ['portfolio', 'ai', 'risk', 'account-data', 'strategy', 'watchlist'].map((feature) => [
      `apps/desktop/src/features/market-data/${file}`,
      `apps/desktop/src/features/${feature}/`,
      '公共标的选择属于 Market 目录契约，不得反向依赖业务确认与保存编排',
    ]),
  ),
  [
    'packages/api-client/src/market-reference-contracts.ts',
    'apps/',
    '来源合约投影只消费已关联的资料页，不得依赖运行时业务编排',
  ],
  ...['InstrumentPicker.tsx', 'InstrumentSymbolField.tsx', 'InstrumentOptionField.tsx'].flatMap(
    (file) =>
      ['account-baselines', 'executions', 'recurring-plans', 'research-submit', 'watchlist', 'model-arena'].map(
        (feature) => [
          `apps/mobile/src/features/market/${file}`,
          `apps/mobile/src/features/${feature}/`,
          '移动端公共标的选择不得反向依赖业务消费者',
        ],
      ),
  ),
  ...['ledger', 'portfolio', 'imports'].map((feature) => [
    'apps/server/src/model-arena/',
    `apps/server/src/${feature}/`,
    '比赛专用模拟账不可依赖账户写入模块',
  ]),
  [
    'apps/server/src/market/',
    'apps/server/src/model-arena/',
    'Market 历史观察契约由 Market 拥有，不得反向依赖竞技场执行编排',
  ],
  [
    'apps/desktop/src/features/portfolio/',
    'apps/desktop/src/features/performance/',
    '组合事实与展示不得反向依赖收益分析消费；联合刷新由应用编排拥有',
  ],
  [
    'apps/desktop/src/features/portfolio/',
    'apps/desktop/src/app/',
    '组合特性不得反向依赖统一收益工作区编排',
  ],
  [
    'apps/desktop/src/features/performance/',
    'apps/desktop/src/app/',
    '收益特性不得反向依赖统一收益工作区编排',
  ],
  ...['market', 'ledger', 'research'].map((feature) => [
    `apps/server/src/${feature}/`,
    'apps/server/src/watchlist/',
    '上游领域不得反向依赖自选关注关系',
  ]),
  [
    'apps/server/src/market/',
    'apps/server/src/ledger/trade-',
    '行情来源不得反向读取账本成交投影；交易叠加由Ledger提供并由Portfolio消费',
  ],
  [
    'apps/server/src/ledger/trade-chart-query.service.ts',
    'apps/server/src/market/',
    '成交图表只读投影不得依赖行情来源或价格读取',
  ],
  [
    'apps/server/src/market/market-rule-monitor.controller.ts',
    'apps/server/src/backtest/',
    '收费资料监测仅观察版本，不得编排回测或改写执行冻结',
  ],
  [
    'apps/server/src/market/market-rule-monitor.controller.ts',
    'apps/server/src/providers/',
    '收费资料监测不得改变Provider配置或准入',
  ],
  [
    'apps/desktop/src/features/shared/usePageRefresh.ts',
    'apps/desktop/src/features/',
    '页面刷新只调度查询缓存，不得依赖具体功能编排',
  ],
  [
    'apps/desktop/src/features/shared/usePageRefresh.ts',
    'apps/desktop/src/shared/api/',
    '页面刷新不得绕过查询缓存直接重放 API 请求',
  ],
  [
    'apps/desktop/src/app/DeferredPage.tsx',
    'apps/desktop/src/features/',
    '页面代码加载只承接加载器，不依赖功能编排',
  ],
  [
    'apps/desktop/src/app/DeferredPage.tsx',
    'apps/desktop/src/shared/api/',
    '页面代码加载不得发起业务请求',
  ],
  [
    'apps/desktop/src/app/performance-workspace-tabs.ts',
    'apps/desktop/src/features/',
    '收益 URL 投影保持轻量，不加载功能页面',
  ],
  [
    'apps/desktop/src/app/performance-workspace-tabs.ts',
    'apps/desktop/src/app/PerformanceWorkspace',
    'URL 投影不得反向加载收益页面实现',
  ],
  [
    'apps/desktop/src/features/',
    'apps/desktop/src/app/deferred-pages',
    '功能模块不得反向依赖应用路由加载注册',
  ],
  ['apps/desktop/src/features/', 'apps/desktop/src/app/DeferredPage', '页面加载组合由应用层拥有'],
  ['packages/domain/src/ratio-percent.ts', 'apps/', '比例单位合同不得依赖应用业务编排'],
  [
    'packages/domain/src/ratio-percent.ts',
    'packages/api-client/',
    '比例单位合同不得依赖请求适配层',
  ],
  ...['decimal.ts', 'decimal-number-display.ts', 'risk/threshold-format.ts'].flatMap((file) => [
    [`packages/domain/src/${file}`, 'apps/', '十进制表示与风险阈值展示不得依赖应用编排'],
    [
      `packages/domain/src/${file}`,
      'packages/api-client/',
      '十进制表示与风险阈值展示不得依赖请求适配层',
    ],
  ]),
  [
    'packages/domain/src/valuation-display.ts',
    'apps/',
    '估值展示投影不得依赖应用编排、来源或持久化',
  ],
  [
    'packages/domain/src/valuation-display.ts',
    'packages/api-client/',
    '估值展示投影只消费结果，不得主动发起请求',
  ],
  ...['research', 'providers', 'ledger', 'backtest'].map((feature) => [
    'apps/server/src/ai/adaptive/',
    `apps/server/src/${feature}/`,
    'AI 自适应策略只消费固定请求与执行预算，不得反向读取业务编排或 Provider 配置',
  ]),
  [
    'apps/server/src/ai/adaptive/',
    'apps/server/src/platform/prisma',
    'AI 自适应缓存不得操作业务数据库或自行扩大请求授权',
  ],
  [
    'apps/server/src/ai/adaptive/',
    'apps/server/src/ai/provider-registry',
    'AI 自适应策略不得自行重新选择Provider或模型',
  ],
  [
    'apps/server/src/ai/adaptive/',
    'apps/server/src/ai/ai-execution-state.store',
    'AI 自适应策略不得直接改写业务执行账本',
  ],
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
  ...['market', 'backtest', 'strategy-optimization'].map((feature) => [
    'apps/server/src/integration/dsa/dsa-client-errors.ts',
    `apps/server/src/${feature}/`,
    'DSA 来源错误分类只属于协议适配层，不得反向依赖消费领域',
  ]),
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
    'packages/schemas/src/backtest-price-research',
    'packages/schemas/src/strategy-authoring',
    '价格研究合同与投影由回测领域拥有，不得反向依赖编写流程',
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
  [
    'apps/server/src/market/',
    'apps/server/src/performance/',
    '行情事实与回退诊断不得反向依赖收益计算或图表消费',
  ],
  [
    'apps/server/src/market/fund-',
    'apps/server/src/ledger/',
    '基金公共估算不得依赖个人账本或持仓编排',
  ],
  [
    'apps/server/src/market/market-fund-valuation',
    'apps/server/src/ledger/',
    '基金估值查询和采样不得依赖个人账本编排',
  ],
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
  ...['market', 'integration', 'providers', 'ledger', 'notifications', 'platform'].flatMap(
    (feature) =>
      [
        'research-experiment-driver.ts',
        'research-live-experiment-driver.ts',
        'research-live-experiment-protocol.ts',
        'research-live-experiment-evaluation.ts',
        'research-live-experiment-arm.ts',
        'research-live-experiment-resume.ts',
        'research-live-experiment-continuation.ts',
        'research-live-experiment-terminal.ts',
        'research-live-experiment-supplemental.ts',
        'research-live-experiment-failure-policy.ts',
        'research-live-experiment-budget.ts',
      ].map((file) => [
        `apps/server/src/ai/${file}`,
        `apps/server/src/${feature}/`,
        '隔离实验只消费固定输入和显式适配器，不得读取生产业务或配置',
      ]),
  ),
  ...[
    'apps/server/src/ai/ai.module.ts',
    'apps/server/src/ai/ai.controller.ts',
    'apps/server/src/ai/ai-research.executor.ts',
    'apps/server/src/research/',
  ].flatMap((source) =>
    ['research-experiment-', 'research-live-experiment-'].map((prefix) => [
      source,
      'apps/server/src/ai/' + prefix,
      '隔离实验不得注册到生产研究路径',
    ]),
  ),
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
    serverLedgerPrefix,
    'apps/server/src/performance/',
    '账本盈亏事实不得反向依赖历史收益消费与图表编排',
  ],
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
    '回测版本、研究价格冻结与执行规则及所属用户契约不得反向依赖优化消费层',
  ],
  ...['integration/', 'ai/'].map((target) => [
    'apps/server/src/strategy-optimization/optimization-model-resolution.ts',
    `apps/server/src/${target}`,
    '实验执行设置解析只复用本地策略与研究规则，不直接请求行情或调用模型',
  ]),
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

async function inspect(path) {
  const source = await readFile(path, 'utf8');
  const imports = [
    ...source.matchAll(/(?:from\s+|(?:import|require)\s*\(|import\s*)['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);
  const file = relative(root, path).replaceAll('\\', '/');
  const isServerSource = file.startsWith('apps/server/src/');
  if (
    file.startsWith('apps/mobile/src/features/research-read/') &&
    /\bresearchRuns\s*\.\s*tools\s*\(/u.test(source)
  ) {
    violations.push(`${file} -> 旧工具审计入口 (研究报告必须携带正文 locator 读取审计)`);
  }
  for (const check of [
    aiCatalogBoundaryViolation,
    instrumentDisplayBoundaryViolation,
    dateInputBoundaryViolation,
    marketSessionBoundaryViolation,
    marketWindowConsumerBoundaryViolation,
    browserRequestIdBoundaryViolation,
    draftCloseSnapshotBoundaryViolation,
    navigationDraftSnapshotBoundaryViolation,
  ]) {
    const violation = check(file, source);
    if (violation) violations.push(`${file} -> ${violation}`);
  }
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
    /\breadMarketReference\s*\(/u.test(source)
  ) {
    violations.push(`${file} -> DSA 市场资料（必须通过 market 领域）`);
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
  if (file.startsWith('packages/domain/src/') && imports.some((specifier) => specifier === '@thesis-ledger/schemas' || specifier.startsWith('@thesis-ledger/schemas/'))) {
    violations.push(`${file} -> Schemas (领域纯模型不得反向依赖校验适配层，类型引用同样适用)`);
  }
  if (file === 'apps/server/src/market/market-arena-replay-reader.ts' && /\b(?:getQuote|readChartV3)\s*\(/u.test(source)) {
    violations.push(`${file} -> 当前报价或交互图表 (历史回放必须消费已发布的冻结证据)`);
  }
  if (['apps/server/src/market/market-arena-replay-reader.ts', 'apps/server/src/market/market-arena-history-source.ts'].includes(file) && /\barenaHistoryCatalog\s*\(/u.test(source)) {
    violations.push(`${file} -> 历史证券全集 (自主研究按选中证券读取资料)`);
  }
  if (file.startsWith('apps/desktop/src/') && /['"]tickflow-free['"]/u.test(source)) {
    violations.push(`${file} -> TickFlow 分档来源身份 (须消费统一来源的逐功能权限)`);
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
        'apps/server/src/model-arena/arena-queue.ts',
        'apps/server/src/strategy-authoring/authoring-queue.ts',
        'apps/server/src/strategy-authoring/authoring.worker.ts',
      ].includes(file)
    ) {
      violations.push(`${file} -> ${specifier} (BullMQ 只能由回测、编写或竞技场队列适配器消费)`);
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

for (const path of await boundarySourceFiles(root)) await inspect(path);
if (violations.length > 0) {
  console.error(`发现跨层非法导入:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Import boundaries: OK');
}
