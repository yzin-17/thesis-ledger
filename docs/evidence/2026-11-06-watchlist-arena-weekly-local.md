# 自选、多模型模拟交易与周报本地验证

核查时间为 2026-11-05 至 2026-11-06。工作树为 Thesis Ledger 主仓与相邻 DSA。目标应用的升级结果另见[本机开发环境验收](2026-11-06-watchlist-arena-target.md)。以下分别记录本地浏览器、真实隔离基础设施、受控模型及行情样本能够证明的行为。

## 从页面到结果

| 入口 | 本轮交付 | 本地证据 |
| --- | --- | --- |
| Desktop 自选、Mobile 市场 → 自选 | 登录身份独立的关注名单、分组、置顶、排序、只读行情及持仓提示 | 两个身份并发维护、旧修订冲突、关闭 Nest 进程后重读、删除后再次重启；无账户可保存。报价失败后仍能移除。 |
| 两端标的详情 | 标的新闻、按完整代码和发布日期过滤的公告、已有研究报告和预填研究对象 | 移动选择器区分浏览、自选、研究与持仓录入。DSA 验证日期和代码先过滤再分页。 |
| Desktop 策略中心、Mobile 研究 → 策略 → 模型竞技场 | 选择目录或复制自选分组建赛、绑定多个模型、保存草稿、启动、暂停、查询排名及逐轮证据 | 草稿默认真实费用额度为零，保存只创建比赛。分组跨页修订改变时整组导入失败。市场日历驱动独立队列。 |
| 标的日线 → 模型模拟买卖点 | 选择比赛、模型和交易日，查看每一笔模拟成交及对应轮次 | API 校验所属比赛、参赛者和完整标的；观望模型没有成交。移动图表同日多点回传交易日，移除叠加后停止回传。 |
| Desktop 投资复盘、Mobile 研究 → 复盘 → 模型周报 | 按比赛、周次和修订查看净值、收益、回撤、换手、费用、贡献、分歧及 5／20 日观察 | 使用真实隔离队列自动发布跨周样本。相同输入重算沿用原发布版本，受控更正发布第二版，原版可重读。 |

## 可复算的样本

- 单方额度不足、全场额度不足或定价未知时，整轮新增模型请求、预留及指令均为零。并发恰好足额只开一轮，数据库拒绝中途写入后可安全重试。
- 模型研究路径读取同一指纹下的标的日线、可用新闻和报告，以及各自的账户快照。隔离样本中的及时新闻进入输入，迟到资讯排除。受控模型分别调仓和观望；按指定开盘价 12 元买入 41 股，现金从 1,000 元变为 508 元。成交事务中断后，重试复用同一份开盘事实。模型已派发时暂停，迟到回执仅更新审计与额度，原指令没有生成成交。
- 跨周样本中，周五决策的 20 股在周一以 10 元成交，交易费 1 元。周一收盘价 12 元，现金 799 元，净值 1,039 元。证券贡献 40 元，扣费后净增 39 元，未归属差额为零。等权基准期末为 1,197 元。两次计划轮次中一次因额度不足未开，另一次仅有一名模型决策有效，对应比赛开轮率 1/2、模型覆盖率 1/1 与 0/1。
- 本轮使用受控输入验收开盘交易。正式运行中当前仅境内股票有开盘执行取证路径；实际开盘价、交易规则、停牌、价格限制、结算或公司行动资料不合格时保留原因。模型费用与模拟交易费用分列，按配置定价估算的金额单列口径。

## 可复跑的检查

从主仓运行隔离基础设施测试。该脚本准备临时 PostgreSQL 和 Redis，执行后清理本次容器。

```sh
ARENA_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs \
  test/model-arena/admission-postgres.integration.test.ts \
  test/model-arena/schedule-queue.integration.test.ts \
  test/model-arena/decisions-postgres.integration.test.ts \
  test/model-arena/cross-week-postgres.integration.test.ts \
  test/watchlist/storage-postgres.integration.test.ts \
  test/watchlist/http-postgres.integration.test.ts
```

