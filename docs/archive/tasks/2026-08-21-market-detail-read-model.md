# 持仓行情详情共享读模型与按能力加载优化任务

> 已完成并归档（2026-10-16）：T8/T11、金额精度与基金净值日期修复均已通过。股票/ETF 的真实读取、基金路由不可用与正向受控样本分层保留；当前 Desktop 139 文件、830 项测试及 typecheck/build/目标 ESLint 通过。[最终证据](../../tasks/evidence/2026-10-16-market-detail-chart-acceptance.md)记录完整状态与请求矩阵。原 V1 兼容和 90 根上限已被现行 V3 合同替代；本任务不再承担图表更新或富途分钟后继范围。

关联规格：[持仓行情详情共享读模型与按能力加载优化规格](../../specs/2026-08-21-market-detail-read-model.md)

## 执行约束

- 开始实施前重新读取关联 Spec、ADR-005、ADR-008、ADR-011、ADR-014 和三个独立仓库各自的 `AGENTS.md`。
- 本任务涉及 `thesis-ledger` 主仓；不得把 DSA Provider 源码复制到主仓，不得让客户端直连 DSA。
- 本任务不新增 DSA 批量详情接口；初始 V1 兼容要求已由 Canonical V3 替代，不再作为旧端点恢复义务。
- 资产类型和 Provider 能力由 Server 权威判断；查看详情不得静默写回 Asset 身份。
- 实现范围或验收标准变化时，先更新 Spec，再同步本任务，最后调整实现。
- 不提交、不推送、不发布镜像，除非用户另行明确授权。
- 所有新增或修改的说明性文档使用中文；代码标识、API 路径和协议名保留原文。

## 初始实施记录（2026-08-22，历史）

- 已完成共享请求/响应类型、Server 资产能力判断、策略路由过滤、未知资产只读降级、分段状态、缓存刷新和 Desktop 请求协调器。
- 已删除旧的 Desktop 多接口详情实现；新详情不再请求 ATR，也不再直连 Provider。
- 已通过 Schema、API client、Server detail/cache、Desktop coordinator/类型辅助函数的确定性测试，以及 Server、Desktop、Mobile typecheck/build。
- Desktop Dialog 的完整回归在 2026-10-15 已接续通过，见 T7a；本节其余数字为 2026-08-22 历史结果，浏览器结论以当前 T8 为准。
- 已通过相关包测试：Schema 39、API client 6、Server 172、Desktop 16；全量 build 与 lint 通过。
- 全量 lint 仍输出既有 `apps/mobile/node_modules/react-native/index.js` Flow 语法解析告警，以及既有 Vite 大 chunk 和 Prisma 配置弃用告警；这些告警未阻断退出码。
- 浏览器已打开本地 Portfolio 页面并确认“行情详情”入口和详情失败态可见；Network 成功态验收受 In-app Browser 对本地 `/api` 请求的 `net::ERR_BLOCKED_BY_CLIENT` 限制，暂不能据此关闭 T8。

## 任务清单

