# 真实新闻研究与在途服务重启验收

## 范围与输入

本次继续前四项验收。模型使用现有 OpenRouter/free、原认证和零价格，调用次数依据本轮新授权，每份研究仍冻结最多 2 次请求、600 秒及费用上限 0；旧冻结账本保持。新闻仅使用用户明确授权续验的同花顺 `hithink-news-stock-timeline`、`600519.SH`、2026-10-23～10-30 元数据，准入版本 4，有效至北京时间 2026-10-31 00:36:39，不自动续期或改变其他来源。

目标沿用 Server / Worker 镜像 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45` 及维护入口同步的可写层。可写层同步不代表镜像或生产发布已更新。原默认修订 7、凭据和 `modelDefaults={}`、`modelReasoning={}` 保留；研究用途暂用已验证 JSON Mode，验后按原输入恢复。

## 实际来源研究

- 研究 `18b58cbe-b907-41fd-b507-7d3ef11e811b`，提交 `5c90766f-c832-45ee-8309-cce873ea7049`，trace `823453d7-0aaa-4fad-92ce-bf480c50519e`。
- 请求 `a93b45b6-20f2-4f95-babd-ff405395b8ad` 仅发送一次；请求模型为 OpenRouter/free，实际模型为 `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`。JSON Mode 流式正式链路约 102.7 秒成功，Token 为 9156 / 5696，上游实报 0 USD。
- 原 V2 合同验证成功，持久化 2 条断言、5 条数字和 11 份来源绑定；11 条 Tool 均成功，11 份 evidence 经带正确 scoped 查询的公开接口独立返回 200。重启后同一公开报告完整对象与重启前完全相同。
- 资料质量为 partial，保留新闻覆盖截断、非穷尽时间线、发布时间或可用时间缺失及行情路由修订缺失等原始标记，没有补造完整覆盖。
- 原始 SSE 已捕获且未截断、存在 DONE、无非法 JSON 帧；响应制品保存失败，trace 的 `captureStatus=incomplete`、原因为 `response_artifact_failed`。该样本不能作为完整 trace 的证据；完整研究 trace 子断言继续复用 D59 的已验输入。
- 原 native_schema 研究 `009a75e1-24b1-4954-ba66-d998d7d0af6f` 因 Liquid/xgrammar 不支持 Schema 的 format/pattern 组合失败，原记录保留；之后独立验证 JSON Mode 通过才保存临时用途配置，没有把失败记录改为成功。

本样本关闭真实新闻材料、长时间生成、合同、citation 与持久化子断言。11 条 Tool 均成功，不能据此声称实际来源发生过 Tool 失败或超时；该场景继续保持开放。

## 目标在途重启

- 新研究 `accb7e26-dd53-4bc7-9ac1-343866a2904f`，提交 `f2b5bc44-2a8b-4f8d-9bfc-3b4e39b692a3`，trace `9d1f9d73-365b-4b8e-8080-5b6d70a52e5c`；唯一请求 `d5224c17-4a6d-4bf2-a65e-f17c982b35ff`。
- 16:09:45.226 UTC 已观测本请求 HTTP 200；16:09:45.229 UTC 的 `upstream.response` 仍 running，数据库研究 running、SDK 请求 dispatching。确认没有其他活跃 AI、回测、优化或自动化任务后才执行故障步骤。
- 16:09:45.457 UTC 通过 infra 维护入口 `scripts/restart-server-for-acceptance.mjs --confirm=thesis-ledger-dev/thesis-ledger --image=<上述精确镜像> --apply` 重启 Server 一次。没有重建容器，没有重启 Worker、DSA、PostgreSQL 或 Redis；Server ID、镜像和挂载保持。
- 停机收尾于 16:09:45.601 UTC 将研究提交 failed 终态，唯一请求为 unknown / `execution_lease_lost`，生成状态 unknown、`settledRevision=0`；旧预留保留，未知 Token 和实际账单不补零。该结果符合已发送请求在所有权失效时禁止重放的合同。
- 同一 Server 于 16:09:51.559 UTC 重新启动，维护入口 16:09:56.767 UTC 返回 healthy；新进程及随后只读反读均只有同一请求、`dispatchExecutionAttempt=1`，没有自动补发或卡住的在途记录。公开 scoped 报告返回 200 和 failed；先前成功研究仍返回 200 且对象完全不变。

本项关闭工作台目标在途重启 smoke。失败终态与外部结果未知属于本场景的准确验收结果，不改写成成功报告或实际零账单。

## 证据定位与保护

执行包为 `.recovery-artifacts/first-four-acceptance-20261030T134208Z`。主要文件：`research-json-source-database.json`、`research-json-source-report-terminal.json`、`research-json-source-evidence-api.json`、`research-json-source-trace-before-sync.json`；`research-restart-inflight-proof.json`、`research-restart-apply-dispatch.json`、`research-restart-entry-result.json`、`research-restart-terminal.json`、`research-restart-stable-readback.json` 及两个 `postrestart-scoped.json`。

`r1-cancel-after-provider-protection.json` 与故障前的 `example-sync-after-provider-protection.json` 对账，五份 Provider 普通配置与密文完全相同。验收只追加所属研究、Tool、请求和健康审计；不写账户、账本、持仓、交易、风险规则或风险应用。原数据最终逐项保护对账由本轮总回执汇总，不以容器 healthy 替代。