- 隔离运行通过六个文件、十一个用例。迁移和运行时打包输入检查通过，结构 head 为 `20261105080000_arena_weekly_reviews`，共 45 份 migration SQL、97 张表。
- 主仓使用项目指定的 Node 24 运行客户端与服务端测试。Server 3,859 例通过、381 例按环境跳过；Desktop 1,282 例通过；Mobile 171 例通过。移动测试在并行运行时有一次既有编写审核交互未等到按钮，串行全包通过。Schemas 1,465 例通过、3 例跳过，Domain 474 例通过，API Client 204 例通过。定向用例包括 `test/model-arena/open-execution.test.ts`、`performance.test.ts`、`week-rules.test.ts`、API Client 的 `arena-setup.test.ts` 以及 Mobile 的 `arena-entry.test.tsx` 和 `f06-updates.test.ts`。DSA 的公告服务及路由测试七例通过。
- Desktop 生产构建通过。在独立临时浏览器配置下用本地 Edge 加载自选、比赛列表、建赛表单和模型周报四个入口。页面读取使用隔离接口响应，未产生写请求。Android、iOS 的 Expo JavaScript 包均已成功导出。
- 模块依赖边界和工作区依赖检查通过。全仓 lint 在既有 `scripts/build-research-stage-benchmark.ts` 的未使用参数 `_facts` 处退出。该脚本未纳入本次改动。

## 同一场比赛的跨页联验

从主仓执行以下命令。默认运行真实 Nest HTTP、PostgreSQL 和 Redis。浏览器模式另需先构建 Desktop，并提供本机可执行的 Chromium 内核浏览器与可通过 Node 解析的 Playwright。该模式加载 Desktop 生产构建，使用同一份临时库和已登录测试身份。

```sh
ARENA_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs \
  test/model-arena/watchlist-journey.integration.test.mjs

pnpm --filter @thesis-ledger/desktop build
# 若 Playwright 来自独立运行时，通过 NODE_PATH 指向其 node_modules。
ARENA_WITH_REDIS=1 ARENA_BROWSER_EXECUTABLE="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  node scripts/test-journal-review-postgres.mjs test/model-arena/watchlist-journey.integration.test.mjs
```

- Node 24.22.1、pnpm 11.9.0。注册两个没有投资账户的隔离用户，从甲的自选分组复制完整标的身份，通过公共客户端保存和启动比赛，乙读取甲的分组与周报均返回 404。相同所有者也不能使用另一场比赛定位这次成交或周报。
- 每个模型额度为 1 次、17,500 令牌，全场为 2 次、35,000 令牌，模型单价设为零。对照场只减少一方的 1 个令牌，后台收盘后留下未开轮原因，预留为零。足额场两名受控模型各调用一次，引用同一条新闻，下一次开盘一方以 10 元买入 50 股，另一方空仓观望。重复调度及预算用完后的交易日没有新增调用。
- 周报 Worker 在独立进程中通过 Redis 领取任务并算出报告，父进程在发布事务前发出 SIGKILL。此时数据库记录仍是首次领取，发布记录为零。受控时钟推进至租约到期后，另一 Worker 第二次领取并成功发布。重放旧 attempt 后，该场该周仍仅有第 1 版。前次跨周样本另覆盖相同输入重算、数据更正发布第二版及原版回读。
- Edge 从自选进入同一标的，依次读到同一条新闻、空窗口与来源失败，查看公告和研究摘要，再从日线的模拟成交进入对应模型，返回后保留标的与分组。策略竞技场和投资复盘两个入口均读到该场同一周报；点成交只展示买入模型，点观望只展示观望模型，二者均能追到原新闻并返回原修订。新闻源、日线、公告与研究摘要使用受控材料。身份、自选、模拟点位、轮次与周报使用真实 HTTP 和隔离库。
- 两端周报的参赛模型可以直接打开对应的决策；移动端成交也传递参赛者身份。Mobile 增加研究导航首屏回归后，定向交互 4 例通过，全包 173 例通过；Desktop 全包 1,282 例、生产构建及 Mobile 类型检查通过。模块边界、工作区依赖和本轮页面及联验文件的格式检查通过。每次隔离运行退出后维护脚本均清理本次容器。

## 待取得的运行证据

目标运行态的升级及页面检查单独记录。目标 Worker 故障恢复、真实模型和费用、真实开盘及完整自然比赛周分别留在三个 Task 的运行门禁。当前没有真实模型调用、付费记录或用户投资账本交易。可复算样本仅作为本地验证。