- [x] T1 固化共享 Market Detail schema、能力枚举、section 状态和 API client 类型；确保旧 Data Contract V1 类型继续可用。
- [x] T2 实现 Server 的只读资产类型解析和能力矩阵：覆盖 STOCK、ETF、MUTUAL_FUND、未知类型；unsupported 能力不得触发 Provider 请求。
- [x] T3 实现 `GET /api/v1/market/:symbol/detail`：支持 include、barsLimit/navLimit、refresh、分段部分成功、结构化诊断和既有缓存/stale 语义。
- [x] T4 实现指标共同依赖语义：MA/MACD/RSI 继续从 DSA 统一 `DAILY_BAR` 派生；日线输入失败时输出统一依赖状态，不新增 ATR 路由。
- [x] T5 将 Desktop 持仓行情详情切换到共享读模型，按资产类型展示 quote/bars/指标/chip 或 Fund NAV，并将用户文案改为“行情详情/持仓行情详情”。
- [x] T6 在 Desktop 增加 in-flight 请求去重、AbortController 生命周期管理、局部重试和整页显式刷新；不实现静默回退到旧多请求链路。
- [x] T7 完成 Schema、Server、API client 以及 Desktop 请求协调器/类型辅助函数的确定性回归：覆盖资产矩阵、参数校验、状态映射、缓存、single-flight、错误诊断和旧接口兼容。
- [x] T7a 补充 Desktop Dialog 的确定性回归：覆盖股票、ETF、基金、partial/stale/unavailable、整页刷新和失败分段局部重试。
- [x] T8 完成 Desktop 浏览器 Network/视觉验收：覆盖股票、ETF、基金、StrictMode、partial、stale、empty、unsupported、unavailable 和局部重试。
  - 最终检查点（2026-10-16）：窄屏溢出、长提示高度、金额精度及净值日期修复通过；完整状态、失败恢复、局部重试、关闭取消、重新打开与未知身份受控降级均有证据。最终 Desktop 830 项及各层检查通过；[本轮记录](../../tasks/evidence/2026-10-16-market-detail-chart-acceptance.md)保留细节。
  - [x] T8-Q：行情金额尊重响应币种并保留报价精度。
    - 范围：现有 `market-quote-display.ts`、`QuoteSection` 和对应确定性测试；仅调整实时价/前收价的展示，不改变市场事实、交易规则或资金金额。
    - 完成条件：CNY/HKD/USD 与缺少币种的状态可区分；ETF 千分位及更小报价不被货币默认两位小数截断；受控浏览器验证与包级回归通过。
  - [x] T8-N：修复基金净值历史的 ISO 日期时间在图表初始化时崩溃。
    - 范围：`MarketNavChart.tsx` 的日级日期映射及组件回归；不修改上游市场事实或新增净值来源。
    - 完成条件：Schema 允许的 UTC/带偏移 ISO 日期时间均可绘制，悬停/锁定能匹配原净值；真实图表的受控浏览器样本及包级回归通过。
- [x] T9 完成 Mobile 现有 Portfolio/Risk 只读类型与测试回归；确认共享 API 增量不会引入 Control Token、Provider 管理或导航变化。
- [x] T10 更新 Spec、Task、ADR、CONTEXT 领域词汇和用户可见变更文档；实际 changelog 路径不存在时不得擅自创建平行格式。
- [x] T11 执行最终一致性 Review：逐项核对 Spec、Task、ADR、Schema、Server、Desktop、Mobile、Contract 和验收证据，处理问题或记录用户接受的遗留项。

2026-10-15 T7a：`MarketDetailDialog.test.tsx`、`MarketDetailDialog.latest.integration.test.tsx`、`MarketDetailSections.empty.test.tsx` 共 21 项通过，覆盖股票上下文、目录只读、ETF/基金能力、局部失败、陈旧提示、空态、整页失败、重新打开、刷新、当前整窗重试、旧响应与卸载隔离。首次执行 9 项失败，原因是测试替身未识别新增 `market-minute-options` 查询，误调用真实客户端；补齐同类能力查询分支后通过。此结果不替代 T8 的浏览器验收。

## 详细 Ticket

- [01：股票 Market Detail 最小闭环](2026-08-21-market-detail-read-model/01-stock-market-detail.md)
- [02：ETF/基金能力矩阵闭环](2026-08-21-market-detail-read-model/02-asset-capability-matrix.md)
- [03：分段状态与失败恢复闭环](2026-08-21-market-detail-read-model/03-partial-failure-recovery.md)
- [04：请求去重与跨端最终验收](2026-08-21-market-detail-read-model/04-dedupe-cross-client-acceptance.md)

## 验收标准

1. 股票详情返回 quote、受限窗口日线、MA/MACD/RSI 和可用 chip；初始 30/90 条约束已被现行 V3 窗口合同替代。
2. ETF 详情不请求 ATR 或 chip，并能在 quote/bars/指标部分失败时显示其余成功内容。
3. 基金详情只请求并展示最新 Fund NAV 和最近 NAV history，不请求证券 quote、指标或 chip。
4. 未知资产类型不会在查看详情过程中写回身份；类型相关能力安全降级。
5. 合法但不支持的能力返回 section=`unsupported`；非法 include 或超限参数返回 400。
6. section 状态能区分 ready、stale、empty、unsupported 和 unavailable；客户端 loading 不写入 Server 响应。
7. unavailable section 包含稳定错误码、用户提示和诊断 ID，不泄露 Provider 原始异常。
8. 局部重试只请求失败能力；整页刷新由用户显式触发并允许 stale fallback。
9. React StrictMode 下相同详情请求复用 in-flight 请求，不产生两组有效请求；切换标的后旧请求不会覆盖新状态。
10. 当前客户端使用 V3 共享详情接口，失败时不发生静默的旧链路 fallback；旧 V1 兼容要求已被后继合同替代。
11. Desktop 浏览器 Network/视觉验收和确定性测试均通过；Mobile 现有只读回归不受影响。

