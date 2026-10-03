# CONT-M26 事件生产接缝静态证据

日期：2026-09-28。结论：`needs_split`。本轮只读核对 DSA 稳定源码及测试，唯一写入本文件；未执行网络、账号读取、数据库或业务请求，未执行测试。Context Mode 工具未提供，使用 RTK 并限制输出。未读取正在变更的 Schema 或 `src/services/thesis_ledger_tushare_mapped_read.py`，其最终导出需由该叶交付方确认。

## 已固定边界

- 精确库存为 CN ETF `CASH_DISTRIBUTION` × `tushare/tushare`，不注册 Tushare SPLIT，不把宽 manifest 能力当准入。
- 独立 identity/dividendCurrency 原文 bundle，完整 ASCII `.SH/.SZ`，不能复用 RQData 身份协议。
- 库存从 mapped 模块单向 import 来源专属 adapter/source revision 常量；mapped 不反向依赖事件库存。
- adapter/source revision 是本地适配协议及字段规则版本，不是 `upstreamDataVersion` 或 `source_firstAvailableAt`。现有 reader 的空/非空内容哈希 `providerRevision` 可保留，不能证明历史完整性；`coverage.complete=false`。
- 原文 wire 为 `identityEvidence={ref,sha256,content}`，`content` 必须保持 raw UTF-8，Server 重算 SHA；不能 JSON parse 后重新编码替代原文。

## 精确接缝与实际签名

