# R06.6 / R06.7 Tushare 行业排名来源与时间边界

日期：2026-09-28。范围：只收紧现有 Tushare 行业排名的 THS / 东财分类身份与 15:30 交易日边界；不读取真实 Token、不请求 Tushare API，不授予权限或在线准入。

## 原状态

`TushareFetcher.get_sector_rankings` 已有明确顺序：
1. `moneyflow_ind_ths`
2. `moneyflow_ind_dc`

并通过 `get_trade_time(early_time="00:00", late_time="15:30")` 选择交易日。但返回行只有 `name/change_pct`，上层无法区分实际使用 THS 还是东财分类；重复行业名也由局部排序 helper 接受。

## 实现

移除函数内重复排序逻辑，复用 `sector_rankings_contract.normalize_sector_rankings`：
- THS：`source=tushare/ths:moneyflow_ind_ths`，字段 `industry/pct_change`；
- 东财：先保留 `content_type=行业` 过滤，再用 `source=tushare/eastmoney:moneyflow_ind_dc`，字段 `name/pct_change`；
- 行业名必须非空且唯一，涨跌幅必须存在可用有限值；
- THS 合同失败后仍按既有顺序回退东财，不改变请求预算或 Provider 顺序。

## 红绿与验证

原有 THS 数值测试改为要求实际 source，并新增“THS 重复行业身份 → 东财 fallback”红例。修前 **2 failed**，实现后两项通过。

随后增加板块能力自身的 15:30 回归：2026-03-17 15:00 时交易日历含 03-17/03-16，`moneyflow_ind_ths` 必须以 `trade_date=20260316` 调用，东财不得被调用；该用例通过。16:00 的既有用例继续使用 `20260317`。

完整 `test_tushare_fetcher_followups.py` **9 passed / 0 failed**；与 MarketStructure、Fundamental、AKShare/Efinance 排名合同组合曾执行 **69 passed / 0 failed**。改动范围 critical flake8、`py_compile`、`git diff --check` 均通过。`tushare_fetcher.py` 当前 1343 行，相关重构没有继续增加大文件规模。

## 保留门禁

本叶只完成 R06.6/R06.7 的本地接口身份、分类差异和交易日选择证据。真实 Token/积分权限、Tushare 源端数据发布时间、分类版本、单位/覆盖、连续可用性和 G0-M 仍未通过；THS 与东财分类不可合并成一个口径，也不能由本地 fallback 测试宣称两者经济等价。
