# R02 腾讯 `newfqkline` 原生成交额接线（2026-09-29）

## 来源与反例

旧精确入口请求 `web.ifzq.gtimg.cn/appstock/app/fqkline/get`，`510300.SH` 的 `none/qfq` 短窗均为六字段，缺原生成交额；前一叶已改为整窗拒绝。安装版 AKShare `stock_zh_a_hist_tx` 使用腾讯 `proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get`，从响应行第 5 位读原生成交量、第 8 位读原生成交额，分别按常规股票/ETF 的手和万元换算；科创板量字段另按股处理。此为代码合同线索，不能代替腾讯的独立官方单位证明。

公开只读请求 `sz159516` 的 2026-07-06 至 2026-07-13 拆分事件窗口，`none/qfq` 各返回 6 根。精确适配器首日 `none` 收盘 `1.714`、`qfq` 收盘 `0.857`；两者成交量同为 `4093108600` 份、成交额同为 `7026982500` 元的本地换算值。末日两口径收盘均为 `0.865`，量额仍一致。说明原始金额字段不应由复权收盘价乘成交量产生；该短窗不证明长期覆盖、官方单位、复权锚点或许可。

## 实施边界

DSA 精确 `get_daily_data_for_source` 改读 `newfqkline/get`；普通 `get_daily_data` 保留旧端点。请求固定单标、`none/qfq`，按日历年最多 8 段读取，单段最多 640 行，整窗最多 800 行并共享总期限。响应校验包装、状态、标的、口径、日期、重复、OHLC、量额非有限值及原生成交额字段；缺失或非法时整窗拒绝。逐段保存请求范围、行数、原始响应 SHA-256，整窗保存分段清单修订。V3 分页证明核验范围、计数、摘要形状和请求口径；适配修订及分页协议提升至 v2，使旧准入不能直接沿用。

## 本地验证

- 新原生读取、旧普通读取、分页证明、V3 路由、Provider Runtime 相邻测试共 `119 passed`；包含跨年、金额不由价量推算、身份/口径错误、金额缺失或非法、总期限过期、旧协议与缺分段证据拒绝。
- `py_compile`、限定 critical flake8 与 `git diff --check` 通过；官方 `ci_gate.sh syntax` 通过。官方 flake8 首次因 Shell PATH 未包含 `.venv/bin` 而未执行，补入后为 `0` 错误。
- 官方 `offline-tests` 首次 `7571 passed`、`3 failed`：两处旧测试夹具未提供新分段证据，一处非腾讯 API 测试直接调用分页 helper 时缺新参数。补齐夹具并为非腾讯调用保留可选默认值后，定向 `66 passed`；官方语法与 critical flake8 复核通过。离线全包复试 `7574 passed`、`1 skipped`、`4 deselected`、`626 subtests passed`。
- 相邻 infra 官方 `./scripts/sync-code.sh dsa` 兼容性预检与快更通过，目标 DSA 为 `running/healthy`。宿主与容器的 `tencent_native_daily.py`、`tencent_fetcher.py`、`thesis_ledger_market_v3_pagination.py` SHA-256 分别同为 `7ea363bbd5434ce2cf6146277e0a1b287c66c0316d55b7da8f669f6bb84eb039`、`338c197f4215b412dfbfe9fbe539d7337096b15a5b608138eac3bf032463d837`、`31bf1b0f442821ce25d84d7d63e0b4f47a1ce4cd38314034987283a3681a2ecd`。容器内 `159516` 同窗 `none/qfq` 各读 6 根、首日收盘分别 `1.714/0.857`，量额同为 `4093108600/7026982500`，各有 1 段传输证据。镜像仍为 `sha256:2e75542952ca40f69c5b96b7f6ec75a184e4ea0db6ba362874c4b7607d287543`；本次仅更新可写层，容器重建后会回到镜像版本。

## 尚未签发的门禁

原生字段单位、币种、长期历史覆盖、真实权限或使用条款、来源修订与目标策略准入仍归 G0-M；目标 `159516.SZ` raw/hfq 回测、独立备用和严格 PIT 均另验。此次本地读取及模拟分页证明不能替代真实 G0-M。

本轮还按 `159516`、2026-07-06 和量额数字检索了深交所及基金管理人的公开资料；检出的上市和拆分公告可核身份/事件日期，但没有提供这次腾讯响应同日字段的官方单位或逐日量额对照。因此未写入腾讯准入，也未把锁定版 AKShare 的换算声明提升为独立来源证明。
额外一次限定 18 秒的 AKShare/EastMoney raw 日线交叉读取被 `ProxyError` 中断，没有获得异源对照行；不继续以同一网络条件机械重试。