以下路径均相对 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`。

| 文件与位置 | 当前接缝 | 后继要求 |
| --- | --- | --- |
| `src/services/thesis_ledger_event_v3_adapters.py:29` | `event_adapter_matches(key: Mapping[str, Any], target: Mapping[str, Any]) -> bool` | 只增加 Tushare CASH 的精确匹配，不能因来源加入而把 SPLIT 一并放行 |
| 同文件 `:35` | `event_adapter_revisions(key, target=None, credential_revision=None) -> dict[str,str] \| None` | Tushare 绑定 HMAC credentialRevision，并消费 mapped 交付的来源专属常量 |
| 同文件 `:43` | `iter_event_adapters()` | 新增单个 gated CASH target，供目录单向消费 |
| `src/services/thesis_ledger_market_v3_revisions.py:65` | `market_v3_current_route_revisions(key,target,provider_manifest,*,credential_version=None,credential_revision=None)` | 事件分支现在仅认为 rqdata requiresCredential=true，必须加入 Tushare 精确来源；不要改 bar 行为 |
| 同文件 `:172` | `_market_v3_admission_matches_current(admission,key,target,provider_manifest,*,credential_version=None,credential_revision=None)` | 比较 adapter/source/credential revision，并校验 admitted、consumer、symbol/date scope；HMAC 以常量时间比较 |
| `src/services/thesis_ledger_catalog_manifest_v3.py:9` | `catalog_manifest_matches_v3(provider,key,target)` | 已优先认 event_adapter_matches，不需要扩大 Tushare 宽 manifest 的 CASH 能力 |
| `src/services/thesis_ledger_control.py:1785` | `_v3_target_reason(connection,policy,key,target,configurations)` | 已按 event_adapter_matches 跳过宽 capability 验证；仍核市场、source、配置、admission、health |
| `src/services/thesis_ledger_provider_runtime.py:451` | `_current_market_v3_admission(self,key,target,*,credential_snapshot=None)` | RQData 已有专属叶；Tushare 事件必须独立分流，不能沿用先解凭据的通用分支 |
| 同文件 `:494` | `_catalog_market_v3_admission_is_current(self,key,target,provider)` | Tushare 事件专属当前性检查；现有 Tushare bar 检查不可误改 |
| 同文件 `:1825` | `market_route_catalog_v3(self) -> dict[str,Any]` | inventory 包含 bar 与 event 全部来源；返回完整 entries 并对 integrity/entries 做 SHA 导出 catalogRevision |
| `src/services/thesis_ledger_event_v3.py:22` | `parse_event_request(value:Any) -> dict[str,Any]` | 完整字段集合、ASCII symbol、routeIndex=0/1、正整数 revision、UTC/asOf；经库存允许才继续 |
| 同文件 `:60` | `_admitted_state(runtime,request)` | 当前 policy、catalog、admission/scope 精确门禁；快照排除 appliedAt/generatedAt，保留完整 entries |
| 同文件 `:117` | `execute_event_request(runtime,payload,*,reader=None)` | 前后 `_admitted_state` 必须相等，新增独立 Tushare production 分支和 identity 原文输出；异常仍脱敏 |
| `api/thesis_ledger_events_v3.py:16` | `market_events(request:Request,payload:Any=Body(...))` | `POST /api/v3/thesis-ledger/market/events`；422 invalid/not_adapted/not_admitted/policy，503其他事件失败 |
| `api/thesis_ledger.py:104` | `require_contract_token(request,authorization=Header(default=None))` | 读取 `THESIS_LEDGER_DSA_TOKEN`；缺配置503，不匹配401；独立 Control Token 不是此入口凭据 |

存储实际接口：`get_route_admission_v3(*,key,target,consumer=CONSUMER_NAMESPACE,now=None)`；`record_route_admission_v3(*,key,target,evidence_ref,evidence_sha256,scope_symbols,scope_date_from,scope_date_to,adapter_revision,source_revision,credential_revision,valid_from,valid_until,recorded_by,consumer=CONSUMER_NAMESPACE)`；`effective_policy_v3()`；`provider_credential_snapshot(provider_id)`。admission 记录方法未暴露给 Control HTTP，不得在普通配置或读取中自动创建准入。

身份稳定接口：`resolve_tushare_fund_identity(content,admission,*,symbol,start,end,data_as_of,observed_at)`，返回 frozen `TushareFundIdentity(query_fund_code,currency,evidence_ref,evidence_sha256,content)`。它是纯校验，不读来源、文件或凭据。`MappingEvidenceStore(root).read(reference) -> bytes` 与 `.put(content) -> str` 可读写内容寻址证据；生产映射要求真实文件路径，不能用 `:memory:`。

RQData 生产样板实际接口：`current_rqdata_event_admission(store,key,target,manifest)`；`read_rqdata_events_v3(runtime,request)`；`read_rqdata_mapped_fund_event(kind,symbol,*,database_path,start,end,data_as_of,read_admission,read_credentials,read_master_key,timeout_seconds,maximum_rows=2000)`；`read_rqdata_fund_event_with_credentials(kind,symbol,*,admitted_credential_revision,read_credentials,read_master_key,timeout_seconds,**options)`。mapped 先读 admission+原文并 resolve，credential 叶使用首次不可变 snapshot 建立来源 client，调用后重算 credential revision，mapped 再核 admission/原文/identity。

Tushare 已有底层 reader：`fetch_tushare_fund_dividends(api,symbol,*,instrument_type,currency,start,end,before_call,maximum_rows=2000)`；`TushareFundDividendsMixin.get_fund_dividends_for_source(self,symbol,upstream_source,*,instrument_type,currency,start_date,end_date,timeout_seconds=15)`。底层一次 `fund_div(ts_code=完整symbol,fields=FIELDS)`，`upstreamDataRevision=None`、`upstreamPaginationVerified=False`，不证明全部历史。

## 当前门禁的真实顺序与风险

当前执行顺序是 parse → `_admitted_state` → effective policy → catalog → current admission → source read → 相同 `_admitted_state` → admission wire projection/facts验证。事实校验含同 symbol/CN/ETF/provider、现金类型、effectiveDate 范围及 availableAt≤asOf/fetchedAt。

**不能仅套 RQData 叶就声明无 admission/identity 时零账号读取。** 三处提前读取是明确源码行为：

1. `_admitted_state` 首先 `effective_policy_v3()`，经 policy projection、`_effective_v3`、`_v3_target_reason`，在取 admission row 前调用 `_provider_configured`；它经 `_credential_state` 可解密 control 密文或读取环境账号。
2. `market_route_catalog_v3` 首先 `provider_registry()`；`thesis_ledger_control.py:2515` 对所有 manifest 调 `_credential_state`，随后目录还会扫描现有 Tushare bar，并经通用 `_catalog_market_v3_admission_is_current` 在 get_admission 前取 snapshot。
3. 通用 `_current_market_v3_admission` 的 Tushare 分支也是 snapshot → revision → get_admission。RQData 专属叶只阻止 missing admission 提前 snapshot，不在当前 admission 解析阶段核 identity 文件。

后继最小方案：parse 后、任何 effective policy/catalog 调用前，新增 **不读账号** 的 Tushare admission/协议修订/有效期/scope + 原文 identity 预检；预检失败立即终止。预检只校验静态来源协议修订、精确原文与当前 admission 时刻，不能授予真实 ready。预检通过后复用现有完整 policy/catalog/security/HMAC 检查，再进入 mapped 叶取首次 immutable credential snapshot。调用前和调用后重核 identity bytes/ref/hash、admission、policy、完整 catalog、credential revision、安全上下文。不能先作 snapshot 校验才补 identity 预检。实际测试必须 spy `_credential_state`/环境凭据入口及 snapshot，而不只是 snapshot。缺 identity 的早返回即可阻断现有扫描，不需要扩大为通用目录扫描重构。

`ProviderCredentialSnapshot` 是 frozen dataclass，values 为 `MappingProxyType(dict(values))`。Tushare HMAC 绑定 token + `httpUrl` + master key，不依赖无关 config version；来源 client 必须只使用核验过的首次 snapshot，不能在调用中重读环境/token/endpoint。目录扫描可能读取同来源其他 bar 的 snapshot；实现需要区分它与实际 source client 使用的固定 snapshot。

HTTP 安全当前只有 Depends 的入站 Bearer 检查，没有 after 检查或 securityRevision 快照。若安全配置轮换也必须拒绝晚到结果，HTTP 叶应向 service 提供不回显秘密的 `check_security` 回调，在调用前后复核原请求 authorization 与当前服务端 token，比较其安全配置当前性。不能把 raw token 加入返回内容、日志、admission、catalog 或证据。HTTPException/事件错误映射由入口统一处理；这不是已经存在的接缝，需新增且独立验收。

## 后继最小写集与拆分

按依赖顺序拆成两个小执行包，排他实施，禁止并发修改共同文件：

| 叶 | 独占源码写集 | 验收范围 |
| --- | --- | --- |
| 库存/修订叶 | `src/services/thesis_ledger_event_v3_adapters.py`、`src/services/thesis_ledger_market_v3_revisions.py`；新增定向库存测试文件 | 只注册 Tushare CASH；mapped 常量单向消费；RQData/Eastmoney、bar库存与 credential 条件不回归；实际 SQLite policy 可认该 target |
| 生产 runtime 与受控 HTTP 叶 | 新增 `src/services/thesis_ledger_tushare_event_v3.py`，最小修改 `src/services/thesis_ledger_event_v3.py`、`src/services/thesis_ledger_provider_runtime.py`、`api/thesis_ledger_events_v3.py`；新增 `tests/test_thesis_ledger_tushare_events_v3.py` | 同一执行包内先验证 production runtime，再验证受控 HTTP：policy/catalog 前完成无凭据预检；桥接最终 mapped 公共接口；完整前后门禁；原文 wire；coverage=false；security当前性、错误脱敏、零执行；真实SQLite+HTTP组合 |

第一包没有consumer执行，先冻结库存/修订单向导出；第二包独占事件runtime及HTTP文件，以两个验证阶段证明同一个纵向闭环。不能只实现其中一面就宣称runtime与HTTP安全都完成。不需修改 `api/app.py`，现有 `:395` 已安装事件 router。不需直接扩充宽 provider manifest；既有policy/catalog扫描保持。只有早返回仍不能满足已证明场景时才报告新的写集需求，不把目录扫描重构作为默认扩展。

## 实际 SQLite 与 HTTP 测试方式

`tests/test_thesis_ledger_rqdata_events_v3.py:25` 使用 `tmp_path/control.sqlite`、合成 master key/token、真实 `ThesisLedgerControlStore`、真实 `MappingEvidenceStore.put(raw bytes)`、真实 apply policy 和 record admission，runtime 调实际 catalog。测试 reader 替换最底层 SDK 或 factory，仍走真实 reader/normalizer；`:156` 的 `TestClient(FastAPI+router prefix=/api/v3)` 走完整 Bearer HTTP 并触达真实 spawn，未连外部服务。

Tushare 建议采用相同结构，合成 token/endpoint+identity bundle、真实 SQLite policy/admission；只替换 requests transport 或来源 reader 最底层数据传输，保留 production orchestration/标准化。HTTP 同时覆盖无Bearer/错Bearer/缺token零执行、缺admission/错误identity零账号读取、admitted成功、撤销/账号及endpoint轮换/策略变更/catalog变化/原文篡改/安全配置轮换拒绝晚到结果、不重试、上下游错误脱敏、空/非空事实及coverage=false。错误身份证明还要覆盖目录中已配置Tushare bar，避免仅无bar特例测试。

建议离线定向命令，均未执行：

```bash
rtk python -m pytest -q tests/test_thesis_ledger_event_control_v3.py tests/test_thesis_ledger_events_v3.py tests/test_thesis_ledger_rqdata_events_v3.py tests/test_thesis_ledger_tushare_credential_revision.py
rtk python -m pytest -q tests/test_thesis_ledger_tushare_events_v3.py
rtk python -m py_compile src/services/thesis_ledger_event_v3_adapters.py src/services/thesis_ledger_market_v3_revisions.py src/services/thesis_ledger_tushare_event_v3.py src/services/thesis_ledger_event_v3.py src/services/thesis_ledger_provider_runtime.py api/thesis_ledger_events_v3.py
```

新增测试/叶文件命令需待文件实际存在再执行。未执行 Docker、真实 Provider、外部HTTP或历史覆盖验证；上述离线 HTTP 指进程内 TestClient，不等于目标容器或Server重算SHA验收。
