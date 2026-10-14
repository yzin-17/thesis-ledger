# 日级停复牌来源切片验收

> 日期：2026-10-06（Asia/Shanghai）。对应 [Spec](../../specs/2026-10-06-historical-rules-primary-backup.md) AC4 的实际来源断言及 [Task](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md) P5.1。
> 结论：P5.1 本地生产来源与跨语言 wire 合同通过。正式网关、控制目录、Snapshot/Runner、页面及真实回测尚未实施，由 P5.2～P5.4 分别承担；P5 父任务保持未完成。

## 真实来源与边界

实际读取皇台酒业 [2023-029 公告 PDF 原件](https://static.cninfo.com.cn/finalpage/2023-08-17/1217557800.PDF) 的文字与第一页图像，核对股票代码 000995、08-17 停牌一天及 08-18 开市复牌。末页落款日期 2023-08-17。只整理日级交易安排；公告涉及的风险警示、名称和价格限制变化没有进入本切片。

首个生产文件为 DSA `data_provider/trading_status/000995-2023-08-suspension.json`，支持 `000995.SZ`、2023-08-16～21，明确返回：

| 日期 | 交易状态 | 事实依据 |
| --- | --- | --- |
| 08-16 | unknown | 本公告没有证明当日状态 |
| 08-17 | suspended | 发行人明确停牌一天 |
| 08-18 | trading | 发行人明确当日开市复牌 |
| 08-19、20、21 | unknown | 不从周末、复牌安排或空记录补成正常 |

自然日分类与独立交易日历不是同一维度；unknown 不表示交易所一定开市或停牌。08-18 的日级复牌安排也不证明全天无盘中暂停。单日请求 08-17 只返回该日停牌事实，不携带未来复牌日期。

通过 DSA 已安装 BaoStock SDK 执行有界免费无凭证交叉查询，socket 超时 8 秒、外层进程 25 秒，无重试：

- `query_stock_basic('sz.000995')`：返回唯一股票，ipoDate=2000-08-07、type=1，error_code=0。
- `query_history_k_data_plus`：字段 date/code/tradestatus/isST，频率 d、adjustflag=3、区间 08-16～21，四行分别为 tradestatus=1/0/1/1、isST=1/1/0/0，error_code=0；查询后 logout。

BaoStock 查询仅用于交叉核对，不把其正常值写入官方公告包，也不将今天查询到的基础信息宣称为历史决策时已知事实。没有读取凭据、创建账户或购买数据。

## 实现

DSA `src/services/thesis_ledger_trading_status.py` 提供 98 行独立 `OfficialTradingStatusProvider.read`，只读明确选中的真实生产包，不抓公告、不联网、不切源。请求复用 V3 `kind=data` 路由，能力 `HISTORICAL_TRADING_STATUS`，身份 `official-states / cn-stock-daily-suspension`。

主仓增加 `packages/schemas/src/market-trading-status-v3.ts`、Schema 导出、定向测试及从实际生产读取器生成的 `market-trading-status-v3.response.json`。请求终点包含当日，响应按自然日完整列出已知/未知分类；已知项必须引用实际文档，unknown 不携带假事实引用。supported 表示来源可以回答这个有界分类请求，不等于全部日期状态已知。

来源 URL、标题、发行人披露性质、发布日期及内容摘要保留；当前读取得到的 fetchedAt 与历史生效日期分开。无法证明历史首次可见时间时固定标记 `historicalAvailability=notVerified`。

| 摘要口径 | 值 |
| --- | --- |
| 生产文件原字节 SHA-256 | `91eef6c73d2d54b9d8c8cdbf443d66dce2bf41a787f310de262763389ca4edba` |
| 规范化规则内容版本 | `official-trading-status-da53da5f33af4372be9e15300a05ad4fe821d6694249bfaf4d457f335f98abe8` |

原文件摘要与规范化内容摘要采用不同口径。版本不含读取时钟，重复读取内容版本稳定。生产包位于可跟踪输入目录，没有落入忽略的生成数据目录。

## 验证

| 检查 | 命令与结果 |
| --- | --- |
| DSA 定向 | `.venv/bin/python -m pytest tests/test_thesis_ledger_trading_status.py -q --disable-warnings`：12 项通过，覆盖真实切片、未知、单日无未来字段、离线/稳定摘要、错误身份/窗口、无效状态/引用及共享 wire |
| Schema 定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/market-trading-status-v3.test.ts --reporter=dot`：最终 8 项通过，覆盖原路由复用、日期分区、来源引用、未知不带事实及非法日期安全拒绝 |
| Schema 包级 | `pnpm --filter @thesis-ledger/schemas test --reporter=dot`：最终 62 文件、700 项通过 |
| Schema 静态/构建 | 同包 typecheck/build 通过 |
| DSA 包级 | `PATH=.venv/bin:$PATH bash scripts/ci_gate.sh all`：退出 0，7,885 项、626 子测试通过，1 skipped、4 deselected |
| 局部门禁 | Python flake8、TS ESLint/Prettier、import boundaries、workspace dependencies、两仓 `git diff --check`、本地文档链接与生产包 ignore 检查通过 |

审查发现 malformed 日期虽然产生 Zod 字段错误，但额外分区检查的 Date 转换仍可能抛出 RangeError。已在转换后保护无效时间，让已有日期错误正常返回，并增加反例测试；未放宽日期或数据合同。

Server、Desktop 未接入新消费者，不重复执行其全包测试；DSA runtime、Provider registry、HTTP 路由和控制目录没有变化。未操作 Docker、目标数据库、队列或浏览器，也没有调用 P4 target/replay；既有目标源和路由保持原运行状态。

## 一致性审查与后续入口

P5.1 的生产输入、来源身份、Schema、共享响应、未知语义、日期粒度、离线读取、版本和检查结果一致，声明的单一生产者/合同范围通过。没有将 fixture 或来源读取成功冒充真实回测、停牌执行或严格 PIT 验收。全部并行 dirty 修改保留；未 stage、commit、push。

下一任务 P5.2 以该已验证合同和来源模块为入口，接入正式认证 HTTP、精确目录/控制路由及中文配置标签；现有巨型 runtime 必须按 Task 的 ratchet 约束收敛职责。P5.3 再冻结来源并接入执行器已有 suspended 约束，P5.4 执行真实停复牌与 Web 验收。尚未通过的当前义务继续保留在 active Task，没有移入 TODO 或归档。
