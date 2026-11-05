# C04 跨仓契约核验

## 本轮结果

消费侧 `apps/server/test/integration/dsa.client.test.ts` 13 项通过，涵盖独立 Control/Data Token、V3 handshake、requestId/版本错误、目录完整性、Apply 身份、目标 pin、五类 Data 错误信封与旧 V2 GET。

Schemas 的 `market-control-wire-v3`、`market-data-wire-v3`、`market-event-wire-v3` 共 42 项通过。DSA 的 `test_thesis_ledger_control_v3.py`、`test_thesis_ledger_market_v3.py`、`test_thesis_ledger_split_event_control_v3.py` 共 36 项通过。合计 91 项定向检查通过，使用当前未提交工作区。

## 发现与修复

首轮 DSA 30 项中 29 项通过，目录断言仅预期 CASH_DISTRIBUTION，遗漏新增 SPLIT_EVENT。核对 `thesis_ledger_event_v3_adapters.py` 的精确库存与拆分控制测试后，更新完整列表断言，明确两项均为 not_admitted。保留列表严格相等，未改成部分包含或弱化准入条件。修复后首次重跑及拆分控制扩展检查全部通过，无需第二次重试。没有生产代码或部署变更。

## 证据边界与后续

两端 Control 测试使用主仓 `packages/schemas/fixtures` 的共享输入；DSA 同时检查旧 V1/V2 handshake 可用和不支持版本拒绝。上述为本地 HTTP/Schema/Client 测试，不证明真实 Provider 可用。C04 仍依赖未关闭的 C03；需继续核验新旧运行/快照及封存边界，不能仅按本轮测试总数关闭父项。

命令分别为 Server/Schemas 的 `pnpm --filter <包> exec vitest run <上述文件>`，DSA `.venv/bin/python -m pytest -q <上述文件> --tb=short`。测试无真实来源调用，未创建目标回测或 AI 作业。

## 收口复核

C03 已通过格式/解码与目标加载器验证，前置项解除。本轮补跑 DSA `test_thesis_ledger_contract.py`、`test_thesis_ledger_control.py`、`test_thesis_ledger_events_v3.py`、`test_thesis_ledger_data_v3_target_pins.py` 共 70 项通过，补齐旧兼容入口、事件信封与精确目标行为。此前 36 项 DSA 和 13 项消费侧检查的相关输入未变；共享 Schema 全包最新 330 项通过，包含旧 strict schema、新 V3 语义与安全错误验证，不重复累计子集作为额外测试。

逐项结论：共享 fixture 被两端解析；Control/Data 独立版本与令牌、未知版本拒绝、旧 V1/V2 入口保留、V3 requestId/目标匹配、安全错误码，以及 DSA 不接收记账语义均有检查覆盖。C04 仅承诺 wire 一致性，不包含 Provider 或部署，现范围内通过。真实来源和 S09/I01 等运行验收继续开放。
