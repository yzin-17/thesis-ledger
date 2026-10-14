# 首个停复牌标的独立上市事实交付证据

日期：2026-10-06。对应 [P5.4a](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md) 和 [主备数据源方案](../../specs/2026-10-06-historical-rules-primary-backup.md)。

## 来源与修改

实际打开皇台酒业 [2020年年度报告原件](https://static.cninfo.com.cn/finalpage/2021-04-28/1209836916.PDF)，核对印刷第6页／PDF第6页的历史股权变动段落：公司股票于2000-08-07在深圳证券交易所上市交易。报告公司信息同时对应股票代码000995。与此前BaoStock基础信息的2000-08-07交叉核对一致；本次生产登记引用发行人报告，不从行情首日推断上市日。

在DSA现有 [独立上市事实库存](../../../../daily-stock-analysis/src/services/thesis_ledger_market_v3_facts.py) 仅新增 `000995.SZ`，来源版本绑定报告 `1209836916`。`knownAt`使用2021-04-28文档日期结束后的2021-04-29零点；这是保守文档日期边界，不是2000年的首次公开时钟，也不声明报告的准确发布时间。

现有2023年八月独立交易所日历已覆盖首个状态窗口，未修改日历。覆盖上下文返回16／17／18／21四个交易所会话，17日仍是会话；个股停牌由独立公告状态约束。未知标的、月外范围和其他事实保持原行为。同步维护DSA专题说明及扁平CHANGELOG，没有新增依赖、Provider、Schema或数据库结构。

## 验证

| 检查 | 命令／输入范围 | 结果 |
| --- | --- | --- |
| 定向回归 | DSA `.venv/bin/python -m pytest tests/test_thesis_ledger_trading_status_listing.py tests/test_thesis_ledger_market_v3_calendar.py tests/test_thesis_ledger_market_v3.py tests/test_thesis_ledger_trading_status.py tests/test_thesis_ledger_trading_status_routes.py -q --disable-warnings` | 85项通过；实际上市身份／时钟、首个状态窗口覆盖及交易所17日会话保留，原股票／ETF日历、状态源和网关回归 |
| 局部静态 | 修改事实模块与新增测试的 `py_compile`、`flake8`；DSA作用域 `git diff --check` | 退出0 |
| DSA后端门禁 | cwd为DSA，以已安装 `.venv/bin` 加入PATH运行 `bash scripts/ci_gate.sh all` | 退出0；7,899项及626项子测试通过，1 skipped、4 deselected，不计真实目标验收 |

事实模块342行，新增登记6行，未改变现有覆盖或日历算法。测试与产物使用现有V3合同；Schema／Server／Desktop本轮未修改，不重跑未变输入的既有构建与包级测试。

核验后的输入身份：

| 文件 | SHA-256 |
| --- | --- |
| DSA `src/services/thesis_ledger_market_v3_facts.py` | `238f93fe478e750856d3feca4946e14a3c4918105aad5f15808e127464fbb41d` |
| DSA `tests/test_thesis_ledger_trading_status_listing.py` | `3892f181a760a6db5b1f2991477d2ac30564d3c1f69a7ab780012a7f89d2219e` |

## 目标前检查与交接

目标API健康，Schema head为 `20261006030000_strategy_authoring_save`；控制策略revision39、dsaRevision39、applied，7条原路由及收费主备保留。目标目录尚无停复牌能力，说明DSA尚未同步P5.2来源／网关；健康不能代替该能力已部署。

对现有腾讯原生日线读取器执行一次有界公开请求：`sz000995`、2023-08-16～21、qfq，成功返回16／18／21三根Bar，没有17日Bar；运输分段完成，响应身份为 `8b2c4ea56c6ca26d8b6b44ee8449fd41f499a8e0d895e14192f47fb85efb3a19`。首次调用参数名错误在发出请求前失败，按函数实际 `start_date`／`end_date` 签名修正后退出0。这是实际价格前检查，不是目标Runner验收；不能由缺Bar推断停牌，也不补17日报价。后续应核对现有普通研究缺日假设，按原下一有效开盘规则验证复牌后的成交。

只读 `docker ps` 确认DSA、Server、Worker、PostgreSQL和Redis运行健康，宿主可用约1.9GiB。没有调用Docker状态变更入口、创建策略／回测或修改配置。后续P5.4b依据最新源码、活动更新和正式预检选择入口；空间或兼容性失败不得绕过。

另一对话C1只读调查已收口，随后开始C2.1日历接缝实现，写集为独立日历helper、API入口、测试和其专题文档；不写本叶事实字典。本轮先完成事实叶，不同步尚在修改的DSA入口。已有共享CHANGELOG条目采用原位追加，其后不再写该文件；未向另一对话发送工具消息。

## 一致性审查

通过，范围为P5.4a的独立上市事实；实际文档、生产登记、时钟、日历会话与定向／后端门禁相符。本叶事实与测试哈希在门禁结束后再次核对一致，P5.4a可勾选。另一对话C2.1的实现与收口由其自身Task维护，本门禁不替它声明完成或证明后续编辑均已验证。

P5.4b目标同步／配置和P5.4c真实回测／离线重放／Web继续未完成，不凭上市登记或实际价格读取勾选父项。全部并行WIP保留，未提交、推送、清理数据或归档。回退只需撤销本叶000995精确登记及对应文档／测试改动，不删除并行代码或数据；当前未部署，不存在本叶目标运行态回退操作。