## 验证矩阵

| 范围 | 验证内容 | 证据类型 |
| --- | --- | --- |
| Schema/API client | 响应状态、能力枚举、参数和旧类型兼容 | 确定性单元/契约测试 |
| Server | 资产矩阵、Provider 调用过滤、部分成功、缓存、诊断和 single-flight | Server facade/fixture/fault injection |
| Desktop | 文案、section 状态、局部重试、请求去重和取消 | UI 测试、typecheck、build |
| Mobile | Portfolio/Risk 只读行为和类型兼容 | 现有 Mobile 测试与 typecheck |
| 浏览器 | Network 请求数量、无效接口消失、响应式状态和视觉布局 | 浏览器人工验收与截图 |
| DSA | 既有 Contract V1、MA/MACD/RSI、chip、fund NAV 兼容 | 既有 fixture/Contract smoke；不新增 DSA 路由 |

## 发布、回滚与风险

- 当前 Server 与客户端按 V3 成套部署和回滚；Mobile 不需要同步新增详情页面。初始增量接口兼容假设仅保留在历史实施条目中。
- 不用静默 fallback 掩盖新接口或 Provider 故障；失败必须进入结构化 section 状态。
- 内部 Server → DSA 的总调用数不是本任务的硬性验收目标；若后续观测到统一 `DAILY_BAR` 仍有重复 Provider 调用，另立 DSA gateway/cache 优化任务。
- 真实 Provider、Docker、原生 Mobile 设备和外部服务不可用时，必须把缺口与已通过的确定性证据分开记录。

## 最终一致性 Review

- [x] Spec 的目标、非目标、接口、状态、资产矩阵和验收标准均有对应任务。
- [x] ADR 的 Position/Market Detail 边界与 Server 能力权威决策在实现中保持一致。
- [x] 现行 V3、Mobile 只读边界和 DSA 仓库边界保持；原 V1/90 根约束已明确记录为被后继替代。
- [x] 测试覆盖截图中的 ETF 422、ATR 422、指标 503、重复请求和长期 Pending 反例。
- [x] 浏览器 Network/视觉证据与实际代码、测试和文档一致。

2026-08-22 历史复核：当时 In-app Browser 对本地 `/api` 返回 `net::ERR_BLOCKED_BY_CLIENT`，因此 T7a、T8、T11 未勾选。该工具故障已消失，T7a 按 10-15 证据通过，T8/T11 按 10-16 新证据完成；旧未勾选不再触发重复执行。[历史报告](../reviews/2026-08-22-market-detail-read-model-review.md)仅供追溯。

### 2026-10-16 ETF 浏览器补验

正式更新后的 Server `3000` 与当前源码 Vite `5174`，实际从“市场数据→标的目录”搜索 `510300`；API 与页面首项均为 `510300.SH`，第二项为 `510300.OF`。先前“精确代码可能被候选截断”的假设未在当前运行态复现，不据此修改搜索代码，也不认定已证明旧观察的根因。

打开 `510300.SH` 详情，真实同花顺报价、日线、MA/MACD/RSI 均为 `ready`；界面显示来源、前复权、CNY、已收盘与 `2026/7/16～2026/10/16` 区间。响应明确将 chip、fund-nav、fund-nav-history 列为 unsupported，没有为这些能力发起单独数据请求。StrictMode 启动存在取消的选项请求和多个选项读取，不能写成零重复；最终完成一次详情 HTTP 200，请求 ID `1e2bd06a-d87f-4b50-a1b0-13f87037920f`，生成时间 `2026-10-16T10:34:01.794Z`。没有确认目录关联、修改路由或写入持仓。

真实响应及截图保留于 `.recovery-artifacts/native-2026-10-15/market-detail-etf-response-20261016.json`、`market-detail-etf-20261016.png`。本节只记录 ETF 实源正向观察；完整状态与最终一致性以本文顶部链接的 10-16 最终证据为准。基金正向受控样本不改变既有账号/路由不可用结论。
