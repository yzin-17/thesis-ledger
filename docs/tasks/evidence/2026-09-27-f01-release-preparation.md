# F01 兼容发布准备核验

infra `node scripts/check-compatibility.mjs` 通过：V1 兼容基线和独立 marketV3 Data/Control 3 要求一致。主仓 `node --test scripts/market-v3-contract-probe.test.mjs` 9 项通过，覆盖旧 Data 声明、握手身份、partial 目录、无效凭据、Token 缺失、错误脱敏与独立 Data 鉴权。

已修正 infra `contract-matrix.md` 中“实际升级尚未完成”的过时描述，分别记录已完成保留数据升级/恢复演练与未执行的相容镜像回退。补充禁用策略应用、修订核验、已有任务独立取消、隔离兼容检查、官方部署和重新准备的步骤。依据为 `MarketRouteRevisionService`、`marketRouteContextV3` 和 `BacktestCreationGuardService`，没有操作目标策略、取消业务任务或回退镜像。

Server 路由修订与整窗选择定向测试用于核对失效边界；这些是本地测试，不替代目标禁用和回退演练。当前仍需验证发布准备的全部条件，尤其相容候选镜像及实际回退证据；F01 保持开放。不得为关闭任务而降级数据库或修改旧快照。
