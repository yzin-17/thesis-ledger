# Tushare 事件生产与鉴权本地证据

日期：2026-09-28。任务：`M26-b2-event-runtime-local`。状态：`worker_done`，生产入口的离线组合已验证；真实来源准入、历史覆盖和目标部署仍开放。

## 范围与依赖

依据 Spec §4 的原文先于账号、安全配置前后复核合同，以及 Task §12.9 已冻结执行包。依赖 registry 121 项、mapped-read 210 项、Schemas 546 项及稳定 dist、Server consumer 48 项，由协调者释放；本叶没有重建共享 Schemas/Server 或执行其消费者测试。读取 runtime-seams、mapped-read、wire 证据和实际源码；按 `spec-driven-workflow` 的实施与交接指导核对。Context Mode 未提供，使用 RTK 和有界输出。

独占新 DSA `src/services/thesis_ledger_tushare_event_v3.py`、`tests/test_thesis_ledger_tushare_events_v3.py`；只修改 `thesis_ledger_event_v3.py`、`thesis_ledger_provider_runtime.py`、`api/thesis_ledger_events_v3.py` 的指定接缝及本文。其他文件，包括上一叶 registry 两源码/测试、mapped/resolver、Control、Schemas/Server、Spec/Task 均只读。保留全部脏工作区，无 stage/commit/reset、子代理、目标配置或部署。

## 实现与职责

- 新来源服务 `:23` 的 `_local_admission` 核对精确 route/target、本地 adapter/source 与合法 HMAC 格式、原准入状态和精确时刻，复用 resolver 既有精确时钟/状态原语，原记录和字符串不改写。
- 新服务 `:36` 的请求原文 guard 直接查询真实 Store、加载当前摘要绑定文件并调用真实 resolver；发生在任何 effective policy/catalog/账号扫描前。缺准入、文件删除或损坏、撤销、过期、scope 不符、错误适配/source、缺独立币种或未来原文均直接 `not_admitted`。测试同时 spy Control `_credential_state`、环境凭据入口、`_decrypt_secret`、snapshot、policy、registry、Fetcher 构造及底层 HTTP，全部零调用；fixture 含合成加密 RQData Control 账号和已配置 Tushare/bar 目录，覆盖真实账号扫描风险。
- 新服务 `:53` 的 current helper 负责精确准入、状态/时间与实际环境凭据 HMAC；目录没有请求窗口，因此不要求身份证据覆盖整个 admission 窗口。目录 ready 只说明本地当前准入存在，不能替代请求 scope 原文 guard、身份/币种审核或完整历史。registry fixture 的 current 正例保持其原有修订职责，不当作原文检查证据。
- 新服务 `:101` 生产编排依次进行请求 guard → 当前完整 policy/catalog/admission → 原 guard 一致性 → 请求安全复核 → mapped 实际读取 → 原文/准入 guard → 完整状态一致性 → 响应事实与精确 availableAt 核对 → 最后原文 guard → 当前请求鉴权复核。mapped 仍使用实际 current matcher、不可变环境 snapshot、用途隔离 HMAC、同 snapshot 构造的既有 Fetcher 和实际 `TushareHistoryRequest`/HTTP Reader；没有恒真谓词、SDK fallback、重试或来源切换。
- `thesis_ledger_event_v3.py:113` 仅对已解析的精确 Tushare 请求进入来源专属执行，其错误转换为原稳定 `EventV3Error`。RQData/Eastmoney/SPLIT 旧执行保留。
- `thesis_ledger_provider_runtime.py:459` current admission 增加来源专属分流；`:501` 目录复用同一 current 检查，收敛原有重复凭据/admission 代码。未改变其他 bar 的协议、凭据快照或 adapter 构造逻辑，原 `_adapter(snapshot=...)` 已满足可信构造接缝。大文件从 2587 行降到 2570 行（按换行分割计数 2588→2571，净减 17），未放宽 ratchet。
- `api/thesis_ledger_events_v3.py:23` 将原 request authorization 提供给可信回调，复用 `require_contract_token` 读前/读后检查。当前实际 HTTP 安全配置只有 `THESIS_LEDGER_DSA_TOKEN`；没有额外 enabled/allowlist HTTP 开关，未发明新配置。policy enabled/targets allowlist 属于既有策略快照。Bearer 轮换/清除导致晚到结果分别 401/503，不返回 facts 或秘密。

## 公共投影与证据限制

