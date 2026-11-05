# R02.7 Efinance 股票回退行身份本地证据

## 来源与调用边界

DSA 股票 `get_realtime_quote()` 先尝试 `ef.stock.get_quote_snapshot()`，失败后保留既有全市场 `ef.stock.get_realtime_quotes()` 回退；ETF 的单标路径明确不走该回退。本地与当前运行中 DSA 容器均安装 `efinance 0.5.9`，相关安装包源码哈希一致，见 [R02.12 包证据](2026-09-28-cont-r02-12-efinance-upstream-identity.md)。本地安装包 `stock/getter.py` 的单标快照调用 `https://hsmarketwg.eastmoney.com/api/SHSZQuoteSnapshot`；全市场回退经 `common/getter.py` 调用 `http://push2.eastmoney.com/api/qt/clist/get`。两条是不同接口、同属 EastMoney，不提供独立上游备用。行业板块的 `get_realtime_quotes(['行业板块'])` 也沿同一个 `clist/get` 函数；仅静态核对，不作真实来源调用或将其当作板块准入。

## 反例与修复

回退 DataFrame 里目标 `600519` 出现两条不同价格，修前运行 `./.venv/bin/pytest -q tests/test_efinance_realtime_quote.py -k duplicate_target_rows` 为 1 failed，返回首条报价。现在在原回退接缝要求目标行数恰好为一，零行或重复行均拒绝；日志只记录代码与行数。既有单标快照、ETF 禁用全市场回退及报价字段归一化保持不变。

## 验证与未完成项

- DSA 报价、Efinance 指数、Sina 指数、Tushare 指数四文件合并：35 passed、2 条第三方弃用 warning。
- 三个改动 Python 文件 `py_compile`、`git diff --check` 通过。`test_efinance_realtime_quote.py` 全文件 flake8 报既有 `E731`；生产大文件全文件 flake8 也有既有告警。本叶未改这些无关行，不宣称 lint 全绿。
- 没有新的真实请求、目标应用代码同步或 DSA 第三次完整离线门禁。运行中容器的包静态版本相同，不证明当前应用代码包含本叶修复。

R02.7 的回退真实 HTTP 传输安全、来源时刻、量额单位、完整范围/权限及 G0-M 准入仍未证明。此前单标 `600519` 真实探针不能外推到回退接口；本地反例也不能代替目标运行态验收。

## Route 来源别名待迁移

只读核对 DSA `thesis_ledger_control.py` 当前 Efinance manifest 同时声明 `efinance` 与 `eastmoney` 两个 `upstreamSources`，`thesis_ledger_provider_runtime.py` 的报价执行对两种选择均调用同一个 Efinance adapter，并把选中 `RouteTarget.upstream_source` 原样写入 `ProviderExecution`。因此选 `efinance/efinance` 时，执行元数据可能写成包装库名，不能作为实际 EastMoney 之外的独立上游证据。单改 manifest 会影响已有 Desired/Effective 路由和冻结引用；本叶未做迁移或改响应合同。后继需按现存路由清点、兼容转换、执行/冻结核验和目标验收分阶段实施，在完成前禁止把该 alias 计入独立备用。
