# SFC征费提醒通告同文档地址修复验证

规格见[正文与读取保护](../../specs/2026-11-15-rule-monitor-lightweight-document.md)，阶段见[任务](../tasks/2026-11-15-rule-monitor-sfc-document.md)。

## 原始失败与官方版本核验

原执行`ba7a5e14-ba67-4aff-acbb-24b753726d66`在2026-11-15 20:00:35.135975（Asia/Shanghai）记录SFC征费提醒不可读，完成间隔15.010秒；随后一次同容器只读复核9.891秒成功。原底层异常缺失，不确证具体网络阶段；原始事实见[上轮验证](2026-11-15-rule-monitor-connection-timeout.md)。

本次仅在原保护内串行核验官方候选，不创建业务检查或写观察：

| 地址 | 有界核验结果 | 判断 |
| --- | --- | --- |
| [原无后缀入口](https://www.hkex.com.hk/-/media/hkex-market/services/circulars-and-notices/participant-and-members-circulars/sehk/2014/ct05314b) | HTTP 200，3.169秒取得响应头，15.002秒触发单件总时限，解码后仅读到65536字节 | 本次直接复现整件读取超时；未读完，不推断响应大小及内容完整性 |
| [官方标准PDF](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2014/CT05314B.pdf) | HTTP 200，1.864秒取得响应头，360679字节，11.090秒完整成功；PDF正文1546字符，快照可读 | 与原包已核验版本SHA-256及完整提取正文一致，保留全部中英文通告 |

未找到已核验且更轻的同通告HTML全文。标准PDF并未缩小，不能把此次修复称为正文压缩；采用同一官方通告的明确标准地址，保留完整正文。官方标准地址的语言和下载参数候选也未缩小内容，最终不加参数。后续网络持续可用性仍受现有保护与外部网络影响。

核验身份为`CT/053/14`、日期2014-10-20、标题为2014-11-01起降低交易征费的提醒，前引`CT/031/14`。全文包含费率`0.003%`到`0.0027%`、2014-11-01生效、买卖双方及参与者对经纪系统、后勤和运作设施的准备要求，未采用其他政策通告或现行费率目录代替。

标准PDF摘要`5635f20beba7574dae3a7847c7e2ecfe0767c669eaab90af8776c072feec6a06`等于两个原资料包中的核验指纹，规范化提取文本摘要`ec756bc618c619236ee1eae4fdce4e2856c90f468cb3abf4c34a9c5fc3eeac03`等于原成功快照；原包观察日期2026-10-07及原始URL不改。

## 修改与回归

运行时代码仅在`rule_monitor_registry.py`加入原完整无后缀URL到上述标准PDF的精确映射；两个港股扩展公共收费来源共用一次读取，原四组映射保持。新地址独立建立版本，不将其成功写回旧地址。目录、资料包、费率、接口、数据库、依赖与客户端不变。

- 定向：`.venv/bin/python -m pytest tests/test_rule_monitor_official_text.py tests/test_rule_monitor_fetch.py tests/test_rule_monitor_execution.py tests/test_rule_monitor_history.py tests/test_us_live_execution_rules.py -q`，115项通过，日志`/tmp/rule-monitor-sfc-focused.log`。
- 相关：`.venv/bin/python -m pytest tests/test_rule_monitor_*.py tests/test_local_rule_demand_refresh.py tests/test_thesis_ledger_*public_fee*.py tests/test_us_live_execution_rules.py -q`，244项通过，6项既有警告，日志`/tmp/rule-monitor-sfc-related.log`。
- 回归覆盖五组精确映射、两个SFC引用来源、原包URL与指纹及日期不变；通过真正的PDF解析路径验证新地址成功、跨来源去重、独立版本与旧失败保留。受控PDF仅验证解析及状态流转，文档身份等价由上述官方版本核验提供。
- 八个读取目标继续验证大小、HTTP失败、认证隔离、无重试、无重定向、单件预算；TCP/TLS有限连接余量与超时、读取超时、整轮预算、取消、串行及扩展目录执行回归保持。
- `py_compile`、关键flake8、服务边界含语法（499运行文件）、统一能力边界、运行合同、测试范围（452目标）检查通过。
- 读取器和资源阈值未改：TCP及TLS各5秒、其他网络阶段各10秒、单件总时限15秒、整轮300秒、2 MiB、快照限制和逐件释放；无新增重试或重定向。

## 同步前保护基线

- 宿主目录实现SHA-256：`0802ce3172be789525e6dbae7228e0217715a5a0975b90680733e50660fc8080`。
- 保存配置修订4、启用、9个保存来源、计划`0 0 * * 1`、时区`Asia/Shanghai`，配置序列化摘要`0ce59a05ee185165f076cbf60d6c349c857bef0b0f797b7314122e62455e15ba`。
- 原执行三表摘要：
  - `6fed1d2d-a591-41ea-bb2e-8e26a51ebb1d`：`7875554cce6e005bdec69f33ad3a77010ea84900fabc14a85f4a38ab430fdca7`。
  - `3b706028-91e9-463b-be00-835ea180f693`：`bd32612812614835872c24b1b25809bea645b1fe001324fa518c68d44bfddba0`。
  - `27ae2e0d-d649-4731-984e-d115ac184f25`：`5ba024e03c21e7205259a82f98f49e40402ff9181b9b2b7e0c9b1cd080eb2a7a`。
  - `93f24632-1436-49ad-b922-ae223ed0cf30`：`5a243748bcf1bf623ae86939c2347070330cd86ff9453726592d124261c26984`。
  - `ba7a5e14-ba67-4aff-acbb-24b753726d66`：`2e5dcabfa39a325b75cf123c62193fdfbc105e2c26945601023eabbbb4f6ff5c`。
- 三表为`runs`、`run_failures`及`run_metadata`，按字段排序序列化后计算SHA-256。原资料包摘要映射聚合值`af1b34ffdac3e9999c5cdb2f5b6740dde69bb0fefb23dc9ebb68fd9ef0ecad4b`。

## 正式同步与全部来源真实检查

- 等待其他验收及正式应用同步释放维护锁后，从`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`执行`./scripts/sync-code.sh dsa`，退出0，日志`/tmp/rule-monitor-sfc-sync.log`。未删除锁、停止其他任务或绕过门禁，没有数据库结构和外部卷变更。
- 独立核对容器目录实现摘要与上列宿主值相同，读取器摘要仍为`a213a6a38022660b380b1811c835884656d14bde089e246aa146b3f466f34016`；实际加载探针为连接5秒、其余网络阶段10秒、大小2097152字节。目录10个来源、29份去重文档，两个SFC来源使用标准PDF，旧无后缀入口不在活动读取中，五组映射和原资料包摘要聚合值正确。
- DSA健康，镜像仍为`sha256:24c71dc2c20cb607e9310c15ffefbc651074565cb7b9c408b3ad25f2e5a4760a`；代码位于容器可写层，不代表镜像已更新或生产发布。
- 正式`POST /api/market-data/rule-monitor/checks`返回HTTP 201，标识`614eb69f-ad4f-47e2-9f6e-2a3c33ea1418`，创建于2026-11-15 20:26:23.224977（Asia/Shanghai）；来源取同次状态中的全部登记来源，发起前配置摘要与基线相同。
- 正式API与只读SQLite均核对为`succeeded`、第1次尝试、29文档、变化0、不可读0、错误为空，`run_failures`无本轮记录。开始2026-11-15 20:26:23.229377，结束20:28:02.319492，耗时99.090115秒；下列时间均为Asia/Shanghai。
- 同次目录映射与本轮时间窗内的成功文档观察逐项关联，29个去重地址全部在本轮检查且无错误。各来源成功引用数如下，共享文档不重复计入全轮29份：

| 来源 | 成功引用／全部引用 |
| --- | --- |
| 上交所股票收费主源 | 6／6 |
| 上交所股票收费备用 | 6／6 |
| 港股交易费 | 2／2 |
| 港股扩展公共收费 | 5／5 |
| 美股Section31 | 4／4 |
| 美股扩展公共收费 | 6／6 |
| 上交所ETF经手费 | 2／2 |
| 港股ETF公共收费 | 5／5 |
| 美股ETF公共收费 | 7／7 |
| 美国当前现金证券执行规则 | 6／6 |

- SFC标准地址于20:27:01.100910读取成功，状态为新地址独立`baseline`，指纹`5635f20b…ec6a06`。正式`GET /api/market-data/rule-monitor/version`返回HTTP 200、`available`、`pdf`、1546字符、原因空，正文包含上述七组身份、日期、费率和系统准备标记。快照采集时间为本轮成功时点；SQLite新快照全文与旧地址同指纹的原成功快照逐字相等，没有沿用旧采集时间。
- 原无后缀地址仍保留20:00:35.135975的`unavailable`与`document_unavailable`，两个历史版本保持；上列五轮执行三表摘要全部与同步前一致。配置序列化摘要、原资料包摘要映射聚合值均与基线相同，保存的9来源计划未变，全目录手动执行覆盖10来源。
- 本轮没有失败来源，无需追加外部诊断或重复全轮。代码及回归、同步文件一致性、正式API与数据库、正文详情和保护基线分别通过；最终差异及文档链接检查通过，任务完成归档。此结论对应本轮真实运行，不推定外部网络将持续可用，也不代替CI或镜像发布证据。
