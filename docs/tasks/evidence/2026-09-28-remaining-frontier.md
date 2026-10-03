# S05 之外的剩余任务前沿核对

日期：2026-09-28。任务：`REM-frontier-discovery-0928`。结果：`worker_done`，仅完成有界只读盘点。主仓基线 `fe0e871e`；现有三仓 WIP 全部保留。本轮唯一写入为本文，没有运行测试、构建、Provider、浏览器、数据库或部署，没有修改主 Task、Spec 或源码。

## 结论

在已核对的当前前沿中，找到一个依赖就绪的文档叶；没有找到可以绕过来源语义缺口、直接派发的 S05 外代码叶。另列两个需先冻结契约的阻塞包。这里不是全部 M3 叶子的源码审计，也不据此断言所有未展开代码都已完成。未选择来源/消费者的叶子仍须先进行自身选择任务，不能按父组整体派发。

依据为主 Spec 全文约束、主 Task 当前执行台账、`2026-09-26-remaining-work-current.md` 与 `2026-09-26-goal-execution.md` 的最新增量，以及下列对应证据和源码。旧清单中的父项未勾选不能作为“代码缺失”的唯一证据。S05 独立历史决策窗口、证据封存和旧严格快照离线复核由另一个发现任务负责，本文不重复拆分。

## 三个候选包

### 1. F02 能力目录当前状态说明收敛：可派发文档叶

- 行为/断言：保持 P02 历史候选基线和来源准入状态，但当前阅读入口不能同时声称“所有叶子仍待分派、准入或实现”和展示已经完成的本地实现。对应 Spec §12.3、§14.2 与 AC20：逐单元区分本地实现、目标拒绝验证、真实正向准入和选择阻塞，不把实现完成写成来源就绪。
- 当前缺口证据：DSA `docs/thesis-ledger-source-capabilities.md:185` 仍使用全部叶子待分派/实现的概括；同文件 R01.10 已明确完成，RQData 最新增量已明确本地身份、事件生产入口和目标拒绝验证完成。R01.5 行仍只描述 SDK 固定第一页缺口，而 `docs/thesis-ledger-catalog-source-evidence.md:5` 已记录安全分页读取器及 19 项本地通过；解析器也已有 13 项通过。这个差异是索引状态说明缺口，不是要求重新实现读取器。
- 就绪输入：主仓当前剩余清单、RQData `2026-09-27-rqdata-event-runtime.md`、日历发布任务、DSA catalog-source-evidence；实际 `src/services/thesis_ledger_event_v3_adapters.py:20-46` 已登记 RQData cash/split，`data_provider/eastmoney_fund_catalog_reader.py:31` 已提供有界读取入口。
- 建议独占写入：`/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/docs/thesis-ledger-source-capabilities.md`。测试：无新增；其他来源证据、主 Task/Spec、manifest 和源码只读。资源：文件写入独占，不使用网络、凭据、构建输出或服务。
- 聚焦检查：逐个核对改写状态对应的已有证据与引用路径，检查中文、编号及 Markdown 表列数，执行该文件的 `rtk git diff --check -- docs/thesis-ledger-source-capabilities.md`。停止：状态摘要与当前证据一致即结束；不重写历史候选表为虚假的当前支持矩阵、不替父项勾选，也不扩展到 117 个条目的完整适配审计。

### 2. M26-b2 分红身份/币种合同：blocked，先拆契约叶

