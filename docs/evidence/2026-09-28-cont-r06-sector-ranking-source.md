# R06.3 / R06.4 行业板块排名来源身份收敛

日期：2026-09-28。范围：只收紧既有 `AkshareFetcher.get_sector_rankings` 的 EastMoney / Sina 上游身份与行合同；不调用真实来源，不授予实时性、单位、覆盖或 G0-M 准入。

## 发现

原实现把两个实际来源隐藏在同一个 AkshareFetcher 内：

1. `stock_board_industry_name_em`
2. `stock_sector_spot(indicator="行业")`

返回行只有 `name/change_pct`，上层只能知道 Akshare 成功，无法知道实际使用 EastMoney 还是 Sina。重复板块名也可直接作为 EastMoney 成功结果返回。

当前安装版 AKShare 静态源码核对：
- EastMoney 行业列表：`https://17.push2.eastmoney.com/api/qt/clist/get`
- Sina `indicator=行业`：`http://money.finance.sina.com.cn/q/view/newFLJK.php`，参数 `param=industry`

该静态核对没有发网络请求，也不证明目标运行版本、来源时点或数据许可。

## 实现

新增 `data_provider/sector_rankings_contract.py` 纯 helper：
- 要求来源声明的板块名/涨跌幅列存在；
- 板块名必须非空且唯一；
- 涨跌幅仅保留可解析有限数值，全部不可用则拒绝；
- 返回现有 `name/change_pct`，并附加稳定 `source`。

`AkshareFetcher.get_sector_rankings` 继续保持 EastMoney → Sina 顺序，不增加请求次数：
- EastMoney 返回 `source=akshare/eastmoney:stock_board_industry_name_em`
- Sina 返回 `source=akshare/sina:stock_sector_spot`

EastMoney 响应合同错误仍可进入既有 Sina 回退，但回退成功会明确标成 Sina，不再冒充第一来源。两个来源均失败时仍按既有 API 返回 `None`。

大文件职责没有继续膨胀：`akshare_fetcher.py` 从本轮修改前 2630 行降为 2612 行，校验职责放入 59 行独立 helper。

## 红绿与验证

专属新测试修前 **3 failed / 4 passed**：
- EastMoney 缺实际 source；
- Sina fallback 缺实际 source；
- 重复 EastMoney 板块名被错误接受。

修后专属 **7 passed / 0 failed**。相邻 `test_market_structure_service.py`、`test_fundamental_context.py` 与专属测试合计 **56 passed / 0 failed**，证明现有 MarketAnalyzer/研究消费者继续兼容额外 source 字段。

质量检查：
- 修改文件 `flake8 --select=E9,F63,F7,F82` 通过；
- `py_compile` 通过；
- `git diff --check` 通过。

## 保留门禁

本叶只完成 R06.3/R06.4 的本地 endpoint 身份、回退位置和行选择合同。真实响应、分类版本、来源快照时点/as-of、涨跌幅单位/覆盖、HTTP 传输安全与 G0-M 仍未验证，因此两项不宣称在线可用，G-M3/AC20 继续开放。
