# 标的名称统一读取实施与验收证据

## 实施基线

2026-11-04，主工作区存在 553 项修改、53 项删除和 969 项未跟踪条目；本任务保留这些已有内容，不重置、暂存或提交。数据库只读核查：`000001.OF` 与 `161725.OF` 的 Asset 名称是代码，Instrument 目录已有中文名称；前者存在两条持仓、四条 Trade、两条风险规则、两条定投计划。这些仅是读取样本，不授权改写业务记录。

## 工具选型

项目已安装 es-toolkit 1.51.0，已核对实际 `keyBy` 声明和官方文档。公共服务采用 `import { keyBy } from 'es-toolkit'` 为已消歧目录项建立代码索引；它返回新对象，不修改输入，同键取最后一项。消歧仍由目录服务负责。参考：[官方文档](https://es-toolkit.dev/reference/array/keyBy.html)。本机默认 Volta 的 Node 24 解析失败；验证通过显式选择已有 Node 26.13.0，不修改项目依赖或锁文件。

## 当前验证

T1 公共服务与既有目录解析 8 项通过；T2 公共服务/Trade 8 项通过；T3 风险 19 项通过；T4 研究查询 7 项通过；T5 定投 5 项通过；T6 移动端 3 项通过。各叶使用包内 `pnpm exec vitest run` 指定对应测试文件。覆盖名称不一致、完整市场、重复代码、故障降级、只读输入、Trade 引用和事务投影、风险旧名遮蔽、研究展示版本与冻结结果、当前计划及冻结实例、移动端分页与无新增目录查询。

首次 T2 验证发现测试夹具返回位置错误，修正后通过；首次 T3 发现装饰器导入缺失，修正后通过。Server 首次 typecheck 发现新增研究测试缺少空值收窄，已修正，待集成复验。

## 静态集成验证

- Server 包级 `pnpm test`：464 文件通过、74 文件跳过；3728 项通过、364 项跳过。跳过的 PostgreSQL/Provider 等条件测试不作为通过。
- Mobile 包级 `pnpm test`：41 文件、158 项通过。Desktop 相关持仓、交易、账户数据、复盘候选 4 文件、40 项通过。
- Server/Mobile `pnpm typecheck` 与三个应用 `pnpm build` 均通过；Desktop build 包含类型检查。
- `node --test scripts/instrument-display-boundaries.test.mjs` 3 项通过；`node scripts/check-boundaries.mjs` 与 `node scripts/check-workspace-dependencies.mjs` 通过。
- 任务涉及的 TypeScript 文件 ESLint 通过。`node scripts/lint-workspace.mjs --guardrails` 通过，原有复杂度警告保留，React Native Flow 依赖解析诊断未被当作任务源码错误。首次发现新增测试夹具未使用参数，修正后整体复验通过。
- `node scripts/check-file-size-guardrails.mjs` 返回通过但未提供远端基线，仅作为库存检查；独立核对本任务修改前快照：Portfolio 477→481、Trade 563→572、风险上下文 533→521、研究查询 419→417、定投 331→341 行；新增服务 49 行，无新增超阈值文件。
- 现有页面两条持仓均为 `000001.OF`，并非两个不同基金；页面验收复用两条原始持仓，另一 `161725.OF` 使用只读目录解析验证，不制造业务样本。

## 目标同步与真实 API

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，显式选择已有 Node 26.13.0，npm/Corepack 均使用项目要求的 npmmirror；兼容性预检通过，退出码 0。目标 Server 与 backtest-worker 健康，二者镜像 ID 均保持 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`。这是容器可写层代码同步，不是镜像构建或正式发布。

独立通过实际 API 验证：

- `GET /api/v1/portfolio/positions?mode=actual`：原两条 `000001.OF` 均返回“华夏成长混合”，数量仍为 90、精确成本字符串仍为 `1.222222222222222222`。
- `GET /api/v1/portfolio/trades?mode=actual&symbol=000001.OF` 与对应详情：当前实际范围两条交易和详情名称正确。数据库的四条记录计数包含其他范围，不将两者混同。
- `GET /api/v1/risk/rules?includeArchived=true`：两条已归档目标规则的当前展示名正确，规则状态未恢复。
- `GET /api/v1/fund-investment-plans`：两条当前计划响应名称正确，数据库原计划名称不回填。
- 在目标容器对实际编译后的公共服务执行只读目录解析：`000001.OF` 为“华夏成长混合”、`161725.OF` 为“招商中证白酒指数(LOF)A”、`000001.SZ` 为“平安银行”，验证同裸代码不同市场。

## 真实页面验收

使用本机 Microsoft Edge 的隔离无头浏览器上下文，不修改用户浏览器配置。Desktop 访问已有 Vite `http://localhost:5173`，连接更新后的实际目标 API；Mobile 使用当前源码的 Expo Web 和本地只读同源转发 `http://127.0.0.1:8088`，API 仍为目标 Server。转发器拒绝业务写方法，未改 Server CORS 配置。Mobile 为 Web 渲染的实际 React Native 组件，未将其描述为 Android/iOS 安装版或 Native 编译证据；本次无原生依赖和工程配置修改。

| 页面 | 结果 |
| --- | --- |
| Desktop 当前持仓 | 两行均显示“华夏成长混合”和原代码 |
| Desktop 交易列表、交易详情 | 目录名称显示正确 |
| Desktop 风险规则 | 展开已归档分组后名称正确；仅切换展示，没有恢复或测试规则 |
| Desktop 账户数据的成交记录页内基金定投 | 当前计划显示目录名称 |
| Mobile 组合卡片 | 显示名称和代码；本次补齐原来只渲染代码的卡片并新增回归 |
| Mobile 成交记录、账本审计 | 消费主响应目录，名称与代码显示正确 |
| Mobile 复盘候选 | 使用当前页目录显示名称 |

Desktop 五个页面和 Mobile 四个页面均保存截图，检查过 Desktop 持仓与 Mobile 成交截图；浏览器报告无业务写请求、无页面异常，Mobile 无独立目录查询。查询失败或缓存丢失的单元场景由定向回归覆盖，未改目标目录来制造样本。

浏览器实施中修正了验收脚本的目标交易选择、带计数按钮名称和定投所在的成交记录页定位；这些是脚本定位问题。Mobile 首次启动采用 CI 模式而不监听后续源码，确认旧 bundle 后重启本轮自己启动的 Metro，并在最终源码上通过全部页面检查。

截图与结构化报告位于：

`/Users/yzin/.codex/visualizations/2026/11/04/01a1a528-98ca-7b12-98e8-3a004d9f64fc/instrument-display/`

其中 `desktop-report.json`、`mobile-report.json` 保存实际页面、名称断言与请求分类；截图分别为 `desktop-portfolio.png`、`desktop-trades.png`、`desktop-trade-detail.png`、`desktop-risk.png`、`desktop-fund-plans.png`、`mobile-portfolio.png`、`mobile-executions.png`、`mobile-audit.png`、`mobile-journal.png`。验收临时开发服务在完成后停止，已有 Desktop 服务保持。

## 数据保护与最终核对

同步前后对以下整表以确定顺序汇总行 JSON 并比较摘要，行数及摘要全部一致：Asset 4、LedgerEvent 138、Trade 20、JournalReviewSnapshot 4、RecurringFundInvestmentOccurrence 2、NotificationDelivery 2、AiRun 26。已有资产名称仍保留代码；页面名称变化来自返回投影。未执行模型生成、通知投递、交易命令或数据回填。

任务文件范围 `git diff --check` 通过；公共服务依赖、当前名称读取模式、历史冻结接缝、客户端分页消费及新项目规范已逐段核对。来源基线为主工作区 `da002744` 上的既有未提交状态与本任务增量，不能当作干净提交或完整生产发布。未暂存、提交、推送。
