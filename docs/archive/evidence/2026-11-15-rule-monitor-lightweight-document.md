# 规则监测轻量正文验证记录

规格见[轻量正文规格](../../specs/2026-11-15-rule-monitor-lightweight-document.md)，状态见[已归档任务](../tasks/2026-11-15-rule-monitor-lightweight-document.md)。

## 原因与官方正文核验

原始全部来源检查 `6fed1d2d-a591-41ea-bb2e-8e26a51ebb1d` 已持久化为 `partial`，唯一失败 PDF 影响三个美股来源。原始检查与后续诊断见[原始记录](../../evidence/2026-11-15-rule-monitor-live-all-sources.md)，其事实保持原样。

- 替代正文：[govinfo HTML](https://www.govinfo.gov/content/pkg/FR-2004-07-07/html/04-15081.htm)。
- 同文档身份：`FR Doc No: 04-15081`，2004-07-07，`Release No. 34-49928`，标题 `Collection Practices Under Section 31 of the Exchange Act`，页码 41060–41087；正文包含收费日期与结算日期的定义。发布身份也与 [SEC 官方发布件](https://www.sec.gov/files/rules/final/34-49928.pdf) 对应。
- 容器 `thesis-ledger-dev-dsa-1` 使用现有 `fetch_document` 直接读取上述 HTML，耗时 1.839 秒，在现有 15 秒、2 MiB 限制内成功；快照格式 `html`，正文176706字符，`snapshotReason=null`。
- 原始摘要：`b09980d6a38457aee361cb3f50dc650faba147c94d538201ba8d3d9e0d014699`；规范正文摘要：`cf6fe04c070a012830e28bbe33accf7c548789a229cd52b76651dd007fa73978`。
- 此次核验是外部只读请求，不写入业务任务或观察；生产运行结果由同步后的一次正式检查独立确认。

## 修改范围

DSA `rule_monitor_registry.py` 仅为这一完整 PDF URL 登记同文档 HTML 的精确监测读取映射；三个收费来源共用。原地址和映射结果均通过既有安全校验，原收费资料包的 URL、摘要、观察时间、费率、资料包指纹及快照保持原值。原 PDF 观察与失败历史保留，新 HTML 建立独立正文基准。

没有修改读取器、任务时限或阈值：300 秒总读取、15 秒单件、3 秒连接、2 MiB 正文、无重定向、无自动重试、串行与结果释放继续使用既有实现。

## 本地回归

- 定向命令：`.venv/bin/python -m pytest tests/test_rule_monitor_official_text.py tests/test_rule_monitor_fetch.py tests/test_rule_monitor_execution.py tests/test_rule_monitor_history.py -q`，29 项通过。
- 相关命令：`.venv/bin/python -m pytest tests/test_rule_monitor_*.py tests/test_local_rule_demand_refresh.py tests/test_thesis_ledger_*public_fee*.py -q`，158 项通过。日志 `/tmp/rule-monitor-lightweight-tests.log`。
- 受控回归覆盖三个来源全部采用 HTML、共享地址只读一次、原资料包字段和摘要保留、原始 PDF 失败不被新 HTML 成功覆盖、HTTP 失败、超限、反爬正文、超时、认证隔离与重定向。
- 第一轮新增测试因受控响应遗漏 `Content-Type: text/html` 而失败；补齐与真实响应一致的类型后，定向及相关回归均通过，此失败属于测试输入，不是实际来源执行结果。
- `py_compile` 与关键 flake8 检查通过；`check_data_service_boundary.py --syntax`、`check_thesis_ledger_capability_boundaries.py`、`check_data_runtime_contract.py`、`data_test_scope.py` 均通过，新增测试已登记，测试目标452项。
- 仅 DSA 目录读取投影和测试变化，不涉及客户端、Server合同、数据库或依赖；未重复无相关输入变化的前端构建。

## 本地同步与真实执行

- 宿主目录实现 SHA-256：`8e1188a156424d18c7d2bcb2e7042a2074baa3099e6b13fd4511f84c8d4136a4`。
- 原始失败运行的 `runs`、`run_failures`、`run_metadata` 按字段排序序列化摘要：`7875554cce6e005bdec69f33ad3a77010ea84900fabc14a85f4a38ab430fdca7`，用于最终确认历史保持不变。
- 首次同步从 infra 目录执行 `./scripts/sync-code.sh dsa`，退出1：工作区已有活动维护锁，持有者是另一项回测验收。未绕过锁，也未改变容器；等待其结束后重走正式入口。日志 `/tmp/rule-monitor-lightweight-sync.log`。

- 第二次入口尝试仍被另一轮活动回测验收锁拒绝，日志 `/tmp/rule-monitor-lightweight-sync-retry.log`；两次拒绝均未修改容器。
- 锁释放后，从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh dsa`，退出0，无跳过门禁参数；日志 `/tmp/rule-monitor-lightweight-sync-final.log`。未修改数据库结构或外部卷。
- 独立只读核验：容器目录实现摘要与上列宿主值一致，10个来源、29个去重文档，三个美股来源统一使用HTML，活动目录不再请求旧PDF；DSA容器健康。
- 运行镜像仍为 `sha256:24c71dc2c20cb607e9310c15ffefbc651074565cb7b9c408b3ad25f2e5a4760a`。此次为代码快更，变化位于容器可写层，未构建新镜像。
- 同步后通过 Server `POST /api/market-data/rule-monitor/checks` 发起一次真实检查，HTTP 201，请求标识 `3b706028-91e9-463b-be00-835ea180f693`，创建时间2026-11-15 18:46:38（Asia/Shanghai）。`sourceIds` 取同次状态返回的全部10个来源。
- 发起前配置仍为修订4、启用、保存来源9个、计划`0 0 * * 1`、时区`Asia/Shanghai`，下一次计划时间不变。

## 同步后的真实检查结果

- 执行标识：`3b706028-91e9-463b-be00-835ea180f693`，`attempt=1`。
- 开始：2026-11-15 18:46:38.381942；结束：18:48:25.398210（Asia/Shanghai）；耗时107.016秒。
- 终态：`partial`，29个去重文档全部检查，成功28个，失败1个，材料指纹变化1个，运行级错误为空。
- 修复目标：govinfo HTML 在18:47:22.389691成功入库，建立首次版本基准，摘要与预核验相同。持久化正文176706字符，包含文档编号、发布编号、收费日期与结算日期定义，快照可用。
- Server正式版本详情接口返回HTTP 200，正文176706字符及上述关键身份、定义可通过消费接口读取。
- 只读SQLite复核：本轮终态、29个文档统计及唯一失败明细与HTTP一致；原始失败运行的三表摘要仍为上列`7875554c…30fdca7`完整值，历史未改写。
- 保存配置仍为修订4、9个来源、原启停和计划，下一执行时间保持不变。

| 来源 | 成功文档／归属文档 | 本轮结果 |
| --- | --- | --- |
| 上交所股票收费主源 | 6／6 | 全部可读 |
| 上交所股票收费备用 | 6／6 | 全部可读 |
| 港股交易费 | 2／2 | 全部可读 |
| 港股扩展公共收费 | 5／5 | 全部可读 |
| 美股Section31 | 4／4 | 全部可读，govinfo正文替换成功 |
| 美股扩展公共收费 | 5／6 | govinfo正文成功，FINRA费率表失败 |
| 上交所ETF经手费 | 2／2 | 全部可读 |
| 港股ETF公共收费 | 5／5 | 全部可读 |
| 美股ETF公共收费 | 6／7 | govinfo正文成功，FINRA费率表失败 |
| 美国当前现金证券执行规则 | 6／6 | 全部可读 |

各来源包含共享文档，表中计数不能相加作为请求数。本轮8个来源全部可读，2个来源受同一个新增失败影响。

## 本轮新增失败的排查

唯一失败为 [FINRA 2020年费率规划表](https://www.finra.org/sites/default/files/2020-10/SR-FINRA-2020-032.pdf)，关联美股扩展公共收费、美股ETF公共收费，18:47:43.974299记录`document_unavailable`，与前一个文档完成时间相隔15.010秒。

本轮结束后仅对该地址做一次同容器只读诊断，保持同样15秒读取、2 MiB大小、3秒连接、User-Agent及禁止重定向和自动重试。诊断返回HTTP 200，2.286秒取得响应头，完整读取1175335字节并完成摘要计算，耗时14.087秒。正文指纹`ddac2be95898c8d7fd43c02e5e1d92fd953c2ccb0a5bf312bd5cc4342bd13cd0`与其上次成功记录一致。PDF文本快照仍按原保护返回`text_too_large`，没有放宽文本上限。

原始错误码未保存底层网络异常；结合本轮15.010秒间隔失败与复核14.087秒成功，支持“读取耗时在单件15秒阈值附近波动”的判断。该文件约1.12 MiB，未超过字节上限，与govinfo大PDF超限问题不同。本次未修改该来源地址，复核没有写入业务观察或覆盖本轮失败，也没有为取得全绿结果额外发起整轮重跑。

## 最终一致性审查

AC1与AC2由精确映射、原证据不变、失败保留、去重及资源保护回归验证；AC3由正式最小目标同步、容器摘要与健康检查验证；AC4已完成一次全部来源的真实检查、逐项排查和配置保护复核。用户指定的govinfo失败文档修复在真实读取、入库与消费接口均通过；整体新一轮仍为部分成功，保留上述FINRA独立失败，不能表述为全部来源本轮通过。

回退方式为撤销监测目录的这一精确正文映射并重新使用正式DSA同步入口，恢复原PDF读取；两种地址的原有观察与版本仍保留。代码未提交，本次未触发CI，也未修改收费规则、资料包、数据库结构、阈值或保存配置。
