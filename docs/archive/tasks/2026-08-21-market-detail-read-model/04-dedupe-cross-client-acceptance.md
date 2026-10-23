# 04 — 请求去重与跨端最终验收

**建设内容：** 收敛 Desktop 的重复请求与竞态问题，验证 Mobile 对共享契约的兼容性，并完成浏览器网络、视觉和文档一致性验收。
**前置依赖：** Ticket 01 — 股票 Market Detail 最小闭环；Ticket 02 — ETF/基金能力矩阵闭环；Ticket 03 — 分段状态与失败恢复闭环
**状态：** 已完成并归档；旧浏览器阻断已消失，分层结果见[父 Task](../2026-08-21-market-detail-read-model.md)与其最终证据。

- [x] 在 Desktop detail 读取层增加基于请求参数的 in-flight 去重和 `AbortController` 取消；覆盖 React StrictMode effect 重放、快速切换资产和关闭详情的场景。
- [x] 防止旧请求覆盖新资产或新 refresh 结果；取消、超时和局部失败都映射到既定分段状态，不制造重复 toast。
- [x] 对 Mobile 现有只读 Portfolio/Risk 消费做类型和契约回归验证，确保不引入交易控件、Provider 规则或桌面专属字段依赖。
- [x] 完成 Desktop 浏览器验收：股票、ETF、基金、未知资产、局部失败、stale 和重试场景，检查 Network 请求数量、请求参数、响应状态及页面可视状态。
- [x] 完成 Spec、Task、ADR、领域术语和实现/测试的一致性 Review；将验证证据、遗留风险和回滚步骤补入任务记录。

验收标准：

- [x] 在开发环境 StrictMode 下，同一 detail 参数只有一个有效详情 GET；取消与重新打开已实测，切换资产旧响应隔离沿用协调器回归。能力/计划查询的取消与重复另行计数，不伪称全部网络读取零重复。
- [x] Desktop 网络面板证明详情及局部重试遵循当前能力矩阵，且不发起不支持的独立 chip、ATR 或基金证券行情请求。
- [x] Mobile 现有构建、类型和相关测试通过，且无破坏性 API 变更。
- [x] 浏览器视觉验收覆盖独立 loading、ready、empty、stale、unsupported、unavailable 和 retry 状态，并保存外部验收证据而非把临时截图提交到仓库。
- [x] 最终一致性 Review 无本范围未处理问题；图表更新、真实来源资格、分钟线和安装态由各原 Task 独立验收，不并入本 Task 的完成结论。

范围外：真实 Provider 在线 smoke 仅作为观测证据，不作为本地确定性验收的替代；不在本 Ticket 中提交、推送或发布。