- 行为/断言：Tushare `fund_div` 的请求必须绑定实际基金代码、请求 ETF/基金身份和独立核验币种；未知时在调用前拒绝。完整事件覆盖和真实准入独立于读取成功。对应 Spec §4.1、§9，AC04、AC08、AC12、AC20。
- 当前缺口证据：`data_provider/tushare_fund_dividends.py:38-44` 仅要求调用方提供 CNY/HKD/USD，不能证明币种来源；读取器参数继续接收该字符串。主 Task M26-b2 已明确“尚缺可冻结的已核验分红币种证据”；`src/services/thesis_ledger_event_v3_adapters.py:7-46` 当前只有 EastMoney/RQData 事件目标，没有 Tushare。`.OF` 与交易所代码不可按数字部分隐式互换。
- 已就绪输入：fund_div 标准化/有界精确读取、共享事件 V3 与准入快照合同、RQData 身份原文校验模式、Tushare raw 的凭据修订机制。缺失输入：目标基金与 ETF 的权威映射、币种证据来源/格式及所接受的适用范围。RQData 证据格式不能自动赋予 Tushare 同一业务事实。
- 后续契约叶写入候选：协调者独占主 Spec/Task；来源证据只允许 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/docs/thesis-ledger-m2-source-gates.md` 中 TS-ETF-CASH 段。明确合同后再独立派发 `data_provider/tushare_fund_dividends.py`、`tushare_fund_dividend_reader.py`、对应 `tests/test_tushare_fund_dividends.py`、`tests/test_tushare_fund_dividend_reader.py` 的拒绝边界叶；事件库存和共享 Schema 另叶，不能合并包揽。
- 聚焦检查/停止：先只做证据字段和身份范围对账；没有独立币种/代码依据就返回 blocked，不添加默认 CNY、不开放事件库存。合同冻结后可用现有 `.venv/bin/python -m pytest` 定向验证错标的、错币种、范围错配和无证据零请求；这不是本轮执行命令。真实账号、部署及覆盖仍是独立门禁。

### 3. R01.5 Catalog 基金消费接线：blocked，先明确分类合同

- 行为/断言：将已实现分页读取器接入既有 Catalog 时，基金和 ETF 身份须有来源依据；不以代码前缀猜类型，不把传输全量当成历史目录。对应 Spec §8.1、§12.2，AC09、AC20。
- 当前缺口证据：`src/services/thesis_ledger_catalog.py:243-263` 仍查找目标 Efinance 0.5.9 没有的 `fund.get_realtime_quotes`；没有调用已有 `read_fund_catalog`。目录证据已明确完整新读取器三次 ReadTimeout、网络成功预算耗尽，基金/ETF 分类与消费者接线继续开放。不能再派发安全解析器/分页读取器实现，也不能重新请求相同网络前提。
- 就绪输入：`data_provider/eastmoney_fund_catalog_page.py`、`eastmoney_fund_catalog_reader.py` 和现有 Catalog 子进程硬期限、显式 instrument_type 及错误协议。缺失输入：rankhandler 的基金集合是否包含交易所 ETF、分类字段与 `MUTUAL_FUND/OF` 投影的权威边界；不能由响应代码/名称猜测。
- 后续合同叶候选路径：DSA `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/docs/thesis-ledger-catalog-source-evidence.md`，协调者维护主 Task。合同确认后代码叶独占 `src/services/thesis_ledger_catalog.py` 的 Efinance loader 和 `tests/test_thesis_ledger_catalog_sources.py`；读取器及其测试只读，必要扩展必须再拆叶。资源：Catalog 子进程 fixture，不占目标目录作业、缓存数据库或真实来源。
- 聚焦检查/停止：冻结分类/源身份与父进程期限后，再定向验证 loader 调用有界读取器、错误协议保留、完整结果原子发布与部分结果拒绝；若还需 ETF 专用来源/分类决策则 needs_split，不开放 Catalog。真实网络成功验收保持耗尽状态。

## 完整剩余范围的分类

| 范围 | 已有本地实现/局部证据 | 仍开放的性质 |
| --- | --- | --- |
| M1 契约与 D01–D03 | C03/C04 wire/兼容、精确路由与 HiThink 适配已有证据 | D01 合格真实目标 qfq、来源准入、普通回测与重放；不能用其他股票响应替代 |
| S01、S03、S04、S06–S09、B01–B05 | 持久化、日期缓存、整窗主备、依赖计划、预检失效、冻结、执行/终态、领域数学和本地装配已有实现；S09 定向 51 项及后续回归有记录 | 当前集成/目标/真实来源独立验收；I01 完整响应 JSONB 哈希往返仍是既有阻塞，不能据 Parquet 或其他 JSON 路径代替 |
| S05 | 重建输入合同、内容绑定、来源时钟必要条件、预检/冻结写入门禁和目标受控拒绝已实现 | 独立历史决策窗口、真实来源版本、合格证据封存、旧严格 V3 离线重验归并行 S05 任务 |
| A01–A03、U01–U05 | 候选比较绑定、封存生命周期/隔离数据库、风险重编译、预检消费、结果披露及 U04 窗口 API/UI 已有局部证据 | 真实来源/Worker/AI、可信证明审核挂载撤销、目标图表/Electron；父项未闭不等于重做界面 |
| M21–M24 | 单位契约和冻结、拆分映射存储/事件接线/冻结、分红 V3 聚合、Tushare raw 精确入口/凭据/分页/日历本地闭环完成 | ETF 未知单位、真实事件历史完整性、raw 权限/覆盖及目标来源门禁 |
| M25、M26、M32 | 因子原始读取、分红标准化/读取、派生计算/快照/持久化/基础证据接缝完成 | 因子锚点/修订/转换依据、分红身份/币种/覆盖合同，以及真实 Reader 派生准入仍未完成；不能伪造锚点或币种以接线 |
| M27、M28、M31、M34 | 仅候选与门禁范围；不能从社区 Pytdx 推断官方 TdxAiData | SDK/endpoint/授权/CPU 与系统依赖未固定；HiThink 分红 endpoint 未选，不是本轮可直接实现叶 |
| M29/M30 | RQData credentials、spawn 隔离、身份原文合同/消费及生产事件 runtime 本地和目标拒绝已完成 | 实际映射/币种审核、账号权限/历史覆盖和目标正向门禁，不再列为本地账号或事件接线缺失 |
| M3 R01–R07、R08 | 名称单标/Manager、日历发布、持仓行校验、报价及目录部分实现已有独立记录 | 历史上市状态 Consumer、基金分类、其他待选 endpoint/字段/消费者、真实逐单元准入；R08 无可信镜像/许可前不激活。116 固定叶及模板仍保留，不能由本次有界核对宣布全部完成 |
| F01/F02、最终终审 | 保留数据升级/协议/健康及文档一致性已有证据，F02-b 版本说明已完成 | 完整部署/来源/运行/UI/AI 门禁与 AC01–AC20 对账；文档当前状态索引可先收敛，父项最终收口仍依赖前置项 |

本轮不重试：I01 JSONB 完整响应、HiThink 159516 qfq、BaoStock 批量身份、Catalog 网络、AI SDK G1 和浏览器 localhost `ERR_BLOCKED_BY_CLIENT`。这些已有耗尽预算或明确阻塞，必须先获得改变前提的输入，不能将新任务编号视为重置预算。

## 核对边界

本轮只读核对了上述前沿的实际入口；没有全仓探索或新增范围。最相关证据：`2026-09-27-f02-document-consistency.md`、`2026-09-27-source-field-units.md`、`2026-09-27-s09-execution-audit.md`、当前剩余清单和 DSA 两份来源目录证据。主 Spec §12.3 要求分层状态，本表遵循该要求，不给整体完成百分比。
