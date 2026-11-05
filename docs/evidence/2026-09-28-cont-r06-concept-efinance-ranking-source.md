# R06.5 / R06.9 排名来源身份续接

日期：2026-09-28。范围：复用已建立的 `sector_rankings_contract`，继续收紧 AKShare 概念板块与 Efinance 行业板块的实际来源身份；全部验证为本地合成/静态源码，不请求真实行情。

## R06.9 AKShare 概念板块

原 `get_concept_rankings` 直接处理 `stock_board_concept_name_em`，只返回 `name/change_pct`，重复概念名可被接受。

新增两条红例：缺实际 source、重复概念身份。修前 **2 failed**，改为复用同一纯 helper 后 **2 passed**：
- 返回 `source=akshare/eastmoney:stock_board_concept_name_em`；
- 概念名非空且唯一；
- 涨跌幅只消费有限数值；
- 原返回结构的 `name/change_pct` 保持。

安装版 AKShare 静态链：公开函数指向 EastMoney 概念板块页；内部 `_fetch_stock_board_concept_name_em` 在 `79.push2.eastmoney.com`、`17.push2.eastmoney.com`、`push2.eastmoney.com` 的 `/api/qt/clist/get` 间选择。未实际请求这些地址。

## R06.5 Efinance 行业板块

原 `EfinanceFetcher.get_sector_rankings` 调用 `ef.stock.get_realtime_quotes(['行业板块'])`，同样只返回匿名排名行，重复行业名可被接受。

新增三条专属用例，修前 **2 failed / 1 passed**，接入同一 pure helper 后 **3 passed**：
- 中文列与兼容 `name/pct_chg` 列均保留；
- 重复行业身份拒绝；
- 返回 `source=efinance/eastmoney:get_realtime_quotes(行业板块)`。

当前安装版 efinance 0.5.9 静态源码确认：`get_realtime_quotes` 将 `行业板块` 转为内部 FS 过滤，底层 `get_realtime_quotes_by_fs` 请求 `http://push2.eastmoney.com/api/qt/clist/get`。因此本地合同明确 R06.5 与 R06.3 的包装不同但实际上游同属 EastMoney，不能计为独立备用。

## 合并验证

`test_market_structure_service.py`、`test_fundamental_context.py`、Akshare 排名合同与 Efinance 排名合同合计 **61 passed / 0 failed**。修改文件 critical flake8、`py_compile`、`git diff --check` 均通过。

复杂度 ratchet：
- `akshare_fetcher.py`：本轮相关修改前 2630 行，当前 2594 行；
- `efinance_fetcher.py`：当前 1422 行；
- 新 pure helper：59 行。

## 保留门禁

本轮只证明当前源码的 endpoint 身份、行校验与实际 source 标签。R06.5/R06.9 的真实响应、来源时点/as-of、分类版本、单位、覆盖、目标运行与 G0-M 仍未通过；同属 EastMoney 的 AKShare/Efinance 入口不得用于 G-M2-Fallback 的“独立上游”证明。
