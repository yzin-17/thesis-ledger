# 东财股票与 ETF 报价唯一原行实施证据

日期：2026-09-28。所有者：`cont_quote_final`。归属主 Spec §3.3、主 Task §12.9 的 `R02.5/R02.6-eastmoney-quote-unique-row`；准备合同见 [接续验收前沿](2026-09-28-cont-acceptance-frontier.md)。本叶状态为 `worker_done`，只关闭本地唯一行约束，不关闭 R02 父单元、G-M3、AC20 或整体验收。

## 写入范围与行为

独占写入 DSA `data_provider/eastmoney_quote_identity.py`、`tests/test_eastmoney_quote_identity.py`、`data_provider/akshare_fetcher.py` 的必要 import 与股票/ETF 两个行选择接缝，以及本文。其他源码、测试、共享文档均只读；未 stage、提交、重置或覆盖既有 dirty WIP。未创建子代理。

`unique_quote_row` 仅接受原字符串 ASCII 六位请求代码，原 `代码` 列必须恰好存在一次，并且目标必须只有一个精确字符串匹配行。缺列、缺目标、空表、重复目标（同值或冲突）以及 numeric、Unicode、空白近似代码均拒绝。合法结果直接返回原 Series，不转换代码、不猜场所；其他标的存在不妨碍唯一目标。

两个实际 Fetcher 方法继续使用原 SDK endpoint、缓存、重试、breaker、字段转换和返回类型。身份不合格返回既有不可用结果；本叶未移动传输成功时点，因此源级 `record_success` 仍只代表既有传输成功，不能充当目标报价身份、单位或来源时点证据。大文件 2633→2630 行，净减少 3 行。

## 本地验证

所有命令在 DSA 根目录执行，使用既有 `.venv`，无安装或构建。以下命令均已退出：

| 命令 | 输入范围与结果 |
| --- | --- |
| `rtk proxy .venv/bin/python -m pytest tests/test_eastmoney_quote_identity.py -q` | 新测试 59 项通过；实际股票/ETF getter、冷 SDK 与缓存命中、重复同值/冲突、错码、缺列、空表、非法请求均覆盖；合法行保持价格、量、额、开盘、涨跌幅和未知来源时间；伪 SDK，不是官方来源原样 fixture |
| `rtk proxy .venv/bin/python -m pytest tests/test_tencent_quote_identity.py tests/test_efinance_realtime_quote.py tests/test_akshare_realtime_logging.py tests/test_realtime_quote_fallback_logging.py -q` | 关联 45 项通过，只有既有依赖弃用警告 |
| `rtk proxy .venv/bin/python -m flake8 data_provider/eastmoney_quote_identity.py tests/test_eastmoney_quote_identity.py` | 新 owned 文件 0 告警 |
| `rtk proxy .venv/bin/python -m flake8 data_provider/akshare_fetcher.py --count --statistics` | 整文件退出 1，200 条存量风格债；不能称整文件 lint 通过 |
| `rtk proxy .venv/bin/python -m flake8 . --count --select=E9,F63,F7,F82 --statistics` | 项目 critical 检查退出 0，0 告警 |
| `rtk proxy .venv/bin/python -m py_compile data_provider/eastmoney_quote_identity.py data_provider/akshare_fetcher.py tests/test_eastmoney_quote_identity.py` | scoped compile 通过 |
| `rtk proxy .venv/bin/python /private/tmp/cont-em-quote-check.py` | 恢复本叶前字节输入并核对 SHA-256；原风格债 202→200，无新增诊断；大文件 owned 行 lint/空白 0，新文件空白 0，行数 ratchet 2633→2630 |

检查脚本是临时只读验证工具，SHA-256 为 `5a9bda92ce9ca0aacc909d97f458a75016285d8af46482439580c4515782f838`，不进入源码或产品运行路径。此前内联核对有两次断言失败：一次恢复文本匹配不精确，一次误把移除两条 W293 也要求诊断完全相等；核对改为精确字节恢复及新增诊断计数后通过。没有生产源码失败、没有测试重试、没有来源重试。临时脚本保留用于复核。

## 输入摘要

| 文件 | SHA-256 |
| --- | --- |
| `data_provider/akshare_fetcher.py` 分派前 | `abb60ee7c54661f53e81babf6186bf183aa5aae4d455e3e8d5c820cc09da566c` |
| `data_provider/akshare_fetcher.py` 交还时 | `216cde9232b86da25d7fbce64c268354ec1afebae1ced1dd96876f9f42cb7a2e` |
| `data_provider/eastmoney_quote_identity.py` | `0102072ad492ebf830545548baa7d4d9c3650b327095d97b50c62048d901a423` |
| `tests/test_eastmoney_quote_identity.py` | `d7f8a6081fee2fc2a7bfe116a79b386860217d596f994e7efbd572d4b058958b` |
| `tests/test_tencent_quote_identity.py` | `42186a343ece0f06e8aeb778d27e59569709f556e9c28980a88a604da95500b9` |
| `tests/test_efinance_realtime_quote.py` | `ab8bd5f481895e114bb990b6e5b118bd1a9c6a98cf203ce0be9b092317c215dd` |
| `tests/test_akshare_realtime_logging.py` | `3c1ecf24de913f5e982b8a9e72dddf27faef80b6b654006119da40e94b78382b` |
| `tests/test_realtime_quote_fallback_logging.py` | `f507fc4c573ca59b691675bb858885af588e078e852ae9cb3b363064dbc0b8e4` |

四份关联测试摘要与分派前一致。检查适用于上述输入；后续源码或依赖变化时按实际影响重验。

## 剩余准入与交还

真实来源请求 0、账号访问 0、数据库/目标环境/镜像/完整包测试 0；此前请求账本与耗尽预算保持不变。本叶未证明东财量额单位、来源日期/时点、实时性、完整覆盖或真实准入，也不改变它们的开放状态。共享 Task、来源 evidence、CHANGELOG 和能力目录由协调者统一维护。

全部进程已结束，无后台会话；源码及本文写权交还协调者，不自领下一项。回滚仅涉及上述 helper/test、import 和两个行选择替换，须保留其他 WIP；未执行回滚。