公共 `tushareIdentityEvidence={ref,sha256,content}` 保留 raw UTF-8，包括中文和末尾换行；没有 JSON 重编码代替原文字节。准入保留原字段/时刻，仅排除 `recordedBy`，事实金额保留实际 JSON-number→Decimal 的 32 位小数，无 float 舍入。保留已定义 recordDate/paymentDate/strategyVisibility、原 providerRevision 与 fetchedAt；空响应保持 actual reader 产生的稳定内容版本。

严格共享 wire 未定义顶层 retrieval/observations，所以公共响应不新增它们。内部 mapped/reader 仍保留 retrieval、公告/实施/净值/再投资等独立日期，本叶通过既有 mapped 回归核验，不宣称公共 wire 已暴露全部源日期。`sourceRevision` 为本地协议，`providerRevision` 为所读内容指纹，均不证明历史上游版本、首次可见时间或完整分页。公开覆盖始终 `complete=false`，不升级冻结/PIT 资格。

所有 fixture 为独立临时 SQLite、内容寻址文件和 synthetic 账号；底层 `requests.post` 替换为本地响应，完整 Reader/Decimal/标准化/编排仍真实执行。实际 FastAPI router/Depends 与项目 TestClient（既有 ASGI threadless 兼容实现）在进程内执行；没有真实网络、Provider SDK 初始化、生产账号读取、目标准入/DB/容器请求。

## 实际验证

命令执行目录为 DSA。新定向首先 37 passed / 1 failed：完全相同的准入重登记是 Store 幂等操作，不会改变 recordVersion。核对实际实现后改为变更 synthetic `recorded_by` 触发真实新记录，唯一修复重试通过；未改生产 Store 或放宽一致性。

