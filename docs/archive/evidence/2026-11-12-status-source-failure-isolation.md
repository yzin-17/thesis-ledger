# 独立状态来源失败隔离验收

日期：2026-11-12（Asia/Shanghai）。规格：[来源失败隔离](../../specs/2026-11-12-status-source-failure-isolation.md)。原输入：`a05c404c-f72e-4624-9ad1-e2839166b613`，实验：`f2120385-11f7-40b2-9ce5-d59279fcf209`。

## 根因与证据边界

此前实际复算的状态请求返回标准 Data V3 `invalid_response`／502，经 Server 映射后成为未区分来源的 `invalid-response`；人工主备与组合层将其当作协议损坏抛出，导致一项可选来源失败终止整个快照。这条处理缺陷已通过未修复代码的定向测试复现：来源 502 隔离及备用选择共 3 项断言失败，畸形协议拒绝断言通过。

公共费用还有独立且确定的生产端缺陷：旧入口返回 `detail.code/message/diagnosticId`，与 Data V3 的 `detail.error` 合同不符。原来源覆盖不足／不可用被消费端解释为“DSA Data V3 错误响应无效”。新增真实认证入口及全局错误处理测试，在未修复代码上准确复现旧信封结构错误。

同一开发区间的 BaoStock 独立读取当前成功，返回 180 个自然日、117 个交易会话，状态覆盖完整。历史坏响应原始字节没有保存，不能确定那一包上游字段具体如何损坏，也不能声称已修复外部服务本身。此次修复的是已确认的两条本地错误处理缺陷，并验证来源再返回坏响应时的行为。

## 实现与保护

- DSA 的公共费用及旧交易状态入口使用公共安全错误映射与标准信封，保留 requestId。覆盖不足为 422，来源数据无效为 502，不可用为 503，权限、认证、限流及额度状态分别保留；不透传 Provider 原文。
- Server 只为严格通过信封校验且匹配 expectedRequestId 的来源 `invalid_response` 设置来源标记。畸形信封、非标准消息、错关联、未绑定请求及成功响应身份错误均没有此标记，继续阻断。
- 人工主备最多各调用一次；来源数据错误允许尝试已有备用。全部失败时保留来源错误，Market 组合只冻结失败事实，不接受其数据。可选项保持警告，必需项仍被 `evaluateStatusCompositionV1` 判定阻断。
- Schemas 的失败枚举增补 `invalid-response`；整窗与旧组合产物继续由当前读取器验证。离线测试确认失败事实、其他能力和历史快照可以重放。
- `scripts/check-boundaries.mjs` 增加 DSA 错误分类层不得反向依赖 Market、Backtest、实验领域的约束。没有新增队列、任务状态、数据库结构或客户端界面。

## 局部验证

1. DSA：`.venv/bin/python -m pytest -q tests/test_thesis_ledger_rule_error_envelope.py tests/test_thesis_ledger_public_fee_routes.py tests/test_thesis_ledger_trading_status_routes.py tests/test_thesis_ledger_baostock_status_routes.py tests/test_thesis_ledger_http_error_projection.py tests/test_thesis_ledger_baostock_capability_path.py tests/test_thesis_ledger_baostock_query_process.py`，80 项通过。
2. Server：`pnpm --filter @thesis-ledger/server exec vitest run test/market/status-source-error-isolation.test.ts test/market/market-status-composition-reader-v1.test.ts test/integration/dsa-status-route-reader-v1.test.ts test/backtest/status-composition-snapshot-v1.test.ts test/backtest/price-research-subwindow.test.ts`，5 个文件、51 项通过。新增测试随后仅将条件表达改为等价清晰分支，已定向复验。
3. Schemas：`pnpm --filter @thesis-ledger/schemas exec vitest run test/market-status-composition-v1.test.ts`，6 项通过；Schemas 构建、Server build 和 typecheck 通过。
4. 本次 TypeScript 生产代码及测试的 ESLint、修改 Python 文件的 `py_compile` 与 flake8 关键检查通过；运行包装和执行程序的 `node --check` 通过。
5. `node scripts/check-boundaries.mjs`、文件尺寸门禁、DSA `check_thesis_ledger_capability_boundaries.py`、`check_data_runtime_contract.py`、`data_test_scope.py` 通过。数据测试清单已登记新增文件。

