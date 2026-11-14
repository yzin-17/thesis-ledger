# 自主竞技场无效输出与时间展示：实施记录

- [x] 调查失败周期、持久化 SDK 诊断和 Schema；确认最终响应 JSON 有效但 decision.orders[0].exitGroup 不符合配对退出规则。
- [x] 在系统消息中补充买入单不得填写 exitGroup、未成交入场先预约 fill 后再设置退出单的规则。
- [x] 添加按浏览器本地时区显示且带 IANA 时区后缀的时间格式，并接入历史决策、近期决策、模型账户和概况时刻。
- [x] 直接从已有审计提取错误字段并展示，不泄露完整模型回复或执行自动修复。
- [x] 定向测试：Desktop 14/14，Server 2/2 通过；Desktop 类型检查与 Server Nest 构建通过，未修改 Schema/交易校验或其它工作区内容。
- [x] 从 thesis-ledger-infra 目录执行 PATH=/Users/yzin/.volta/tools/image/packages/pnpm/bin:$PATH ./scripts/sync-code.sh thesis-ledger，退出码 0；正式预检和宿主构建通过，Server/Backtest Worker 健康。容器内确认 exitGroup 更新提示，/api/v1/health 返回 200；Vite 已读取本地时间和错误说明新版模块。仅容器可写层更新，镜像未更新；DSA 未作为同步目标。
- [x] 数据库只读核验历史失败仍为 model_output_invalid，模型仍处于 needs_attention，未主动发起重试或新增模型调用；下次用户显式重新预约研究才应用修订后的提示。