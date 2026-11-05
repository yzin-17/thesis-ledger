# 探索种子的归一化价格兼容验收

日期：2026-10-30。所属任务：[策略 T19](../../archive/tasks/2026-09-09-strategy-risk-ai-optimization.md#t19探索闭环与目标运行态验收)。本证据关闭 `T19.SEED-COMPAT`，完整 G1 和 T19 仍需真实合法候选及后续闭环。

## 发现与修复范围

本轮使用当前同花顺实际日线准备 `600519.SH`、2025-03-03～2025-08-29 的固定快照，200 个交易日候选预热预算，显式归一化执行和费用假设，市场政策修订 175。执行行情完整窗口摘要为 `794665f12f8b26cf24792655715238fe8bb7ced4e29032c82e77df50c16a86b0`。这属于固定来源归一化研究，不声明严格 PIT 或历史实际交易规则完整。

首次实验 `535ac1ed-4f43-4f20-a4b1-e615e73f60e5` 在模型调用前遇到公告准备；现有准备入口随后完成全部六个月任务，无失败。后继实验 `f98249cb-181a-4b7d-8197-a14dccb8be18` 的基线 Run `231610c5-7187-4771-a746-c7d7f8c68697` 在完整快照检查失败，也没有模型调用。

纯函数复现确认：种子的 `close > 0` 命中 `ABSOLUTE_PRICE_THRESHOLD_UNCONVERTIBLE`，当前来源没有真实价格转换证据。修复仅将新种子入场改为“当前无持仓”；离场仍为持仓状态，原仓位、风险、执行、成本、SignalSource 与探索空间保持。未放宽单位门禁，未修改旧种子或旧实验。

## 本地验证与目标同步

新增正反例：归一化价格窗口允许状态种子，继续拒绝缺转换证据的绝对价格阈值。修复前正例失败、反例通过；修复后连同探索、采纳、回测依赖规划四文件 26 项全部通过。Server 全部源码和测试类型检查、写集 ESLint/格式及完整依赖边界通过。测试中的币种字面量类型首次检查失败后修正，原日志保留。源文件由 310 行减为 308 行，新测试 61 行。

2026-10-30 23:03:27～23:04:08（北京时间）执行 infra `./scripts/sync-code.sh thesis-ledger`，退出 0，Server/Worker 健康。执行前确认没有在途研究、回测、优化或自动化任务。两角色的种子、模型事实和 Provider 服务模块与宿主构建摘要一致，目标纯函数反读为无持仓入场。镜像保持，是可写层更新。五份 Provider 配置、密文、验证元数据及旧审计保持；此前为本轮验收临时启用的两条 JSON Mode 路由仍由独立执行计划持有，最终恢复另行核对。

## 实际基线与后续模型结果

新实验 `111cac80-1087-4ba1-a83e-192a3d9bcba8` 的两条实际基线均成功：

| 区间 | Run | 完整性 | 闭合交易 | 校验 |
| --- | --- | --- | --- | --- |
| 开发 | `dcec32a1-07ff-447b-a2e7-17307a962d8d` | complete | 20 | valid |
| 验证 | `9d83af2a-212e-48d6-b5df-57eb30bb28b4` | complete | 19 | valid |

该实验随后单次请求 OpenRouter/free，AiRun 为 `baa6f221-6c42-4d02-8535-92394a8c32b9`，请求 ID 为 `bc4b4ed9-7fd9-44e3-9b81-e55414aa7f6b`。TLS 建连前断开，步骤按 `unknown_outcome` 收敛，未产生候选、未自动重放；旧预留和未知计量保留。预留估算 0 USD 不能当作本次实际费用已知。后续公共目录 HEAD 200 仅证明当时 TLS 可连通，不代收模型业务成功。

原 99 条策略、108 条版本、71 条回测、15 条 AiRun、165 条 Tool call，以及原风险应用/审计/规则逐 ID 摘要保持。至本证据新增的是本轮三个隐藏种子/实验、三个对应版本、三个回测及一个未知 AiRun/步骤，没有正式采纳或账户交易写入。

## 证据位置

执行包：`.recovery-artifacts/first-four-acceptance-20261030T134208Z/`。核心文件为 `discovery-market-prepare-response.json`、`discovery-seed-full-preparation-final.json`、`discovery-baseline-failed-job.json`、`discovery-seed-compatibility-reproduction.json`、`seed-coordinate-red.log`、`seed-coordinate-green.log`、`seed-server-typecheck.json`、`seed-sync-result.json`、两角色 `seed-target-modules-*.json`、`discovery-state-seed-proposal-terminal.json`、`after-seed-business-protection.json` 及真实请求账本。
