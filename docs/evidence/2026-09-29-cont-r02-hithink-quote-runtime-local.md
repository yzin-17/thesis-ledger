# HiThink 股票与 ETF 报价本地接线证据

## 范围与状态

本轮将两个已选精确来源接入 DSA V2 `REALTIME_QUOTE` 的 Control、Runtime 和 V1 Quote HTTP，并把可空来源时点、精确来源及已核单位送到 Server Quote Reader。目标 V2 revision 28 和 V3 revision 29 原本均无 HiThink Quote 路由；本轮未改目标策略、未写真实 RouteAdmission、未调用真实 Provider、未更新容器。目标正向链路及 G0-H 保持开放。

## 准入与执行

- Control 从同一 SQLite 的精确 `CN/STOCK|ETF/REALTIME_QUOTE × hithink/来源` 准入记录重算 V2 Effective；缺行、过期、撤销、范围外、来源目录移除或凭据修订变化均不放行。V1 无来源钉住的路径继续关闭。
- Runtime 在来源调用前后重新读取当前 V2 policy、来源目录、准入版本和环境凭据快照。股票与 ETF 分别保留完整 `thscode`；其他 Provider 继续使用其既有裸代码合同。适配器只用前检得到的不可变凭据快照，晚到撤销、策略或凭据变更结果被拒绝。
- HiThink `rate_limited` 保留稳定错误码；每个 V2 目标仅一次来源调用。ETF 同标的再次请求命中已有 600 秒持久预算而不再调用适配器。
- V1 Quote HTTP 仅对精确 HiThink 来源公开 `units`：股票为 `CNY/share/CNY`，ETF 为 `CNY/unknown/unknown`；ETF 错用股票量额单位返回 502。`marketTime` 在原始来源时点缺失时为 `null`，`fetchedAt` 仍单独保留，`freshness=unknown`。

## 验证

| 层级 | 结果 |
| --- | --- |
| DSA 隔离 SQLite、Runtime、鉴权 V1 HTTP 与相邻 Control/Quote 回归 | 9 个相关测试文件 **116 passed、5 warnings**；覆盖股票/ETF 正向、缺证据、逐标的范围、目录移除、晚到撤销/策略/凭据变更、限流、ETF 预算、401/503/200 及来源/时间/单位 |
| DSA 静态门禁 | 官方 `./scripts/ci_gate.sh syntax` 退出 0；官方 `flake8` critical 退出 0、计数 0；新增模块单独 `py_compile` 与限定 `flake8` 通过 |
| Schemas / Server / Desktop | Schemas `build` 通过；Server 与 Desktop `typecheck` 均 0 错误；Server Quote Reader 定向 **11 passed**，两资产分别验证 `marketTime=null`、精确来源和单位经 fresh、last-valid 缓存保留 |
| 仓库空白 | 主仓、DSA 的 `git diff --check` 均退出 0 |

Server 定向测试初次读取旧 Schemas `dist` 而拒绝可空 `marketTime`；构建本轮 Schemas 后通过。随后测试使用了非法的合成 `DsaError` 类型，修正为既有 `unavailable` 合同后 Server 类型检查通过。上述失败不是目标运行态证据。

## 未完成门禁

本轮没有对新增输入重跑 DSA 官方隔离 `offline-tests`，不能沿用此前全包通过作为本轮结论。没有按 infra 官方入口同步目标容器，因此目标仍不能执行新报价路径；需要目标策略分别配置两个来源、逐来源审核并签发范围内真实准入，再从 Server 到目标 DSA 验证正向、撤销、凭据轮换、缓存与错误。ETF 真实量额单位仍未核证，公开合同保持 `unknown`。两次历史单标只读探针仅证明对应账号和请求当次端点可用。
