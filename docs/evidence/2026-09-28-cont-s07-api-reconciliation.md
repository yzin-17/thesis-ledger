# S07-api 当前实现对账

## 结论

本叶只收口 `S07-api` 的服务端 API 与消费合同，不关闭 S07 父项。S07 父项仍受 S05 真实历史资格、目标有效依赖通过路径及最终 UI/非法提交组合验收约束。

当前源码复验：
- Server `backtest-run-preflight`、诊断、非价格依赖、执行预检、配置准备共 5 个文件 **64 passed**。
- API Client 的准备/预检传输共 2 个文件 **11 passed**。
- 合计 7 文件 **75 passed**，退出码 0。

既有实现已包含 `POST /backtests/run-config/preflight`、`backtests.preflightRunConfig`、创建/冻结前 revision 复核、逐项事件/范围/目标诊断，以及 U03 的准备→联合预检消费接缝；相关历史证据分别见 `2026-09-27-s07-preflight-api.md`、`2026-09-27-s07-event-diagnostics.md`、`2026-09-27-u03-preflight-consumption.md`。

## 目标失败关闭复核

当前目标 Server 的 `POST /api/v1/backtests/run-config/preflight` 对仅含额外字段的非法请求返回 HTTP **400**。本次探针只发送非法合同，不携带策略/账号/Provider 参数，不触发 HiThink 或 AI。

既有目标同步证据 `2026-09-27-s07-target-sync.md` 已验证：非法版本 400、不存在策略 404、缺价格绑定返回 `invalid-input`，检查前后 `BacktestJob` 数量一致，拒绝发生在 Provider 读取前。本轮当前部署仍保留同一失败关闭入口。

因此 `S07-api` 的“API + 消费契约 + 创建前失效规则”可勾选；真实依赖 ready、S05 严格历史资格、浏览器/Electron 与 G-UI 仍保持独立未完成。
