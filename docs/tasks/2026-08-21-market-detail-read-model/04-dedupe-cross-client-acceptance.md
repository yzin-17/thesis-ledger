# 04 — 请求去重与跨端最终验收

**建设内容：** 收敛 Desktop 的重复请求与竞态问题，验证 Mobile 对共享契约的兼容性，并完成浏览器网络、视觉和文档一致性验收。
**前置依赖：** Ticket 01 — 股票 Market Detail 最小闭环；Ticket 02 — ETF/基金能力矩阵闭环；Ticket 03 — 分段状态与失败恢复闭环
**状态：** 部分完成（浏览器验收受本地环境阻断）

- [x] 在 Desktop detail 读取层增加基于请求参数的 in-flight 去重和 `AbortController` 取消；覆盖 React StrictMode effect 重放、快速切换资产和关闭详情的场景。
- [x] 防止旧请求覆盖新资产或新 refresh 结果；取消、超时和局部失败都映射到既定分段状态，不制造重复 toast。
- [x] 对 Mobile 现有只读 Portfolio/Risk 消费做类型和契约回归验证，确保不引入交易控件、Provider 规则或桌面专属字段依赖。
- [ ] 完成 Desktop 浏览器验收：股票、ETF、基金、未知资产、局部失败、stale 和重试场景，检查 Network 请求数量、请求参数、响应状态及页面可视状态。
- [ ] 完成 Spec、Task、ADR、领域术语和实现/测试的一致性 Review；将验证证据、遗留风险和回滚步骤补入任务记录。

验收标准：

- [ ] 在开发环境 StrictMode 下，同一 detail 参数不会产生重复的并发网络请求；切换资产后旧结果不污染新详情。
- [ ] Desktop 网络面板证明不再为同一页面重复请求同一能力，且不发起不支持的 chip、ATR 或证券行情请求。
- [x] Mobile 现有构建、类型和相关测试通过，且无破坏性 API 变更。
- [ ] 浏览器视觉验收覆盖独立 loading、ready、empty、stale、unsupported、unavailable 和 retry 状态，并保存外部验收证据而非把临时截图提交到仓库。
- [ ] 最终一致性 Review 无未处理问题；如有遗留项，必须明确记录为用户接受的风险后才能关闭任务。

范围外：真实 Provider 在线 smoke 仅作为观测证据，不作为本地确定性验收的替代；不在本 Ticket 中提交、推送或发布。
