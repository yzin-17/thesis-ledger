# Control 策略与目录路由收敛

## 生产调用与状态语义

- Server 与 DSA 的握手、Desired Policy 写入、Effective Policy 读取及精确路由能力目录统一使用 `/api/v3/thesis-ledger/control/*`。原有 V3 请求/响应解析、策略修订 CAS、目标顺序和可用性判断保持。
- 标的 Catalog 快照、增量迁到 `/api/v3/thesis-ledger/catalog/*`，响应标识 `contractVersion: 3`。Job 创建/状态和 ACK 迁到 V3 Control URL，创建与 ACK 请求只接受 V3 信封。generation、checksum、cursor、失效游标和 ACK 校验保留。
- 删除 DSA 已空的 ThesisLedger V1 router 及其生产挂载；非 ThesisLedger 的 DSA `/api/v1` 接口保留。

## 验证与剩余边界

- DSA 路由/策略/目录/Provider 定向 91 项通过，Catalog Job 负例与 ACK 正例通过。Schemas 全包 563 项、Server 定向 26 项与全包 1685 项通过且 81 项跳过；Server/Schemas 类型检查、边界门禁及主仓 diff 检查通过。
- DSA 官方离线全包 7597 项通过、1 项跳过、4 项未选。旧 Store 的 V1/V2 Policy 和单字符串凭证分支、目标 Server→DSA/桌面与真实 Provider 尚未验收；E04-c/d、D02/D03 不勾选。
