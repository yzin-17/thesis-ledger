# Provider registry 读取路由收敛

## 改动与语义

- DSA Provider registry 的 GET 从旧 V1 URL 迁到 `/api/v3/thesis-ledger/control/providers`，响应标识 `contractVersion: 3`；旧 GET 返回 404。独立 Control Token、Provider 身份与凭证配置状态仍由原 Store 读取。
- Server `DsaClient.controlProviders()` 改读现行 URL，Market Control 的提供方列表继续消费同一份 registry。
- Provider 配置、测试、移除、OAuth、Policy 和 Catalog 仍通过各自旧合同；这些路径需要按已拆分的 E04-b/c 阶段迁移，不能以 registry GET 迁移宣称整个 Provider 配置完成。

## 验证

- DSA Control/RQData 定向 29 项、官方离线全量 7596 项通过，1 项跳过、4 项未选；旧 GET 404 和当前响应版本断言通过。
- Server 类型检查和全包 1684 项通过、81 项跳过；目标 Server→DSA/桌面、真实 Provider、Docker 尚未验收，E04-b/D02/D03 未勾选。
