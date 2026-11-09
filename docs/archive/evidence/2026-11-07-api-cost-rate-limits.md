# 全接口限流分类与验证记录

日期：2026-11-07。对应[Spec](../../specs/2026-11-07-api-cost-rate-limits.md)与[Task](../tasks/2026-11-07-api-cost-rate-limits.md)。

最终结论：328 个操作唯一登记；最终 Server 定向 81 项、Desktop 全包 1661 项通过。6240 次隔离 HTTP 负载及真实四宽 24 次页面访问无 429；目标 Server/Worker 已同步并独立核对。Server 全包保留 16 个既有行情图表失败，详见下文。

## 初始盘点

通过 TypeScript AST 从 Controller 提取 328 个 HTTP 操作，其中 GET 139、POST 164、PATCH 15、DELETE 7、PUT 3；扫描到 Desktop/Mobile 共 44 处轮询配置。现有读取窗口仍按 IP 与方法聚合。回测/编写/研究读取可达 1.5～2 秒一次，自选报价及图表按来源节奏刷新；POST `research/submissions/find`、`watchlist/prices`、市场资料与预览均不能按写入直接判重。

`ai/providers` 普通保存与启停仅消费既有验证记录；`test-and-save` 和测试才可能调用模型。回测/优化 prepare 可重复查询准备进度并在领域层去重，不应归入低额度的任务启动。周报修订、竞技场启动、研究提交会安排模型工作；账本重放与账户导出为高成本 GET。

## 操作成本清单

每行对应唯一 Controller 操作；源码理由按类别及下文特殊入口说明继承。

