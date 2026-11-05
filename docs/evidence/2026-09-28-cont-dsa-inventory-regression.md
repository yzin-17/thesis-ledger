# DSA 库存与兼容断言只读分诊（2026-09-28）

## 范围与结论

本记录只对账官方 DSA 隔离 `offline-tests` 的三项失败；该轮结果仍为 **7208 passed / 16 failed / 1 skipped / 4 deselected / 594 subtests passed**，见 `docs/tasks/evidence/2026-09-28-cont-dsa-stable-gates.md:41,63-65`。本叶只读 DSA 源码、测试和合同，未运行 Provider、数据库、全包或目标环境，也未修改断言。本记录不能把全包记作通过。

| 失败 | 当前源码与合同事实 | 判定与剩余风险 |
| --- | --- | --- |
| `tests/test_thesis_ledger_control_v3.py:200-285` 的事件精确列表 | 断言仅列 EastMoney cash/split 与 RQData cash/split 四项（`225-243`）。`src/services/thesis_ledger_event_v3_adapters.py:11-25,34-61` 另登记唯一 `CN/ETF/CASH_DISTRIBUTION → tushare/tushare`；`src/services/thesis_ledger_provider_runtime.py:1833-1842` 将事件库存纳入目录，`1856-1888` 按配置和当前精确准入决定状态。`src/services/thesis_ledger_catalog_manifest_v3.py:7-10` 允许精确事件适配跨宽 manifest 匹配。Spec `docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md:132-138` 定义身份原文与准入；Task 同名文件 `1336-1337` 记录本地库存及生产接线已完成，早期 `636` 的“尚不开放库存”是当时的阶段记录。 | **固定 expected 过期**，新增条目不是意外放宽；该隔离环境中的 `not_admitted` 只说明当前没有满足准入，不能作为所有环境的固定状态。M26-b2/c 和真实历史覆盖仍开放；目录条目不得推断 ready、完整覆盖或真实账号权限。 |
| `tests/test_thesis_ledger_provider_runtime.py:124-158` 的注册集合与抓取器集合 | `src/services/thesis_ledger_control.py:275-276` 增加 `rqdata`，宽 `capabilities={}`；`src/services/provider_manifest.py:18-42` 为其生成空 source 能力。`src/services/thesis_ledger_provider_runtime.py:64-76,556-560` 的通用 `_PROVIDER_ADAPTER_IMPORTS` 无 `rqdata`，但精确事件执行有专门路径（同文件 `473-476`；`src/services/thesis_ledger_event_v3_adapters.py:24-31,57-61`）。Spec `docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md:120` 明定“注册和配置成功不授予事件能力”；`tests/test_rqdata_control_credentials.py:67-72` 明确期待空宽能力。 | **注册 expected 过期**；不能仅向现有 set 增加 `rqdata`，否则其下一句 `_PROVIDER_ADAPTER_IMPORTS == registry - {hithink}` 仍错，并误称 RQData 有通用 fetcher。要分别验证注册集合、通用 fetcher 集合及 RQData 空宽能力/精确事件库存。真实映射、币种、逐接口权限与覆盖仍未由注册证明。 |
| `tests/test_thesis_ledger_provider_route_v2.py:44-69` 的 `hithink/DAILY_BAR has no executable source` | 测试 `51-55` 要求**某一个** source 的资产集合包含 provider-wide `ETF,STOCK`。实际 `src/services/thesis_ledger_control.py:126-149` 有意将 ETF 限于 `fund-market-historical`、STOCK 限于 `hithink-financial-api`；`src/services/thesis_ledger_control.py:770-780` 的 V2 校验逐 source 检查资产。`tests/test_thesis_ledger_hithink_legacy_route_gate.py:113-216` 已覆盖 V1/V2 的未准入与错配拒绝；`src/services/thesis_ledger_control.py:1733-1748` 使正确配对的 V2 HiThink 仍为 `not_admitted`，`src/services/thesis_ledger_provider_runtime.py:1020-1058` 不取不可选目标。HiThink 真实精确执行只在 V3 分流（同文件 `518-533,1699-1725`）。 | **测试把 provider 能力并集误当单一 source 的能力**；当前没有由此失败证明的 V2 行为回归。也不能把两个 source 扩为 `ETF,STOCK` 来满足断言，那会让 V2 接受错误配对。V2 兼容边界是保留旧策略可解析、错配拒绝、正确配对未准入；这符合 Spec AC15（`docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md:515`），并不承诺 HiThink V2 可执行。旧 raw、其他市场、NAV 与旧 Snapshot 重放仍需独立验收。 |

## 最小修复方案（未实施）

1. 仅改 DSA `tests/test_thesis_ledger_control_v3.py` 的事件 expected：增加精确 Tushare cash 身份，保持事件唯一数和目录完整性检查；对运行状态使用确定性的未准入 fixture 或逐项检查状态来源，避免把全局 `not_admitted` 写死成所有环境的能力结论。定向执行该测试、`tests/test_thesis_ledger_tushare_event_registry_v3.py` 与事件准入拒绝用例。
2. 仅改 DSA `tests/test_thesis_ledger_provider_runtime.py` 对注册与 `_PROVIDER_ADAPTER_IMPORTS` 的分组断言，加入 `rqdata` 注册、验证其宽能力为空并保持通用 fetcher 不含 `rqdata`；关联执行 `tests/test_rqdata_control_credentials.py` 的注册/只写凭据用例。
3. 仅改 DSA `tests/test_thesis_ledger_provider_route_v2.py` 的库存不变量：每个 source 的能力必须是 provider-wide 子集、每个 provider-wide `capability × assetType` 至少由一个合法 source 覆盖，source ID 唯一；不要要求单个 source 覆盖整项资产并集。关联执行 `tests/test_thesis_ledger_hithink_legacy_route_gate.py` 的 V1/V2 正确配对、错配和未准入用例，必要时补一条 ETF source 不接受 STOCK 的 V2 反例。

以上修复只针对旧测试断言，生产 manifest/适配器无需因这三项失败而放宽。修复后先跑三项定向与各自关联测试、限定 lint/编译，再由共享门禁所有者在输入稳定且隔离前提明确时决定是否重跑官方离线门禁；本叶不授权第三次同前提全包，也不改变其余 13 项失败的状态。
