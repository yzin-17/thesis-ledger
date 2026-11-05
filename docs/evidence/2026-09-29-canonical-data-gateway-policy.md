# DSA 通用数据网关的当前策略准入

## 生产执行

- DSA 通用 Data Gateway 在报价、净值、持仓和筹码等能力执行前读取当前 `effective_policy_v3()`；按市场、资产类型、能力选择唯一 data RouteKey，并验证修订、目标顺序、来源身份和可用状态。旧策略不再作为该执行入口的 Provider 选择依据。
- 每个目标还需持有当前 admitted 的 RouteAdmission，且准入范围覆盖请求标的与日期。ETF 单标预算、来源调用顺序与真实 Provider 元数据继续由原执行器维护；HiThink 报价守卫改核对 V3 Policy、凭据修订与准入版本，结束后再次检查晚到变化。
- V3 data RouteKey 的 Target 资格不再误用日线专属 adapter 校验；AKShare ETF 报价目前无单标适配器，明确标记为 `not_adapted`。

## 当前证据与未闭环

- 通用路由/HiThink/网关定向 48 项通过，相关模块 flake8 通过。旧普通日线测试因公开入口已移除而退役，现行 V3 精确日线测试仍在原套件中。
- DSA 全包正在执行。V3 精确能力目录尚未列出通用 data 路由，Server 无法据此写入这些策略；非 HiThink 来源的精确 adapter/source 修订与读后准入复核仍需核验。目标 Docker 和真实报价链路未验收，E04-c/d 与 D02/D03 不勾选。