| 操作 | 类别 | 源码 |
| --- | --- | --- |
| `POST /api/v1/ai/providers/validation-plan` | `preview` | `apps/server/src/ai/ai-provider.controller.ts:42` |
| `POST /api/v1/ai/providers/test-and-save` | `ai` | `apps/server/src/ai/ai-provider.controller.ts:47` |
| `POST /api/v1/ai/providers/:name/validation/cancel` | `write` | `apps/server/src/ai/ai-provider.controller.ts:56` |
| `GET /api/v1/ai/providers` | `read` | `apps/server/src/ai/ai-provider.controller.ts:62` |
| `POST /api/v1/ai/providers/migration/dry-run` | `preview` | `apps/server/src/ai/ai-provider.controller.ts:67` |
| `POST /api/v1/ai/providers` | `write` | `apps/server/src/ai/ai-provider.controller.ts:72` |
| `POST /api/v1/ai/providers/test` | `ai` | `apps/server/src/ai/ai-provider.controller.ts:77` |
| `POST /api/v1/ai/providers/models` | `integration` | `apps/server/src/ai/ai-provider.controller.ts:82` |
| `POST /api/v1/ai/providers/:name/test` | `ai` | `apps/server/src/ai/ai-provider.controller.ts:87` |
| `POST /api/v1/ai/providers/:name/test/cancel` | `write` | `apps/server/src/ai/ai-provider.controller.ts:102` |
| `GET /api/v1/ai/providers/:name/readiness` | `read` | `apps/server/src/ai/ai-provider.controller.ts:108` |
| `PATCH /api/v1/ai/providers/:name/enabled` | `write` | `apps/server/src/ai/ai-provider.controller.ts:113` |
| `DELETE /api/v1/ai/providers/:name` | `write` | `apps/server/src/ai/ai-provider.controller.ts:119` |
| `GET /api/v1/ai/settings` | `read` | `apps/server/src/ai/ai-settings.controller.ts:9` |
| `PATCH /api/v1/ai/settings` | `write` | `apps/server/src/ai/ai-settings.controller.ts:14` |
| `GET /api/v1/ai/runs` | `poll` | `apps/server/src/ai/ai.controller.ts:62` |
| `POST /api/v1/ai/runs` | `ai` | `apps/server/src/ai/ai.controller.ts:104` |
| `PATCH /api/v1/ai/runs/:id/checkpoint` | `write` | `apps/server/src/ai/ai.controller.ts:146` |
| `GET /api/v1/ai/runs/usage/summary` | `read` | `apps/server/src/ai/ai.controller.ts:151` |
| `POST /api/v1/ai/runs/decision-logs` | `write` | `apps/server/src/ai/ai.controller.ts:159` |
| `GET /api/v1/ai/runs/decision-logs` | `read` | `apps/server/src/ai/ai.controller.ts:164` |
| `GET /api/v1/ai/runs/capabilities` | `read` | `apps/server/src/ai/ai.controller.ts:169` |
| `GET /api/v1/ai/runs/:id/retry-prefill` | `read` | `apps/server/src/ai/ai.controller.ts:180` |
| `GET /api/v1/ai/runs/:id/tool-calls` | `read` | `apps/server/src/ai/ai.controller.ts:185` |
| `GET /api/v1/ai/runs/:id` | `poll` | `apps/server/src/ai/ai.controller.ts:195` |
| `POST /api/v1/automations` | `write` | `apps/server/src/automation/automation.controller.ts:59` |
| `GET /api/v1/automations` | `read` | `apps/server/src/automation/automation.controller.ts:64` |
| `GET /api/v1/automations/history` | `poll` | `apps/server/src/automation/automation.controller.ts:69` |
| `PATCH /api/v1/automations/:id` | `write` | `apps/server/src/automation/automation.controller.ts:82` |
| `PATCH /api/v1/automations/:id/enabled` | `write` | `apps/server/src/automation/automation.controller.ts:87` |
| `DELETE /api/v1/automations/:id` | `write` | `apps/server/src/automation/automation.controller.ts:93` |
| `POST /api/v1/automations/:id/run` | `ai` | `apps/server/src/automation/automation.controller.ts:99` |
| `POST /api/v1/automations/workflows/pre-market-events` | `preview` | `apps/server/src/automation/automation.controller.ts:114` |
| `POST /api/v1/automations/workflows/risk-preview` | `preview` | `apps/server/src/automation/automation.controller.ts:120` |
| `POST /api/v1/automations/workflows/daily-risk-summary` | `preview` | `apps/server/src/automation/automation.controller.ts:126` |
| `POST /api/v1/automations/workflows/digest` | `preview` | `apps/server/src/automation/automation.controller.ts:132` |
| `POST /api/v1/automations/workflows/daily-report` | `preview` | `apps/server/src/automation/automation.controller.ts:137` |
| `POST /api/v1/automations/workflows/opening-scan` | `preview` | `apps/server/src/automation/automation.controller.ts:142` |
| `POST /api/v1/automations/workflows/weekly-performance` | `preview` | `apps/server/src/automation/automation.controller.ts:147` |
| `POST /api/v1/automations/workflows/weekly-strategy` | `preview` | `apps/server/src/automation/automation.controller.ts:154` |
| `POST /api/v1/automations/workflows/close-sync` | `integration` | `apps/server/src/automation/automation.controller.ts:161` |
| `POST /api/v1/automations/workflows/close-snapshots` | `task` | `apps/server/src/automation/automation.controller.ts:166` |
| `POST /api/v1/automations/workflows/risk-scan` | `task` | `apps/server/src/automation/automation.controller.ts:173` |
| `GET /api/v1/automations/risk-monitoring` | `poll` | `apps/server/src/automation/risk-monitoring.controller.ts:28` |
| `POST /api/v1/automations/risk-monitoring/enable` | `write` | `apps/server/src/automation/risk-monitoring.controller.ts:58` |
| `POST /api/v1/backtests/run-config/nav/prepare` | `marketRead` | `apps/server/src/backtest/backtest-nav-preparation.controller.ts:15` |
| `GET /api/v1/backtests/runs/nav` | `poll` | `apps/server/src/backtest/backtest-nav-run.controller.ts:30` |
| `POST /api/v1/backtests/runs/nav` | `task` | `apps/server/src/backtest/backtest-nav-run.controller.ts:36` |
| `GET /api/v1/backtests/runs/nav/:id` | `poll` | `apps/server/src/backtest/backtest-nav-run.controller.ts:41` |
| `POST /api/v1/backtests/runs/nav/:id/retry` | `task` | `apps/server/src/backtest/backtest-nav-run.controller.ts:46` |
| `POST /api/v1/backtests/runs/nav/:id/cancel` | `write` | `apps/server/src/backtest/backtest-nav-run.controller.ts:53` |
| `POST /api/v1/backtests/run-config/preflight` | `preview` | `apps/server/src/backtest/backtest-run-preflight.controller.ts:11` |
| `POST /api/v1/backtests/run-config/prepare` | `marketRead` | `apps/server/src/backtest/backtest-run-preparation.controller.ts:14` |
| `POST /api/v1/backtests/strategies` | `write` | `apps/server/src/backtest/backtest.controller.ts:39` |
| `POST /api/v1/backtests/strategies/:id/versions` | `write` | `apps/server/src/backtest/backtest.controller.ts:45` |
| `POST /api/v1/backtests/runs` | `task` | `apps/server/src/backtest/backtest.controller.ts:50` |
| `POST /api/v1/backtests/runs/:id/cancel` | `write` | `apps/server/src/backtest/backtest.controller.ts:55` |
| `POST /api/v1/backtests/runs/:id/retry` | `task` | `apps/server/src/backtest/backtest.controller.ts:60` |
| `POST /api/v1/backtests/runs/:id/run` | `task` | `apps/server/src/backtest/backtest.controller.ts:65` |
| `GET /api/v1/backtests/runs` | `poll` | `apps/server/src/backtest/backtest.controller.ts:70` |
| `GET /api/v1/backtests/runs/:id` | `poll` | `apps/server/src/backtest/backtest.controller.ts:75` |
| `GET /api/v1/backtests/events` | `poll` | `apps/server/src/backtest/backtest.controller.ts:80` |
| `GET /api/v1/backtests/strategies` | `read` | `apps/server/src/backtest/backtest.controller.ts:103` |
| `GET /api/v1/cash-deposit-plans` | `read` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:8` |
| `POST /api/v1/cash-deposit-plans` | `write` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:16` |
| `PATCH /api/v1/cash-deposit-plans/:id` | `write` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:21` |
| `POST /api/v1/cash-deposit-plans/:id/pause` | `write` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:26` |
| `POST /api/v1/cash-deposit-plans/:id/resume` | `write` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:31` |
| `POST /api/v1/cash-deposit-plans/:id/end` | `write` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:36` |
| `GET /api/v1/cash-deposit-occurrences` | `read` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:46` |
| `POST /api/v1/cash-deposit-occurrences/:id/confirm` | `write` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:59` |
| `POST /api/v1/cash-deposit-occurrences/:id/skip` | `write` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:64` |
| `POST /api/v1/cash-deposit-occurrences/:id/reopen` | `write` | `apps/server/src/cash-plans/recurring-cash-deposit.controller.ts:69` |
| `GET /api/v1/fund-investment-plans` | `read` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:8` |
| `POST /api/v1/fund-investment-plans` | `write` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:16` |
| `PATCH /api/v1/fund-investment-plans/:id` | `write` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:21` |
| `POST /api/v1/fund-investment-plans/:id/pause` | `write` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:26` |
| `POST /api/v1/fund-investment-plans/:id/resume` | `write` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:31` |
| `POST /api/v1/fund-investment-plans/:id/end` | `write` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:36` |
| `GET /api/v1/fund-investment-occurrences` | `read` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:46` |
| `POST /api/v1/fund-investment-occurrences/:id/confirm` | `write` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:59` |
| `POST /api/v1/fund-investment-occurrences/:id/skip` | `write` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:64` |
| `POST /api/v1/fund-investment-occurrences/:id/reopen` | `write` | `apps/server/src/fund-plans/recurring-fund-investment.controller.ts:69` |
| `GET /api/v1/identity/context` | `read` | `apps/server/src/identity/identity.controller.ts:16` |
| `POST /api/v1/identity/users` | `auth` | `apps/server/src/identity/identity.controller.ts:30` |
| `POST /api/v1/identity/sessions` | `auth` | `apps/server/src/identity/identity.controller.ts:34` |
| `GET /api/v1/identity/session` | `read` | `apps/server/src/identity/identity.controller.ts:39` |
| `POST /api/v1/identity/session/revoke` | `write` | `apps/server/src/identity/identity.controller.ts:43` |
| `POST /api/v1/imports/screenshot` | `ai` | `apps/server/src/imports/import.controller.ts:57` |
| `POST /api/v1/imports/:id/commit` | `task` | `apps/server/src/imports/import.controller.ts:83` |
| `POST /api/v1/imports/:id/rebaseline` | `task` | `apps/server/src/imports/import.controller.ts:92` |
| `POST /api/v1/imports/:id/rollback` | `task` | `apps/server/src/imports/import.controller.ts:97` |
| `GET /api/v1/imports` | `read` | `apps/server/src/imports/import.controller.ts:102` |
| `GET /api/v1/imports/review` | `read` | `apps/server/src/imports/import.controller.ts:107` |
| `GET /api/v1/integrity` | `export` | `apps/server/src/integrity/integrity.controller.ts:8` |
| `POST /api/v1/journal/analysis/planned-vs-actual` | `preview` | `apps/server/src/journal/journal-legacy-analysis.controller.ts:15` |
| `POST /api/v1/journal/analysis/planned-stop` | `preview` | `apps/server/src/journal/journal-legacy-analysis.controller.ts:19` |
| `POST /api/v1/journal/analysis/counterfactual` | `preview` | `apps/server/src/journal/journal-legacy-analysis.controller.ts:24` |
| `POST /api/v1/journal/analysis/review` | `preview` | `apps/server/src/journal/journal-legacy-analysis.controller.ts:28` |
| `POST /api/v1/journal/analysis/behavior` | `preview` | `apps/server/src/journal/journal-legacy-analysis.controller.ts:32` |
| `GET /api/v1/journal/review-candidates` | `preview` | `apps/server/src/journal/journal-review.controller.ts:21` |
| `GET /api/v1/journal/review-objects/:reviewObjectId` | `preview` | `apps/server/src/journal/journal-review.controller.ts:36` |
| `GET /api/v1/journal/review-object-reference` | `preview` | `apps/server/src/journal/journal-review.controller.ts:44` |
| `POST /api/v1/journal/analysis/object` | `preview` | `apps/server/src/journal/journal-review.controller.ts:49` |
| `POST /api/v1/journal/analysis/period` | `preview` | `apps/server/src/journal/journal-review.controller.ts:54` |
| `POST /api/v1/journal/review-snapshots` | `write` | `apps/server/src/journal/journal-review.controller.ts:59` |
| `POST /api/v1/journal/explanations` | `ai` | `apps/server/src/journal/journal-review.controller.ts:64` |
| `POST /api/v1/journal/period-explanations` | `ai` | `apps/server/src/journal/journal-review.controller.ts:69` |
| `GET /api/v1/journal/period-explanations/:id` | `poll` | `apps/server/src/journal/journal-review.controller.ts:74` |
| `GET /api/v1/journal/explanations/:id` | `poll` | `apps/server/src/journal/journal-review.controller.ts:79` |
| `GET /api/v1/journal/review-snapshots` | `read` | `apps/server/src/journal/journal-review.controller.ts:84` |
| `GET /api/v1/journal/review-snapshots/:id` | `read` | `apps/server/src/journal/journal-review.controller.ts:89` |
| `POST /api/v1/journal/entries` | `write` | `apps/server/src/journal/journal.controller.ts:14` |
| `GET /api/v1/journal/entries` | `read` | `apps/server/src/journal/journal.controller.ts:19` |
| `PATCH /api/v1/journal/entries/:id` | `write` | `apps/server/src/journal/journal.controller.ts:24` |
| `POST /api/v1/journal/plans` | `write` | `apps/server/src/journal/journal.controller.ts:29` |
| `GET /api/v1/journal/plans` | `read` | `apps/server/src/journal/journal.controller.ts:34` |
| `GET /api/v1/journal/entries/export` | `export` | `apps/server/src/journal/journal.controller.ts:39` |
| `POST /api/v1/ledger/executions` | `write` | `apps/server/src/ledger/ledger.controller.ts:51` |
| `POST /api/v1/ledger/executions/replace` | `write` | `apps/server/src/ledger/ledger.controller.ts:56` |
| `POST /api/v1/ledger/executions/void` | `write` | `apps/server/src/ledger/ledger.controller.ts:61` |
| `POST /api/v1/ledger/executions/restore` | `write` | `apps/server/src/ledger/ledger.controller.ts:66` |
| `POST /api/v1/ledger/executions/move-account` | `write` | `apps/server/src/ledger/ledger.controller.ts:71` |
| `POST /api/v1/ledger/cash-flows` | `write` | `apps/server/src/ledger/ledger.controller.ts:76` |
| `POST /api/v1/ledger/cash-flows/replace` | `write` | `apps/server/src/ledger/ledger.controller.ts:81` |
| `POST /api/v1/ledger/cash-flows/void` | `write` | `apps/server/src/ledger/ledger.controller.ts:86` |
| `POST /api/v1/ledger/cash-flows/restore` | `write` | `apps/server/src/ledger/ledger.controller.ts:91` |
| `POST /api/v1/ledger/cash-transfers` | `write` | `apps/server/src/ledger/ledger.controller.ts:96` |
| `POST /api/v1/ledger/cash-transfers/replace` | `write` | `apps/server/src/ledger/ledger.controller.ts:101` |
| `POST /api/v1/ledger/cash-transfers/void` | `write` | `apps/server/src/ledger/ledger.controller.ts:108` |
| `POST /api/v1/ledger/cash-transfers/restore` | `write` | `apps/server/src/ledger/ledger.controller.ts:113` |
| `POST /api/v1/ledger/baseline-observation-batches` | `write` | `apps/server/src/ledger/ledger.controller.ts:120` |
| `POST /api/v1/ledger/import-draft-revisions` | `write` | `apps/server/src/ledger/ledger.controller.ts:127` |
| `POST /api/v1/ledger/import-draft-revisions/revise` | `write` | `apps/server/src/ledger/ledger.controller.ts:132` |
| `POST /api/v1/ledger/import-draft-revisions/submit` | `write` | `apps/server/src/ledger/ledger.controller.ts:137` |
| `POST /api/v1/ledger/:accountId/rebuild` | `task` | `apps/server/src/ledger/ledger.controller.ts:142` |
| `POST /api/v1/ledger/migrate-positions` | `task` | `apps/server/src/ledger/ledger.controller.ts:147` |
| `GET /api/v1/ledger/:accountId/events` | `read` | `apps/server/src/ledger/ledger.controller.ts:152` |
| `GET /api/v1/ledger/:accountId/events/audit` | `read` | `apps/server/src/ledger/ledger.controller.ts:160` |
| `GET /api/v1/ledger/:accountId/events/replay` | `export` | `apps/server/src/ledger/ledger.controller.ts:168` |
| `GET /api/v1/ledger/:accountId/reconciliation-candidates` | `read` | `apps/server/src/ledger/ledger.controller.ts:179` |
| `POST /api/v1/ledger/reconciliations/confirm` | `write` | `apps/server/src/ledger/ledger.controller.ts:184` |
| `POST /api/v1/ledger/reconciliations/void` | `write` | `apps/server/src/ledger/ledger.controller.ts:189` |
| `POST /api/v1/ledger/reconciliations/restore` | `write` | `apps/server/src/ledger/ledger.controller.ts:194` |
| `GET /api/market-data/announcements` | `marketRead` | `apps/server/src/market/market-announcements.controller.ts:16` |
| `GET /api/market-data/policy` | `read` | `apps/server/src/market/market-data.controller.ts:38` |
| `GET /api/market-data/routes/capabilities` | `read` | `apps/server/src/market/market-data.controller.ts:42` |
| `PUT /api/market-data/policy` | `integration` | `apps/server/src/market/market-data.controller.ts:49` |
| `POST /api/market-data/policy/retry` | `integration` | `apps/server/src/market/market-data.controller.ts:53` |
| `POST /api/market-data/policy/rollback/:revision` | `integration` | `apps/server/src/market/market-data.controller.ts:57` |
| `GET /api/market-data/providers` | `read` | `apps/server/src/market/market-data.controller.ts:61` |
| `POST /api/market-data/providers/:providerId/config` | `integration` | `apps/server/src/market/market-data.controller.ts:65` |
| `POST /api/market-data/providers/:providerId/test` | `integration` | `apps/server/src/market/market-data.controller.ts:72` |
| `POST /api/market-data/providers/:providerId/remove` | `write` | `apps/server/src/market/market-data.controller.ts:79` |
| `POST /api/market-data/providers/longbridge/oauth/sessions` | `integration` | `apps/server/src/market/market-data.controller.ts:86` |
| `GET /api/market-data/providers/longbridge/oauth/sessions/current` | `poll` | `apps/server/src/market/market-data.controller.ts:99` |
| `GET /api/market-data/providers/longbridge/oauth/sessions/:sessionId` | `poll` | `apps/server/src/market/market-data.controller.ts:105` |
| `POST /api/market-data/providers/longbridge/oauth/sessions/:sessionId/cancel` | `write` | `apps/server/src/market/market-data.controller.ts:111` |
| `GET /api/market-data/instruments/search` | `read` | `apps/server/src/market/market-data.controller.ts:118` |
| `GET /api/market-data/instruments/identity` | `read` | `apps/server/src/market/market-data.controller.ts:124` |
| `POST /api/market-data/instruments/:id/confirm` | `write` | `apps/server/src/market/market-data.controller.ts:130` |
| `GET /api/market-data/instruments/associations` | `read` | `apps/server/src/market/market-data.controller.ts:134` |
| `GET /api/market-data/catalog/status` | `poll` | `apps/server/src/market/market-data.controller.ts:138` |
| `GET /api/market-data/catalog/jobs/:jobId` | `poll` | `apps/server/src/market/market-data.controller.ts:142` |
| `POST /api/market-data/catalog/sync` | `integration` | `apps/server/src/market/market-data.controller.ts:148` |
| `GET /api/market/:symbol/fund-valuation/daily-error` | `read` | `apps/server/src/market/market-fund-valuation.controller.ts:8` |
| `GET /api/market/:symbol/fund-valuation` | `marketRead` | `apps/server/src/market/market-fund-valuation.controller.ts:11` |
| `GET /api/market/:symbol/fund-valuation/today` | `marketRead` | `apps/server/src/market/market-fund-valuation.controller.ts:14` |
| `POST /api/market-data/news` | `marketRead` | `apps/server/src/market/market-news.controller.ts:21` |
| `POST /api/market-data/news-feed` | `marketRead` | `apps/server/src/market/market-news.controller.ts:29` |
| `POST /api/market/quotes` | `marketRead` | `apps/server/src/market/market-quotes.controller.ts:12` |
| `POST /api/market-data/reference` | `marketRead` | `apps/server/src/market/market-reference.controller.ts:23` |
| `POST /api/market-data/research-report-metadata/collect` | `integration` | `apps/server/src/market/market-report-metadata.controller.ts:14` |
| `GET /api/market-data/research-report-metadata/history` | `read` | `apps/server/src/market/market-report-metadata.controller.ts:18` |
| `GET /api/market-data/research-report-metadata/snapshots/:snapshotId` | `read` | `apps/server/src/market/market-report-metadata.controller.ts:24` |
| `GET /api/market-data/rule-monitor` | `poll` | `apps/server/src/market/market-rule-monitor.controller.ts:60` |
| `PUT /api/market-data/rule-monitor/config` | `write` | `apps/server/src/market/market-rule-monitor.controller.ts:63` |
| `POST /api/market-data/rule-monitor/checks` | `integration` | `apps/server/src/market/market-rule-monitor.controller.ts:78` |
| `GET /api/market-data/rule-monitor/checks/:identity` | `poll` | `apps/server/src/market/market-rule-monitor.controller.ts:92` |
| `GET /api/market-data/rule-monitor/versions` | `read` | `apps/server/src/market/market-rule-monitor.controller.ts:104` |
| `GET /api/market-data/security-lot-size` | `marketRead` | `apps/server/src/market/market-security-lot-size.controller.ts:10` |
| `GET /api/market-data/security-static-info` | `marketRead` | `apps/server/src/market/market-security-static-info.controller.ts:10` |
| `GET /api/market/:symbol/bars` | `marketRead` | `apps/server/src/market/market.controller.ts:79` |
| `GET /api/market/:symbol/indicators/:name` | `marketRead` | `apps/server/src/market/market.controller.ts:106` |
| `GET /api/market/:symbol/detail` | `marketRead` | `apps/server/src/market/market.controller.ts:137` |
| `GET /api/market/:symbol/period-options` | `marketRead` | `apps/server/src/market/market.controller.ts:256` |
| `GET /api/market/:symbol/minute-options` | `marketRead` | `apps/server/src/market/market.controller.ts:266` |
| `GET /api/market/:symbol/chart-options` | `marketRead` | `apps/server/src/market/market.controller.ts:274` |
| `GET /api/market/:symbol/quote` | `marketRead` | `apps/server/src/market/market.controller.ts:286` |
| `GET /api/market/:symbol/fund-nav` | `marketRead` | `apps/server/src/market/market.controller.ts:293` |
| `GET /api/market/:symbol/fund-nav/history` | `marketRead` | `apps/server/src/market/market.controller.ts:298` |
| `GET /api/market/:symbol/chip` | `marketRead` | `apps/server/src/market/market.controller.ts:310` |
| `GET /api/v1/model-weeklies` | `read` | `apps/server/src/model-arena/arena-week.controller.ts:20` |
| `GET /api/v1/model-weeklies/:arenaId/:id` | `read` | `apps/server/src/model-arena/arena-week.controller.ts:25` |
| `POST /api/v1/model-weeklies/:arenaId/:id/revisions` | `ai` | `apps/server/src/model-arena/arena-week.controller.ts:34` |
| `POST /api/v1/model-arenas` | `write` | `apps/server/src/model-arena/model-arena.controller.ts:36` |
| `POST /api/v1/model-arenas/:id/start` | `ai` | `apps/server/src/model-arena/model-arena.controller.ts:40` |
| `POST /api/v1/model-arenas/:id/pause` | `write` | `apps/server/src/model-arena/model-arena.controller.ts:47` |
| `POST /api/v1/model-arenas/:id/end` | `write` | `apps/server/src/model-arena/model-arena.controller.ts:54` |
| `GET /api/v1/model-arenas` | `read` | `apps/server/src/model-arena/model-arena.controller.ts:61` |
| `GET /api/v1/model-arenas/calendar` | `preview` | `apps/server/src/model-arena/model-arena.controller.ts:69` |
| `GET /api/v1/model-arenas/:id/points` | `read` | `apps/server/src/model-arena/model-arena.controller.ts:73` |
| `GET /api/v1/model-arenas/:id/comparison` | `preview` | `apps/server/src/model-arena/model-arena.controller.ts:82` |
| `GET /api/v1/model-arenas/:id/rounds/:roundId` | `read` | `apps/server/src/model-arena/model-arena.controller.ts:91` |
| `GET /api/v1/model-arenas/:id` | `read` | `apps/server/src/model-arena/model-arena.controller.ts:100` |
| `GET /api/v1/notifications` | `read` | `apps/server/src/notifications/notification.controller.ts:19` |
| `GET /api/v1/notifications/routing` | `read` | `apps/server/src/notifications/notification.controller.ts:24` |
| `GET /api/v1/notifications/routing/risk` | `read` | `apps/server/src/notifications/notification.controller.ts:29` |
| `PUT /api/v1/notifications/routing/risk` | `write` | `apps/server/src/notifications/notification.controller.ts:34` |
| `POST /api/v1/notifications/:id/deliver/feishu` | `integration` | `apps/server/src/notifications/notification.controller.ts:39` |
| `GET /api/v1/performance/pnl-series` | `preview` | `apps/server/src/performance/performance.controller.ts:26` |
| `GET /api/v1/performance/series` | `preview` | `apps/server/src/performance/performance.controller.ts:31` |
| `GET /api/v1/performance/snapshots` | `read` | `apps/server/src/performance/performance.controller.ts:55` |
| `GET /api/v1/performance/snapshots/:id` | `read` | `apps/server/src/performance/performance.controller.ts:76` |
| `GET /api/v1/performance/history` | `preview` | `apps/server/src/performance/performance.controller.ts:81` |
| `GET /api/v1/performance/summary` | `preview` | `apps/server/src/performance/performance.controller.ts:96` |
| `POST /api/v1/performance/calculate` | `preview` | `apps/server/src/performance/performance.controller.ts:111` |
| `POST /api/v1/performance/allocation` | `preview` | `apps/server/src/performance/performance.controller.ts:118` |
| `GET /api/v1/performance/targets` | `preview` | `apps/server/src/performance/performance.controller.ts:125` |
| `POST /api/v1/performance/targets` | `write` | `apps/server/src/performance/performance.controller.ts:139` |
| `GET /api/v1/performance/layers` | `preview` | `apps/server/src/performance/performance.controller.ts:145` |
| `GET /api/v1/exports/account` | `export` | `apps/server/src/platform/data-export.controller.ts:11` |
| `GET /api/v1/health` | `monitor` | `apps/server/src/platform/health.controller.ts:7` |
| `GET /api/v1/metrics` | `monitor` | `apps/server/src/platform/metrics.controller.ts:8` |
| `GET /api/v1/accounts` | `read` | `apps/server/src/portfolio/accounts.controller.ts:24` |
| `POST /api/v1/accounts` | `write` | `apps/server/src/portfolio/accounts.controller.ts:33` |
| `PATCH /api/v1/accounts/:id` | `write` | `apps/server/src/portfolio/accounts.controller.ts:36` |
| `DELETE /api/v1/accounts/:id/permanent` | `task` | `apps/server/src/portfolio/accounts.controller.ts:39` |
| `DELETE /api/v1/accounts/:id` | `write` | `apps/server/src/portfolio/accounts.controller.ts:44` |
| `POST /api/v1/accounts/:id/reactivate` | `write` | `apps/server/src/portfolio/accounts.controller.ts:47` |
| `GET /api/v1/portfolio/positions` | `read` | `apps/server/src/portfolio/portfolio.controller.ts:8` |
| `POST /api/v1/portfolio/positions` | `write` | `apps/server/src/portfolio/portfolio.controller.ts:14` |
| `POST /api/v1/portfolio/cash` | `write` | `apps/server/src/portfolio/portfolio.controller.ts:17` |
| `POST /api/v1/portfolio/positions/clear` | `write` | `apps/server/src/portfolio/portfolio.controller.ts:35` |
| `DELETE /api/v1/portfolio/positions/:id` | `write` | `apps/server/src/portfolio/portfolio.controller.ts:38` |
| `PATCH /api/v1/portfolio/positions/:id` | `write` | `apps/server/src/portfolio/portfolio.controller.ts:41` |
| `GET /api/v1/portfolio/valuation` | `marketRead` | `apps/server/src/portfolio/portfolio.controller.ts:44` |
| `GET /api/v1/portfolio/trades` | `read` | `apps/server/src/portfolio/trade.controller.ts:26` |
| `GET /api/v1/portfolio/trades/chart` | `read` | `apps/server/src/portfolio/trade.controller.ts:31` |
| `GET /api/v1/portfolio/trades/instruments` | `read` | `apps/server/src/portfolio/trade.controller.ts:37` |
| `POST /api/v1/portfolio/trades/resolve-reference` | `preview` | `apps/server/src/portfolio/trade.controller.ts:42` |
| `POST /api/v1/portfolio/trades/:tradeId/opening-boundary` | `write` | `apps/server/src/portfolio/trade.controller.ts:47` |
| `GET /api/v1/portfolio/trades/:tradeId` | `read` | `apps/server/src/portfolio/trade.controller.ts:55` |
| `GET /api/v1/portfolio/trades/:tradeId/close-slices/:sliceId` | `read` | `apps/server/src/portfolio/trade.controller.ts:67` |
| `GET /api/v1/providers/config` | `read` | `apps/server/src/providers/provider-config.controller.ts:8` |
| `POST /api/v1/providers/config` | `write` | `apps/server/src/providers/provider-config.controller.ts:13` |
| `POST /api/v1/providers/config/test` | `integration` | `apps/server/src/providers/provider-config.controller.ts:18` |
| `POST /api/v1/providers/config/:name/test` | `integration` | `apps/server/src/providers/provider-config.controller.ts:23` |
| `GET /api/v1/providers/config/:name/usage` | `read` | `apps/server/src/providers/provider-config.controller.ts:28` |
| `GET /api/v1/providers/health` | `read` | `apps/server/src/providers/provider-health.controller.ts:13` |
| `POST /api/v1/providers/health/check` | `integration` | `apps/server/src/providers/provider-health.controller.ts:18` |
| `GET /api/v1/providers/health/history` | `read` | `apps/server/src/providers/provider-health.controller.ts:23` |
| `GET /api/v1/data-quality/issues` | `read` | `apps/server/src/quality/data-quality.controller.ts:9` |
| `POST /api/v1/data-quality/issues` | `write` | `apps/server/src/quality/data-quality.controller.ts:14` |
| `PATCH /api/v1/data-quality/issues/:id/resolve` | `write` | `apps/server/src/quality/data-quality.controller.ts:19` |
| `POST /api/v1/research/reports/:id/observations` | `write` | `apps/server/src/research/research-observations.controller.ts:25` |
| `GET /api/v1/research/reports/:id/observations` | `read` | `apps/server/src/research/research-observations.controller.ts:36` |
| `GET /api/v1/research/reports/:id/observations/:observationId/versions` | `read` | `apps/server/src/research/research-observations.controller.ts:45` |
| `GET /api/v1/research/reports` | `poll` | `apps/server/src/research/research-reports.controller.ts:15` |
| `GET /api/v1/research/reports/:id/comparison` | `read` | `apps/server/src/research/research-reports.controller.ts:20` |
| `GET /api/v1/research/reports/:id/evidence/:referenceId` | `read` | `apps/server/src/research/research-reports.controller.ts:31` |
| `GET /api/v1/research/reports/:id/tool-calls` | `read` | `apps/server/src/research/research-reports.controller.ts:41` |
| `GET /api/v1/research/reports/:id` | `poll` | `apps/server/src/research/research-reports.controller.ts:50` |
| `GET /api/v1/research/capabilities` | `read` | `apps/server/src/research/research.controller.ts:26` |
| `POST /api/v1/research/submissions` | `ai` | `apps/server/src/research/research.controller.ts:33` |
| `POST /api/v1/research/submissions/find` | `poll` | `apps/server/src/research/research.controller.ts:66` |
| `POST /api/v1/research/submissions/cancel` | `write` | `apps/server/src/research/research.controller.ts:77` |
| `GET /api/v1/risk/monitoring` | `poll` | `apps/server/src/risk/risk-monitoring.controller.ts:18` |
| `GET /api/v1/risk/rules` | `read` | `apps/server/src/risk/risk.controller.ts:20` |
| `POST /api/v1/risk/rules` | `write` | `apps/server/src/risk/risk.controller.ts:25` |
| `POST /api/v1/risk/rules/from-plan` | `write` | `apps/server/src/risk/risk.controller.ts:30` |
| `PATCH /api/v1/risk/rules/:id` | `write` | `apps/server/src/risk/risk.controller.ts:36` |
| `DELETE /api/v1/risk/rules/:id` | `write` | `apps/server/src/risk/risk.controller.ts:41` |
| `POST /api/v1/risk/rules/:id/restore` | `write` | `apps/server/src/risk/risk.controller.ts:46` |
| `POST /api/v1/risk/rules/:id/test` | `preview` | `apps/server/src/risk/risk.controller.ts:51` |
| `GET /api/v1/risk/rules/:id/audit` | `read` | `apps/server/src/risk/risk.controller.ts:56` |
| `POST /api/v1/risk/scan` | `task` | `apps/server/src/risk/risk.controller.ts:61` |
| `GET /api/v1/risk/events` | `read` | `apps/server/src/risk/risk.controller.ts:66` |
| `POST /api/v1/strategy-authoring/drafts` | `write` | `apps/server/src/strategy-authoring/authoring-draft.controller.ts:30` |
| `GET /api/v1/strategy-authoring/drafts` | `read` | `apps/server/src/strategy-authoring/authoring-draft.controller.ts:34` |
| `GET /api/v1/strategy-authoring/drafts/:id` | `read` | `apps/server/src/strategy-authoring/authoring-draft.controller.ts:52` |
| `PATCH /api/v1/strategy-authoring/drafts/:id` | `write` | `apps/server/src/strategy-authoring/authoring-draft.controller.ts:56` |
| `POST /api/v1/strategy-authoring/drafts/:id/discard` | `write` | `apps/server/src/strategy-authoring/authoring-draft.controller.ts:64` |
| `GET /api/v1/strategy-authoring/drafts/:id/operations` | `poll` | `apps/server/src/strategy-authoring/authoring-operation-history.controller.ts:10` |
| `POST /api/v1/strategy-authoring/operations/:id/discard` | `write` | `apps/server/src/strategy-authoring/authoring-operation-history.controller.ts:14` |
| `POST /api/v1/strategy-authoring/drafts/:id/operations` | `ai` | `apps/server/src/strategy-authoring/authoring-operation.controller.ts:21` |
| `GET /api/v1/strategy-authoring/operations/:id` | `poll` | `apps/server/src/strategy-authoring/authoring-operation.controller.ts:29` |
| `POST /api/v1/strategy-authoring/operations/:id/cancel` | `write` | `apps/server/src/strategy-authoring/authoring-operation.controller.ts:34` |
| `POST /api/v1/strategy-authoring/operations/:id/apply-analysis` | `write` | `apps/server/src/strategy-authoring/authoring-operation.controller.ts:43` |
| `POST /api/v1/strategy-authoring/operations/:id/apply-generation` | `write` | `apps/server/src/strategy-authoring/authoring-operation.controller.ts:51` |
| `POST /api/v1/strategy-authoring/operations/:id/proposal` | `preview` | `apps/server/src/strategy-authoring/authoring-proposal.controller.ts:17` |
| `GET /api/v1/strategy-authoring/proposals/:id` | `read` | `apps/server/src/strategy-authoring/authoring-proposal.controller.ts:25` |
| `POST /api/v1/strategy-authoring/proposals/:id/apply` | `write` | `apps/server/src/strategy-authoring/authoring-proposal.controller.ts:29` |
| `POST /api/v1/strategy-authoring/proposals/:id/discard` | `write` | `apps/server/src/strategy-authoring/authoring-proposal.controller.ts:33` |
| `GET /api/v1/strategy-authoring/drafts/:id/review` | `read` | `apps/server/src/strategy-authoring/authoring-save.controller.ts:14` |
| `POST /api/v1/strategy-authoring/drafts/:id/save` | `write` | `apps/server/src/strategy-authoring/authoring-save.controller.ts:18` |
| `GET /api/v1/strategy-authoring/versions/:id/source` | `read` | `apps/server/src/strategy-authoring/authoring-save.controller.ts:22` |
| `POST /api/v1/strategy-optimization/run-config/prepare` | `marketRead` | `apps/server/src/strategy-optimization/strategy-optimization-preparation.controller.ts:7` |
| `GET /api/v1/strategy-optimization/capabilities` | `read` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:51` |
| `GET /api/v1/strategy-optimization/strategies/:strategyVersionId/parameters` | `read` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:56` |
| `GET /api/v1/strategy-optimization/strategies/:strategyVersionId/monitoring-plan` | `read` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:61` |
| `POST /api/v1/strategy-optimization/risk-applications/preview` | `preview` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:66` |
| `POST /api/v1/strategy-optimization/risk-applications` | `write` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:71` |
| `GET /api/v1/strategy-optimization/risk-applications` | `read` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:76` |
| `GET /api/v1/strategy-optimization/risk-applications/:id` | `read` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:82` |
| `PATCH /api/v1/strategy-optimization/risk-applications/:id` | `write` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:87` |
| `DELETE /api/v1/strategy-optimization/risk-applications/:id` | `write` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:92` |
| `POST /api/v1/strategy-optimization/risk-applications/:id/upgrade-preview` | `preview` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:97` |
| `POST /api/v1/strategy-optimization/risk-applications/:id/upgrade` | `write` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:103` |
| `POST /api/v1/strategy-optimization/risk-applications/:id/evaluate` | `task` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:108` |
| `POST /api/v1/strategy-optimization/experiments` | `task` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:113` |
| `GET /api/v1/strategy-optimization/experiments` | `poll` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:118` |
| `GET /api/v1/strategy-optimization/backtests/groups` | `read` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:123` |
| `GET /api/v1/strategy-optimization/experiments/:id` | `poll` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:129` |
| `PATCH /api/v1/strategy-optimization/experiments/:id` | `write` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:134` |
| `GET /api/v1/strategy-optimization/experiments/:id/compare` | `preview` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:139` |
| `GET /api/v1/strategy-optimization/experiments/:id/adopt-context` | `preview` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:144` |
| `POST /api/v1/strategy-optimization/experiments/:id/clone` | `task` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:150` |
| `POST /api/v1/strategy-optimization/experiments/:id/cancel` | `write` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:155` |
| `POST /api/v1/strategy-optimization/experiments/:id/finalize` | `task` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:160` |
| `POST /api/v1/strategy-optimization/experiments/:id/adopt` | `write` | `apps/server/src/strategy-optimization/strategy-optimization.controller.ts:165` |
| `POST /api/v1/strategy-submissions` | `ai` | `apps/server/src/strategy-optimization/strategy-submissions.controller.ts:11` |
| `GET /api/v1/strategy-submissions` | `poll` | `apps/server/src/strategy-optimization/strategy-submissions.controller.ts:17` |
| `POST /api/v1/strategy-submissions/:id/confirm` | `task` | `apps/server/src/strategy-optimization/strategy-submissions.controller.ts:20` |
| `POST /api/v1/watchlist/prices` | `marketRead` | `apps/server/src/watchlist/watchlist-prices.controller.ts:11` |
| `GET /api/v1/watchlist` | `read` | `apps/server/src/watchlist/watchlist.controller.ts:18` |
| `POST /api/v1/watchlist/items` | `write` | `apps/server/src/watchlist/watchlist.controller.ts:24` |
| `POST /api/v1/watchlist/changes` | `write` | `apps/server/src/watchlist/watchlist.controller.ts:30` |

