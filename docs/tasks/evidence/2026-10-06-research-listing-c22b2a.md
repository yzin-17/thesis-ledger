# 普通股票研究未知上市信息生产验收

日期：2026-10-06。对应 [C2.2b2a](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md) 与 [普通研究窗口规格](../../specs/2026-10-03-multi-source-remaining-acceptance.md#research-window-policy)。本叶本地生产合同通过；Server 本地准备、结果说明与目标运行态仍由后续任务验收。

## 实现与边界

既有研究入口仅对明确选择 `assume-untradable-no-bar`、固定腾讯来源、CN STOCK、`1d`、`none/qfq` 的请求允许上市信息未知。覆盖上下文的默认调用仍要求已知事实；已有事实保留原字段。未知市场信息为 `{ symbol, status: 'unknown' }`，日级信息为 `{ status: 'unknown' }`，严格拒绝附带日期或来源。

独立上市信息模块拥有已知／未知编码和日级投影；现有覆盖与日级管线消费它。未知时保留整个请求日历，不填推定上市日；标的、来源、Bar OHLC／量价、缺日分区、分页及采集／日历时钟继续校验。未知日期不免除其他事实的时间检查。公共 API 入口、来源字典、HiThink 路径、P5、路由和费用配置未改动。

移除本叶对 `thesis_ledger_market_v3_facts.py` 的函数改动后，文件 SHA-256 为 `238f93fe478e750856d3feca4946e14a3c4918105aad5f15808e127464fbb41d`，与协调基线完全一致，包括另一对话维护的 000995.SZ 上市事实。

## 定向与正式门禁

DSA 定向八个文件共 **149 项通过**，覆盖上市信息、研究日历、公共日级状态、覆盖／行情 API、日级校验、多窗口和 P5 上市回归。已有认证 HTTP 用例使用受控行情：未认证仍为 401 且不调用 Provider，600000.SH 和缺上市事实的 600519.SH 均为 200，后者返回明确未知；缺 Bar 仍只表示显式不交易假设。

```sh
cd /Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis
rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_listing_information.py tests/test_thesis_ledger_research_calendar.py tests/test_thesis_ledger_market_tradability_common.py tests/test_thesis_ledger_market_v3_calendar.py tests/test_thesis_ledger_market_v3.py tests/test_thesis_ledger_daily_tradability.py tests/test_thesis_ledger_multi_window_api.py tests/test_thesis_ledger_trading_status_listing.py -q --disable-warnings
rtk proxy .venv/bin/flake8 src/services/thesis_ledger_listing_information.py tests/test_thesis_ledger_listing_information.py
rtk proxy .venv/bin/flake8 src/services/thesis_ledger_market_v3_facts.py src/services/thesis_ledger_research_calendar.py src/services/thesis_ledger_market_tradability_input.py src/services/thesis_ledger_daily_tradability.py src/services/thesis_ledger_market_daily_tradability.py tests/test_thesis_ledger_research_calendar.py
rtk proxy env PATH=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/.venv/bin:$PATH bash scripts/ci_gate.sh all
```

两组完整 flake8 均通过。正式后端门禁退出 **0**：Python 语法、critical flake8、确定性检查及离线全包通过，**7,958 passed、626 subtests passed、1 skipped、4 deselected**，离线全包耗时 192.57 秒。跳过和 network 排除不算通过。门禁期间八份生产／测试输入未变化。[定向日志](/private/tmp/thesis-c22b2a-directed.log)、[正式日志](/private/tmp/thesis-c22b2a-gate.log)。

## 保存原文与共享消费者合同

使用 [C1 原文来源](2026-10-06-research-window-coverage-c1.md)的两组腾讯 qfq 日线，经实际 `_parse_response`、当前 coverage resolver、日级状态与公共响应投影执行两次。请求区间为 2023-07-08～09-15，均得到 **50 根**日线，交易日期 07-10～09-15，实际会话与日历一致。固定原采集时间后，两次响应完全相同；`requests.get` 与 `Session.request` 被禁止调用，HTTP 调用计数为 **0**。

| 标的 | 上市信息 | 输入指纹 |
| --- | --- | --- |
| 600000.SH | 沿用原事实，上市日 1999-11-10 | `3a8111433781d0e31745bb65106a070647e9b895449021708c75fe71a3f85236`，与 C2.1 完全一致 |
| 600519.SH | 明确未知 | `ecbff05d64602c47b03dcf4f3ab17305c48737a47cfb7d00e04f39d635097157` |

两组输出均由现有构建的 `marketDataBarSeriesRequestResponseV3Schema` 实际解析通过。Python 与 TypeScript 的规范编码 SHA-256 一致：600000.SH 为 `4df5a4aa9047f6c717ee176da5f071896066acb5a98c6f3705fc36d0b592caa9`，600519.SH 为 `5456d831a7585cd161ed4ea93a99a18c219154de9396bc95be219eab2c0cde9d`。共享已知 fixture 的原编码摘要仍为 `9b4e93931d93cece2c8492afaa79657916829291a5abf8153ce833e1d7e88703`。

[保存的请求与当前生产投影](2026-10-06-research-listing-c22b2a-input.json)可供 b2b 消费；[原文复核脚本](/private/tmp/thesis-c22b2a-captured.py)。执行封套采用 C1 保存的来源修订和受控 policy 39，不是当前目标路由状态；该证据不包含新鲜在线 Provider 请求、Server 准备或目标回测成功。

## 验证输入身份

下表为 DSA 相对路径。按路径排序，以 `路径 + NUL + 文件字节 + NUL` 拼接的聚合 SHA-256 为 `21692f2ce1c533095fa9186abd4f71429b2a82bebd488cbf9b20fd7bab7e1384`。

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/services/thesis_ledger_listing_information.py` | 50 | `c75edf56fb0f8720177ce25c20f5a555b562b81c6059bae5e70baefbbbfb56be` |
| `src/services/thesis_ledger_market_v3_facts.py` | 344 | `435d97c3a06cd19204d68f074775affc009c21e3b826ef8424b7e2f9f2af30bd` |
| `src/services/thesis_ledger_research_calendar.py` | 81 | `ccfc768d107acc77df22e3663f4f745a4413a7857e90fba10f5d14f8c8ae9b7b` |
| `src/services/thesis_ledger_market_tradability_input.py` | 37 | `0e77327dc46db13590a212e90f06ad4c07f320bafef9cd86155da6d0b87d4342` |
| `src/services/thesis_ledger_daily_tradability.py` | 79 | `5a4482ee7ef661ed8db9190a15afad0fa938c9992d7213b7b521d48b66547b0c` |
| `src/services/thesis_ledger_market_daily_tradability.py` | 51 | `1a32d620ab6965e4e9d88e2051affc7fa46d876edb481984ef9a0a2ceba4e75f` |
| `tests/test_thesis_ledger_listing_information.py` | 144 | `5e1932aada5a007344ec647db6662f3d4717bc64146fb083a4ece293bc0bdbed` |
| `tests/test_thesis_ledger_research_calendar.py` | 175 | `1b4431063ae4b8ee0e49e40451a50e763986972207608fa7ed220e0a7ceb1da7` |

## 一致性审查与后续条件

本叶本地范围通过：实现、有限来源入口、严格默认路径、已知编码、日级未知投影、保存行情、认证 HTTP、共享消费者与正式门禁已对账。b2a 已完成，b2b 的真实股票 Server 本地准备、C2.2c 的既有结果说明与 C3 的目标更新／运行／重放保持未完成。C2.2b2、C2.2b 及 C2.2 父项不勾选，不归档或移入 TODO。

本轮未更新容器、修改目标路由或数据库，也未提交／推送。后续同步须先更新 Server／共享 Schema 消费者，再更新 DSA 生产者，并与原 P5 对话约定同一目标窗口；本地生产合同通过不能代替该兼容顺序和目标验收。
