# FINRA监测正文替换验证记录

规格见[轻量正文规格](../../specs/2026-11-15-rule-monitor-lightweight-document.md)，阶段见[已归档任务](../tasks/2026-11-15-rule-monitor-finra-document.md)。

## 官方正文核验

原FINRA PDF在执行`3b706028-91e9-463b-be00-835ea180f693`中读取失败，独立诊断14.087秒成功，耗时接近15秒保护。原始记录见[上轮验证](2026-11-15-rule-monitor-lightweight-document.md)。

- [FINRA提案登记](https://www.finra.org/rules-guidance/rule-filings/sr-finra-2020-032)确认原PDF为`SR-FINRA-2020-032`提案提交文本。
- [SEC官方登记](https://www.sec.gov/rules-regulations/self-regulatory-organization-rulemaking/sr-finra-2020-032)确认同一提案的SEC发布号为`34-90176`、发布日期2020-10-14、联邦公报发布日2020-10-20、引文`85 FR 66592`，提供联邦公报版本入口。
- 替代地址为[同一提案的联邦公报公告正文](https://www.govinfo.gov/content/pkg/FR-2020-10-20/html/2020-23141.htm)。公报编号`2020-23141`，页码66592–66607，正文载明提案号、SEC发布号与2024年TAF每股`0.000166`美元、每笔最高`8.30`美元的规划表。
- 原PDF是含附件的提交包；新地址是同一提案的官方公告正文，原包及附件证据继续保留。此次未采用提案目录页或其他年份费率规则作为正文。
- 同步前容器通过既有`fetch_document`只读核验：3.346秒成功，HTML正文快照118771字符、`reason=null`，身份与费率规划表均可读；在原15秒、2 MiB和250000字符保护内。
- 原始摘要`16d97dd68eb878c2eb9bbcc822080d3858e9b564f56e78a4bb1edda900ecc9fa`，规范正文摘要`7419769676788ead7c8b422d50adbff191638c268dc205b1f58fe12f9d7e1b77`。

## 修改及本地回归

DSA仅在监测目录精确映射表中新增原FINRA完整PDF URL到上述HTML的映射，两个引用来源共用一次读取；既有govinfo映射保留。资料包原URL、摘要、空发布时间、观察时间、费率和身份不改，新URL独立建立版本，旧URL的失败继续保留。

- 定向命令：`.venv/bin/python -m pytest tests/test_rule_monitor_official_text.py tests/test_rule_monitor_fetch.py tests/test_rule_monitor_execution.py tests/test_rule_monitor_history.py -q`，41项通过，日志`/tmp/rule-monitor-finra-focused.log`。
- 相关命令：`.venv/bin/python -m pytest tests/test_rule_monitor_*.py tests/test_local_rule_demand_refresh.py tests/test_thesis_ledger_*public_fee*.py -q`，170项通过，日志`/tmp/rule-monitor-finra-related.log`。
- 覆盖两组映射的原证据字段保护、共享地址去重、原失败保留、新HTML成功基准、未登记地址拒绝、大小和超时、HTTP失败、认证隔离、禁止重定向和重试；扩展目录及全量执行回归继续通过。
- `py_compile`、关键flake8、`check_data_service_boundary.py --syntax`、`check_thesis_ledger_capability_boundaries.py`、`check_data_runtime_contract.py`、`data_test_scope.py`通过，测试范围目标452项。
- 未修改读取器、运行时、合同、数据库或依赖；继续使用300秒总读取、15秒单件、3秒连接、2 MiB正文及原快照保护。

## 同步前保护基线

- 宿主目录实现SHA-256：`16811d6cf80252478ed0a6ce8ec798ffbf5e843a8ed0458a5b2c51b0e4e20f02`。
- 保存配置：修订4，启用，9个来源，计划`0 0 * * 1`，时区`Asia/Shanghai`，配置响应序列化摘要`0ce59a05ee185165f076cbf60d6c349c857bef0b0f797b7314122e62455e15ba`。
- 原失败执行`6fed1d2d-a591-41ea-bb2e-8e26a51ebb1d`三表摘要：`7875554cce6e005bdec69f33ad3a77010ea84900fabc14a85f4a38ab430fdca7`。
- FINRA失败执行`3b706028-91e9-463b-be00-835ea180f693`三表摘要：`bd32612812614835872c24b1b25809bea645b1fe001324fa518c68d44bfddba0`。
- 三表指`runs`、`run_failures`、`run_metadata`按字段排序序列化；最终复核其摘要相同，确认原始执行未改写。

## 本地同步与真实检查

- 从`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`执行`./scripts/sync-code.sh dsa`，没有跳过门禁参数，退出0；日志`/tmp/rule-monitor-finra-sync.log`。未执行数据库结构或外部卷变更。
- 容器与宿主目录实现摘要均为上列`16811d6c…4e20f02`完整值。实际登记目录10个来源、29个去重文档；FINRA两个引用来源使用新HTML，govinfo三个引用来源继续使用原修复HTML，两份旧PDF均不在活动读取地址中。
- 代码快更保持DSA镜像ID不变，仍为`sha256:24c71dc2c20cb607e9310c15ffefbc651074565cb7b9c408b3ad25f2e5a4760a`；变化位于容器可写层。
- 同步后通过Server正式`POST /api/market-data/rule-monitor/checks`发起一次检查，HTTP 201。请求标识`27ae2e0d-d649-4731-984e-d115ac184f25`，创建于2026-11-15 19:09:46（Asia/Shanghai），来源取同次状态返回的全部登记来源。
- 发起前配置摘要仍等于同步前基线。

## 全部来源真实检查结果

- 执行标识`27ae2e0d-d649-4731-984e-d115ac184f25`，`attempt=1`。
- 开始2026-11-15 19:09:46.377170，结束19:11:29.126636（Asia/Shanghai），耗时102.749秒。
- 29个去重文档全部检查，成功27个，失败2个，材料指纹变化1个，终态`partial`，运行级错误为空；没有触发总读取时限。
- 修复目标在19:10:45.273361成功读取，建立HTML首次版本基准，规范正文摘要与同步前核验一致。
- 持久化正文118771字符，快照`reason=null`，提案号、SEC发布号、2024年费率与上限均存在；Server正式版本详情接口HTTP 200，返回同长度正文和上述内容。
- 只读SQLite核对本轮`runs`与`run_failures`，状态、统计及两条失败与正式HTTP一致。
- 两次原始失败执行的三表摘要均与上列基线相同，保存配置摘要也与上列基线相同。

| 来源 | 成功文档／归属文档 | 本轮结果 |
| --- | --- | --- |
| 上交所股票收费主源 | 6／6 | 全部可读 |
| 上交所股票收费备用 | 6／6 | 全部可读 |
| 港股交易费 | 1／2 | 港交所2022交易费通告失败 |
| 港股扩展公共收费 | 4／5 | 同一份港交所通告失败 |
| 美股Section31 | 4／4 | 全部可读，既有govinfo修复保持 |
| 美股扩展公共收费 | 6／6 | 全部可读，FINRA新正文成功 |
| 上交所ETF经手费 | 2／2 | 全部可读 |
| 港股ETF公共收费 | 4／5 | 同一份港交所通告失败 |
| 美股ETF公共收费 | 7／7 | 全部可读，FINRA新正文成功 |
| 美国当前现金证券执行规则 | 5／6 | SEC暂停收费生效通知失败 |

各来源共享文档，分行计数不能相加作为实际请求数；本轮6个来源全部可读，4个来源受两个独立失败地址影响。

## 两个新增失败逐项诊断

原始错误码均为`document_unavailable`，未保存更底层异常；以下时间判断是结合原始执行间隔与后续同容器复核的推断。每个失败URL仅额外做一次只读诊断，串行执行，保持原15秒、3秒连接、2 MiB大小、禁止重定向和自动重试；不创建业务任务，不写入观察或覆盖本轮失败。

| 文档 | 本轮原始事实 | 同容器独立复核 | 原因判断 |
| --- | --- | --- | --- |
| [港交所2022交易费通告](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2022/086_22_SEHK_OP_Trading-Fee_e.pdf) | 19:10:05.184135失败，与前一文档完成相隔15.017秒 | HTTP 200，2.228秒取得响应头，完整520624字节，摘要与上次成功一致，9.574秒成功，正文快照可用 | 支持读取耗时波动触发15秒单件时限的判断，非大小超限 |
| [SEC TAF暂停收费生效通知](https://www.sec.gov/files/rules/sro/finra/2026/34-106409.pdf) | 19:11:23.220548失败，与前一文档完成相隔3.033秒 | HTTP 200，2.003秒取得响应头，完整273086字节，摘要与上次成功一致，10.386秒成功，正文快照可用 | 时间接近3秒连接时限，支持连接建立阶段短时超时或网络波动的判断；原始异常缺失，不能确证具体底层异常 |

两份文档均未超过单件大小上限，复核均可读；本轮原始失败继续保留。未修改这两个地址，也未为获得全绿结果额外重跑整轮。

## 最终一致性审查

AC1由官方同提案正文身份、费率表、两个引用来源及原资料保护核验；AC2由41项定向、170项相关回归和资源保护检查；AC3由正式最小目标同步、实现摘要及独立目录核验；AC4完成一次全部来源真实检查、逐项失败诊断、正文消费与历史和配置保护复核。

指定FINRA文档修复在真实读取、持久化、两个来源及Server消费入口通过。整体本轮仍为部分成功，不能声称所有外部文档本轮通过或持续可读。收费资料包、读取器、超时和大小、快照阈值均保持原值；代码未提交，未触发CI。

回退为仅撤销FINRA这一精确监测地址映射，再使用正式DSA同步入口，恢复原PDF读取；保留govinfo既有修复及所有历史记录。
