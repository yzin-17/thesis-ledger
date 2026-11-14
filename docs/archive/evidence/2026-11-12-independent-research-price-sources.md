# 双价格研究独立来源验证记录

日期：2026-11-12。合同见[规格](../../specs/2026-11-12-independent-research-price-sources.md)，完成范围见[任务](../tasks/2026-11-12-independent-research-price-sources.md)。

## 问题与实现

截图中的原价 `route_not_configured` 发生在跨口径来源钉选阶段。当前路由版本 199 中，A 股股票后复权主源为富途、备用为东方财富，不复权主源为同花顺、备用为 Tushare；原价读取强制跟随后复权来源时找不到富途目标。用户明确要求分别选择来源。

- AC1：`readPriceResearchReference` 使用原价路由的正常选择流程，移除跨口径 `requiredSource`；删除 `backtest-price-research-pair.ts` 及准备阶段整体重试，原价问题不再改变已选后复权来源。Market 的每条路由主备与准入合同保留。
- AC2：来源 helper 继续校验每套请求、响应、固定目标、完整证据和摘要。回放移除两套 Provider/上游相等比较，保留各套自身来源、冻结窗口、哈希、价格行及可见时间检查；参考 RouteKey 与执行 RouteKey 的全部范围字段继续对应，仅复权方式不同。
- AC3：manifest 和结果已有独立原价来源字段，保留原实际 Provider、上游和主备索引。普通历史同源样本继续通过，新的不同源样本在断开 Reader 后可离线重放；实验基线、候选与切分继续复用各自窗口。
- AC4：原价失败错误保留具体标的、窗口、底层原因及备用失败，不再借用后复权 Provider 标记原价失败。最小依赖及实验的显式额外冻结意图保留。

## 定向与实际 Worker 验证

在主仓经 RTK 执行，原始日志为本机 `/tmp/independent-price-*`，不作为源码跟踪。

```sh
pnpm --filter @thesis-ledger/server exec vitest run test/backtest/price-research-pair.test.ts test/backtest/price-research-snapshot.test.ts test/market/market-window-selector-v3.test.ts test/market/market-frozen-window-reader-v3.test.ts test/strategy-optimization/experiment-price-research.test.ts test/strategy-optimization/strategy-optimization-preparation-http.test.ts
pnpm exec node scripts/test-experiment-price-research-runtime.mjs
```

定向回归 6 文件、53 测试通过；涵盖后复权富途与原价 Tushare 的独立主/备用索引、原价失败时不重取后复权、标的/市场/窗口错误拒绝、来源自身证据被篡改拒绝、纯指标最小依赖及已有同源快照回放。原 Market 主备选择和冻结 Reader 的测试继续通过，不以两个假来源返回成功替代这部分门禁。

维护入口创建并清理隔离 PostgreSQL、Redis；实际 Nest HTTP、BullMQ、编译后 Worker 的完整链路 1 测试通过。后复权样本为富途，原价样本为同花顺，结果来源保留，固定份数投入和离线重放正确；实验准备、持久化种子、基线与候选复用也通过。数据为确定性样本，未调用真实 Provider 或 AI。

最初一次隔离创建返回 409：测试中的当前路由读取器仍固定旧同花顺执行目标，与新增富途执行来源的准备戳不符。仅将测试读取器更新为对应路由，保留生产创建门禁，随后同一测试通过。修复了该受影响测试中的既有未使用变量 lint 问题，没有降低检查。

Server 构建通过，受影响源码和测试 ESLint、边界、workspace 依赖门禁及 `git diff --check` 通过；尺寸门禁保留 6 个既有警告。本次无客户端组件、样式、Native 工程或数据库结构变更，既有结果界面分别消费研究来源与原价来源，未新增接口或显示分支。

## 正式快更与运行态

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 通过 RTK 执行 `PATH=/Users/yzin/.volta/tools/image/node/26.13.0/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，退出码 0。兼容性预检和应用构建通过，Server 与 Backtest Worker 健康，镜像 ID 保持不变；未修改数据库结构、外部卷或路由。代码更新位于容器可写层，不代表镜像已重建。

独立只读检查确认实际 Server 编译产物中的原价读取已无来源钉选、准备已无整体价格对重试，而原价来源/窗口/冻结身份校验保留；Server、Worker 及工作区数据服务健康。

## 代表真实窗口准备

使用本地 Server 的自动执行设置解析和实验准备接口，目标为用户此前提到的 `300058.SZ`，从零探索，研究区间为 2025-11-16 至 2026-11-10，候选预热预算 60，固定后复权研究并额外冻结原价。没有提交实验创建请求。

准备接口 HTTP 201，业务状态 `prepared`，后复权实际来源为 `futu/futu`、主源索引 0，原价窗口已冻结。随后只读查询对应窗口的持久化行情证据：

| 口径 | 实际来源 | 冻结窗口 | 有效策略版本 |
| --- | --- | --- | --- |
| 后复权 | `futu/futu`，主源 | 2025-10-31 至 2026-11-10 | 199 |
| 不复权 | `hithink/hithink-financial-api`，主源 | 2025-10-31 至 2026-11-10 | 199 |

真实行情准备仅读取来源行情并生成冻结证据，未创建用户实验、策略或模型调用。路由版本核对仍为 199，没有为本次验收保存路由。该结果只证明上述窗口与准备合同，不代替所有标的/来源覆盖。

## 最终一致性审查

通过。核对新准备、创建、冻结、离线执行、实验基线/候选和历史输入之间的来源契约。跨来源已允许，单套证据和范围仍严格匹配；共享 Reader 的来源、主备和冻结语义保持。普通研究 Spec、实验 Spec、当前设计和索引已同步；归档旧价格对恢复证据保留其历史适用性。没有未决事项或延期，未改历史业务结果，未调用真实 AI 或创建用户实验，未提交或推送。
