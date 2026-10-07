# Longbridge OAuth 会话路由收敛

## 生产链路

- Desktop 通过 Server 创建、查询和取消 Longbridge 授权会话；Server 对 DSA 的请求统一使用 `/api/v3/thesis-ledger/control/providers/longbridge/oauth/sessions` 前缀。创建请求携带 `contractVersion: 3`、`consumer`、`requestId` 与 Client ID。
- DSA 仅在 V3 URL 挂载会话路由。旧 V1 URL 返回 404；V3 URL 上的旧版本创建信封在启动授权会话前返回 `CONTROL_CONTRACT_UNSUPPORTED`。
- 当前会话、按 ID 查询、取消、重启恢复和令牌不回显行为保持。

## 本地验证与剩余边界

- DSA OAuth/Control 定向 21 项通过；Server OAuth 定向 3 项、Server 全包 1685 项通过且 81 项跳过，类型检查通过。
- DSA 官方离线全包 7597 项通过、1 项跳过、4 项未选。目标 Server→DSA/桌面真实 OAuth 尚未验收；Provider Store 旧单字符串凭证分支、Policy/Catalog 与目标运行态仍未收敛，E04-b/c、D02/D03 不勾选。
