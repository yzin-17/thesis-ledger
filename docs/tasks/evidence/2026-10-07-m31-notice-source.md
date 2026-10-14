# M31-r1：有界公告现金事件来源交付证据

> 日期：2026-10-07；关联：[多源剩余 Task](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md)、[Spec 的 M31 执行基线](../../specs/2026-10-03-multi-source-remaining-acceptance.md)。
> 状态：M31-r1 来源叶本地交付通过，最终 DSA 后端门禁退出 0。M31 产品闭环未验收。

## 真实输入核实

本轮使用内置 PDF 依赖实际下载并解析[管理人分红公告](https://static.cninfo.com.cn/finalpage/2023-01-09/1215552905.PDF)三页及[2023 年年报](https://www.sse.com.cn/disclosure/fund/announcement/c/new/2024-03-30/510300_20240330_437H.pdf)第 52 页。公告明确基金主代码 510300、ETF 名称、人民币金额、上海交易所登记资格、每十份 0.6400 元及登记/除息/发放日期 01-13/16/19；年报利润分配表只有这一行及合计，独立确认现金分配已发生。没有把过去的发放计划日期单独当成实施证明。

| 原件 | 字节数 | SHA-256 | 实际核验时间（UTC） |
| --- | ---: | --- | --- |
| 分红公告 | 68,208 | `68f2227ae25acec3b831d50d042b87f12696dc0df1514ef9dacb36e018d571d7` | `2026-10-06T18:31:16.117954+00:00` |
| 2023 年年报 | 871,278 | `cbe1900cb617a67a804dc463e6658f662917b04361266bef51b7bd139a6433be` | `2026-10-06T18:31:16.730840+00:00` |

以上对应北京时间 2026-10-07 02:31。首次系统 Python 缺 `pypdf`，随后改用已提供的内置 PDF runtime 成功，无安装依赖；Web PDF 读取超时未当作成功，实际 PDF 正文由本轮独立解析取得。没有新请求 HiThink、腾讯或已跳过的付费来源，未加入 PDF 二进制产物。

## 来源交付与语义

DSA 新增来源包 `data_provider/cash_distributions/510300-2023-01.json`、读取器 `src/services/thesis_ledger_notice_dividends.py`、专属回归测试与 `docs/thesis-ledger-notice-dividends.md`，在原 CHANGELOG 的 Unreleased 中追加一条。主仓更新已有成对 Spec/Task，以 M31-r1～r5b 分别拥有来源、网关、现金模型、冻结执行、结果消费、目标与页面门禁；未创建竞争任务状态表。

来源仅承诺 `510300.SH / 2023-01-03..2023-02-01` 的现金分配及其子窗口。用 Decimal 将每十份金额转换成每份 `0.064 CNY`；有效日期是除息日，登记/发放日独立保留。年报确认的是现金覆盖，不签发拆分覆盖。源事实的 `availableAt` 使用两份证据均实际核验后的时刻，读取时间另放 `fetchedAt`；不生成历史策略可见性。

原字节 SHA-256 构成稳定来源修订，跨读取时间不改变事实身份；包内容或引用变化生成新修订。内部观察包含来源文档/覆盖依据，不是 V3 网关响应、不含准入。r2 须将这一精确来源包原文与修订绑定至现有准入/冻结路径，不能直接将内部 `coverage.complete` 当作生产可消费的完整响应。

错误路径覆盖精确证券、日期/窗口、冻结截点、人民币和每十份单位、非法/重复日期、缺来源/年报/摘要/页码、事件清单与覆盖不一致、重复 JSON 字段、错误身份/列表类型及缺文件；均明确拒绝，不返回伪完整空集。

## 验证与最终基线

执行目录为 `daily-stock-analysis`，通过 RTK 使用仓库 `.venv`：

- 最终定向与相邻事件测试：`.venv/bin/python -m pytest tests/test_thesis_ledger_notice_dividends.py tests/test_hithink_fund_dividends.py tests/test_thesis_ledger_hithink_events_v3.py tests/test_thesis_ledger_events_v3.py -q --tb=short`，91 项通过，其中本叶 50 项。包含实际包读取、每十份换算、整数尾零/细小金额、查询空子窗口及原字节修订/时钟分离等断言。
- 最终专属 Python 语法与完整 flake8：通过，无忽略或阈值调整。
- 实际 DSA 生产读取器 → 主仓已构建的 `corporateActionFactSchema`：一个实际标准化事实通过严格 parse；没有拿独立 mock 代替生产输出。它只证明事实合同，尚不证明 V3 exchange/准入。
- Spec/Task、来源说明与 JSON 的项目锁定 Prettier 检查通过；数据包/源码/测试均未被 Git 忽略，diff 空白检查通过。
- 首次 `./scripts/ci_gate.sh all` 退出 0：8,004 passed、626 subtests、1 skipped、4 deselected。运行期间的自审随后强化身份/标题/列表类型拒绝，局部复验 91 项通过；首次结果不冒充最终基线。使用最终代码重新执行同一门禁退出 0：8,008 passed、626 subtests、1 skipped、4 deselected，离线测试耗时 186.98 秒；日志为 `/tmp/m31-r1-backend-final.log`。语法、关键 flake8、既有确定性检查与离线套件均通过，未新增跳过。

| 最终输入 | SHA-256 |
| --- | --- |
| 来源包 | `924ca0ef585cbc044a34cc552ec0a17b24645a63ecbfec4df9fa01ded414cfa3` |
| 读取器 | `02527fefff562bb19c499d5be3014e990bebead5c5724ac95b2ae70f0dd8af23` |
| 专属测试 | `761f119bb5193583ecb5a52edfba0ee49d9c750acdeb5e501ec309d7d2cb53d1` |

## 一致性审查与交接

已对照真实输入、金额/日期、公开身份与币种、来源原件摘要、独立现金覆盖、标准化事实、错误路径和 Spec/Task 分工。代码 150 行、专属测试 144 行，未触及存量大文件或提高门禁阈值。原有及其他对话 dirty 修改保留，未 stage/commit/push。

最终一致性审查结论：r1 的声明范围通过，最后门禁前后三个输入摘要保持一致，无在途进程。r2～r5b 尚未实施；无 Docker、数据库、路由策略或目标运行态变更。原 HiThink 数字进度/全历史门禁不变；P6/M32/R02/S05/F01 未关闭。下一独立叶为 r2，开始前须固定 V3 原文绑定/准入合同及共享写集；现金资格与时点模型由 r3a 独立负责，不能把源日期齐备当作入账正确。
