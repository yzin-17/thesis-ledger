# 原价失败后的完整价格对切换验收

日期：2026-11-11。对应[需求规格](../../specs/2026-11-11-backtest-return-research.md)、[归档任务](../tasks/2026-11-11-backtest-return-research.md)和[首次实施证据](2026-11-11-backtest-return-research.md)。

## 原始故障与修复

用户失败任务 `7c74d2f5-55e8-4faf-9023-12a303383665`，策略版本 `0653cd37-6d90-456e-9930-df59c258c847`（v3），窗口 2026-10-11 至 2026-11-11，初始资金 100000 CNY。保存的实际规则为不复权收盘价等于 3.99 时进入、小于 0 时退出、参考份数 100、零佣金和滑点；沿用原模型与估值设置。没有按策略名称推断其仍含分红事件规则。

原任务于北京时间 15:57:26 创建、15:57:30 准备失败，未进入 Worker。DSA 日志先返回后复权成功，再返回原价请求 503／`transient_failure`。此前原价虽绑定后复权选中来源，但失败后没有换取完整备用价格对。

Market 的内部 `requiredSource` 约束支持研究后复权与原价的精确选源，仍核验配置、生效、准入和来源身份。Backtest 在新准备阶段遇到可恢复的原价失败时，按后复权路由顺序尝试下一个共同目标，重新取得两套价格并完成全部准备；不重复目标、不混合提供方。证据冲突等合同错误继续失败，复用冻结输入和快照构建不切换来源。失败摘要保留具体来源、底层原因与窗口。没有调整路由、放松准入或新增权益事件前置。

## 局部与包级验证

- 定向首次 36 项通过；后补冻结输入不切换测试后，价格对专项 7 项通过。覆盖主后复权成功／原价失败、完整备用对冻结和离线计算、两侧路由顺序不同、全部失败、无共同备用、不可恢复错误及读取器忽略选源约束。
- `pnpm --filter @thesis-ledger/server exec vitest run test/backtest test/market`：237 文件通过、17 跳过；1988 项通过、63 跳过。后续只新增上述独立专项测试，单独通过。
- Server 类型检查、构建和本次源码／测试限定 ESLint 通过。运行脚本在 ESLint 的既有忽略范围，未将该警告记为脚本 lint 通过；两种脚本执行模式均经实际运行。
- `scripts/check-boundaries.mjs` 通过；文件尺寸检查通过，仍为六个既有大文件警告。本次没有引入新的跨领域依赖；Market 负责精确来源约束，Backtest 负责价格对准备协调。
- 此次没有修改客户端、依赖、数据库结构或 DSA 源码，复用首次证据中未变化输入的客户端、Worker 和浏览器验证；没有重跑原生编译或构建镜像。

## 目标同步与独立核验

执行目录 `thesis-ledger-infra`，正式入口 `./scripts/sync-code.sh thesis-ledger`，使用 Node.js 24.22.1；退出 0。Server／Worker 健康，镜像 ID 不变，无数据库结构或外部卷变更。六个本次关键编译文件分别在 Server 和 Worker 中与宿主摘要一致（各 6／6）。这只证明容器可写层源码同步，容器重建仍恢复镜像内版本。

16:18:16，通过正式 `POST /api/v1/backtests/run-config/prepare` 提交原任务保存的准备请求，返回 HTTP 201、`status=prepared`、`executionPreflight.status=ready`，来源为 `efinance/eastmoney`、备用索引 1、路由修订 197。请求前后原失败任务完整响应一致。没有调用正式任务创建接口。

## 原任务完整窗口的隔离结果

维护入口：

```sh
node scripts/local-runtime/verify-price-research-live.mjs --output /tmp/price-research-exact-20261111-pair.json --run-id 7c74d2f5-55e8-4faf-9023-12a303383665
```

16:16:15 完成真实取数、准备、快照构建和正式计算器运行。实际顺序为 AkShare 后复权成功、AkShare 原价失败、EFinance 后复权成功、EFinance 原价成功。两套备用行情各 28 根，预热起点 2026-09-25；快照阶段按冻结引用读取，没有重新选源。策略内容摘要 `672f884b7d3f00d1ff9cfaaf2c2a8f8aa05f8dccb90e107566fb21e7cafbab79`。

快照状态 finalized、输入质量 complete、无质量警告；内容摘要 `0f9c98fd172d793a6806b83219129f423f6ab6291f0a390ad7549b5d1785d606`。正式计算器生成 23 个权益点、0 次模拟成交、0 次拒单；最后研究权益和研究资金余额均为 100000 CNY，研究单位 0，模拟盈亏 0。相同快照两次离线运行校验和一致：`5e74f62dd2adce63`。

为补齐指标原因，16:19:23 使用同一成功报告的冻结引用复算，没有再次采集价格：

```sh
node scripts/local-runtime/verify-price-research-live.mjs --output /tmp/price-research-exact-20261111-replay.json --run-id 7c74d2f5-55e8-4faf-9023-12a303383665 --prepared-report /tmp/price-research-exact-20261111-pair.json
```

研究收益率为 0、基准收益率约 -4.0076%。结果 `completeness=partial` 是零波动的夏普不可计算（`ZERO_VOLATILITY`）、无平仓交易的胜率与盈亏比不可计算（`NO_CLOSED_TRADES`），不是行情或快照输入缺失。新隔离 runId 会改变结果身份和校验和；只核对同一快照两次离线重放一致，不把不同 runId 的校验和直接比较。

两个成功运行均验证 Strategy、StrategyVersion、BacktestJob、Account、LedgerEvent、DesiredProviderPolicy、DesiredProviderPolicyRevision 的行数和完整行摘要不变。仅允许正常 Market 观测／证据持久化；快照写入脚本拥有的临时目录并在 finally 清理。没有真实任务入队或账本写入。本次真实输入的结果计算与首次受控实际 Worker／数据库／队列证据分别成立。

## 来源可用性与证据边界

16:17:27 的一次新增采集仍失败：AkShare 和 EFinance 后复权均 `fetch_failed`。日志显示东方财富连接被远端关闭（`RemoteDisconnected`）。报告 `/tmp/price-research-exact-20261111-result.json` 保留失败和业务表不变结果；没有删除该反例。之后正式 API 准备成功，不代表上游永久恢复。

当前两家提供方共享 `eastmoney` 上游，因此完整价格对切换能处理单个适配入口失败，不能保证共同上游故障时可用。未修改真实策略或来源政策，也没有隐式改用旧观测。首次另一代表股票的已有成功证据继续仅适用于其实际窗口；本次新增完整窗口的实际证据仅为上述 510300 策略。

最终类型检查、专项测试 lint、`git diff --check` 和本次文档相对链接核对均通过。

结论：单侧失败时遗漏完整备用价格对的缺陷已修复，原策略完整窗口已通过真实准备、隔离结果及目标 API 验收。保留共同上游间歇故障、未创建正式新任务、可写层更新及既有全仓 lint 的边界。
