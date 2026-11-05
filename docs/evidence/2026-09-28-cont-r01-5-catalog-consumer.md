# R01.5 开放基金目录分类与 Catalog 消费接线

日期：2026-09-28。范围：只完成 EastMoney 开放基金 rankhandler 的分类合同与现有 Catalog 消费接线；不重置已耗尽的真实完整读取预算，不宣称来源在线、历史目录完整或 ETF 目录可用。

## 分类合同

当前 EastMoney 基金排行页面把“开放基金排行”和“场内交易基金排行”分开展示。当前宿主 AKShare 1.18.94 的 `fund_open_fund_rank_em` 源码同样把目标声明为“开放基金排行”，其“全部”类型显式使用 `dt=kf,ft=all` 请求 `rankhandler.aspx`。

据此，Spec 与 DSA 能力目录固定本叶边界：

- Reader 请求显式带 `dt=kf,ft=all`；
- 只有该开放基金范围可投影为 `MUTUAL_FUND / OF`；
- 不按六位代码、名称、`etf_count` 或其他聚合计数推断 ETF；
- 场内 ETF 目录继续要求独立来源/分类证据；
- 当前抓取时刻不构成历史身份或目录可见时刻。

参考：
- https://fund.eastmoney.com/data/fundranking.html
- https://akshare.akfamily.xyz/data/fund/fund_public.html

## 实现

DSA `data_provider/eastmoney_fund_catalog_reader.py` 的实际 `_fetch_page` 增加 `ft=all`，原 HTTPS、禁止重定向、流式 8 MiB 上限、剩余预算 timeout 与分页完整性合同不变。

DSA `src/services/thesis_ledger_catalog.py` 在 Efinance 0.5.9 缺少 `fund.get_realtime_quotes` 时调用既有有界 `read_fund_catalog(timeout_seconds=45)`。若未来/其他版本存在原生基金目录方法，继续优先原生方法，不重复请求 fallback。

fallback 再次核对 Reader 边界：必须是非空冻结 tuple、每行二元组、六位 ASCII 数字代码、非空名称、代码唯一；全部投影为 `MUTUAL_FUND/OF`。Reader 协议/分页 ValueError 映射为不可重试 `catalog_provider_invalid_response`；总截止时间映射为可重试 `catalog_provider_timeout`。

该调用仍位于现有 Catalog spawn 子进程，因此股票读取与基金 fallback 共用父进程硬期限。基金失败会使整个 Efinance Provider snapshot 失败，不会先发布股票部分目录；跨 Provider 优先级与来源原子发布语义不变。

## 红绿与验证

新增合同先运行得到 **5 failed / 1 passed**：缺 `ft=all` 两项、缺 fallback 一项、错误映射两项；原生基金方法优先级用例已通过。实现后同 6 项全部通过，并补 Consumer 冻结行形状、坏代码、空名称和重复代码拒绝。

最终定向：`test_eastmoney_fund_catalog_page.py`、`test_eastmoney_fund_catalog_reader.py`、`test_thesis_ledger_catalog_sources.py`、`test_thesis_ledger_catalog.py`、`test_thesis_ledger_catalog_job.py`，**68 passed / 0 failed**。

质量检查：改动 reader/tests 完整 flake8 0；Catalog 及全部改动文件 E9/F63/F7/F82 为 0；4 个改动 Python 文件 `py_compile` 为 0；tracked `git diff --check` 为 0。测试全部使用离线 fixture/mock，没有再次访问 EastMoney。

## 保留门禁

此前真实完整新 Reader 的首次及两次重试均为 `ReadTimeout`，预算已耗尽；本叶不因代码接通而重置。故 `R01.5-pagination` 父项仍不勾选：真实目标完整读取、连续可用性、完整覆盖与历史目录资格仍未通过。

本叶只关闭本地 `R01.5-catalog-consumer` 子项；G-M3 与最终 AC20 继续按真实待验证状态验收。
