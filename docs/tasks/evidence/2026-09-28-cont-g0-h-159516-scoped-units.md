# G0-H-units-scope：159516.SZ 有作用域的原生单位投影

## 依据与范围

[深交所独立单位核验](2026-09-28-cont-g0-h-159516-szse-units.md)对 HiThink ETF 历史端点的 `159516.SZ` 做了两种核对：2025 年 7 月 HiThink 日线合计与深交所 ETF 月报只差 5 份、19 元；2026-04-30..08-09 的 68 个日期与深交所官方日线逐日匹配，量与官方展示值乘 100 后 67 日精确相等，最大差 30 份，金额最大差 50 元。结合深交所基金量额定义，本次仅为目标 68 日及其子窗口声明 `volume=fund-unit`、`amount=CNY`。2025 年 7 月是独立尺度核验样本，不据此开放该月的 Data V3 日历或准入。

## 实施

- DSA 新增 `thesis_ledger_hithink_etf_units.py` 纯函数：只有标的精确为 `159516.SZ`、请求日期完全位于 `2026-04-30..08-09` 且来源修订等于已审查的 `dsa-hithink-etf-request-contract-v1` 时，生成带证据 ID、请求身份和修订的 V2 单位合同。其余情况沿用 V1 `unknown/unknown`。
- HiThink ETF 运行时只在适配器继续报告未自行定义的 `unknown` 时附加上述合同；原始量额数值不变。Data V3 与 Chart V3 的 HTTP 投影复核合同及请求标的、窗口，不能从另一请求复制已知单位声明；单位参与响应指纹。ETF 精确适配修订从 `v2` 升到 `v3`，使旧准入即使存在也因修订不匹配而失效。
- 来源准入与字段单位独立。没有写入 RouteAdmission、没有启用目标路由，也没有调用真实回测；价格复权算法、历史修订/PIT 及目标容器版本继续单独验收。

## 验证

- 定向 `pytest`：字段单位、HiThink ETF 适配器、凭据/准入运行时、精确准入路径及 Data V3 合计 **97 passed**。覆盖目标窗口的运行时标注、超界/换标的/换修订回退、HTTP 响应身份和原始数值保真。
- 上述修改文件的 `flake8` 通过；DSA `git diff --check` 通过。
- 代码稳定后按相邻 infra 的官方 `./scripts/sync-code.sh dsa` 同步目标容器，兼容性预检通过，DSA 重启后健康，镜像 ID 保持 `sha256:e4e1671e7bdfdb632d545cf8cc07501bfe5f4d574fd73ca97469f99d1ef18e57`。目标 Server、Worker 同时为 running/healthy。宿主与容器内 `thesis_ledger_hithink_etf_units.py`、Provider Runtime、HTTP 单位投影三份 SHA-256 分别精确一致：`e460f929...`、`1d89353c...`、`06164b84...`。容器中纯函数对目标范围返回 `fund-unit/CNY`，超界返回 `unknown`；精确 ETF qfq 目录仍只有 1 条 HiThink 条目且状态 `not_admitted`。这次是容器可写层快更，镜像未更新，容器重建后会恢复镜像内代码。
- 扩展执行含 `test_thesis_ledger_hithink_market_v3_contract.py` 时为 **99 passed、1 failed**：该文件现存断言只允许 HiThink `DAILY_BAR`，而当前 manifest 另含 `REALTIME_QUOTE`。失败与本次字段单位改动无关；未在本叶修改能力目录或该断言，不能把扩展套件记为全绿。

## 尚未通过

真实 `159516.SZ` 精确 RouteAdmission 仍为 `not_admitted`。目标前复权算法/历史修订与拆分、历史决策 PIT、普通回测和 UI 验收均未因此通过。M31 分红进度码 `"2"` 仍无可信映射，保持拒绝。