## 定向与集成验证

Server 平台、身份与已有访问检查共 76 项通过；Desktop 相关恢复测试 15 项通过。操作清单与全部 Controller 的 AST 对比通过；每个模板以具体参数、大小写、HEAD、尾斜线及查询参数变体验证分类。来源、每用户每操作及成本总窗口分别验证，未验证会话不能创建用户额度，撤销/过期/禁用继续被原 Guard 拒绝；已验证结果仅在一个请求内复用，策略访问检查继续执行。

独立 Nest HTTP 受控处理器承接 5280 次真实 HTTP 请求，以逻辑时间压缩两分钟正常负载：八页面各六路 1.5 秒轮询，加每分钟初始化和 POST 报价及研究状态查询，全部 200。中间件单测另覆盖三分钟、POST 准备进度查询与独立成本保护。没有执行真实任务或模型。真实 HTTP 的任务/模型/登录过量分别返回 429 和 Retry-After，拒绝不执行处理器；同 IP 两个已验证用户独立，取消和读取仍 200，窗口结束恢复。此结果证明定义负载的限流行为，不作为生产吞吐或外部来源容量基准。

Desktop 冷却按来源、方法及路径隔离，同操作不同 query 仍等待，取消等待不发送请求；其它状态读取、POST 报价和取消立即可用，不自动重放写请求。复用 `es-toolkit@1.51.0` 根入口的 `delay(ms, { signal })`；已核对实际导出、声明、实现及[官方文档](https://es-toolkit.dev/reference/promise/delay.html)，保持可取消等待，未新增手写计时工具。

对应日志：`/tmp/api-cost-limits-integrated.log`、`/tmp/api-cost-limits-client.log`。Server 类型、本次范围 ESLint 和边界门禁通过，日志为 `/tmp/api-cost-limits-types.log`、`/tmp/api-cost-limits-lint.log`、`/tmp/api-cost-limits-boundaries.log`。

## 包级检查归属

Desktop 全包 `vitest run --maxWorkers=2`：260 文件、1661 项通过。Server 同配置全包：502 文件、3985 项通过，90 文件、403 项按既有环境条件跳过；16 项失败全部位于既有 `market-chart-detail-v3.test.ts`（1 项）和 `market-chart-selector-v3.test.ts`（15 项），另有同一图表输入的未处理拒绝。这些文件不属于本任务写集，既有失败与[前次记录](2026-11-07-strategy-read-rate-limit.md)相同；不将包级结果扩大为全仓全绿。

全包运行后对限流容量过期清理及测试类型标注做局部补强，最终定向 76 项重新通过；Server 类型、局部 ESLint、独立复杂度 20／函数长度 220／禁止嵌套三元门禁通过。Desktop 构建通过；尺寸门禁通过并保留 6 处既有告警。包级日志为 `/tmp/api-cost-limits-server-suite.log` 与 `/tmp/api-cost-limits-desktop-suite.log`，构建及局部门禁日志为 `/tmp/api-cost-limits-desktop-build.log`、`/tmp/api-cost-limits-complexity.log`、`/tmp/api-cost-limits-file-size.log`。

运行态首次同步被活动更新锁阻止，退出 1，未进入容器变更；锁对应正在运行的另一轮维护入口 `scripts/update.sh all`。保留该进程与锁，待完成后再使用本任务最小同步入口核对最终代码。

逐层追踪基金估值入口：`fund-valuation` 与 `fund-valuation/today` 在交易时段会读取持仓披露和受控行情并计算估值，归入行情交互；`daily-error` 只读取既有日误差记录，保留普通读取。这些入口不因 GET 方法而被归为低成本数据库查询。

收益目标读取在无显式目标时会聚合账户当前估值及权重，归入计算预览；不把该 GET 简化为单条配置查询。

优化“最终测试”入口会执行 `runFinalization`，按任务启动计数；已有结果的采纳仅保存版本及应用差异，保留普通写入。手工自动化可启动模型流程，按最高可达模型成本保护，实际 Worker 的执行预算继续独立生效。

最终负载补强：实际来源监测为 1 秒轮询，加入独立 HTTP 验收。每分钟六路 1.5 秒读取 1920 次，1 秒监测 480 次，POST 状态查询 320 次，报价 320 次，初始化 80 次；两分钟合计 6240 次真实 HTTP 全部 200。轮询类合计 2720 次，最繁忙操作 480 次。此前 5280 次为未加入来源监测的初始验证，以上补强结果覆盖最终输入。

## 实际浏览器与目标运行态

Edge Chromium 与实际 Vite 页面，1440、1024、768、390 四宽。策略库、回测任务、规则、通知和自选四宽各访问一次；桌面另访问账户、持仓、提供方和市场数据，共 24 次页面访问。142 个实际 API 响应全部 200，没有平台 429、页面脚本异常或页面横向溢出。验收未缓存或替换这些 API 响应；除明确只读的 POST 报价/自选价格外，拦截其它写请求，实际被阻止的写请求为 0。截图、逐响应统计在 `/tmp/api-cost-limits-browser-qa`，日志 `/tmp/api-cost-limits-browser.log`。

每宽另在浏览器内加载实际 transport 模块，由受控 fetcher 注入任务 POST 的 429：其它 GET 状态、POST 报价和取消在 0 毫秒内发出；同路径不同 query 等待约一秒，取消等待不发送请求。该部分没有连接业务写接口。已有持仓、账户、配置、通知及历史任务只读，没有创建真实模型工作或回测。

活动更新完成后，从主仓执行 `../thesis-ledger-infra/scripts/sync-code.sh thesis-ledger`，实际命令通过 `pnpm exec bash` 运行并设置工作区要求的三项 npmmirror 环境变量；兼容性预检通过，退出 0。最终成本登记和错误边界稳定后再次经同一维护入口同步，最终日志 `/tmp/api-cost-limits-sync-reviewed.log`，Server 与 Worker 均 healthy。未删除或覆盖他人的更新锁，未变更数据库结构、依赖或卷。

两个目标容器各 9 个产物（限流窗口、策略、查询清单、命令清单、身份主体、两个 Guard、身份 Controller、main）的 SHA-256 与宿主构建一致。运行时登记数量 328，基金估值为行情交互、优化最终测试为任务、来源监测为轮询；对应记录 `/tmp/api-cost-limits-runtime.json` 与 `/tmp/api-cost-limits-runtime-reviewed.json`。最后一次错误捕获范围收敛只调整异常路径，定向 81 项重跑通过，并验证并发 21 次任务请求恰好 20 个通过、1 个被拒绝。正常浏览输入及界面未改变，复用前述四宽证据；最终同步后健康、上下文、策略及回测列表四个实际 GET 再次返回 200。

镜像为另一轮维护更新产生的 `sha256:b1761bc3773061bd94397d7350a17d2657ef93df1355a21acbcaeffccefed35b`，本任务仅同步可写层，没有构建或发布新镜像。容器重建后须重新同步或经完整更新入口生成镜像。

## 最终一致性核对

AC1 由完整成本清单、特殊调用链理由、最终 AST 覆盖和运行时 328 项登记对应；AC2 由真实身份服务的单请求复用、撤销与归属检查、同 IP 主体隔离和异常路径验证对应；AC3 由含一秒来源监测的混合负载、窗口及并发边界、取消通路和浏览器冷却隔离对应；AC4 由全操作门禁、边界门禁、日志中间件顺序及明确失败类别对应；AC5 由分层构建、维护入口同步、产物摘要与真实页面证据对应。任务范围验收通过，保留共享工作区无关失败，不声明整个工作区全绿。