| 实际命令 | 结果 |
| --- | --- |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_tushare_events_v3.py -q --disable-warnings` | 修复后 41 passed，3 个既有警告，2.11 秒；包含 runtime 与 HTTP 两阶段及 actual built Schema exchange。 |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_tushare_event_registry_v3.py tests/test_thesis_ledger_event_control_v3.py tests/test_thesis_ledger_events_v3.py tests/test_thesis_ledger_rqdata_events_v3.py tests/test_thesis_ledger_split_event_control_v3.py tests/test_thesis_ledger_tushare_credential_revision.py tests/test_thesis_ledger_market_v3_admission_runtime.py tests/test_thesis_ledger_tushare_market_v3.py tests/test_thesis_ledger_market_v3.py tests/test_thesis_ledger_hithink_credential_admission_runtime.py tests/test_thesis_ledger_rqdata_mapped_read.py tests/test_thesis_ledger_tushare_mapped_read.py -q --disable-warnings` | 184 passed，8 个既有警告，9.04 秒；event/RQData/Eastmoney/bar/current HMAC/mapped 回归通过。 |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_tushare_events_v3.py tests/test_thesis_ledger_tushare_event_registry_v3.py -q --disable-warnings` | 自审补充 static admission 的精确 route/target 检查后，最终相关输入 75 passed，3 warnings，2.36 秒；其他来源路径没有再变动。 |
| `rtk proxy .venv/bin/python -m flake8 src/services/thesis_ledger_tushare_event_v3.py src/services/thesis_ledger_event_v3.py api/thesis_ledger_events_v3.py tests/test_thesis_ledger_tushare_events_v3.py --max-complexity=20` | 最终源码/test 通过，退出码 0；首次 test continuation 缩进提示已修正。 |
| `rtk proxy .venv/bin/python -m flake8 src/services/thesis_ledger_provider_runtime.py --select E9,F63,F7,F82` | 退出码 0。全文件普通 flake8 仅报初始已存在 `:84 E302`（DAILY_BAR 常量与旧日志函数之间缺空行）；未把该全文件 lint 记作通过，也未修改相邻既有 WIP 格式。 |
| `rtk proxy .venv/bin/python -m py_compile src/services/thesis_ledger_tushare_event_v3.py tests/test_thesis_ledger_tushare_events_v3.py src/services/thesis_ledger_event_v3.py src/services/thesis_ledger_provider_runtime.py api/thesis_ledger_events_v3.py` | 最终输入通过，退出码 0。 |
| `rtk git diff --check -- src/services/thesis_ledger_tushare_event_v3.py tests/test_thesis_ledger_tushare_events_v3.py src/services/thesis_ledger_event_v3.py src/services/thesis_ledger_provider_runtime.py api/thesis_ledger_events_v3.py` | 退出码 0；另用 `rtk proxy node -e` 对全部 owned 文件逐行检查，0 尾随空白。 |
| `rtk proxy node -e` 的尺寸检查 | 实际 `split(/\r?\n/).length` 比较 runtime 2588→2571，断言净规模不增加通过；新来源模块 134 行、测试 335 行。没有运行或声称仓库全量规模门禁。 |

HTTP 成功测试将实际 request/response 写入该用例临时目录的 `synthetic-exchange.json`，随后真实调用 `rtk proxy node -e`，从主仓稳定 `packages/schemas/dist/index.js` 导入 `marketEventExchangeV3Schema.parse`，结果 `synthetic exchange passed`。没有重建 dist 或手写替代 parser；跨仓 SHA 实际输入见下表。

实测反例包括缺/坏 proof 零账号、读前 token/endpoint/master/version/HMAC 不匹配零来源、读中撤销/适配/source/recordVersion/文件/账号/地址/主密钥/策略 enabled/targets/Provider disabled/真实其他库存目录变化拒绝、最后 policy/catalog 复查期间原文变化拒绝、源码失败无 retry/脱敏、Bearer 入站拒绝零 runtime 与读中安全轮换拒绝。没有全包/build 或真实目标验收。

## 最终输入摘要

通过 `rtk proxy shasum -a 256` 取得；DSA 路径均相对该仓，主仓 dist 单列。上游 registry/mapped/resolver/Control 摘要与交接相同。

| 文件 | SHA-256 |
| --- | --- |
| `src/services/thesis_ledger_tushare_event_v3.py` | `fe15cbfec0ab2525513ee90bdaea38d36d72adbff5f0bf0c027dd6c58349fc08` |
| `tests/test_thesis_ledger_tushare_events_v3.py` | `0f602fc50c2e34d509bcc9f555b03656bf9b0c721d8f4a90720e8cf97209e9ff` |
| `src/services/thesis_ledger_event_v3.py` | `cfb32fb696326746d60198befb5edccf3d37c2dd8e97be774e561fabe2b687ab` |
| `src/services/thesis_ledger_provider_runtime.py` | `c4d82eedfe83d27b2a5fde90128e37b5c30bb4f356a5f6f5b4110af6147e87a1` |
| `api/thesis_ledger_events_v3.py` | `e29e7402b2dee51a764c66430b24e7959d6e7d167cbbb2758b68081526461331` |
| `src/services/thesis_ledger_event_v3_adapters.py` | `bad2af395f112b322b3c46401cc89668c7976d3a3f9bf4217ab538ffa0d9c491` |
| `src/services/thesis_ledger_market_v3_revisions.py` | `4888eafaeb29c9479f710d69cdc91da62cd1233bf029c18dc865dcf135dc1c42` |
| `src/services/thesis_ledger_tushare_mapped_read.py` | `436d4fc0d4daccb69d10388ce266d505ae3a0db37f7983448cc98c3b894acf95` |
| `src/services/tushare_fund_identity_evidence.py` | `3fb8b53a019146789bad5a126136898f9a30b55094f1a2edc6930ad4cf9f599b` |
| `src/services/thesis_ledger_control.py` | `ab21053693486ee06cd433f2a128197db0b1cced063825dd485d85afd9026b38` |
| 主仓 `packages/schemas/dist/index.js` | `bf2a1c88d294af5920ba27d8f98fe102c77557444c1cd274dd46d7401a3d0d39` |
| 主仓 `packages/schemas/dist/market-event-wire-v3.js` | `594931a9ee5f924888f66bb0afce5d5b12109280556d2796a6a560823570d73c` |
| 主仓 `packages/schemas/dist/market-tushare-identity-v3.js` | `e45899f2dfbcb90caf20b161c927b81d33dfa78cdbff9b4363318cfaf12ada5a` |

## 交接与剩余门禁

本叶自审完成，仍由协调者执行整体一致性 Review 和主 Task 状态维护。源码、测试和证据未提交；无后台进程或共享 build 资源，写权交回，不自行领取后继任务。真实身份/独立分红币种审核、fund_div 权限、完整分页/历史修订、目标容器同步、真实 Server 消费与 M33 记账/信号门禁未执行，不能以离线成功授予真实 ready/完整 coverage。既有大 runtime 普通 flake8 的 E302 基线提示保留明示。
