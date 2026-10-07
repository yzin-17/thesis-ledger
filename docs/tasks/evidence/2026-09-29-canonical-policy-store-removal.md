# DSA 当前策略存储收敛

## 生产变更

- 删除 DSA Store 的 V1/V2 Policy 规范化、写入、生效投影、旧路由选择和相关旧表定义；当前 Policy 使用单一 `thesis_ledger_policy_state` 与历史表。Provider 配置、移除与健康状态只影响当前动态投影。
- 读取或覆盖现有旧格式行前检查存储格式；旧行返回 `UNSUPPORTED_STORED_POLICY`（409），不会被当作当前路由，也不会被静默改写。开发环境需通过显式重建入口处理旧 SQLite 状态。
- Provider Runtime 的内部执行入口现在必须收到当前 V3 Effective Policy 和精确目标列表；删除 V1/V2 路由解析与无来源回退。保留当前来源的熔断隔离测试，移除仅验证旧来源别名共享的测试及旧 HiThink V1/V2 准入用例。

## 验证与边界

- 当前 Control、Provider、报价和 Store 定向 61 项通过，相关 `flake8` 通过；跨连接相同修订竞争只允许一个提交，旧行拒绝后原内容不变。
- DSA 全包尚需在最后源码稳定后重跑。目标 DSA SQLite、Server→DSA、Docker、真实来源及原 M1/M2/M3 与 AC01–AC20 未验收，E04-c/d、D01/D02/D03 不勾选。