DSA 定向测试初次还发现两项旧目录断言未包含现有的 `verification: {state: unverified}`，已按当前目录合同补齐后通过。没有修改生产资格逻辑。

`pnpm guardrails:complexity` 未全量通过：它在 Desktop 的 14 个既有 lint 错误处停止，涉及本次未修改的 `provider-account-access.ts`、`StrategyBacktestDetailSections.tsx`、`StrategyExperimentCandidateDiff.tsx`、`StrategyExperimentDetailSections.tsx` 和 `use-strategy-submission.test.tsx`；另有 192 项复杂度等警告。独立文件尺寸门禁通过，保留 6 个既有警告。本次仅声称所列范围的验证通过，不声称仓库全量检查通过。

## 目标运行态

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all`，无额外行为参数，退出 0。预检和构建通过，DSA、Server、Worker 均健康。镜像保持不变，更新仅在容器可写层；没有数据库结构或外部卷变更。

独立比对宿主与容器产物：

| 产物                                   | SHA-256                                                            | 核对范围             |
| -------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| DSA `api/thesis_ledger_local_rules.py` | `d2635b5517fb42601bae7c623519db704520119cd316b08ddcd2380bf0f17915` | 宿主与 DSA           |
| Server `dsa-client-errors.js`          | `7d380d80d1b88d1eee6a5c9205e7d9e21fcb4b9f91c8eef4c243e05f309d0543` | 宿主、Server、Worker |
| Server `dsa-v3-protocol.js`            | `278ec07b971519f93403f88d4365d677a0bf7045a5c912ff516aa98c91bbdb19` | 宿主、Server、Worker |

## 实际与受控故障验收

共用正式入口 `node scripts/local-runtime/verify-price-research-live.mjs --run-id a05c404c-f72e-4624-9ad1-e2839166b613 --frozen-input --output <报告绝对路径>`，仅复用原冻结价格，不创建策略、正式 Run 或实验，不调用 AI。

| 场景                         | 报告                                                       | 结果                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正常实际来源读取             | `/tmp/status-source-normal-a05c404c-20261112.json`         | 退出 0；备用 BaoStock 交易状态和基础日期纳入组合；3 项可选能力失败；完整计算及两次离线重放通过，校验和 `88eabf5788e805c4`                                           |
| 追加 `--status-source-error` | `/tmp/status-source-injected-a05c404c-20261112-valid.json` | 退出 0；两个已配置交易状态目标分别收到一次受控标准 502，冻结为 `failed / invalid-response`；基础日期事实保留；完整计算及两次离线重放通过，校验和 `4928eb3f15b5ffdb` |

正常和受控场景都读取后复权及原价各 128 根冻结 Bar，计算 117 个权益点、116 次模拟成交。不同场景包含不同冻结事实与观测时钟，不要求跨场景校验和相同。

首版受控注入使用了非标准错误文案，合同校验正确阻断，报告为 `/tmp/status-source-injected-a05c404c-20261112.json`。随后改用共享错误常量才通过；未放宽消息、信封或请求关联校验。

公共费用的实际错误现已稳定分类为 `insufficient-coverage / 422`，不再误报协议格式无效。实际风险警示备用仅支持粗 ST，不满足本次细分类别；价格规则和上市阶段的现有来源未取得事实，均明确保留失败。没有为通过验收改动人工来源或启用能力。

全部场景均得到 `businessStateUnchanged=true`。摘要覆盖 Strategy、StrategyVersion、BacktestJob、Account、LedgerEvent、DesiredProviderPolicy 及修订、OptimizationExperiment、OptimizationAttempt、AiRun。独立 SQL 核对原任务及实验仍为 `failed`，AI 调用数仍为 0。

## 验收结论

AC1–AC4 范围验收通过。此次交付证明来源再次返回标准数据无效时，已配置的可选状态能力会按合同失败并冻结，研究计算仍可继续；必需事实与协议完整性门禁保留。没有运行新的完整 AI 实验，不声称所有外部来源已恢复或持续可用。界面及 Native 配置未变，浏览器布局与 Native compile 不适用。工作区原有改动保留，没有 Git 提交或推送。
