# 159516.SZ 普通回测 draft 策略建立证据

## 范围与目标

在目标开发运行态中，以已有 `159516.SZ` 实验种子的 V2 合同为输入，通过正式 `POST /api/v1/backtests/strategies` 创建可供普通回测选择的独立 `draft` 策略。用户已明确选择复制种子。此步只建立策略，不发起数据请求或回测，也不改变 Provider 准入。

## 创建与核对

- 目标 Server 的 `GET /api/v1/backtests/strategies` 创建前返回 `200`、空列表；目标数据库已有 9 个 `experiment-only` 策略，无普通可选策略。
- 输入为种子策略版本 `353fe0a8-1f8c-489c-a299-6902d43fc628`。创建前核对 V2、`CN/etf/159516.SZ` 信号与执行标的、`close` 日线、下一有效交易日开盘市价执行和空风险规则。仅将 schema 的 `name`、`description` 换成普通回测用途的中文说明。
- 正式 API 返回 `201`：新策略 `6abc8dda-17c2-45fb-a8d2-d18f430a6e32`，名称 `159516.SZ 普通回测基线`，状态 `draft`，`schemaVersion=2`。
- 数据库复核：新策略版本 `38e91024-8ca5-44dc-84d9-a7ec6a63628b`、版本号 `1`；新旧 schema 的差异键仅为 `name` 和 `description`；原种子版本仍存在。普通策略列表返回 1 项且包含新策略。
- 将新版本实际 schema 送入目标 Server 已部署的 `planBacktestPriceInputs`，按 `2026-05-16..2026-08-09`、`CNY` 计算：1 个日线预热交易日，保守取数起点 `2026-04-30`，`calendar-aware-conservative-v1`，无规划阻断项。这是依赖计划结果，不代表该区间真实数据可用。

## 未通过的门禁

目标 DSA 当前没有 HiThink 配置、环境凭据或 `thesis-ledger` 的 V3 策略行；目标 Server 当前 ETF 日线 Desired 路由未选择 HiThink。已有 59 行目标区间样本也未覆盖策略所需的 `2026-04-30` 预热起点。HiThink ETF 成交量、成交额单位及完整历史/价格坐标仍缺真实准入证据。因此 `G0-H-target`、`G-Deploy-159516`、`G-Run`、`G-UI-159516` 均保持开放，不能由策略创建推断正向回测可执行。本步未重复任何已耗尽的同前提真实来源请求或 DSA 官方完整离线门禁。
