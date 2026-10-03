# Tushare 分红内部映射读取证据

日期：2026-09-28。任务：`M26-b2-mapped-read`。状态：`worker_done`，纯内部读取编排通过本地组合验证；来源准入、公共 wire、库存及目标执行继续开放。

## 边界与依据

依据主 [Spec §4](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)、[Task §12.9](../2026-09-25-multi-source-adjustment-aware-backtest.md) Ready 叶及 [纯解析证据](2026-09-28-cont-m26-identity-resolver.md)。本叶独占新 DSA `src/services/thesis_ledger_tushare_mapped_read.py`、`tests/test_thesis_ledger_tushare_mapped_read.py` 与本文；全部既有 resolver/reader/store/凭据/Fetcher/Spec/台账保持只读。全程 apply_patch 手动编辑，保留脏工作区；无暂存、提交、子代理、生产配置/账号读取或真实 Provider 请求。

测试仅使用独立临时 SQLite ControlStore、内容寻址文件、明确 synthetic 环境快照和受控 HTTP 响应；没有操作目标库、目标配置、容器或运行态。没有调用全量测试/构建/部署，也没有申请或重置外部请求预算。

## 出口与当前修订

DSA `src/services/thesis_ledger_tushare_mapped_read.py:80`：

```python
read_tushare_mapped_fund_dividends(
    symbol, *, database_path, start, end, data_as_of, read_admission,
    read_credentials, read_master_key, build_fetcher, timeout_seconds,
)
```

返回冻结 `TushareMappedFundDividends(result, identity)`。`result` 保留实际 Reader 的 facts/observations/retrieval/providerRevision 和不完整 coverage；`identity` 为既有冻结 `TushareFundIdentity`，含原 bundle bytes/ref/hash/query/currency。没有公共响应字段、账号快照或内部凭据修订出现在返回对象中，也不返回准入投影。

模块独占两个供后继库存单向消费的常量：

- `TUSHARE_FUND_DIV_ADAPTER_REVISION = 'dsa-tushare-etf-fund-div-identity-v1'`
- `TUSHARE_FUND_DIV_SOURCE_REVISION = 'tushare-fund-div-symbol-history-decimal-v1'`

它们表示已实施本地适配与精确请求协议，不是上游数据历史版本。现有 `market_v3_current_route_revisions/_market_v3_admission_matches_current` 对未注册的 Tushare CASH 返回不可用；本叶未用该 matcher 宣称正向通过。经协调者确认，本模块逐项核对当前准入的上述两个值，并使用真实凭据 HMAC；库存叶需要登记这些常量后再核验生产 matcher。

## 实际复用接口与行为

| 接口 | 本叶实际使用方式 |
| --- | --- |
| `MappingEvidenceStore` | 从显式持久化 Control 路径同目录、当前准入的 sha256 引用加载原字节；内存路径拒绝，读后重新加载同一文件并核对。 |
| `resolve_tushare_fund_identity` | 读取账号前核验精确 CN ETF CASH/Tushare 准入、独立身份和币种、所有映射范围及精确时刻；读取后再次按实际观察时刻核验原准入/证据。 |
| `ProviderCredentialSnapshot.create` | 将已读取环境快照复制为不可变值集合，限定 tushare/environment/token；同一经核验快照传入构造回调。Control 来源不扩大为 Tushare 可用凭据。 |
| `provider_credential_revision` | 复用既有用途隔离 HMAC，绑定真实快照中的 Token/精确接入地址与主密钥/版本；读前、读后均读取当前快照/主密钥并用恒时比较，不新建安全哈希实现。 |
| 必传 `build_fetcher(snapshot)` | 可信运行时构造接缝；测试真实调用 `runtime._adapter('tushare', snapshot=snapshot)`，没有永远为 true 的修订检查。返回对象必须是既有 FundDividendsMixin，冻结 token/http_url 相同；错快照拒绝。 |
| `TushareFundDividendsMixin.get_fund_dividends_for_source` | 明确已核验 query code、ETF、币种、经济窗口和剩余预算；复用实际 `TushareHistoryRequest`、`fetch_tushare_fund_dividends`、HTTP JSON/Decimal 解析与现有标准化。没有 SDK 初始化或其他 endpoint 回退。 |

读取前复制当前准入、核对本地修订，加载身份证据后才允许读取账号。缺准入、错误 route/target、身份缺失/损坏/未来、缺独立币种均零账号读取、零 Fetcher 构造和零来源调用。快照/HMAC 不符时同样不构造 Fetcher 或调用来源。

读取后重新读取当前准入并检查本地修订，完整记录必须与原记录相同；证据文件必须保持相同原字节，再调用 resolver 重验。实际凭据/接入地址/主密钥变化、清除、准入撤销或修订变化、文件摘要损坏/删除均拒绝晚到结果。原准入时间字符串和 bundle bytes 保留，不公开 resolver 的微秒投影；纳秒有效期在读后重新核验。还核对读取结果的精确协议、内容版本、事实身份/币种及显式 coverage=false，不能由一个修改后的 Reader 自称完整覆盖。

## 预算与限制

入口要求正数有限的总 timeout，布尔值拒绝。一次 monotonic 总期限覆盖本地加载、身份/凭据核验、Fetcher 构造、来源读取及读后复核；来源调用仅获得当时剩余预算。复用 Reader 的默认 2000 行本地预算，不推定上游分页取尽；空集及窗外事件内容版本仍由既有 Reader 保留，coverage=false。

