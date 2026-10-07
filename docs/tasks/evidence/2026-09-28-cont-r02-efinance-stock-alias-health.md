# Efinance 股票报价旧来源健康兼容

日期：2026-09-28。状态：本地实施完成；旧 source 完整迁移及真实来源准入保持开放。

## 合同与写集

DSA Runtime 对 `efinance × REALTIME_QUOTE × STOCK` 的旧 `efinance`、新 `eastmoney`、V1 无 source 均调用同一 `adapter.get_realtime_quote(symbol)`，选中路由原文仍用于执行来源。原健康键和进程内熔断键含 source，切换 alias 可绕开最近的 open。Spec §3.3 已先固定仅这组三种股票报价身份共用规范 `eastmoney` 健康作用域；Efinance ETF 原兼容、AKShare 股票、净值、日线及其他 Provider 不扩组。股票不启用 ETF 单标报价的 600 秒持久请求预算。

DSA 仅修改 `src/services/thesis_ledger_source_alias_identity.py`、`src/services/thesis_ledger_request_budget_keys.py`、新 `tests/test_thesis_ledger_efinance_stock_alias_health.py`、既有 `tests/test_thesis_ledger_source_alias_health.py` 的一条旧独立性断言，以及 `docs/thesis-ledger-source-capabilities.md` 的两条股票行。主仓仅修改本 Spec、Task 和本文。Control、Runtime、实际健康旧行、Desired/Effective Policy、准入及冻结源码未改；相关工作树文件均未暂存或提交。

## 红绿与验证

- 新测试修前 6 项中 5 failed、1 passed：旧/新/V1 健康 open 均未阻断另一 source，进程内连续失败可多发一次；相同 adapter 调用与股票预算原范围的对照已通过。
- 修后精确 alias 映射只影响健康读取、规范写入和进程内 circuit；最近 60 秒的任一旧 open 阻断，过期旧行原样保留并允许现有探测，新健康仅写规范键。旧 `efinance` 与新 `eastmoney` 的执行来源不改；V1 无 source 也共享股票健康身份。
- `request_budget_keys` 改为显式只对 `efinance × REALTIME_QUOTE × ETF` 合并旧/新/V1 冷却键；股票仍返回原单一键三元组，原 ETF 预算 6 项回归通过。
- DSA alias、Provider 路由/Runtime、Control V1/V3 的 8 文件定向组合：**92 passed、4 条第三方/收集 warning**。Data Gateway 相邻 **7 passed、3 条 warning**。改动 Python 文件完整 `flake8` 和编译退出 0；仓库 critical `E9,F63,F7,F82` 为 0。五份 DSA 改动文件逐行无尾随空白。

本次仅使用合成报价与隔离 SQLite，不访问真实 EastMoney、账号或目标容器，不执行此前失败且已允许重试的 DSA 官方离线全包。股票报价的时间、量额单位、源端覆盖、完整旧 alias 迁移、目标健康行与 G0-M/AC20 仍须独立验收；主 Task §13 保持未勾选。
