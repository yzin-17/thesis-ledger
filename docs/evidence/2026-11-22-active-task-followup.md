# 活动任务收尾核对

## 运行态基线

2026-11-22 复用已有正式更新。11 月 14 日，infra 目录执行带备份的 `./scripts/update.sh all`，退出 0。独立恢复演练、目标迁移和权限核验覆盖了周期快照表，回执在 [升级记录](2026-11-14-arena-us-execution-evidence.md#引擎恢复后的最终核对)。11 月 22 日同一目录的 `./scripts/sync-code.sh thesis-ledger` 退出 0，见 [快更记录](2026-11-20-backtest-practical-implementation.md#2026-11-22-ac03-目标同步验收)。本轮未再次执行部署。

宿主、目标 Server 和 Worker 中八份 JavaScript 产物逐项比对 SHA-256 一致。覆盖复盘 Controller 和周期快照、研究列表和到期调度、风险监控和后台报价需求、自选报价、收益趋势。目标库用只读事务确认结构 head 为 `20261114010000_journal_period_review_snapshots`，有 5 份单笔快照和 1 份周期快照。迁移矩阵通过，覆盖 53 项迁移、107 张表。目标业务库写入、模型请求及新增上游行情请求均为 0。

## 周期复盘与历史标的

宿主启动 Desktop 的 Vite 页面，以 Chromium 加载实际组件，代理到目标 Server。放行已核对的业务读取，请求写入、实时估值、外部行情及生成接口均未出站。在 1440、1024、768、390 像素下，周期初始的解读和保存按钮均禁用，周期历史列表和详情均返回 200，现有冻结样本的两组统计显示完整，详情可关闭。同一账户的历史单笔快照列表有两条「名称 · 代码」，可读回冻结详情和关联解读。四宽度下均无页面横向溢出。

四宽度下还通过真实入口打开单笔复盘、运行确定性统计、关闭抽屉并运行周期分析。两个 `POST /api/v1/journal/analysis` 子路径均返回 201，应用源码对应分支只查询事实并计算，没有持久化。复盘快照写入及 AI 请求由浏览器拦截。零样本、部分缺失、旧版格式与比较分支沿用[原定向验证](2026-11-14-research-journal-reading.md)。

- Server 与 Desktop `pnpm run typecheck` 均退出 0，Desktop `pnpm exec vite build` 退出 0，保留已有大分块提示。
- Server 周期／单笔快照定向用例 11 项通过。Desktop 周期、AI 结果及历史快照组件共 17 项通过，覆盖保存、异步状态、账户隔离及回读。另有收益走势组件 8 项通过。
- 通过 `node scripts/test-journal-review-postgres.mjs` 在唯一临时 PostgreSQL 上应用全部 53 项迁移。V5 解读持久化用例 1 项、单笔快照真实数据库用例 4 项均通过，隔离资源正常清理。混跑的旧优化用例失败独立记录，V5 实际模型回执继续沿用原任务。

## 研究列表与到期样本

使用模拟账户模式的真实研究列表。四宽度下均显示 20 条记录，其中 9 条能由本地目录解析名称并保留代码。分别打开真实报告抽屉与完整阅读页，实际列表、详情均 HTTP 200，读取过程中无页面横向溢出。账户使用范围由正常应用入口控制。

真实到期门禁已定位到首个有适用价格论点的成功研究，创建于 11 月 13 日 22:55（北京时间）。其五交易日窗口冻结为 11 月 16 日至 11 月 23 日，结束时刻为 **11 月 23 日 15:00**。数据库已有后台登记的 `not_due` 观察，抽屉「查看复核状态」读到同一事实。仍需等实际到期后核对自动落盘的版本和对应页面。

## 收益走势、风险、自选和竞技场

- 收益走势在实际组件固定输入页通过 1440、1024、768、390 四宽。近一年失败时分线和时线禁用，切换一日后分线可选，读取失败后可重新加载。目标 `GET /api/v1/performance/series` 只读取已记录估值点。实际模式一日分钟返回 200、0 点、`UNAVAILABLE`，五日小时返回 200、15 点、`LOW_COVERAGE`。一年分钟和模拟五日小时均返回 400 `UNSUPPORTED_SERIES_INTERVAL`。
- 风险中心实际页面在 1440、390 宽度通过总览、规则和策略应用切换，目标风险状态、规则、事件均返回 200。数据库有 9 条规则、2 条当前生效候选、独立的 `risk-evaluation` 排程 0 条。DSA 后台报价请求模块、收费按需刷新以及美国费用检查模块三份文件与宿主摘要一致。日线策略自动监控已经 [单独结案](../archive/tasks/2026-11-13-strategy-risk-automatic-monitoring.md)。其他报价来源的后台读取资格和正式净值采集仍按对应任务保留。
- 自选与竞技场列表在 1440、390 宽度从真实目标接口读取，各自返回 200 且无页面横向溢出。自选报价与行情请求保留在受控或既有证据边界内。真实开市成交、回放转实时和需要真实生成的 Arena 准入尚未验收。

## 工程与外部条件

- 11 月 19 日通过正式 `DEV_DATABASE_MODE=check ./scripts/update.sh thesis-ledger` 构建并运行浮动安装 pnpm 12.21.0 的 Server 镜像，退出 0。原报告保留首次生产依赖裁剪遇到未使用移动补丁及收敛结果，当前两容器都使用该镜像。 [正式镜像回执](2026-11-19-strategy-authoring-order-validity-target.md#镜像更新与打包修复)
- 主仓和 infra 各有真实 CI 运行记录。主仓四个已执行任务的 pnpm 安装和冻结依赖安装成功，`quality` 在 Lint 步骤耗尽 JavaScript 堆，隔离数据库任务在旧夹具处失败。infra 的 pnpm 安装成功，镜像复用测试因依赖同级应用源码而退出 127。 [主仓 CI](https://github.com/yzin-17/thesis-ledger/actions/runs/43714021772) · [infra CI](https://github.com/yzin-17/thesis-ledger-infra/actions/runs/43713982851)
- infra 编排夹具现在通过受控应用接口验证镜像形态传递及拒绝传播。缺同级应用的临时检出从 2 失败、5 通过变为 8 通过。infra 完整测试 97 通过、1 跳过，`pnpm check` 通过。真实应用入口独立用原形态成功、目录／用户／命令三个反例拒绝，4 项通过。
- 主仓以现行 V3 正式策略、已完成交易日历、冻结检查及真实数据库约束校正优化夹具。恢复用例等待自动封存完成，验证存储结果、显式确认测试暴露和采纳幂等。原版隔离复现为 4 项失败，最终两份优化集成文件 5 项通过，自动化持久执行另有 6 项通过。现行 Server 构建、相关测试 ESLint、仓库边界及 workspace 依赖门禁通过。修复只改本地测试。
- 真实开发库已到现有迁移链 head，B4 显式不备份升级等待下一次符合范围且已授权的迁移。已有带备份的执行回执保留其原口径。
- 旧实验原地址的有界 TCP 连接通过。该次检查限于连通性。后续从目标正式回执确认原实验已自动完成并结案。 [终态验收](2026-11-12-experiment-retry-catalog-revalidation.md#2026-11-22-真实终态只读验收)
- DSA 美股四批原采样已找到报告，完成 D6 对账。24 次中 18 成功、6 失败。原计划时点和市场覆盖缺口照原记录保留。Tushare 权限、官方收费覆盖基线和公开搜索的实源门禁仍由各自任务持有。 [原采样](2026-11-11-us-intraday-observation.md)

## 实际写集

- ThesisLedger 修改 `apps/server/test/strategy-optimization/` 内的 `strategy-optimization-market-fixture.ts`、`strategy-optimization-postgres-context.fixture.ts`、`strategy-optimization-postgres-fixtures.ts` 及两个优化 PostgreSQL 入口测试。通过既有 `scripts/test-journal-review-postgres.mjs` 对最终输入验收，退出 0。更新相关 Task、证据和归档导航。
- infra 修改 `scripts/fixtures/node-runtime.mjs`、`scripts/reuse-thesis-ledger-image.test.mjs` 及维护规格的编排验收边界。
- DSA 更新盘中采样 D6 和官方收费按需刷新 R05 的 Task 证据。保留原上游回执。

## 主仓 CI Lint 堆内存复验

[原 CI 的 quality 日志](https://github.com/yzin-17/thesis-ledger/actions/runs/43714021772/job/132811551830)显示，ESLint 进入 `apps/server` 单组 1,710 个文件后，压缩回收仍保留约 4,067 MB 堆，最终 `SIGABRT`。每个工作区原有一个 ESLint 子进程，Server 实现和测试在同一进程内累积类型与导入依赖分析数据。使用宿主 Node 24.22.2、同一 ESLint 配置和 4 GiB 旧生代上限，现有 1,892 个 Server 文件的单组重现堆耗尽。

先试验 Server 分组。随后首次运行正式 Lint 时，本机 pnpm 启动 Node 26，当前 Desktop 单组 1,204 个文件也耗尽堆。再以 CI 同主版本的 Node 24 直接重现 Desktop 单组失败。两个工作区的实现与测试分别运行，原规则均能在对应上限内完成。

| Node 24 定向对照 | 单组 | 实现组 | 测试组 |
| --- | --- | --- | --- |
| Server | 1,892 文件，堆耗尽 | 958 文件通过，RSS 峰值 3.62 GiB | 932 文件通过，RSS 峰值 2.90 GiB |
| Desktop | 1,204 文件，堆耗尽 | 845 文件通过，RSS 峰值 3.37 GiB | 359 文件通过，RSS 峰值 3.02 GiB |

其余 2 个 Server 文件在原包级组通过。仅修改 `scripts/lint-workspace.mjs` 的分组，复用现有串行子进程。两类命令的精确文件清单分别是 4,321 和 4,312 项，逐路径与原清单一致，每个文件出现一次。原清单测试 6 项、脚本语法和跨组循环依赖反例均通过。

- 从主仓使用 `volta run --node 24.22.2 pnpm lint`，设置 `CI=true`、`NODE_OPTIONS=--max-old-space-size=4096` 及工作区 npm 镜像。退出 0，构建、导入边界、8 包依赖图均通过，ESLint 为 12 组、4,321 文件、零错误和零告警，耗时 133.7 秒。
- 使用同一运行条件执行 `volta run --node 24.22.2 pnpm guardrails:complexity`，另指定 `GUARDRAIL_BASE_REF=HEAD`，实际基线为 `1ed418780d1970e8380955453667edc2fed4b126`。退出 0，11 组、4,312 文件、零错误、102 条复杂度类告警，文件尺寸无告警，耗时 91.2 秒。

4 GiB 是复现与验收条件。正式脚本继续消费调用环境的 Node 配置。原失败及本地对照日志保存在本次私有临时目录内，最终回执为 `lint-node24-final.log` 和 `guardrails-complexity-node24-final.log`。本轮无模型请求、真实数据写入、部署、提交或推送。后续综合 CI 与结案见[归档任务](../archive/tasks/2026-11-14-unpinned-pnpm.md)。
