# 实验采纳一致性修复验证

日期：2026-11-12。范围：[当前合同](../../specs/2026-11-12-experiment-adoption-consistency.md)，[归档任务](../tasks/2026-11-12-experiment-adoption-consistency.md)。

后续维护：本记录当时遗留的 12 项 lint 错误已修复，完整门禁现已通过，详见[既有错误修复验证](2026-11-12-existing-lint-errors.md)。下文保留采纳修复验收时的历史结果。

## 修复结果

- F1：顶部使用本实验已采纳候选关联的最高正式版本。本地回执、刷新及候选乱序均遵循同一规则，同策略无关的手工高版本不会改变实验产物入口。
- F2：Backtest 拥有策略级事务锁，手工发布及采纳共同使用。手工先提交时采纳返回 `ADOPTION_STALE_BASELINE`；采纳先提交时手工发布下一个版本。版本唯一键、来源及幂等约束保留，没有迁移。
- 提交后读取：响应保留正式版本身份和实验／候选／执行哈希凭据。上下文、监控计划或风险应用差异不可读时返回 `detailsStatus: unavailable`，不制造空风险列表或误报采纳失败。
- 响应中断：共享 SDK 自动只读查询一次采纳事实，严格核对来源与执行哈希；不自动重复 POST。未知结果保留原请求体和幂等键。两端均将已确认保存与待确认分开表达，Mobile 本地清理失败也不会推翻已提交结果。

## 分层验证

| 范围 | 命令及输入 | 结果 |
| --- | --- | --- |
| Schema | `pnpm --filter @thesis-ledger/schemas test` | 145 文件、1583 项通过 |
| API Client | `pnpm --filter @thesis-ledger/api-client test` | 49 文件、268 项通过，包含 8 项新恢复验证 |
| Server 单元 | 采纳、读取、风险计划、预览、Backtest 服务的 5 个定向文件 | 34 项通过 |
| 隔离 PostgreSQL | `ADOPTION_CONSISTENCY_POSTGRES=1 COMPLETED_ADOPTION_POSTGRES=1 pnpm --filter @thesis-ledger/server test test/strategy-optimization/adoption-consistency.postgres.integration.test.ts test/strategy-optimization/completed-adoption.postgres.integration.test.ts` | 2 文件、11 项通过 |
| Desktop | 实验详情及相关投影的 3 个定向文件 | 18 项通过 |
| Mobile | `pnpm --filter @thesis-ledger/mobile test test/optimization-adoption-recovery.ui.test.tsx` | 真实 SDK、屏幕组件和受控响应，4 项通过 |
| 构建 | Schema、API Client、Server、Desktop、Mobile 各包 `build` | 通过 |
| 工程检查 | 本次写集定向 ESLint、`check-boundaries.mjs`、`check-workspace-dependencies.mjs`、`check-file-size-guardrails.mjs` | 通过；尺寸检查保留 5 条存量告警 |
| 全仓复杂度 | `pnpm guardrails:complexity` | 失败：12 个错误、195 条告警；不宣称全仓门禁通过 |

隔离 PostgreSQL 通过项目既有 harness 创建并自动清理，显式连接临时数据库，没有使用真实默认连接。并发验证用持锁及释放门控制执行顺序，覆盖手工先发布、采纳先发布、两个手工并发及重复采纳。三种附加读取故障分别验证核心回执、同键重放、恢复后只读查询及实验反向关联；AiRun 为零。

Mobile 未变更原生依赖或构建配置，本轮没有原生设备验收；组件测试不作为原生验收证明。

## 浏览器受控验证

使用本地 Vite 页面、Edge 和真实只读 GET。采纳 POST 全部在浏览器拦截，不转发至服务端。脚本：`/tmp/verify-adoption-consistency.cjs`；结果和截图：`/tmp/adoption-consistency-qa/`。

- 1440、1024、768、390 宽度：候选反序、v1／v2 均已采纳，同策略额外手工 v9；初次加载和刷新均显示 v2，顶部及两个行内入口正确，无页面横向溢出。
- 390 宽度：附加信息不可用仍显示已保存并关闭审阅弹窗；丢失响应后 1 次 POST、1 次只读核对，显示成功。
- 只读核对失败：显示待确认，保留审阅；用户再次确认时请求体与幂等键完全相同，不生成新意图。
- 错误哈希的回执不作为成功；明确版本冲突仍显示失败并保留审阅。取消交互正常，没有页面脚本异常。
- 首轮截图捕获到关闭动画，等待动画结束后重拍并目视检查。该补拍不改变业务输入。

## 本地运行态

快更前确认实验 19 条均终态、AiRun 41 条均终态、回测 151 条均终态，Arena 为 ended／paused／draft，无待恢复模型执行。

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。入口：`../thesis-ledger-infra/scripts/sync-code.sh thesis-ledger`，未增加改变行为的参数；退出码 0。日志：`/tmp/experiment-adoption-consistency-sync.log`。

Server、Worker 均健康。分别比较两个容器中发布锁、采纳响应 helper、Controller 及实际解析的 Schema bundle 的 SHA-256，均与宿主构建一致。首次按 workspace 路径检查 Schema 时文件不存在，随后按 `require.resolve('@thesis-ledger/schemas')` 的真实安装路径核对通过。

两条已有真实采纳记录的新只读查询均为 HTTP 200、`detailsStatus: ready`，通过 Schema，来源实验和候选匹配。按各正式版本查询实验均为 HTTP 200、`totalCount: 1`，返回正确来源实验。没有执行真实采纳、手工发布、修补数据或模型调用。

快更仅改变本地容器可写层，镜像保持不变，不作为镜像更新或生产发布证据。

## 真实数据保护

更新前后比较行数和全行排序摘要，全部一致；AiRun 未新增且内容未变化。

| 表 | 行数 | 前后相同的摘要 |
| --- | ---: | --- |
| OptimizationExperiment | 19 | `440815933e0521ad9e3f924c598ce44a` |
| OptimizationCandidate | 14 | `32db77a14efe7266955119843c5c95f8` |
| OptimizationAdoption | 2 | `658440575b66d5ffb2dd247132794258` |
| Strategy | 119 | `877c8b32f42d03de6128a85e1a31f94f` |
| StrategyVersion | 151 | `18d04543e8a7107889027558d3007c1c` |
| BacktestJob | 151 | `7c1ad010d27088254562205ef4db8077` |
| AiRun | 41 | `451c101cc2889c14f2cf14515470aa3a` |
| StrategyRiskApplication | 2 | `5af27d34a13b1623533952472a3f1a79` |
