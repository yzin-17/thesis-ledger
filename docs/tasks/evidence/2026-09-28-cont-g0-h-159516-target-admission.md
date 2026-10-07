# G0-H-target：159516.SZ 固定供应商快照来源准入

## 准入判断

本叶只签发 `CN/ETF/DAILY_BAR/1d/qfq` 的 HiThink `fund-market-historical`、`159516.SZ`、`2026-04-30..2026-08-09` 精确范围。HiThink [ETF 历史接口](https://github.com/HiThink-Tech/Financial-API/blob/3bca7805a4127ece8d81961917e740d2effac6ec/docs/api/fund/fund-market.md)将 `adjust:null` 定义为固定前复权；目标与预热 68 个交易日的完整性、重叠窗口和长窗口边界已有 G0-H 前期证据。[深交所独立量额核验](2026-09-28-cont-g0-h-159516-szse-units.md)支持该标的该窗口的 `fund-unit/CNY`；[全窗与拆分价格对账](2026-09-28-cont-g0-h-159516-unit-and-split-crosscheck.md)证明拆分前约二倍、07-10 起同原始价的前复权坐标，与[管理人拆分公告](2026-09-28-cont-m22-159516-splits.md)一致。

Spec §5.2 允许供应商未公开完整分红公式时以 `dividendMeaning=provider-defined` 使用已验证的复权序列；来源修订可为明确标识的本地观测版本。故本次仅准入**归一化序列记账 + 固定供应商快照研究**所需的目标价格输入；不声称严格历史 PIT、已知供应商算法版本、真实账户份额或现金分红再投资。归一化持仓不得在 07-10 再乘拆分比例。未经验证的其他 ETF、窗口和口径不在准入范围。

## 目标准入记录与运行核验

- 目标 DSA 环境凭据已配置，调用内部 ControlStore 取得当前凭据 HMAC 修订，但未输出 Key 或修订值。签发前精确路由无准入行；当前适配修订 `dsa-v3-etf-hithink-fund-market-historical-qfq-adapter-v3`，来源修订 `dsa-hithink-etf-request-contract-v1`。
- 将上述标的、范围、来源链接、响应指纹、68 日、量额差值及限制写入 DSA 的内容寻址证据存储并读回验证，引用为 `sha256:6af28d300868040ffb553fb8473d378c5bd876ae79c57b9f250e7957c9d5b097`。内部精确 RouteAdmission 的 `recordVersion=1`，有效期至 `2026-10-05T13:28:45.824032+00:00`；过期、换 Key、换适配/来源修订均重新拒绝。未扩展到其他标的。随后经正式 Control HTTP `POST /api/v1/thesis-ledger/control/policies/apply` 建立 V3 revision 1 的单一 ETF qfq 目标路由；Effective 目标 `eligible=true`，Catalog `ready`。V1/V2 策略未更改。
- 经目标 DSA 正式 Data V3 HTTP `POST /api/v3/thesis-ledger/market/bars`，同一 Key 的真实 HiThink 请求返回 HTTP 200、68 Bar，首日 `2026-04-30`、末日 `2026-08-07`，`sourcePriceBasis.fieldUnits={volume:fund-unit,amount:CNY}`，`dividendMeaning=provider-defined`，`inputFingerprint=e6db97ea3aca01136666882919b05883fc1319db2fd07f69759b653e22fdbbab`。07-09 开/收 `0.903/0.973`、量 `5,167,705,300`、额 `9,570,656,400`；07-10 开/收 `0.973/0.905`、量 `12,805,326,400`、额 `12,338,560,700`，均与既有独立对账一致。未输出原始 HTTP 响应或凭据。
- 同一 HTTP 入口以 `2026-04-29` 起点超出准入范围时返回 422，未触发正向窗口；原始错误层级未在有界探针中展开，不把 `code` 记为已核值。首次正向请求在 V3 Policy 尚不存在时返回 `NO_ELIGIBLE_PROVIDER`，发现并通过 Control HTTP 建立精确 Policy 后，同前提发生变化才重新请求并成功；另一次 405 是探针误用未带 `/api/v3` 的路径，未触达目标 Data V3 路由。

## 后续门禁

`G0-H-target` 的目标来源读取、单位和价格坐标在上述限定协议下通过。`G0-H` 父项的其他 ETF、股票和事件样本未通过。`G-Deploy-159516` 仍需核对 Server Desired/Effective、真实多窗口及冻结/重放；`G-Run` 仍需正式创建、独立 Worker 终态、结果和交易明细。严格 PIT、分红 `progress="2"`、其他来源均继续拒绝或待核。
