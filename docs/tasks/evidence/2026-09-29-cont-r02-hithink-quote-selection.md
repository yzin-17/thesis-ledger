# R02.1/R02.3 HiThink 单标报价来源选择（2026-09-29）

## 来源与消费入口

同花顺当前[股票行情接口](https://fuyao.aicubes.cn/docs/api-reference/prices/)将 A 股快照定义为 `GET /api/a-share/prices/snapshot`。显式 `thscodes` 进入按代码取数模式；现有适配器只发送一只带市场后缀的完整代码，不进入省略参数后的全市场分页。适配器允许 `.BJ` 代码形状，但本页没有单独证明该交易所的实际覆盖，须由目标探针核验。返回的 `thscode` 是原始身份，价格为 CNY，成交量为股；`data.timestamp` 可空，不能由系统抓取时间补为上游时间。

当前[基金行情接口](https://fuyao.aicubes.cn/docs/api-reference/fund-market/)将场内快照定义为 `GET /api/fund/market/snapshot`，必填单只带市场后缀的 `thscode`，可覆盖 ETF/LOF。本叶仅选择 ETF；端点文档给出量额字段，但没有足以把 ETF `volume` 直接授予项目执行单位的独立目标证据，原生单位仍待核验。两接口同属 HiThink 服务，不登记成两个独立上游。

现有 `ProviderRuntime.execute_request(REALTIME_QUOTE)` 是股票与 ETF 的 Quote 消费入口。DSA `thesis_ledger_hithink_quote.py` 已有两个来源 ID 的单标适配器，检查完整代码、唯一响应行、价格/时间与稳定错误；Control manifest 也分别登记两个精确来源。当前 `_adapter(hithink)` 只提供 V3 历史 Bar 方法，`_realtime_quote` 尚未调用上述快照适配器；Control V1/V2 的 HiThink Quote 目标维持 `not_admitted`。因此 R02.1/R02.3 的 endpoint 与 Consumer **选择完成**，R02.2/R02.4 的生产执行、当前准入与真实 G0-H 仍开放。

## 本轮验证与后继条件

现有 `test_thesis_ledger_hithink_quote.py` 和 `test_thesis_ledger_hithink_quote_gate.py` 共 14 项本地通过，覆盖适配器及禁用门禁；这些测试不证明实际账号权限、上游延迟或目标数据。下一执行叶须先定义 Quote 对当前 policy/catalog/admission 与凭据修订的读前读后核验，再把精确来源接入 `ProviderRuntime`，验证实际来源 ID、观测时间与失败分类。目标环境分别对股票与 ETF 做单标、权限、单位、时点和消费者验证；不能由历史日线准入继承报价资格。

## 目标容器单标只读探针

2026-09-29（Asia/Shanghai），目标 DSA 容器 `thesis-ledger-dev-dsa-1` 健康且环境中存在 HiThink Key。宿主与容器内 `thesis_ledger_hithink_quote.py` 的 SHA-256 均为 `abdcc3634ae513409b9919fa2523ce2b2366bf95789e56814e5c2e014d00d695`。在容器内直接调用该适配器，对 `600519.SH/STOCK` 与 `510300.SH/ETF` 各发一次精确单标请求；没有重试、全市场请求、策略修改或目录准入写入。

| 单元 | 结果 | 原始响应证据 | 上游时间 / 本地观测时间 | 已核边界 |
| --- | --- | --- | --- | --- |
| 股票 `a-share-prices-snapshot` | HTTP 200，适配器成功 | 364 字节，SHA-256 `ca48f161f67b5c5edd64a27074f50935af6b96e35a2f49fec7662991f830cddc` | `2026-09-28T21:01:53+00:00` / `2026-09-28T21:01:55.739201+00:00` | 该账号在该次请求可取单只股票；官方与适配器约定价格 CNY、量为股、额为 CNY |
| ETF `fund-market-snapshot` | HTTP 200，适配器成功 | 422 字节，SHA-256 `188c5f8bf84be154d488ca9c1ef2caba20068cddb94232396b112a2d49fd1579` | `2026-09-28T21:01:56+00:00` / `2026-09-28T21:01:55.928261+00:00` | 该账号在该次请求可取单只 ETF；价格 CNY，量额单位继续 `unknown` |

ETF 上游时间比本地 `fetchedAt` 晚约 72 毫秒；两种时钟不能互相替代，也不能由这一次读数推断源端发布延迟或历史可见性。原始响应、Key、请求头未写入证据；仅保存大小、摘要及非敏感字段。该探针证明两个精确端点的当次权限与适配器读取，不证明生产 Quote 路由、当前 RouteAdmission、长期可用性、ETF 量额单位或真实消费者。R02.2/R02.4 与 G0-H 继续开放。

## 生产接线复核

只读目标 Control 投影显示：V2 revision 28 的 STOCK/ETF Quote 均没有 HiThink 目标，V3 revision 29 也没有 `REALTIME_QUOTE` 路由。源码中 `_effective_v2` 对这两个 HiThink 来源保持 `not_admitted`；`_adapter(hithink)` 当前仅返回历史 Bar 执行方法，而 `execute_request(REALTIME_QUOTE)` 的通用路径会先用 `provider_symbol_for_contract` 去掉 `.SH/.SZ` 后缀。直接把适配器加入通用调用会传入错误身份；仅删除 `not_admitted` 又会跳过来源特定的当前准入与读后撤销复核。对应状态机、执行面、消费者及目标验收已在主 Task 拆为独立叶子。
