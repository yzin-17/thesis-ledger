# 印花税通告与FINRA FAQ连接保护校准验证

规格见[轻量正文规格](../../specs/2026-11-15-rule-monitor-lightweight-document.md)，阶段见[已归档任务](../tasks/2026-11-15-rule-monitor-connection-timeout.md)。

## 原始失败与官方正文评估

原执行`93f24632-1436-49ad-b922-ae223ed0cf30`的事实见[上轮记录](2026-11-15-rule-monitor-hkex-sec-documents.md)：两份文档均为`document_unavailable`，没有底层异常，不能确证原失败一定是`ConnectTimeout`。

| 对象 | 原失败间隔 | 原轮后续同容器只读复核 | 本次官方正文评估 |
| --- | --- | --- | --- |
| [港交所印花税通告CT/158/23](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2023/ce_SEHK_CT_158_2023.pdf) | 前一文档完成后3.033秒 | 2.923秒取得HTTP 200响应头，211972字节，9.788秒成功，摘要与前次成功相同 | 同一官方通告仅找到英中两份PDF及官方索引，未找到已核验的更轻独立正文；保留原英文通告及完整范围 |
| [FINRA交易活动费FAQ](https://www.finra.org/rules-guidance/guidance/faqs/trading-activity-fee) | 前一文档完成后3.024秒 | 1.862秒取得HTTP 200响应头，122944字节，2.349秒成功，规范摘要与前次成功相同 | 原地址已经是完整HTML正文，包含Q100.22的ETF交易与申赎区分；未找到更轻的同文档官方版本，保留完整页面 |

FINRA正文通过官方页面重新核对；港交所核对通告编号、发布日期2023-11-15、生效日2023-11-17及从0.13%降至0.1%的指示。两份均远低于2 MiB，不能把此次失败解释为大小超限，也不采用其他政策通知替换原通告。

结合原3秒附近的失败、成功复核和跨站连接波动，原连接余量偏紧的判断成立；但后续成功不能证明原始底层异常。仅将连接超时从3秒校准为5秒，为已有网络波动留有限余量，不增加重试。

## 保护与实施范围

运行时代码仅修改`src/services/rule_monitor_fetch.py`中的`httpx.Timeout(10, connect=3)`为`httpx.Timeout(10, connect=5)`。原URL、四组已核验正文映射、资料包、冻结摘要、来源数量、数据库及计划不变。

[HTTPX官方超时说明](https://www.python-httpx.org/advanced/timeouts/)区分连接、读取、写入及连接池等待；本地实际HTTPX/httpcore源码确认TCP与TLS分别消费连接时限。新策略分别约束TCP建立、TLS握手各5秒，读取、写入、连接池等待各10秒；应用外层仍限制整件最多15秒，整轮仍为300秒。阶段时限不能相加作为新的总预算。2 MiB、串行、逐件释放、快照保护、安全URL校验、无重定向和无自动重试继续保持。

## 受控回归与门禁

- 通过真实`fetch_document → httpx.AsyncHTTPTransport → httpcore`调用链注入有限网络后端，只缩放受控网络的等待时间，实际分阶段参数与异常转换保留；覆盖两个原地址、TCP、TLS、读取、单件剩余预算和单次请求。
- 在3秒原策略下，修正受控TLS清理模拟后，4个3.4秒TCP/TLS成功用例均失败，另10项通过；日志`/tmp/rule-monitor-connection-red-fixture.log`。最初模拟未实现握手失败及取消的底层流关闭，额外4项清理断言失败，仅修正测试后端，原日志`/tmp/rule-monitor-connection-red.log`保留。
- 校准5秒后，3.4秒TCP/TLS成功，5.2秒连接及10.2秒读取超时仍映射为不可读；0.02秒单件剩余预算能够取消TCP或TLS等待，网络调用不自动重试。受控网络清理不等同于真实外部连接资源测量。
- 定向命令：`.venv/bin/python -m pytest tests/test_rule_monitor_fetch.py tests/test_rule_monitor_official_text.py tests/test_rule_monitor_execution.py tests/test_rule_monitor_history.py tests/test_us_live_execution_rules.py -q`，103项通过，日志`/tmp/rule-monitor-connection-focused.log`。
- 相关命令：`.venv/bin/python -m pytest tests/test_rule_monitor_*.py tests/test_local_rule_demand_refresh.py tests/test_thesis_ledger_*public_fee*.py tests/test_us_live_execution_rules.py -q`，232项通过，6项既有警告，日志`/tmp/rule-monitor-connection-related.log`。
- 七个读取目标继续通过HTTP失败、大小、认证隔离、无重定向及无重试、单件预算保护；原四组映射、原资料与历史保护、扩展目录执行及美国规则按需核验继续通过。
- `py_compile`、关键flake8、服务边界含语法（499运行文件）、统一能力边界、运行合同、测试范围检查（452目标）通过。未修改API、客户端、依赖或数据库结构。

## 同步前保护基线

- 宿主读取器SHA-256：`a213a6a38022660b380b1811c835884656d14bde089e246aa146b3f466f34016`。
- 保存配置修订4，启用、9个保存来源，计划`0 0 * * 1`、`Asia/Shanghai`；配置响应序列化摘要`0ce59a05ee185165f076cbf60d6c349c857bef0b0f797b7314122e62455e15ba`。
- 四个原执行三表摘要：
  - `6fed1d2d-a591-41ea-bb2e-8e26a51ebb1d`：`7875554cce6e005bdec69f33ad3a77010ea84900fabc14a85f4a38ab430fdca7`。
  - `3b706028-91e9-463b-be00-835ea180f693`：`bd32612812614835872c24b1b25809bea645b1fe001324fa518c68d44bfddba0`。
  - `27ae2e0d-d649-4731-984e-d115ac184f25`：`5ba024e03c21e7205259a82f98f49e40402ff9181b9b2b7e0c9b1cd080eb2a7a`。
  - `93f24632-1436-49ad-b922-ae223ed0cf30`：`5a243748bcf1bf623ae86939c2347070330cd86ff9453726592d124261c26984`。
- 三表为`runs`、`run_failures`、`run_metadata`，字段排序序列化后计算SHA-256。全部来源原包摘要映射的聚合摘要为`af1b34ffdac3e9999c5cdb2f5b6740dde69bb0fefb23dc9ebb68fd9ef0ecad4b`。

## 本地同步与一次全部来源检查

- 从`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`执行`./scripts/sync-code.sh dsa`。首次因其他验收持有维护锁而在变更前退出1，日志`/tmp/rule-monitor-connection-sync.log`；未删除锁、停止其他任务或绕过保护。等待锁释放后使用同一正式入口退出0，日志`/tmp/rule-monitor-connection-sync-ready.log`。
- 容器读取器摘要与上列宿主值相同；独立受控请求探针确认实际加载参数为`connect=5`、`read=write=pool=10`，大小上限2097152字节。活动目录10来源、29个去重地址，四组既有映射、两个目标原URL及原包摘要聚合值均保持。
- DSA健康，镜像仍为`sha256:24c71dc2c20cb607e9310c15ffefbc651074565cb7b9c408b3ad25f2e5a4760a`，代码位于容器可写层，不代表镜像重建或生产发布。
- 正式`POST /api/market-data/rule-monitor/checks`返回HTTP 201，请求标识`ba7a5e14-ba67-4aff-acbb-24b753726d66`，创建于2026-11-15 19:59:56.144582（Asia/Shanghai）；来源取同次状态中的全部登记来源，配置摘要与基线相同。
- 开始2026-11-15 19:59:56.146923，结束20:01:40.779695（Asia/Shanghai），耗时104.633秒，`attempt=1`；29份文档全部检查，28成功、1失败、材料变化0，终态`partial`，无运行级错误，未触发整轮读取时限。
- 印花税通告在20:00:20.125230成功，摘要`c3810abf83dd53b22f6f58a9301525a01b80bb922e52f88543e411b2f90689d3`与此前相同；SQLite正文1318字符、`reason=null`，正式版本详情HTTP 200，通告号、发布日期、生效日及0.13%到0.1%的正文可读。
- FINRA FAQ在20:01:20.632436成功，规范摘要`a164a5ee1aee6758401d1db92196621df98f7c53953d8ef0d62973ace4d81c72`与此前相同；SQLite正文37260字符、`reason=null`，正式版本详情HTTP 200，`Q100.22`、`A100.22`及ETF申赎区分可读。
- 两份为本轮真实新读取成功、指纹未变。版本详情复用同指纹已有快照：印花税正文首次采集于2026-11-15 18:14:25.685068，FAQ正文首次采集于2026-11-10 18:28:31.198725（Asia/Shanghai）；旧快照采集时间与本轮核查时间分开，不把复用的正文称为新历史版本。
- SQLite终态、统计与唯一失败均与正式API一致。上列四轮原执行三表摘要、原资料包摘要聚合值和保存配置摘要均与基线相同；此前失败未改写。本轮两份目标观察恢复为成功，原失败仍保存在旧执行明细中。

| 来源 | 成功文档／归属文档 | 本轮结果 |
| --- | --- | --- |
| 上交所股票收费主源 | 6／6 | 全部可读 |
| 上交所股票收费备用 | 6／6 | 全部可读 |
| 港股交易费 | 2／2 | 全部可读，既有正文替换保持 |
| 港股扩展公共收费 | 4／5 | 本次印花税目标成功，另一份SFC通告失败 |
| 美股Section31 | 4／4 | 全部可读，既有正文替换保持 |
| 美股扩展公共收费 | 6／6 | 全部可读，既有FINRA正文替换保持 |
| 上交所ETF经手费 | 2／2 | 全部可读 |
| 港股ETF公共收费 | 4／5 | 同一份SFC通告失败 |
| 美股ETF公共收费 | 7／7 | 全部可读，本次FINRA FAQ目标成功 |
| 美国当前现金证券执行规则 | 6／6 | 全部可读，既有SEC正文替换保持 |

8个来源完整可读，2个来源受同一份SFC通告影响。共享文档每轮只请求一次，分行计数不可相加为实际请求数；未自动改费或更新来源配置。

## 唯一其他失败诊断

[SFC交易征费调整通告](https://www.hkex.com.hk/-/media/hkex-market/services/circulars-and-notices/participant-and-members-circulars/sehk/2014/ct05314b)在20:00:35.135975失败，与前一件完成相隔15.010秒，错误`document_unavailable`。原底层异常缺失，不能确证具体网络阶段；耗时触及单件总时限，支持网络或读取时延波动的判断，不应继续放宽连接时限掩盖整件超时。

整轮完成后仅做一次同容器只读诊断，沿用连接5秒、其他网络阶段10秒、单件15秒、2 MiB、无重试和无重定向：HTTP 200，3.613秒取得响应头，声明及完整正文均为360679字节，9.891秒成功，PDF正文1546字符，快照可读，摘要`5635f20beba7574dae3a7847c7e2ecfe0767c669eaab90af8776c072feec6a06`与原最近成功相同。

诊断不创建业务检查、不写入观察。之后正式状态仍保留本轮`partial`、1条失败及原失败时间，未将后续成功覆盖进本轮，也未额外重跑全目录。这份其他通告未作地址替换。

## 最终一致性审查

生产读取器仅修改连接参数；AC1原四组映射与冻结资料保护保持，目标两份原官方文档范围保留；AC2及AC5由103项定向、232项相关回归、真实HTTPX/httpcore受控阶段测试和资源门禁；AC3由正式最小目标同步、文件摘要、实际参数探针及健康；AC4由一次全部来源实际执行、逐项结果、正文持久化及消费、历史配置保护和唯一失败诊断完成。

两份指定目标通过真实读取和正式消费入口；总体本轮仍为部分成功，不能认证全部外部文档本轮通过或持续可用。原15秒及其他资源保护保持，代码未提交，未触发CI。

回退仅将读取器连接参数恢复为3秒并通过正式DSA同步入口应用；相应受控回归预期随策略回退。原官方地址、现有四组映射、收费规则、资料包、计划与全部历史不需改动。
