# 目标公开测试后保存的取消验收

## 样本与预算

继续配置 Task 的 T6.CANCEL-TARGET，使用本轮现有免费 Provider 的不限次数授权；本样本单独限制最多 1 次真实请求、费用上限 0。复用当前四条启用用途的成功证明，只在草稿增加 `strategy_authoring_generation / authoring-generation-v2`、JSON Mode、manual。计划 `maxCalls=1`、唯一 pending 用途、600 秒、8192 输出 Token，所有估算费用为 0 USD。

操作 `6dd8e710-b3b5-4d84-9084-35f9ea779f22`，唯一请求 `e37b265d-bc5f-44e6-bc74-0d8c28c4f9c3`。出现 pending 审计约 2 秒后，经 `POST /api/v1/ai/providers/openrouter/validation/cancel` 取消。

## 结果与边界

- 取消接口返回 201、`cancelled=true`；原 test-and-save 返回 400 和生成已取消，不保存配置。
- 16:14:40.357 UTC 写入 pending，16:14:42.470 UTC 写入 failed / `validation_cancelled`，两条记录关联相同 operationId、requestId、用途及指纹；没有其他用途、格式回退或重试。
- 用量保持 unknown，Token 为 null。成本为 `estimated / configured_model_pricing / 0 USD`，实际供应商账单未观测，不报告为已实付零。
- 本次验证使用目标 Server 与真实 SDK/现有上游地址；没有上游收到请求或物理断流的独立回执，该部分继续复用本机 SSE 隔离取消的断流及禁止后续请求证明。
- 配置修订仍为 `2026-10-30T15:47:07.007Z`。五份 Provider 普通配置和密文与前一维护同步后的快照完全相同，默认和两个空字段保持；没有研究、策略或风险应用产物。

## 证据定位

执行包 `.recovery-artifacts/first-four-acceptance-20261030T134208Z` 中保留 `target-cancel-current-plan.json`、`target-cancel-dispatch.json`、`target-cancel-before-cancel-audit.json`、`target-cancel-public-response.json`、`target-cancel-response.json`、`target-cancel-terminal-audit.json`、`target-cancel-after-provider.json` 及 `r1-cancel-after-provider-protection.json`。

隔离断流证据见[本机取消验收](2026-10-30-ai-provider-cancel-isolated.md)。本叶通过不关闭整个 T6 的协议、期限和停顿差集。
