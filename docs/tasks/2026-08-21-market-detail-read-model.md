# 持仓行情详情共享读模型与按能力加载优化任务

关联规格：[持仓行情详情共享读模型与按能力加载优化规格](../specs/2026-08-21-market-detail-read-model.md)

## 执行约束

- 开始实施前重新读取关联 Spec、ADR-005、ADR-008、ADR-011、ADR-014 和三个独立仓库各自的 `AGENTS.md`。
- 本任务涉及 `thesis-ledger` 主仓；不得把 DSA Provider 源码复制到主仓，不得让客户端直连 DSA。
- 保持 DSA Contract V1 和既有 quote、bars、indicator、chip、fund NAV 路径兼容；本任务不新增 DSA 批量详情接口。
- 资产类型和 Provider 能力由 Server 权威判断；查看详情不得静默写回 Asset 身份。
- 实现范围或验收标准变化时，先更新 Spec，再同步本任务，最后调整实现。
- 不提交、不推送、不发布镜像，除非用户另行明确授权。
- 所有新增或修改的说明性文档使用中文；代码标识、API 路径和协议名保留原文。

## 当前执行状态（2026-08-22）

- 已完成共享请求/响应类型、Server 资产能力判断、策略路由过滤、未知资产只读降级、分段状态、缓存刷新和 Desktop 请求协调器。
- 已删除旧的 Desktop 多接口详情实现；新详情不再请求 ATR，也不再直连 Provider。
- 已通过 Schema、API client、Server detail/cache、Desktop coordinator/类型辅助函数的确定性测试，以及 Server、Desktop、Mobile typecheck/build。
- Desktop Dialog 的完整资产矩阵、partial/stale/unavailable 和局部重试 UI 回归仍待补充，不能把 coordinator/类型测试等同于完整 Dialog 验收。
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
- [ ] T7a 补充 Desktop Dialog 的确定性回归：覆盖股票、ETF、基金、partial/stale/unavailable、整页刷新和失败分段局部重试。
- [ ] T8 完成 Desktop 浏览器 Network/视觉验收：覆盖股票、ETF、基金、StrictMode、partial、stale、empty、unsupported、unavailable 和局部重试。
- [x] T9 完成 Mobile 现有 Portfolio/Risk 只读类型与测试回归；确认共享 API 增量不会引入 Control Token、Provider 管理或导航变化。
- [x] T10 更新 Spec、Task、ADR、CONTEXT 领域词汇和用户可见变更文档；实际 changelog 路径不存在时不得擅自创建平行格式。
- [ ] T11 执行最终一致性 Review：逐项核对 Spec、Task、ADR、Schema、Server、Desktop、Mobile、Contract 和验收证据，处理问题或记录用户接受的遗留项。

## 详细 Ticket

- [01：股票 Market Detail 最小闭环](2026-08-21-market-detail-read-model/01-stock-market-detail.md)
- [02：ETF/基金能力矩阵闭环](2026-08-21-market-detail-read-model/02-asset-capability-matrix.md)
- [03：分段状态与失败恢复闭环](2026-08-21-market-detail-read-model/03-partial-failure-recovery.md)
- [04：请求去重与跨端最终验收](2026-08-21-market-detail-read-model/04-dedupe-cross-client-acceptance.md)

## 验收标准

1. 股票详情能够返回并展示 quote、最近 30 条日线、MA/MACD/RSI 和可用 chip；最多允许请求 90 条历史数据。
2. ETF 详情不请求 ATR 或 chip，并能在 quote/bars/指标部分失败时显示其余成功内容。
3. 基金详情只请求并展示最新 Fund NAV 和最近 NAV history，不请求证券 quote、指标或 chip。
4. 未知资产类型不会在查看详情过程中写回身份；类型相关能力安全降级。
5. 合法但不支持的能力返回 section=`unsupported`；非法 include 或超限参数返回 400。
6. section 状态能区分 ready、stale、empty、unsupported 和 unavailable；客户端 loading 不写入 Server 响应。
7. unavailable section 包含稳定错误码、用户提示和诊断 ID，不泄露 Provider 原始异常。
8. 局部重试只请求失败能力；整页刷新由用户显式触发并允许 stale fallback。
9. React StrictMode 下相同详情请求复用 in-flight 请求，不产生两组有效请求；切换标的后旧请求不会覆盖新状态。
10. 旧市场接口仍可被旧客户端调用；新接口失败时不发生静默的旧链路 fallback。
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

- 先发布 Schema/API client 和 Server，再发布 Desktop；Mobile 不需要同步新增页面。
- 新接口为增量能力，旧客户端继续使用旧接口；回滚 Desktop 时保留旧接口可用。
- 不用静默 fallback 掩盖新接口或 Provider 故障；失败必须进入结构化 section 状态。
- 内部 Server → DSA 的总调用数不是本任务的硬性验收目标；若后续观测到统一 `DAILY_BAR` 仍有重复 Provider 调用，另立 DSA gateway/cache 优化任务。
- 真实 Provider、Docker、原生 Mobile 设备和外部服务不可用时，必须把缺口与已通过的确定性证据分开记录。

## 最终一致性 Review

- [ ] Spec 的目标、非目标、接口、状态、资产矩阵和验收标准均有对应任务。
- [ ] ADR 的 Position/Market Detail 边界与 Server 能力权威决策在实现中保持一致。
- [ ] 旧 Data Contract V1、Mobile 只读边界和 DSA 仓库边界没有被新聚合接口绕过。
- [ ] 测试覆盖截图中的 ETF 422、ATR 422、指标 503、重复请求和长期 Pending 反例。
- [ ] 浏览器 Network/视觉证据与实际代码、测试和文档一致。

2026-08-22 复核记录：Standards 与 Spec 双轴复核均未发现当前 P0/P1/P2 问题。由于 In-app Browser 对本地 `/api` 请求返回 `net::ERR_BLOCKED_BY_CLIENT`，T7a、T8、T11 继续保持未勾选；这表示验收证据缺口，不代表代码复核通过等同于浏览器验收通过。完整审查报告见 [`docs/reviews/2026-08-22-market-detail-read-model-review.md`](../reviews/2026-08-22-market-detail-read-model-review.md)。
