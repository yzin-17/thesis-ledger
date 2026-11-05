# 腾讯后复权价格研究准入与目标验收

## 设计决定与范围

用户于 2026-10-03 确认：候选来源完成合理验证后，如果最终只有 HiThink 能适配，应判断准入设计过严并减少限制。该决定已进入配对 Spec §5.2 和 Task。基础价格研究按策略和记账方式的实际需要准入；完整公司行动、可逆因子、严格 PIT 和未消费的量额单位只约束对应功能。

本次范围为 `tencent/tencent × CN/ETF/DAILY_BAR/1d/hfq`、`159516.SZ`、来源窗口 `2026-04-30..2026-08-09`。使用原生 `newfqkline/get` 的 `hfqday`，公共 Bar 合同不变。匿名访问是本次可用性观察，未据此认定再分发许可。其他来源的跳过决定保持。

## 来源、窗口与正式取数

北京时间 2026-10-03 01:10 左右的目标 DSA 探针各限 25 秒、1 MiB，无重试。完整窗口含 68 个唯一交易日，与独立深市日历一致，首尾为 04-30 和 08-07；07-06..07-17 短窗有 10 行，重叠 OHLCV 和原生成交额全部一致。分页和有限 OHLC 检查通过。首次准备脚本在网络请求前因日历键名错误退出，改正后才消耗两个请求。

| 证据 | SHA-256 |
| --- | --- |
| 完整窗来源响应 | `79d4afc5402d0e56629ae2f45e77e77c9d598f353991aeb4075dbd87c59cf2f5` |
| 完整窗规范化行 | `c6d65e4ba151499cf55fd249e2761aec387dcc32126acffe1723d3b1b8f8fb15` |
| 重叠窗来源响应 | `907e22c7e0e7956bd22fb9988db33fab33cf939f5fee85d7f4496d01ed4beb6d` |
| 重叠窗规范化行 | `fc95e7f399aa94df9d6a6c52d7014beb566701e5eec5cc4b4e4238ceea2abfc3` |
| 内容寻址准入证据 | `9ba2f14276d864afd3bfc6c97a0c1468f986c8cdc9dd41b6da05f0d59cb76922` |

[准入证据原件](2026-10-03-tencent-hfq-price-research-admission.json)已写入目标内容寻址存储并读回核验。绑定适配修订 `dsa-v3-etf-tencent-hfq-newfqkline-adapter-v1`、来源修订 `tencent-newfqkline-year-partitions-v2`、凭据修订 `not-required`，有效至 `2026-10-09T17:17:22.724280+00:00`，即北京时间 10-10 01:17:22。只覆盖上述标的、口径和窗口。

正式 Data V3 `POST /api/v3/thesis-ledger/market/bars` 返回 HTTP 200、68 条 Bar，输入指纹 `5d9c1d75f15abca6285bd37d84c6cf80c03bdefd17241031ce68e8c2829a00b7`，实际来源 `tencent/tencent`、策略版本 33。越界至 04-29 的反例返回 HTTP 422；未保存业务错误码，不声明精确错误分类。

`volumeBasis=unknown`、量额单位未声明、供应商定义的复权基准和分红语义、不可逆转换继续保留。当前准入适用于固定供应商快照和归一化连续数量上的纯价格规则；没有授予真实份额、量价混合规则、严格历史 PIT、公司行动完整性或跨源备用兼容资格。单一主源成功执行不受仅用于跨源回退的兼容条件阻塞。

## 路由保存限制收敛

Server 原版本 32 含准入已过期的 Efinance 净值路由，整份目录校验阻止保留它并新增腾讯 HFQ。新增领域 helper 按上一份成功 Effective 识别 RouteKey、目标及主备顺序均未改动的路由，允许保留目录仍存在的暂不可用目标。新增或变更目标、重新开启全局策略、部分目录、适配缺失和不支持口径继续拒绝；失败的 Desired 不能提供保留资格。

正式 `PUT /api/market-data/policy` 后，Server 和 DSA 均为版本 33，`syncState=applied`、`effectiveStale=false`，Desired 和 Effective 路由读回一致：

| 路由 | 实际目标 | Effective |
| --- | --- | --- |
| ETF 日线前复权 | `hithink/fund-market-historical` | 可用 |
| 基金历史净值 | `efinance/eastmoney` | 不可用，`admission_expired`；配置保留 |
| ETF 日线后复权 | `tencent/tencent` | 可用 |

