# 基金净值读取合同收敛

## 改动

- DSA 最新与历史基金净值从 ThesisLedger 专属 V1 URL 移到 V3 URL，原路由删除；响应点使用 `version: 3`。V1 capabilities 不再宣称提供净值路由。
- 主仓 Schemas 仅保留当前 `FundNav` / `FundNavHistory` 类型与解析器；Server 直接校验 DSA 响应版本及代码，停止补写旧版本，并使用新的 Redis 键隔离旧缓存。Desktop 净值消费类型同步。
- DSA 合同文档与 Changelog 已更新；测试确认旧净值 URL 返回 404。

## 本地验证

- Schemas 562 项、Server Market 定向新增旧版本拒绝后 14 项、DSA 定向 45 项、Desktop 全包 508 项通过；Server/Desktop 类型检查及构建通过。DSA 官方 syntax、flake8 关键检查通过。
- DSA 官方离线门禁：7600 项通过、1 项跳过、1 项失败；失败项为无关的 Codex 工具进程测试，报 `未找到 600000 的数据`，隔离重试 1 项通过。完整门禁本次仍记失败，不用隔离重试冒充全包通过。
- Server 全包与 DSA 门禁并行时 4 个回测测试达到 5 秒超时，其余 1682 项通过、81 项跳过；隔离重试覆盖这 4 个测试文件共 7 项通过。完整门禁本次仍记失败。

## 保留门禁

目标 DSA/Server/Worker 尚未用官方 infra 入口更新，真实 Provider、HTTP 与客户端未验收。报价、筹码、持仓、FX 等剩余 V1 合同及 Backtest/Ledger 旧链路继续未完成。
