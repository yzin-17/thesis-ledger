# Provider 变更后的当前策略投影

## 生产变更

- DSA Provider 保存、移除的返回值现在从当前 V3 Policy 即时生成 `effective`，不再读取或改写旧 V1/V2 Policy 状态表。健康写入只保存健康事实，当前 Policy 读取会重新计算目标状态。
- ThesisLedger 专属 V3 HTTP 的稳定错误信封使用 `contractVersion: 3`，旧错误编号不再出现在当前报价端点。

## 验证与后续

- Provider 配置、凭证、当前 Control 与 HiThink 报价定向 71 项通过，相关文件 `flake8` 通过；旧策略状态表在只应用 V3 Policy 时保持无行。
- 旧 Policy Store 方法与表仍在源码中，需要完成调用反查和删除；目标 Server→DSA、Docker 与真实 Provider 未验收。E04-b/c/d、D02/D03 不勾选。
