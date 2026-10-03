# R06.8 TickFlow SW1 行业排名横截面合同

日期：2026-09-28。范围：收紧既有 TickFlow `universes.list/batch + quotes.get` 的 SW1 派生排名来源与 provider as-of；不请求真实 SDK、账号或套餐，不授予 G0-M。

## 原状态

既有实现会：
- 读取 `CN_Equity_SW1_*` universe；
- 合并同名 SW1 universe 的成分；
- 从 CN 全市场 quote 计算成分股涨跌幅均值；
- 返回 `source=tickflow_sw1`、`constituent_count` 并缓存。

但 source 没有绑定实际三段输入，且参与横截面计算的 quote 即使 provider timestamp 不一致仍会被混合；因此不能可靠声明 ranking 的 as-of。

## 实现

保留原 universe 与均值算法，仅增加横截面资格：
- 为每个可用 quote 使用既有 `_format_provider_timestamp` 规范化 `timestamp/time/ts`；
- 只针对实际属于 SW1 成分且有涨跌幅的 quote 建立 ranking symbol 集合；
- 任一参与 symbol 缺 provider timestamp，或参与 quote 的规范时间不完全相同，整个排名返回 `None`；
- 成功结果统一携带 `as_of=<provider timestamp>`；
- `source=tickflow/sw1:universes.list+universes.batch+quotes.get`；
- `classification=SW1`，`classification_version=None`，不从 universe ID 猜版本。

## 红绿与验证

更新既有 SW1 聚合测试要求精确 source、SW1 分类、未知版本和 `2024-01-02T00:00:00+00:00` provider as-of；新增混合 1 秒 quote timestamp 的拒绝反例。修前 **2 failed**，实现后两项通过。

完整 `test_tickflow_fetcher.py` 与当前 Tushare/AKShare/Efinance 板块合同、MarketStructure/Fundamental 组合共 **89 passed / 0 failed**。修改范围 critical flake8、`py_compile`、`git diff --check` 均通过。`tickflow_fetcher.py` 当前 1252 行；本叶只增必要横截面资格，不改变权限负缓存、universe 合并或缓存 TTL。

## 保留门禁

本叶不证明 TickFlow SDK/套餐可访问 SW1 universes，也不证明 SW1 分类版本、quote timestamp 的源端公布语义、单位或目标运行覆盖。`classification_version` 明确保留未知。R06.8 的本地实现证据可登记，但真实权限、分类版本和快照时点资格仍由 G0-M/G-M3 验收。