现有 `TushareHistoryRequest` 在精确调用前后检查期限并把剩余值设置为 HTTP timeout，配额耗尽拒绝、不等待或重试，历史请求禁止重定向。外层再次拒绝超过总期限的晚到结果，构造超时也不请求来源。该能力是原生 HTTP timeout 与晚到拒绝，不是 spawn 子进程或强制终止请求线程；HTTP timeout 的传输行为沿用现有 Requests 客户端。账号或证据回调自身若阻塞，返回后也不能成为成功结果，本叶不宣称可以中断任意阻塞回调。

来源错误以稳定的内部失败分类返回，原上游文本不传播；权限/完整历史必须由真实门禁另验。保留实际事实 `availableAt` 和观测 `observedAt`，不把观察时间回填到历史事件日；内部观测结果也不自动获得最终冻结/PIT 资格。

## 验证结果

执行目录：`/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`。

| 命令 | 最终结果 |
| --- | --- |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_tushare_mapped_read.py tests/test_tushare_fund_identity_evidence.py tests/test_thesis_ledger_rqdata_mapped_read.py -q` | 210 passed：新 mapped-read 44 项、resolver 155 项、RQData mapped 11 项；2 个既有 Starlette/anyio 弃用警告；最终 1.39 秒。 |
| `rtk proxy .venv/bin/python -m flake8 src/services/thesis_ledger_tushare_mapped_read.py tests/test_thesis_ledger_tushare_mapped_read.py` | 两个新文件通过，退出码 0。 |
| `rtk proxy .venv/bin/python -m py_compile src/services/thesis_ledger_tushare_mapped_read.py tests/test_thesis_ledger_tushare_mapped_read.py` | 两个新文件通过，退出码 0；仅产生可重建缓存。 |
| `rtk git diff --check -- src/services/thesis_ledger_tushare_mapped_read.py tests/test_thesis_ledger_tushare_mapped_read.py` | 退出码 0；新文件未跟踪，另用 Node 检查原文件，均 0 尾随空白。 |

首次 209 项通过；补充读后纳秒到期、原准入不变的定向断言后，因测试输入变化重新运行所列组合，最终 210 项通过。没有失败或重试。

实测覆盖精确 query/currency、不可变快照、同一快照实际 HTTP 地址/Token、单一 fund_div/无重定向、真实 HMAC 及前后 Token/endpoint/主密钥轮换、local revision/recordVersion/撤销/文件原字节变化、空集稳定版本与同修订限流计数复用、无 retry/SDK/endpoint fallback、非法/耗尽总预算、构造晚到零来源调用、读后纳秒到期及完整覆盖声明拒绝。请求只被本地 Mock 响应接收，不联网；没有生成真实审核证据。

## 摘要与交接

产出源码 142 行、测试 329 行。输入摘要用于后续稳定验证识别实际范围；它们不是生产部署证明。

| 文件 | SHA-256 |
| --- | --- |
| DSA `src/services/thesis_ledger_tushare_mapped_read.py` | `436d4fc0d4daccb69d10388ce266d505ae3a0db37f7983448cc98c3b894acf95` |
| DSA `tests/test_thesis_ledger_tushare_mapped_read.py` | `d8eb973fc17eca98822b8ee3042c668bf9f749f562b737a9cead7db37f665c7c` |
| DSA `src/services/tushare_fund_identity_evidence.py` | `3fb8b53a019146789bad5a126136898f9a30b55094f1a2edc6930ad4cf9f599b` |
| DSA `tests/test_tushare_fund_identity_evidence.py` | `5717b33a9af9eb4976514bd6ba0d99d3b66ea0f4d2fec36364aa9a22b0010bc2` |
| DSA `tests/test_thesis_ledger_rqdata_mapped_read.py` | `a0991102f0b6ddd7184988ce1fff3855c606af99925c0bd86b0e3484dd4d2c92` |
| DSA `src/services/provider_credential_revision.py` | `be98800a94f216d609539ae3269f6bf9298be2d413059c50817e33fd27c83c3b` |
| DSA `src/services/provider_credentials_runtime.py` | `85bedf416b480e4b59b725b91a0710bb93b08e3a99b339eae3963bf287f428f0` |
| DSA `src/services/thesis_ledger_control.py` | `ab21053693486ee06cd433f2a128197db0b1cced063825dd485d85afd9026b38` |
| DSA `src/services/thesis_ledger_provider_runtime.py` | `ef5ec245a27214fe2909d69ca583b216fd0b9b4fe0611d309b21776b488960d1` |
| DSA `data_provider/tushare_fund_dividend_reader.py` | `c0428506e6855404bcf0a2322387dda4db081003e8ced823b5cb1f730802e25b` |
| DSA `data_provider/tushare_history_request.py` | `2b12df3e7fa243405bff317deff576079c62aa2b0fd3f61de9390f2d917d99a1` |
| DSA `data_provider/tushare_fetcher.py` | `fe0d7c99e91433571d1bbd496c734511854e8e399db3d89497f8a107a746919f` |
| DSA `src/services/thesis_ledger_mapping_evidence_store.py` | `b3c7bfb481d620bec4c6f4c2b0df0f343cec58b47557dad2150e91529f35410a` |

后继生产库存叶需要先具备共享 wire 与消费者，再单向消费本模块的两项修订和内部读取出口；显式提供当前准入、真实环境快照、主密钥和可信 Fetcher 构造接缝，完成实际登记后验证生产 matcher、HTTP 正反例和策略/目录读后复核。本叶未接公共 wire、未应用策略/准入、未注册库存、未部署；真实映射/币种审核、逐接口权限、分页/完整历史覆盖及目标正向消费仍单列未完成。

全部命令已结束，无后台进程或共享资源占用。写权交回协调者，不自行领取后继任务。
