# Tushare 基金身份与分红币种纯解析证据

日期：2026-09-28。任务：`M26-b2-identity-resolver`。状态：`worker_done`，仅本地纯合同交付；M26、M2 和真实来源门禁保持开放。

## 依据与写入边界

依据主 [Spec §4](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) 新增的 `tushare-fund-identity`、完整同代码映射、独立分红币种、原字节摘要、准入范围与精确观察截点合同，及 [Task §12.9](../2026-09-25-multi-source-adjustment-aware-backtest.md) 的 Ready 派发。接缝发现见 [前沿证据](2026-09-28-cont-m2-currency-frontier.md)。遵循已读取的 RTK、Codex、两仓 AGENTS 和 spec-driven-workflow；Context Mode 不可调用，输出均限定范围。

本次只新建 DSA `src/services/tushare_fund_identity_evidence.py`、`tests/test_tushare_fund_identity_evidence.py` 与本文。既有 RQData/存储/准入原语、主 Spec/Task/CHANGELOG/目录均未修改。脏工作区保留；无暂存、提交、子代理、Provider 请求、凭据读取、数据库或运行态变更。语法检查仅产生可重建的 Python 缓存。

## 已实现合同

出口位于 DSA `src/services/tushare_fund_identity_evidence.py:128`：

```python
resolve_tushare_fund_identity(
    content, admission, *, symbol, start, end, data_as_of, observed_at,
)
```

返回冻结 dataclass `TushareFundIdentity`（同文件第 120 行），字段为 `query_fund_code`、`currency`、`evidence_ref`、`evidence_sha256`、`content`。原 `bytes` 保留，不重排 JSON 或回填时间；不读文件、凭据、SDK、不生成事件、不注册库存。

- bundle 顶层严格为 `contractVersion: 1`、`kind: 'tushare-fund-identity'`、`mappings`，数量 1..1000，UTF-8 原文字节 1..1 MiB；重复 JSON 字段（含转义同名）、额外键、无效 JSON、非有限常量、深层嵌套与超长整数均稳定拒绝。
- 每项严格包含 `symbol/instrumentType/queryFundCode/scopeDateFrom/scopeDateTo/observedAt/identityEvidence/dividendCurrencyEvidence`。只接受 ASCII 六位 `.SH/.SZ` ETF，同完整代码查询；OF、净值基金、Unicode 数字、跨代码/交易所、缺后缀和非规范空白拒绝。即使代码相同也需要身份依据。
- 两种证据角色分别必填，无账号 HTTPS 原文引用及小写 SHA-256。分红币种只能显式来自独立 `dividendCurrencyEvidence` 的 CNY/HKD/USD；同一权威原文可列入两个角色，但不会从交易币种或身份依据推币种。
- 复用 `event_admission_snapshot` 核对结构、consumer、状态、未撤销与修订字段，复用 `route_admission_scope_applies` 核对完整请求范围。精确 route 为 `data/CN/ETF/CASH_DISTRIBUTION`，target 为 `tushare/tushare`。原字节摘要必须同时匹配准入 ref/hash。
- 每个 mapping 均须在准入标的/日期范围内，而非找到请求项就提前返回；每个证券唯一，选中 mapping 覆盖整个请求。日期必须为合法规范 ISO date，调用 `observed_at` 必须是 aware datetime。

错误统一为稳定的 `tushare_identity_*` 分类，不传播原始 JSON/URL 或标准库错误内容。此纯合同校验引用关联，不审核公告经济语义，不核验当前适配/来源/账号修订，不证明历史覆盖。

## 精确时间与旧原语适配

新模块私有时刻解析按四位合法公历年、显式已知偏移、秒与最多 1024 位小数校验；拒绝 `-00:00`、非法偏移、无时区和超限输入。整数 UTC 秒与等宽小数字符串分别比较，未通过浮点、毫秒或微秒转换来判定顺序。等价时区偏移及小数尾零相等。

所有原始 `validFrom/validUntil/recordedAt`、`data_as_of`、实际读取观察和 mapping 观察先精确比较：`validFrom <= observed_at < validUntil`，准入记录不晚于实际观察及冻结截点，每项证据不晚于准入记录、实际观察和冻结截点。未来一纳秒及 1024 位小数末位的未来证据均拒绝。

既有 `event_admission_snapshot` 使用原生 datetime，超过微秒的小数会截断。新模块第 86 行的局部适配只在精确判定通过后，对送入旧原语的 `validUntil` 取微秒上界；`validFrom/recordedAt` 的截断由此前精确下界和顺序检查覆盖。投影只供旧原语检查状态和结构，不返回、冻结或发出投影字段；输入 admission 不修改。若上界投影在 `datetime.max` 溢出，稳定失败关闭，即使精确比较仍在有效期内也不放行。该限制有定向测试，不改旧原语或其调用方。