完整目录有两个 ready 精确条目。配置保留没有改变执行端的实时资格检查。

## 验证与部署

- 定向两文件 27 项通过；Server 全包 252 文件、2070 项通过，33 文件、125 项按既有条件跳过。日志 `/private/tmp/tencent-hfq-policy-server-tests-20261003.log`。
- Server typecheck、build、修改文件 ESLint/Prettier、import 边界和 8 包依赖图通过。首次 typecheck 发现新测试联合类型未收窄，改用 `satisfies` 后通过。
- 全仓 HEAD 文件尺寸门禁失败于本轮未改动的 `apps/server/test/ledger/baseline-import.service.test.ts`，1549→1550 行，既有 Ledger 迁移增加了 `envelopeVersion` 字段；保留该工作。另有 9 项既有警告。本次文件未触及尺寸阈值，全仓门禁不记为通过。
- 官方 `./scripts/sync-code.sh thesis-ledger` 成功，Server/Worker 健康，兼容预检通过，依赖、数据库和镜像未改变。镜像仍为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`；此次容器可写层同步不是镜像发布。
- helper 构建物在宿主、Server 和 Worker 均为 `fa3208434418245712ebe0b53466895a7634ef8965cab30f743046517e18a11c`。同步日志 `/private/tmp/tencent-hfq-policy-sync-20261003.log`。

## 正式回测准备与停止点

正式 `POST /api/v1/backtests/run-config/prepare` 复用普通策略 v2 `08ac7d30-d1a0-4ba2-8d7e-338cebe4c9e4` 的同源 `close > open` 规则；选择腾讯后复权、归一化记账、固定快照、采集后冻结和零费用模型。正式区间 05-16..08-09，来源与预热范围为已准入的 04-30..08-09。旧策略、旧 Run 和旧模型未改写。

北京时间 2026-10-03 01:45:29，准备返回 HTTP 201、业务 `blocked/DATA_UNAVAILABLE`，诊断字段为 `readyExecutionRouteTarget`。DSA 日志记录对应 `/market/bars` HTTP 422。没有创建 Run、没有调用 AI，也未执行 Worker 重放。此次未保存生产 DSA 422 的完整响应体，不能把离线错误码冒充生产响应体的直接记录。

源码核对与目标容器离线复现定位出待补合同：Server 对固定快照 CN 日线附带 `tradabilityMode=assume-untradable-no-bar`，DSA `market_daily_tradability` 随后要求 `daily_tradability_input`。腾讯适配器提供完整价格与分页元数据，但没有该日级元数据。离线完整两日样本在普通读取下通过，增加该选项后得到 `invalid_response`，原因为“日级来源证据缺失或范围不符”；通过 mock 禁止网络并核对请求数为 0。该结果证明可复现的适配缺口，不代表腾讯服务不可用。

本叶单次准备预算已用完，停止同条件来源请求。下一叶先审查如何将完整 Bar、独立日历、分页和来源指纹组成通用日级证据，保留缺日和身份/冻结时间检查，再增加适配与测试。不能简单关闭执行事实校验，也不能把缺日推断成已证实停牌。

目前是两个就绪价格条目，其中 HiThink 已有完整回测验收；腾讯正式取数和配置通过，Server 回测与重放未通过。完整 raw 路径、独立备用、事件、其他标的/窗口和严格 PIT 继续开放。

本轮脚本与日志位于 `/private/tmp/`：`tencent-hfq-admission-review-20261003.py`、`tencent-hfq-admit-20261003.py`、`tencent-hfq-policy-align-20261003.py`、`tencent-hfq-server-run-20261003.py`、`tencent-hfq-server-run-20261003.log`、`tencent-hfq-tradability-gap-20261003.py`。

## 2026-10-03 共同能力修复后结论

用户随后确认以 HiThink/腾讯共同能力收敛设计。公共层现已自动整理日级状态，四个基础 ETF 价格条目取消人工窗口准入前置；腾讯 qfq/hfq 与 HiThink qfq 的普通回测、腾讯 qfq 整窗备用及目标冻结重放均已通过。原始证据文件与本节以前的失败记录保持不变，当前结果由[共同价格能力验收](2026-10-03-common-price-baseline.md)和主 Task §0 接续。
