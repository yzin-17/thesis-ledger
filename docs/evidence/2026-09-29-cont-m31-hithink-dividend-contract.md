# M31 HiThink 分红精确候选合同

## 已完成

DSA 新增纯合同 `thesis_ledger_hithink_dividend_contract_v3.py`，固定唯一候选身份 `CN/ETF/CASH_DISTRIBUTION` 与 `hithink/fund-corporate-actions-dividends`，分别标识适配及来源修订。凭据修订只接受 `hmac-sha256-v1:<64 位小写摘要>`；不存在凭据、旧配置版本、原密钥、错误资产/能力、跨来源或宽松键均拒绝。单独测试还断言该候选尚未进入 `iter_event_adapters()`，生产 `event_adapter_matches` 仍为 false，因此目录和 Control 不会因本合同存在而授予事件路由。

DSA `tests/test_thesis_ledger_hithink_dividend_contract_v3.py` 13 项通过；两份新增 Python 文件的 flake8 和 `py_compile` 通过。没有调用真实 HiThink、变更目标 DSA 容器或修改凭据。本批只完成 M31-b2-contract 的安全前置部分，尚未接 Provider manifest、实际准入与生产执行，故该叶及 M31 父项保持开放。

官方分红页已把 `fund_type` 列为必需参数。一次独立只读对照以 `fund_type=exchange&thscode=510300.SH` 得到 HTTP 200、业务 `code=0`、14/14 条，进度仍全为 `"2"`；见[真实字段差异](2026-09-28-cont-m31-live-progress-drift.md)。DSA 有界读取器据此改为要求调用方显式传 `fund_type`，只接受 `exchange` 与 `.SH/.SZ`、`otc` 与 `.OF` 的对应关系；响应保留该请求类型，未知类型或错配在出站前拒绝。该变更不解释数字进度，也不增加历史覆盖。

修改后读取器、标准化器及候选合同三文件共 46 项测试通过，受影响 Python 文件的 flake8、`py_compile` 通过。目标 DSA 未更新；本地读取器传参修正和单次手工真实响应分别成立，尚未证明生产事件入口、Server 冻结或历史覆盖。

## 后续条件

按主 Task 的 M31-b2-runtime 先建立独立可核验的 ETF 标的和币种依据，再以同一凭据快照完成前后版本核对、调用有界读取器、严格标准化和事件 V3 输出；只有这一执行路径齐备，才同时把精确来源加入 manifest 与事件库存。真实 `progress="2"` 无官方释义，当前标准化会拒绝；单次响应 `historyComplete=false`。真实权限、历史覆盖、公告和目标 Server 冻结消费分别归 M31-b2-target/G0-H/G-M2-Events，不由本地合同测试替代。