后续 wire、运行入口、在线选择和离线 Snapshot 必须按原字符串重新核验相同精确时刻与准入边界，不能使用旧原语或投影结果替代精确判定。原 evidence bytes/ref/hash 必须全程保留；消费者先更新，生产者才启用独立字段。Tushare 不使用 RQData 的 `identityEvidence`。

## 实际验证

执行目录：`/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`。没有调用全包、构建、容器、共享数据库或目标门禁。

| 命令 | 输入与最终结果 |
| --- | --- |
| `rtk proxy .venv/bin/python -m pytest tests/test_tushare_fund_identity_evidence.py tests/test_rqdata_fund_identity_evidence.py tests/test_thesis_ledger_mapping_evidence_store.py -q` | 最终 197 passed、2 个既有 Starlette/anyio 弃用警告，0.29 秒；新 resolver 155 项、RQData 35 项、存储 7 项。 |
| `rtk proxy .venv/bin/python -m flake8 src/services/tushare_fund_identity_evidence.py tests/test_tushare_fund_identity_evidence.py` | 更新后的两个文件通过，退出码 0。 |
| `rtk proxy .venv/bin/python -m py_compile src/services/tushare_fund_identity_evidence.py tests/test_tushare_fund_identity_evidence.py` | 更新后的两个文件通过，退出码 0。 |
| `rtk git diff --check -- src/services/tushare_fund_identity_evidence.py tests/test_tushare_fund_identity_evidence.py` | 退出码 0；两文件为新未跟踪文件，另外以 Node 直接检查原文件，均 0 尾随空白。 |

首轮 195 项通过后，自审补充超长 JSON 整数/深层 JSON 的稳定拒绝及两项反例，因此因源码输入变化重新执行上述定向组合，最终 197 项通过。没有验证失败或重试，不增加任何外部请求预算。测试输入均明确是 `.example.test` 与 synthetic 准入的离线合同输入，不代表真实标的、公告、币种审核或账号授权。

实际反例覆盖独立币种缺失/非法、OF/Unicode/跨码、全部 mapping scope、完整请求覆盖、精确 route/target、原字节摘要、撤销/过期/未来记录、微秒/纳秒/1024 位小数边界、等价偏移、未知偏移、精确相等到期、到期投影不改原文与最大时刻溢出拒绝。原 bytes 在最大 1 MiB 合法空白填充下仍保留，超限与 1001 项映射拒绝。

## 输入与产出摘要

源码产出为 183 行，测试产出为 316 行；既有 RQData resolver 和 MappingEvidenceStore 摘要与前沿发现相同。

| 文件 | SHA-256 |
| --- | --- |
| DSA `src/services/tushare_fund_identity_evidence.py` | `3fb8b53a019146789bad5a126136898f9a30b55094f1a2edc6930ad4cf9f599b` |
| DSA `tests/test_tushare_fund_identity_evidence.py` | `5717b33a9af9eb4976514bd6ba0d99d3b66ea0f4d2fec36364aa9a22b0010bc2` |
| DSA `src/services/thesis_ledger_event_admission_v3.py` | `004272342c5ddebeac79cbe3559af744edd916a6cb6101b5d2e3174256e8772f` |
| DSA `src/services/thesis_ledger_route_admission_v3.py` | `08d113b8103c0924f25aba6985cff84421a58647e27708a62aec9094ce337537` |
| DSA `src/services/rqdata_fund_identity_evidence.py` | `1ea97d049588c15eafc4ef37d5a292a5cd809e1a9383d63cb872697af6b54f90` |
| DSA `src/services/thesis_ledger_mapping_evidence_store.py` | `b3c7bfb481d620bec4c6f4c2b0df0f343cec58b47557dad2150e91529f35410a` |
| DSA `tests/test_rqdata_fund_identity_evidence.py` | `bc39128c58e4725afac37848a81cb07c83fc52c0638fa3a22678fb3b05a6c980` |
| DSA `tests/test_thesis_ledger_mapping_evidence_store.py` | `f4202b33e4c0f36e3a789788c808c4d9abe62f471fb2884bb701b483ced31b22` |
| 主 Spec（本轮读取的共享输入） | `2f4831e8ac74d29884ed3439ca128f636d0971c3e5342abfca9666b9e6708fbe` |

下一依赖是独立共享 wire 叶：按此纯出口和原字段合同建立 Tushare 专属 bundle 与事件响应字段，保留原小数秒字符串。Schemas/Server 消费、DSA 文件加载及读取编排、当前凭据/适配修订、库存/HTTP、目标部署、真实代码映射/币种/权限/历史覆盖均未完成；本叶不领取后继。全部命令已结束，无后台进程或共享资源占用，源码写权交还协调者。
