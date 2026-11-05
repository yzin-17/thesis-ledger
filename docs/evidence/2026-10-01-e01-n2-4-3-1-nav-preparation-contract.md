# E01-N2.4.3.1 准备合同与输入核验

日期：2026-10-01。所属任务：E01-N2.4.3.1。

## 拆分与交付边界

N2.4.3 拆分为纯准备合同/核验与策略版本服务/API 两叶。本叶完成前者，后者仍由 N2.4.3.2 拥有；N2.5/6 的创建写入、冻结关联和数据库验收保持原有归属。

准备成功的 scope 为 `nav-input-plan`，只表示当前完整输入证据与配置吻合。内部摘要用于内容关联，不是公共创建授权、已写 Snapshot 或目标运行态就绪证明。

## 变更与不变量

| 文件 | 责任 |
| --- | --- |
| `packages/schemas/src/backtest-nav-preparation-v3.ts` 与 `index.ts` | 独立显式研究意图及策略版本请求；禁止调用方指定最终时点、可见性规则、来源/准入修订 |
| `apps/server/src/backtest/backtest-nav-input-budget.ts` | 复用现行 N1 策略支持条件及确认/结算尾部预算 |
| `apps/server/src/backtest/backtest-nav-input-plan.ts` | 消费上述所属领域函数，保持完整 N1 计划行为 |
| `apps/server/src/backtest/backtest-nav-preparation.ts` | 固定一次 Market Reader 调用，采集后定时点，绑定完整计划和内容摘要 |
| `apps/server/src/backtest/backtest-nav-preparation-proof.ts` | 最终时点、准入有效期、完整范围、原文记录及可见时间核验 |
| `apps/server/src/backtest/backtest-nav-source-evidence.ts` | 将现有逐条原文核验参数收窄为实际使用的事实字段，供准备与冻结共同消费 |
| `apps/server/test/backtest/backtest-nav-preparation.test.ts` | 定向正例、错误边界及当前冻结读回接缝 |

全部变更保留在既有未提交工作区，未提交或暂存。

请求显式提供完整申赎模型、基金类型、日期研究决策及普通基金 T+1 决策；QDII 决策不能伪装成普通规则。实际规则由精确来源返回并核验。来源前复用 N1 策略支持条件、实际指标 lookback 以及 `1 + confirmation + afterConfirmation` 尾部预算，不使用用户填写的任意预热值替代策略需求。

来源请求 `dataAsOf` 为有界采集期限，最终 RunConfig `dataAsOf` 为 Reader 返回后的 Server 时刻。来源请求及原文不重写为最终时点；所有事实、来源及准入按最终时点再核验。期限超出、时钟回退、未来来源/可见时间、已过期准入、预热/运行/确认/结算/披露日期不足均拒绝。

准备结果保留完整策略、最终配置、日期及来源原文、全部事实和来源记录；绑定策略版本内容、意图、配置、计划、来源请求/响应、路由状态及准入摘要，以及开始/完成时点。完整 N1 计划继续包含执行、信号、基准、预热、确认/结算、披露日历、费用模型版本及期末行为。

## 验证结果

| 检查 | 输入范围及结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-preparation.test.ts test/backtest/backtest-nav-input-plan.test.ts test/backtest/backtest-nav-snapshot-store.test.ts test/backtest/backtest-nav-visibility.test.ts test/market-nav-reader-v3.test.ts` | 5 文件，114 项通过；其中新增准备 28 项 |
| `pnpm --filter @thesis-ledger/schemas typecheck` / `build` | 通过；包含新意图及导出 |
| `pnpm --filter @thesis-ledger/server typecheck` / `build` | 通过；包含准备与测试 |
| 限定 ESLint、Prettier | 通过；覆盖上述源码与测试 |
| 复杂度 20、函数尺寸 220 | 通过 |
| `node scripts/check-boundaries.mjs` | 通过；Backtest 单向消费 Market，未直接依赖 DsaNavClient |

正例核对全部内容摘要、实际冻结时点、一次来源调用、执行/信号/基准完整输入及隔离 Store 的 Parquet 写入/读回。负例覆盖普通/QDII 错配、缺决策、模型基金错配、非研究模式、调用方指定时点、非 CNY、日期逆序、跨基金策略/信号、旧策略费用、未来决策、无效预算、时钟回退、期限超出、未来来源与事实、准入过期、缺事实、重复原文、规则原文篡改、预热/结算/披露日期不足、请求身份错配及来源失败。

首轮 Schema 构建发现 Zod issue 转发类型不兼容，改为保留 path/message 的 custom issue 后通过；测试样本的宽类型影响 Server 编译，显式标注受控 Reader 返回类型后，重新类型检查及构建通过。没有放宽运行时 Schema 或门禁。

## 三份真实来源原文复验

入口：`/private/tmp/e01-n2-4-3-1-nav-preparation-probe.mjs`。

复用 N2.3 的已采集完整原文。实际隔离鉴权 HTTP 和当前 DsaNavClient 重新核验全部来源证据，再以 Market Reader 合同桩调用当前纯准备函数，经过当前 LocalNavSnapshotStore 的实际 Parquet 冻结及离线读回。历史时钟受控；请求关联的上限元数据按本轮毫秒时钟格式构造，来源原文、原始净值记录、规则文件及真实采集时刻保持不变。该验证不表示本轮重新调用上游、当前路由状态或策略版本服务已验证。

| 基金 | 研究规则 | 事实数 | 来源采集期限 | 最终冻结时点 | 完整准备/Parquet/读回 |
| --- | --- | --- | --- | --- | --- |
| `161725.OF` | 普通 T+1 | 10 | `2026-09-30T17:33:08.195Z` | `2026-09-30T17:32:08.195Z` | 通过 |
| `110011.OF` | 已审核 QDII T+1 | 10 | `2026-09-30T17:33:22.219Z` | `2026-09-30T17:32:22.219Z` | 通过 |
| `118001.OF` | 已审核 QDII T+2 | 10 | `2026-09-30T17:33:36.466Z` | `2026-09-30T17:32:36.466Z` | 通过 |

三份均采用实际 MA3/MA4 策略，完整计划要求四个预热期、四个确认/结算尾部交易日。来源原文校验、最终计划、冻结上下文及读回计划一致；共三次来源请求。隔离 HTTP 服务和临时 Parquet 目录在验收结束时关闭/移除。

## 当前状态与下一叶

N2.4.3.1 完成。N2.4.3/N2.4 仍未完成；未接入 Prisma、公开准备 API、证据持久化、业务 Run 或目标部署。下一叶为 N2.4.3.2 策略版本服务与准备 API，消费本叶合同并负责真实服务/API 接缝验收。

N4 仍须处理现有默认 5 秒请求预算不足的问题；本叶没有修改目标配置。
