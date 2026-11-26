# scripts 逐文件维护归属清单

日期：2026-11-15（Asia/Shanghai）。对应[审计报告](2026-11-15-scripts-maintenance-audit.md)。

分类与数量保留审计时快照；12 个已移动文件的路径已按[后续整理](../evidence/2026-11-15-scripts-maintenance.md)更新。当前维护入口见[工具索引](../../scripts/README.md)。

本清单来自当前工作区的静态扫描，包含 Git 已跟踪及未忽略的新文件，排除忽略的生成物。分类是保守的整理建议，不是删除许可、运行验收或所有者确认。脚本引用通过路径、相对引用和文件名检索，另行补充已核实的 CI 通配符与 P0 动态加载；无法枚举的运行时调用和仓外自动化仍可能存在。每项仅列代表性证据，不表示完整调用图。本次审计的两份新文档不参与引用统计，避免审计清单自身制造“仍在使用”的证据。

代码基线：`1ed418780d1970e8380955453667edc2fed4b126`；实际扫描 462 个脚本目录文件，三仓文本扫描 8449 个文件。工作区原有 18 个变更条目，其中新增 15 个。所有变更均保留。

| 分类 | 文件数 |
| --- | ---: |
| 长期工具及其依赖 | 128 |
| 当前新增工具，保留待定 | 15 |
| 已结案专项工具，候选归档 | 5 |
| 已结案界面验收，建议转回归 | 7 |
| 缺少入口归属，候选清理复核 | 13 |
| 业务验收与回归，按领域归类 | 294 |

## 长期工具及其依赖

有包命令、CI、运维指南、工程门禁或稳定夹具生产关系的入口及其依赖；包括当前应保留但存在维护缺陷的工具，具体缺陷见审计报告。

| 文件 | 代表性证据与保护条件 |
| --- | --- |
| [scripts/ai-catalog-boundaries.mjs](../../scripts/ai-catalog-boundaries.mjs) | `scripts/check-boundaries.mjs:5`；`scripts/ai-catalog-boundaries.test.mjs:3` |
| [scripts/ai-catalog-boundaries.test.mjs](../../scripts/ai-catalog-boundaries.test.mjs) | `docs/evidence/2026-10-26-provider-model-catalog-configuration.md:23`；`docs/evidence/2026-10-30-boundary-source-inventory.md:9` |
| [scripts/backup-db.sh](../../scripts/backup-db.sh) | `docs/guides/2026-08-18-release-and-recovery.md:5` |
| [scripts/boundary-source-inventory.mjs](../../scripts/boundary-source-inventory.mjs) | `scripts/check-boundaries.mjs:3`；`scripts/boundary-source-inventory.test.mjs:8` |
| [scripts/boundary-source-inventory.test.mjs](../../scripts/boundary-source-inventory.test.mjs) | `docs/evidence/2026-10-30-boundary-source-inventory.md:9` |
| [scripts/browser-request-id-boundaries.mjs](../../scripts/browser-request-id-boundaries.mjs) | `scripts/check-boundaries.mjs:7` |
| [scripts/build-research-stage-benchmark.ts](../../scripts/build-research-stage-benchmark.ts) | `docs/evidence/2026-11-01-research-live-experiment.md:19`；`docs/evidence/2026-11-06-watchlist-arena-weekly-local.md:39` |
| [scripts/check-accessibility.mjs](../../scripts/check-accessibility.mjs) | `package.json:11`；`docs/evidence/2026-11-09-market-news-pagination.md:41` |
| [scripts/check-benchmarks.mjs](../../scripts/check-benchmarks.mjs) | `package.json:14` |
| [scripts/check-boundaries.mjs](../../scripts/check-boundaries.mjs) | `现有工作区 M`；`package.json:9`；`docs/guides/2026-09-19-ai-sdk-cutover-and-rollback.md:20` |
| [scripts/check-file-size-guardrails.mjs](../../scripts/check-file-size-guardrails.mjs) | `package.json:25` · [日记 AI 解读 V2 归档](../archive/tasks/2026-11-13-journal-ai-research-v2.md) |
| [scripts/check-licenses.mjs](../../scripts/check-licenses.mjs) | `package.json:13` |
| [scripts/check-migration-matrix.mjs](../../scripts/check-migration-matrix.mjs) | `package.json:16`；`docs/evidence/2026-10-01-e01-n2-5-6-nav-persistence.md:45` |
| [scripts/check-release-artifacts.mjs](../../scripts/check-release-artifacts.mjs) | `package.json:12`；`docs/evidence/web-mobile-parity/2026-10-22-batch-0-1.md:67` |
| [scripts/check-runtime-database-input.mjs](../../scripts/check-runtime-database-input.mjs) | `docs/guides/2026-08-18-migration-test-matrix.md:29`；`scripts/check-migration-matrix.mjs:69` |
| [scripts/check-secrets.mjs](../../scripts/check-secrets.mjs) | `package.json:10`；`docs/evidence/2026-10-04-natural-language-strategy-parallel.md:103` |
| [scripts/check-workspace-dependencies.mjs](../../scripts/check-workspace-dependencies.mjs) | `package.json:9`；`docs/guides/2026-09-19-ai-sdk-cutover-and-rollback.md:21` |
| [scripts/date-input-boundaries.mjs](../../scripts/date-input-boundaries.mjs) | `scripts/check-boundaries.mjs:8`；`scripts/date-input-boundaries.test.mjs:3` |
| [scripts/date-input-boundaries.test.mjs](../../scripts/date-input-boundaries.test.mjs) | `docs/archive/evidence/2026-11-06-desktop-date-selection.md:52`；`docs/archive/evidence/2026-11-11-date-input-consistency.md:41` |
| [scripts/db-integration-smoke.mjs](../../scripts/db-integration-smoke.mjs) | `package.json:20` |
| [scripts/deployment/apply-code.sh](../../scripts/deployment/apply-code.sh) | `docs/guides/local-deployment-interface.md:11` |
| [scripts/deployment/image-contract.mjs](../../scripts/deployment/image-contract.mjs) | `scripts/local-deployment.sh:10` |
| [scripts/deployment/maintenance.json](../../scripts/deployment/maintenance.json) | `现有工作区 M`；`docs/guides/local-deployment-interface.md:13`；`docs/evidence/2026-11-13-arena-research-output-fix.md:106` |
| [scripts/deployment/prepare-code.sh](../../scripts/deployment/prepare-code.sh) | `scripts/local-deployment.sh:8`；`scripts/local-deployment.sh:9` |
| [scripts/deployment/prepare-code.test.mjs](../../scripts/deployment/prepare-code.test.mjs) | `.github/workflows/ci.yml（测试通配符）` |
| [scripts/disaster-recovery-smoke.mjs](../../scripts/disaster-recovery-smoke.mjs) | `package.json:26` |
| [scripts/draft-close-boundaries.mjs](../../scripts/draft-close-boundaries.mjs) | `scripts/check-boundaries.mjs:14`；`scripts/draft-close-boundaries.test.mjs:3` |
| [scripts/draft-close-boundaries.test.mjs](../../scripts/draft-close-boundaries.test.mjs) | `docs/archive/evidence/2026-11-07-draft-close-races.md:62`；`docs/archive/evidence/2026-11-07-navigation-draft-snapshots.md:47` |
| [scripts/dsa-target-consumer.mjs](../../scripts/dsa-target-consumer.mjs) | `scripts/local-runtime/dsa-target-acceptance.mjs:15`；`scripts/local-runtime/dsa-target-acceptance.mjs:217` |
| [scripts/evaluate-research-trace.mjs](../../scripts/evaluate-research-trace.mjs) | `.github/workflows/ci.yml:125`；`docs/tasks/2026-10-18-research-evidence-evolution.md:180` |
| [scripts/file-size-sources.mjs](../../scripts/file-size-sources.mjs) | `scripts/check-file-size-guardrails.mjs:5`；`scripts/file-size-sources.test.mjs:7` |
| [scripts/file-size-sources.test.mjs](../../scripts/file-size-sources.test.mjs) | `docs/evidence/2026-10-26-file-size-source-ownership.md:13` |
| [scripts/fixtures/arena-detail-refresh.cjs](../../scripts/fixtures/arena-detail-refresh.cjs) | `apps/desktop/scripts/check-arena-detail-refresh.cjs:5`；`apps/desktop/test/arena-detail-refresh.ui.test.tsx:16` |
| [scripts/fixtures/arena-live.cjs](../../scripts/fixtures/arena-live.cjs) | `scripts/fixtures/arena-contingent-orders.mjs:5`；`scripts/local-runtime/arena-experience-browser.mjs:8` |
| [scripts/instrument-display-boundaries.mjs](../../scripts/instrument-display-boundaries.mjs) | `scripts/check-boundaries.mjs:6`；`scripts/instrument-display-boundaries.test.mjs:3` |
| [scripts/instrument-display-boundaries.test.mjs](../../scripts/instrument-display-boundaries.test.mjs) | `docs/evidence/2026-11-04-instrument-display-read-model.md:22`；`docs/archive/evidence/2026-11-10-strategy-instrument-display.md:25` |
| [scripts/known-cash-frozen-comparison.mjs](../../scripts/known-cash-frozen-comparison.mjs) | `scripts/research-window-replay-target.mjs:10`；`scripts/research-window-replay-target.mjs:16` |
| [scripts/lint-workspace.mjs](../../scripts/lint-workspace.mjs) | `package.json:9`；`package.json:25` |
| [scripts/local-deployment.sh](../../scripts/local-deployment.sh) | `docs/guides/local-deployment-interface.md:7`；`docs/guides/local-deployment-interface.md:8` |
| [scripts/local-runtime/ai-deployment-contract.test.sh](../../scripts/local-runtime/ai-deployment-contract.test.sh) | `.github/workflows/ci.yml:40`；`docs/guides/local-deployment-interface.md:21` |
| [scripts/local-runtime/arena-maintenance-queue.mjs](../../scripts/local-runtime/arena-maintenance-queue.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`scripts/deployment/maintenance.json:8`；`scripts/local-runtime/arena-maintenance-queue.test.mjs:4` |
| [scripts/local-runtime/arena-maintenance-queue.test.mjs](../../scripts/local-runtime/arena-maintenance-queue.test.mjs) | `.github/workflows/ci.yml（测试通配符）` |
| [scripts/local-runtime/arena-research-recovery.mjs](../../scripts/local-runtime/arena-research-recovery.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`scripts/deployment/maintenance.json:12`；`scripts/local-runtime/arena-research-recovery.test.mjs:3` |
| [scripts/local-runtime/arena-research-recovery.test.mjs](../../scripts/local-runtime/arena-research-recovery.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`docs/evidence/2026-11-13-arena-research-output-fix.md:16`；`docs/evidence/2026-11-14-arena-replay-continuation.md:18` |
| [scripts/local-runtime/arena-us-acceptance-config.mjs](../../scripts/local-runtime/arena-us-acceptance-config.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`scripts/deployment/maintenance.json:6` |
| [scripts/local-runtime/arena-us-history-observation.mjs](../../scripts/local-runtime/arena-us-history-observation.mjs) | `scripts/local-runtime/arena-us-model-acceptance.mjs:24`；`scripts/local-runtime/arena-us-history-observation.test.mjs:3` |
| [scripts/local-runtime/arena-us-history-observation.test.mjs](../../scripts/local-runtime/arena-us-history-observation.test.mjs) | `.github/workflows/ci.yml（测试通配符）` |
| [scripts/local-runtime/arena-us-model-acceptance.mjs](../../scripts/local-runtime/arena-us-model-acceptance.mjs) | `scripts/local-runtime/run-arena-us-model-acceptance.mjs:9` |
| [scripts/local-runtime/backtest-production-compose-smoke.mjs](../../scripts/local-runtime/backtest-production-compose-smoke.mjs) | `docs/guides/backtest-target-recovery.md:28`；`scripts/local-runtime/backtest-target-recovery.test.mjs:6` |
| [scripts/local-runtime/backtest-target-recovery.mjs](../../scripts/local-runtime/backtest-target-recovery.mjs) | `docs/guides/backtest-target-recovery.md:15`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:84` |
| [scripts/local-runtime/backtest-target-recovery.test.mjs](../../scripts/local-runtime/backtest-target-recovery.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`docs/guides/backtest-target-recovery.md:14`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:89` |
| [scripts/local-runtime/backtest-target-runtime.mjs](../../scripts/local-runtime/backtest-target-runtime.mjs) | `scripts/local-runtime/backtest-production-compose-smoke.mjs:8`；`scripts/local-runtime/backtest-target-recovery.mjs:5` |
| [scripts/local-runtime/capture-arena-us-history.mjs](../../scripts/local-runtime/capture-arena-us-history.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`scripts/deployment/maintenance.json:7` |
| [scripts/local-runtime/contract-test.sh](../../scripts/local-runtime/contract-test.sh) | `docs/guides/local-runtime-tools.md:27`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:569` |
| [scripts/local-runtime/database-role-contract.test.sh](../../scripts/local-runtime/database-role-contract.test.sh) | `.github/workflows/ci.yml:41`；`docs/guides/local-deployment-interface.md:21` |
| [scripts/local-runtime/dsa-forward-image-recovery.mjs](../../scripts/local-runtime/dsa-forward-image-recovery.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`scripts/deployment/maintenance.json:9`；`scripts/local-runtime/dsa-forward-image-recovery.test.mjs:4` |
| [scripts/local-runtime/dsa-forward-image-recovery.test.mjs](../../scripts/local-runtime/dsa-forward-image-recovery.test.mjs) | `.github/workflows/ci.yml（测试通配符）` |
| [scripts/local-runtime/dsa-target-acceptance.mjs](../../scripts/local-runtime/dsa-target-acceptance.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`scripts/deployment/maintenance.json:11`；`scripts/local-runtime/dsa-target-acceptance.sh:9` |
| [scripts/local-runtime/dsa-target-recovery.mjs](../../scripts/local-runtime/dsa-target-recovery.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`scripts/deployment/maintenance.json:10`；`scripts/local-runtime/dsa-target-recovery.sh:8` |
| [scripts/local-runtime/dsa-target-recovery.sh](../../scripts/local-runtime/dsa-target-recovery.sh) | `scripts/local-runtime/dsa-target-recovery.mjs:163`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:179` |
| [scripts/local-runtime/dsa-target-recovery.test.mjs](../../scripts/local-runtime/dsa-target-recovery.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`docs/archive/reviews/2026-11-05-three-repository-documentation.md:106`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:184` |
| [scripts/local-runtime/market-v3-contract-test.sh](../../scripts/local-runtime/market-v3-contract-test.sh) | `docs/guides/local-runtime-tools.md:38`；`scripts/local-runtime/contract-test.sh:5` |
| [scripts/local-runtime/provider-health-record-conversion.mjs](../../scripts/local-runtime/provider-health-record-conversion.mjs) | `scripts/local-runtime/provider-health-record-maintenance.mjs:10`；`scripts/local-runtime/provider-health-record-conversion.test.mjs:6` |
| [scripts/local-runtime/provider-health-record-conversion.test.mjs](../../scripts/local-runtime/provider-health-record-conversion.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`docs/archive/evidence/2026-11-12-provider-health-records.md:21` |
| [scripts/local-runtime/provider-health-record-maintenance.mjs](../../scripts/local-runtime/provider-health-record-maintenance.mjs) | `docs/guides/provider-health-record-maintenance.md:11`；`docs/guides/provider-health-record-maintenance.md:19` |
| [scripts/local-runtime/research-dual-read-inputs.mjs](../../scripts/local-runtime/research-dual-read-inputs.mjs) | `scripts/local-runtime/research-dual-read-consumers.mjs:8`；`scripts/local-runtime/research-dual-read.mjs:9` |
| [scripts/local-runtime/research-dual-read-runtime.mjs](../../scripts/local-runtime/research-dual-read-runtime.mjs) | `scripts/local-runtime/ai-provider-copy-acceptance.mjs:7`；`scripts/local-runtime/research-dual-read-consumers.mjs:6` |
| [scripts/local-runtime/research-dual-read-runtime.test.mjs](../../scripts/local-runtime/research-dual-read-runtime.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:449` |
| [scripts/local-runtime/research-dual-read.mjs](../../scripts/local-runtime/research-dual-read.mjs) | `scripts/ai-controlled-config-web.mjs:6`；`scripts/ai-credential-type-web.mjs:6` |
| [scripts/local-runtime/research-observation-retention-guards.mjs](../../scripts/local-runtime/research-observation-retention-guards.mjs) | `scripts/local-runtime/research-observation-retention.mjs:11`；`scripts/local-runtime/research-observation-retention.mjs:142` |
| [scripts/local-runtime/research-observation-retention-probe.mjs](../../scripts/local-runtime/research-observation-retention-probe.mjs) | `scripts/local-runtime/research-observation-retention.mjs:9`；`scripts/local-runtime/research-observation-retention.mjs:143` |
| [scripts/local-runtime/research-observation-retention.mjs](../../scripts/local-runtime/research-observation-retention.mjs) | `docs/guides/local-runtime-tools.md:17`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:474` |
| [scripts/local-runtime/research-observation-retention.test.mjs](../../scripts/local-runtime/research-observation-retention.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:479` |
| [scripts/local-runtime/research-state-archive.py](../../scripts/local-runtime/research-state-archive.py) | `scripts/local-runtime/research-state-restore.mjs:10` |
| [scripts/local-runtime/research-state-backup.mjs](../../scripts/local-runtime/research-state-backup.mjs) | `docs/guides/local-runtime-tools.md:10`；`docs/guides/local-runtime-tools.md:11` |
| [scripts/local-runtime/research-state-backup.test.mjs](../../scripts/local-runtime/research-state-backup.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:489` |
| [scripts/local-runtime/research-state-rehearse.mjs](../../scripts/local-runtime/research-state-rehearse.mjs) | `docs/guides/local-runtime-tools.md:12`；`docs/guides/local-runtime-tools.md:15` |
| [scripts/local-runtime/research-state-rehearse.test.mjs](../../scripts/local-runtime/research-state-rehearse.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:499` |
| [scripts/local-runtime/research-state-restore.mjs](../../scripts/local-runtime/research-state-restore.mjs) | `docs/guides/local-deployment-interface.md:15`；`scripts/local-runtime/research-state-rehearse.mjs:10` |
| [scripts/local-runtime/run-arena-us-model-acceptance.mjs](../../scripts/local-runtime/run-arena-us-model-acceptance.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`scripts/deployment/maintenance.json:5` |
| [scripts/local-runtime/verify-price-research-live-program.mjs](../../scripts/local-runtime/verify-price-research-live-program.mjs) | `scripts/local-runtime/verify-price-research-live.mjs:48` |
| [scripts/local-runtime/verify-price-research-live.mjs](../../scripts/local-runtime/verify-price-research-live.mjs) | `docs/guides/2026-11-11-backtest-return-research.md:36`；`docs/archive/evidence/2026-11-11-backtest-price-pair-recovery.md:32` |
| [scripts/local-runtime/verify-price-research-run-program.mjs](../../scripts/local-runtime/verify-price-research-run-program.mjs) | `scripts/local-runtime/verify-price-research-live.mjs:47` |
| [scripts/market-session-boundaries.mjs](../../scripts/market-session-boundaries.mjs) | `scripts/check-boundaries.mjs:9`；`scripts/market-session-boundaries.test.mjs:3` |
| [scripts/market-session-boundaries.test.mjs](../../scripts/market-session-boundaries.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/market-v3-business-probe.mjs](../../scripts/market-v3-business-probe.mjs) | `scripts/market-v3-business-smoke.mjs:2`；`scripts/market-v3-business-probe.test.mjs:4` |
| [scripts/market-v3-business-probe.test.mjs](../../scripts/market-v3-business-probe.test.mjs) | `docs/evidence/2026-09-29-canonical-contract-smoke-entry.md:17` |
| [scripts/market-v3-business-smoke.mjs](../../scripts/market-v3-business-smoke.mjs) | `package.json:24`；`scripts/local-runtime/contract-test.sh:6` |
| [scripts/market-v3-contract-probe.mjs](../../scripts/market-v3-contract-probe.mjs) | `scripts/market-v3-contract-smoke.mjs:1`；`scripts/market-v3-contract-probe.test.mjs:4` |
| [scripts/market-v3-contract-probe.test.mjs](../../scripts/market-v3-contract-probe.test.mjs) | `docs/evidence/2026-09-27-f01-release-preparation.md:3`；`docs/evidence/2026-09-27-target-runtime-gates.md:26` |
| [scripts/market-v3-contract-smoke.mjs](../../scripts/market-v3-contract-smoke.mjs) | `package.json:24`；`scripts/local-runtime/market-v3-contract-test.sh:5` |
| [scripts/market-window-consumer-boundaries.mjs](../../scripts/market-window-consumer-boundaries.mjs) | `scripts/check-boundaries.mjs:10`；`scripts/market-window-consumer-boundaries.test.mjs:3` |
| [scripts/market-window-consumer-boundaries.test.mjs](../../scripts/market-window-consumer-boundaries.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/mobile-boundaries.mjs](../../scripts/mobile-boundaries.mjs) | `scripts/check-boundaries.mjs:4`；`scripts/test-mobile-boundaries.mjs:3` |
| [scripts/mobile-release.mjs](../../scripts/mobile-release.mjs) | `.github/workflows/mobile-release-prepare.yml:43`；`.github/workflows/mobile-release-prepare.yml:44` |
| [scripts/mobile-release/android.mjs](../../scripts/mobile-release/android.mjs) | `scripts/mobile-release.mjs:19`；`scripts/mobile-release/policy.test.mjs:7` |
| [scripts/mobile-release/cli.test.mjs](../../scripts/mobile-release/cli.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`docs/evidence/2026-10-25-g3-reasoning-off-control.md:120` |
| [scripts/mobile-release/config.mjs](../../scripts/mobile-release/config.mjs) | `scripts/mobile-release.mjs:11`；`scripts/mobile-release/android.mjs:5` |
| [scripts/mobile-release/ios.mjs](../../scripts/mobile-release/ios.mjs) | `scripts/mobile-release.mjs:26`；`scripts/mobile-release/policy.test.mjs:6` |
| [scripts/mobile-release/ipa-extract.py](../../scripts/mobile-release/ipa-extract.py) | `scripts/mobile-release/ios.mjs:146`；`scripts/mobile-release/cli.test.mjs:150` |
| [scripts/mobile-release/policy.mjs](../../scripts/mobile-release/policy.mjs) | `scripts/mobile-release/android.mjs:7`；`scripts/mobile-release/ios.mjs:9` |
| [scripts/mobile-release/policy.test.mjs](../../scripts/mobile-release/policy.test.mjs) | `.github/workflows/ci.yml（测试通配符）` |
| [scripts/mobile-release/process.mjs](../../scripts/mobile-release/process.mjs) | `scripts/mobile-release.mjs:12`；`scripts/mobile-release/android.mjs:6` |
| [scripts/mobile-release/process.test.mjs](../../scripts/mobile-release/process.test.mjs) | `.github/workflows/ci.yml（测试通配符）` |
| [scripts/mobile-release/provenance.mjs](../../scripts/mobile-release/provenance.mjs) | `scripts/mobile-release.mjs:27` |
| [scripts/portfolio-benchmark.mjs](../../scripts/portfolio-benchmark.mjs) | `package.json:15` |
| [scripts/print-market-minute-indicator-fixture.mjs](../../scripts/print-market-minute-indicator-fixture.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/print-market-period-indicator-fixture.mjs](../../scripts/print-market-period-indicator-fixture.mjs) | `docs/evidence/2026-10-04-market-period-indicator-contract.md:20`；`docs/evidence/2026-10-05-market-period-t6-engineering-gates.md:90` |
| [scripts/projection-shadow-diff.mjs](../../scripts/projection-shadow-diff.mjs) | `package.json:17`；`docs/archive/tasks/2026-08-26-trade-execution-ledger-system-follow-up-history.md:241` |
| [scripts/projection-shadow-rebuild.mjs](../../scripts/projection-shadow-rebuild.mjs) | `package.json:18`；`docs/guides/2026-08-28-trade-projection-cutover.md:63` |
| [scripts/projection-switch-gate.mjs](../../scripts/projection-switch-gate.mjs) | `package.json:19`；`docs/archive/tasks/2026-08-26-trade-execution-ledger-system-follow-up-history.md:241` |
| [scripts/provider-failover-smoke.mjs](../../scripts/provider-failover-smoke.mjs) | `package.json:21` |
| [scripts/research-dual-read-consumers.mjs](../../scripts/research-dual-read-consumers.mjs) | `scripts/local-runtime/research-dual-read-consumers.mjs:26`；`scripts/local-runtime/research-dual-read-consumers.mjs:85` |
| [scripts/research-dual-read-fixtures.mjs](../../scripts/research-dual-read-fixtures.mjs) | `scripts/local-runtime/research-dual-read-inputs.mjs:45`；`scripts/local-runtime/research-dual-read.mjs:93` |
| [scripts/research-dual-read-fixtures.test.mjs](../../scripts/research-dual-read-fixtures.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-dual-read-sdk.mjs](../../scripts/research-dual-read-sdk.mjs) | `scripts/local-runtime/research-dual-read-consumers.mjs:27`；`scripts/local-runtime/research-dual-read-inputs.mjs:46` |
| [scripts/research-window-replay.mjs](../../scripts/research-window-replay.mjs) | `scripts/local-runtime/research-state-rehearse.mjs:54`；`scripts/research-window-replay-target.mjs:15` |
| [scripts/restore-db.sh](../../scripts/restore-db.sh) | `docs/guides/2026-08-18-release-and-recovery.md:5` |
| [scripts/test-ai-provider-postgres.mjs](../../scripts/test-ai-provider-postgres.mjs) | `现有工作区 M`；`.github/workflows/ci.yml:97`；`docs/tasks/2026-10-18-research-evidence-evolution.md:106` |
| [scripts/test-fund-investment-postgres.mjs](../../scripts/test-fund-investment-postgres.mjs) | `.github/workflows/ci.yml:99`；`docs/evidence/2026-10-04-recurring-fund-runtime.md:28` |
| [scripts/test-journal-review-postgres.mjs](../../scripts/test-journal-review-postgres.mjs) | `.github/workflows/ci.yml:105`；`docs/tasks/2026-11-05-model-arena.md:11` |
| [scripts/test-mobile-boundaries.mjs](../../scripts/test-mobile-boundaries.mjs) | `.github/workflows/ci.yml:131`；`docs/evidence/web-mobile-parity/2026-10-23-batch-2.md:156` |
| [scripts/test-performance-correctness-postgres.mjs](../../scripts/test-performance-correctness-postgres.mjs) | `.github/workflows/ci.yml:103`；`docs/evidence/2026-10-18-performance-correctness.md:34` |
| [scripts/test-portfolio-valuation-postgres.mjs](../../scripts/test-portfolio-valuation-postgres.mjs) | `.github/workflows/ci.yml:101`；`docs/evidence/2026-10-04-portfolio-valuation-runtime.md:9` |
| [scripts/tsconfig.json](../../scripts/tsconfig.json) | `scripts/test-backtest-recovery.mjs:34`；`docs/archive/evidence/2026-11-05-desktop-presentation-consistency.md:44` |
| [scripts/v1-core-e2e-smoke.mjs](../../scripts/v1-core-e2e-smoke.mjs) | `package.json:22` |
| [scripts/workspace-lint-sources.mjs](../../scripts/workspace-lint-sources.mjs) | `scripts/file-size-sources.mjs:3`；`scripts/lint-workspace.mjs:6` |
| [scripts/workspace-lint-sources.test.mjs](../../scripts/workspace-lint-sources.test.mjs) | `docs/evidence/2026-10-25-g3-trace-deployment.md:19`；`docs/evidence/2026-10-26-file-size-source-ownership.md:13` |

## 当前新增工具，保留待定

当前工作区新文件；无显式入站引用不能证明已经废弃。归属由进行中的功能任务决定。

| 文件 | 代表性证据与保护条件 |
| --- | --- |
| [scripts/fixtures/arena-contingent-orders.mjs](../../scripts/fixtures/arena-contingent-orders.mjs) | `现有工作区 ??`；`scripts/local-runtime/arena-contingent-advanced-replay.mjs:8`；`scripts/local-runtime/arena-contingent-captured-replay.mjs:9` |
| [scripts/local-runtime/ai-provider-status-browser.mjs](../../scripts/local-runtime/ai-provider-status-browser.mjs) | `现有工作区 ??`；`docs/archive/evidence/2026-11-15-ai-provider-status.md:50` |
| [scripts/local-runtime/arena-contingent-advanced-replay.mjs](../../scripts/local-runtime/arena-contingent-advanced-replay.mjs) | `现有工作区 ??`；`scripts/local-runtime/arena-contingent-captured-replay.mjs:16` |
| [scripts/local-runtime/arena-contingent-captured-replay.mjs](../../scripts/local-runtime/arena-contingent-captured-replay.mjs) | `现有工作区 ??`；`scripts/local-runtime/run-arena-contingent-model-acceptance.mjs:10` |
| [scripts/local-runtime/arena-contingent-fixed-captures.mjs](../../scripts/local-runtime/arena-contingent-fixed-captures.mjs) | `现有工作区 ??` |
| [scripts/local-runtime/arena-contingent-model-acceptance.mjs](../../scripts/local-runtime/arena-contingent-model-acceptance.mjs) | `现有工作区 ??`；`scripts/local-runtime/run-arena-contingent-model-acceptance.mjs:9` |
| [scripts/local-runtime/arena-contingent-model-scenarios.mjs](../../scripts/local-runtime/arena-contingent-model-scenarios.mjs) | `现有工作区 ??`；`scripts/local-runtime/arena-contingent-advanced-replay.mjs:9`；`scripts/local-runtime/arena-contingent-fixed-captures.mjs:8` |
| [scripts/local-runtime/arena-contingent-orders-browser.mjs](../../scripts/local-runtime/arena-contingent-orders-browser.mjs) | `现有工作区 ??`；`docs/evidence/2026-11-15-arena-contingent-orders.md:31` |
| [scripts/local-runtime/arena-contingent-orders-mobile-browser.mjs](../../scripts/local-runtime/arena-contingent-orders-mobile-browser.mjs) | `现有工作区 ??` |
| [scripts/local-runtime/arena-contingent-runtime-check.mjs](../../scripts/local-runtime/arena-contingent-runtime-check.mjs) | `现有工作区 ??` |
| [scripts/local-runtime/rule-monitor-source-growth-browser.mjs](../../scripts/local-runtime/rule-monitor-source-growth-browser.mjs) | `现有工作区 ??`；`docs/evidence/2026-11-15-rule-monitor-source-selection.md:9` |
| [scripts/local-runtime/run-arena-contingent-model-acceptance.mjs](../../scripts/local-runtime/run-arena-contingent-model-acceptance.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`现有工作区 ??`；`scripts/deployment/maintenance.json:4`；`docs/evidence/2026-11-15-arena-contingent-orders.md:41` |
| [scripts/local-runtime/run-arena-research-route-upgrade.mjs](../../scripts/local-runtime/run-arena-research-route-upgrade.mjs) | `scripts/deployment/maintenance.json（维护登记）`；`现有工作区 ??`；`scripts/deployment/maintenance.json:3` |
| [scripts/local-runtime/upgrade-arena-research-route.mjs](../../scripts/local-runtime/upgrade-arena-research-route.mjs) | `现有工作区 ??`；`scripts/local-runtime/run-arena-research-route-upgrade.mjs:31` |
| [scripts/test-strategy-regressions-postgres.mjs](../../scripts/test-strategy-regressions-postgres.mjs) | `现有工作区 ??` |

## 已结案专项工具，候选归档

已核对结案资料的专项脚本。归档前仍需保留历史复现关系并处理测试发现规则。

| 文件 | 代表性证据与保护条件 |
| --- | --- |
| [scripts/archive/2026-10-08-announcement-preparation/announcement_preparation_target.py](../../scripts/archive/2026-10-08-announcement-preparation/announcement_preparation_target.py) | `docs/archive/reviews/2026-10-08-announcement-preparation-acceptance.md:29` |
| [scripts/archive/2026-10-08-announcement-preparation/announcement_restart_target.py](../../scripts/archive/2026-10-08-announcement-preparation/announcement_restart_target.py) | `docs/archive/reviews/2026-10-08-announcement-preparation-acceptance.md:30` |
| [scripts/archive/2026-08-28-unified-backtest-v2/backtest-v1-inventory.mjs](../../scripts/archive/2026-08-28-unified-backtest-v2/backtest-v1-inventory.mjs) | `docs/archive/tasks/2026-08-28-unified-backtest-v2.md:329` |
| [scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.mjs](../../scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.mjs) | `scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.test.mjs:3`；`docs/archive/evidence/2026-11-12-strategy-cross-direction.md:78` |
| [scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.test.mjs](../../scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`docs/archive/evidence/2026-11-12-strategy-cross-direction.md:66` |

## 已结案界面验收，建议转回归

关联已结案界面任务；已有可复用交互断言，优先按领域纳入浏览器回归，未建议直接删除。

| 文件 | 代表性证据与保护条件 |
| --- | --- |
| [scripts/local-runtime/browser/instruments/instrument-multiselect-mobile.regression.mjs](../../scripts/local-runtime/browser/instruments/instrument-multiselect-mobile.regression.mjs) | `docs/archive/evidence/2026-11-12-instrument-multiselect-consistency.md:33`；`docs/archive/evidence/2026-11-12-multiselect-inline-values.md:70` |
| [scripts/local-runtime/browser/instruments/multiselect-inline.regression.mjs](../../scripts/local-runtime/browser/instruments/multiselect-inline.regression.mjs) | `docs/archive/evidence/2026-11-12-multiselect-inline-values.md:68` |
| [scripts/local-runtime/browser/providers/provider-health-record.regression.mjs](../../scripts/local-runtime/browser/providers/provider-health-record.regression.mjs) | `docs/archive/evidence/2026-11-12-provider-health-records.md:70` |
| [scripts/local-runtime/browser/risk/risk-notification-mobile.regression.mjs](../../scripts/local-runtime/browser/risk/risk-notification-mobile.regression.mjs) | `docs/archive/evidence/2026-11-12-risk-notification-unification.md:34` |
| [scripts/local-runtime/browser/risk/risk-notification-unification.regression.mjs](../../scripts/local-runtime/browser/risk/risk-notification-unification.regression.mjs) | `docs/archive/evidence/2026-11-12-risk-notification-unification.md:33` |
| [scripts/local-runtime/browser/risk/strategy-risk-monitoring.regression.mjs](../../scripts/local-runtime/browser/risk/strategy-risk-monitoring.regression.mjs) | `docs/archive/evidence/2026-11-13-strategy-risk-automatic-monitoring.md:41` |
| [scripts/local-runtime/browser/risk/strategy-rule-notification.regression.mjs](../../scripts/local-runtime/browser/risk/strategy-rule-notification.regression.mjs) | `docs/archive/evidence/2026-11-12-risk-close-confirmation.md:22`；`docs/archive/evidence/2026-11-12-risk-notification-unification.md:36` |

## 缺少入口归属，候选清理复核

未检出明确调用归属的候选复核项；“零引用”只是静态线索。需要核对人工命令、语义覆盖及任务承接后才能决定删除、归档或转为回归。

| 文件 | 代表性证据与保护条件 |
| --- | --- |
| [scripts/ai-credential-type-web.mjs](../../scripts/ai-credential-type-web.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/authoring-provider-validation.mjs](../../scripts/authoring-provider-validation.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/authoring-target-live.mjs](../../scripts/authoring-target-live.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/cn-status-independent.py](../../scripts/cn-status-independent.py) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/eastmoney-cash-research-policy.mjs](../../scripts/eastmoney-cash-research-policy.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/fixtures/projection-shadow-pass.json](../../scripts/fixtures/projection-shadow-pass.json) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/hk-share-window-independent.py](../../scripts/hk-share-window-independent.py) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/local-runtime/arena-us-runtime-check.mjs](../../scripts/local-runtime/arena-us-runtime-check.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/market-composition-success-reconciliation.mjs](../../scripts/market-composition-success-reconciliation.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/market-rule-target.mjs](../../scripts/market-rule-target.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/share-window-independent.py](../../scripts/share-window-independent.py) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/share-window-target.mjs](../../scripts/share-window-target.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/test-fund-disclosure-contract.mjs](../../scripts/test-fund-disclosure-contract.mjs) | `未检出可解析的显式入站引用；不代表未使用` |

## 业务验收与回归，按领域归类

其余验收入口、驱动、复算器、夹具与测试保守保留，按领域归类。尚未逐一确认原任务是否完整结束，不能把本分类理解成当前全部在用或全部一次性。

| 文件 | 代表性证据与保护条件 |
| --- | --- |
| [scripts/ai-controlled-config-contract.mjs](../../scripts/ai-controlled-config-contract.mjs) | `scripts/ai-controlled-config-web.mjs:18`；`scripts/ai-credential-type-contract.mjs:3` |
| [scripts/ai-controlled-config-contract.test.mjs](../../scripts/ai-controlled-config-contract.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/ai-controlled-config-inspect.mjs](../../scripts/ai-controlled-config-inspect.mjs) | `scripts/ai-controlled-config-web.mjs:79` |
| [scripts/ai-controlled-config-web.mjs](../../scripts/ai-controlled-config-web.mjs) | `docs/evidence/2026-10-21-ai-controlled-config-web.md:28` |
| [scripts/ai-credential-type-contract.mjs](../../scripts/ai-credential-type-contract.mjs) | `scripts/ai-credential-type-web.mjs:19`；`scripts/ai-credential-type-contract.test.mjs:9` |
| [scripts/ai-credential-type-contract.test.mjs](../../scripts/ai-credential-type-contract.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/ai-credential-type-inspect.mjs](../../scripts/ai-credential-type-inspect.mjs) | `scripts/ai-credential-type-web.mjs:71` |
| [scripts/ai-default-lifecycle-target.mjs](../../scripts/ai-default-lifecycle-target.mjs) | `scripts/ai-default-lifecycle-target.test.mjs:3`；`docs/evidence/2026-10-21-ai-default-lifecycle-target.md:22` |
| [scripts/ai-default-lifecycle-target.test.mjs](../../scripts/ai-default-lifecycle-target.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/ai-provider-copy-acceptance.mjs](../../scripts/ai-provider-copy-acceptance.mjs) | `scripts/local-runtime/ai-provider-copy-acceptance.mjs:10`；`docs/evidence/2026-10-19-ai-provider-database-only.md:87` |
| [scripts/ai-provider-target-fault-acceptance.mjs](../../scripts/ai-provider-target-fault-acceptance.mjs) | `scripts/ai-provider-target-fault-acceptance.test.mjs:14`；`docs/evidence/2026-10-31-ai-provider-live-fault-acceptance.md:43` |
| [scripts/ai-provider-target-fault-acceptance.test.mjs](../../scripts/ai-provider-target-fault-acceptance.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/ai-provider-target-fault-relay.mjs](../../scripts/ai-provider-target-fault-relay.mjs) | `scripts/ai-provider-target-fault-acceptance.mjs:13`；`scripts/ai-provider-target-fault-runtime.mjs:6` |
| [scripts/ai-provider-target-fault-requests.mjs](../../scripts/ai-provider-target-fault-requests.mjs) | `scripts/ai-provider-target-fault-acceptance.mjs:14`；`scripts/ai-provider-target-fault-relay.mjs:5` |
| [scripts/ai-provider-target-fault-runtime.mjs](../../scripts/ai-provider-target-fault-runtime.mjs) | `scripts/ai-provider-target-fault-acceptance.mjs:12`；`scripts/ai-provider-target-fault-acceptance.mjs:108` |
| [scripts/ai-settings-concurrency-acceptance.mjs](../../scripts/ai-settings-concurrency-acceptance.mjs) | `scripts/ai-settings-concurrency-acceptance.test.mjs:3`；`docs/evidence/2026-10-21-ai-settings-concurrency.md:7` |
| [scripts/ai-settings-concurrency-acceptance.test.mjs](../../scripts/ai-settings-concurrency-acceptance.test.mjs) | `docs/evidence/2026-10-21-ai-settings-concurrency.md:7` |
| [scripts/authoring-target-admission.mjs](../../scripts/authoring-target-admission.mjs) | `docs/evidence/2026-10-06-authoring-target-admission.md:74`；`docs/evidence/2026-10-06-authoring-target-admission.md:75` |
| [scripts/authoring-target-recovery-run.mjs](../../scripts/authoring-target-recovery-run.mjs) | `docs/evidence/2026-10-06-authoring-completion.md:64` |
| [scripts/automation-market-consumer-contract.mjs](../../scripts/automation-market-consumer-contract.mjs) | `scripts/automation-market-consumer-final.mjs:18`；`scripts/automation-market-consumer.mjs:27` |
| [scripts/automation-market-consumer-contract.test.mjs](../../scripts/automation-market-consumer-contract.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/automation-market-consumer-final.mjs](../../scripts/automation-market-consumer-final.mjs) | `docs/evidence/2026-10-21-automation-market-consumer.md:41` |
| [scripts/automation-market-consumer.mjs](../../scripts/automation-market-consumer.mjs) | `docs/evidence/2026-10-21-automation-market-consumer.md:41` |
| [scripts/automation-process-recovery-smoke.mjs](../../scripts/automation-process-recovery-smoke.mjs) | `scripts/cash-notification-mock-smoke.mjs:8`；`scripts/automation-process-recovery-smoke.test.mjs:7` |
| [scripts/automation-process-recovery-smoke.test.mjs](../../scripts/automation-process-recovery-smoke.test.mjs) | `docs/evidence/2026-11-01-cash-notification-feishu-acceptance.md:57` |
| [scripts/automation-process-recovery.runtime.mjs](../../scripts/automation-process-recovery.runtime.mjs) | `scripts/automation-process-recovery-smoke.mjs:190` |
| [scripts/backtest-v2-artifact-fault-smoke.ts](../../scripts/backtest-v2-artifact-fault-smoke.ts) | `docs/evidence/benchmarks/2026-09-09-unified-backtest-v2-t13.md:53` |
| [scripts/backtest-v2-isolation-audit.mjs](../../scripts/backtest-v2-isolation-audit.mjs) | `docs/evidence/2026-10-02-e01-execution-completion.md:31`；`docs/evidence/benchmarks/2026-09-09-unified-backtest-v2-t13.md:35` |
| [scripts/backtest-v2-performance-spike.ts](../../scripts/backtest-v2-performance-spike.ts) | `docs/evidence/benchmarks/2026-09-09-unified-backtest-v2-t13.md:16`；`docs/archive/tasks/2026-08-28-unified-backtest-v2.md:331` |
| [scripts/c02-target-acceptance.mjs](../../scripts/c02-target-acceptance.mjs) | `docs/evidence/2026-10-02-c01-c02-completion.md:61` |
| [scripts/c04-target-acceptance.mjs](../../scripts/c04-target-acceptance.mjs) | `docs/evidence/2026-10-02-c04-frozen-contract-completion.md:45`；`docs/evidence/2026-10-02-canonical-final-completion.md:43` |
| [scripts/canonical-consumers-target-acceptance.mjs](../../scripts/canonical-consumers-target-acceptance.mjs) | `docs/evidence/2026-10-02-canonical-final-completion.md:44` |
| [scripts/cash-dividend-captured-input.py](../../scripts/cash-dividend-captured-input.py) | `scripts/cash-dividend-local-acceptance.mts:48`；`scripts/cash-dividend-local-acceptance.mts:470` |
| [scripts/cash-dividend-diagnostics-check.mts](../../scripts/cash-dividend-diagnostics-check.mts) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/cash-dividend-independent.py](../../scripts/cash-dividend-independent.py) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:1471` |
| [scripts/cash-dividend-local-acceptance.mts](../../scripts/cash-dividend-local-acceptance.mts) | `docs/evidence/2026-10-07-m31-local-execution.md:15` |
| [scripts/cash-dividend-target-policy.mjs](../../scripts/cash-dividend-target-policy.mjs) | `scripts/cash-dividend-target.mjs:4`；`scripts/cash-dividend-target-policy.test.mjs:3` |
| [scripts/cash-dividend-target-policy.test.mjs](../../scripts/cash-dividend-target-policy.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/cash-dividend-target.mjs](../../scripts/cash-dividend-target.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:1446`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:1465` |
| [scripts/cash-notification-feishu.runtime.mjs](../../scripts/cash-notification-feishu.runtime.mjs) | `scripts/cash-notification-mock-smoke.mjs:263`；`docs/evidence/2026-11-01-cash-notification-feishu-acceptance.md:34` |
| [scripts/cash-notification-mock-smoke.mjs](../../scripts/cash-notification-mock-smoke.mjs) | `scripts/cash-notification-mock-smoke.test.mjs:4`；`docs/evidence/2026-11-01-cash-notification-feishu-acceptance.md:34` |
| [scripts/cash-notification-mock-smoke.test.mjs](../../scripts/cash-notification-mock-smoke.test.mjs) | `docs/evidence/2026-11-01-cash-notification-feishu-acceptance.md:57`；`docs/evidence/2026-11-01-cash-notification-mock-provider.md:20` |
| [scripts/cash-notification-mock.contract.mjs](../../scripts/cash-notification-mock.contract.mjs) | `scripts/cash-notification-mock-smoke.mjs:21`；`scripts/local-runtime/mobile-notification-acceptance.mjs:8` |
| [scripts/cash-notification-mock.runtime.mjs](../../scripts/cash-notification-mock.runtime.mjs) | `scripts/cash-notification-mock-smoke.mjs:263`；`docs/evidence/2026-11-01-cash-notification-mock-provider.md:19` |
| [scripts/desktop-qa-fixture.mjs](../../scripts/desktop-qa-fixture.mjs) | `docs/evidence/desktop-macos/2026-08-18-keyboard-e2e.md:8`；`docs/evidence/desktop-macos/2026-08-18-state-matrix.md:8` |
| [scripts/e04-catalog-isolated-acceptance.mjs](../../scripts/e04-catalog-isolated-acceptance.mjs) | `docs/evidence/2026-10-02-e04-c-e02-c-parent-completion.md:47` |
| [scripts/e04-catalog-target-acceptance.mjs](../../scripts/e04-catalog-target-acceptance.mjs) | `docs/evidence/2026-10-02-e04-c-e02-c-parent-completion.md:49` |
| [scripts/e04-data-target-acceptance.mjs](../../scripts/e04-data-target-acceptance.mjs) | `docs/evidence/2026-10-02-canonical-final-completion.md:41`；`docs/evidence/2026-10-02-e04-a-e02-data-completion.md:53` |
| [scripts/e04-policy-target-acceptance.mjs](../../scripts/e04-policy-target-acceptance.mjs) | `docs/evidence/2026-10-02-e04-c-e02-c-parent-completion.md:50`；`docs/evidence/2026-10-02-e04-c1-e02-policy-completion.md:53` |
| [scripts/e04-provider-isolated-acceptance.mjs](../../scripts/e04-provider-isolated-acceptance.mjs) | `docs/evidence/2026-10-02-e04-b-e02-provider-completion.md:37` |
| [scripts/e04-provider-target-acceptance.mjs](../../scripts/e04-provider-target-acceptance.mjs) | `docs/evidence/2026-10-02-canonical-final-completion.md:42`；`docs/evidence/2026-10-02-e04-b-e02-provider-completion.md:45` |
| [scripts/eastmoney-cash-reconciliation-independent.py](../../scripts/eastmoney-cash-reconciliation-independent.py) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:168` |
| [scripts/eastmoney-cash-reconciliation-target.mjs](../../scripts/eastmoney-cash-reconciliation-target.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:166` |
| [scripts/evaluate-research-experiment.mjs](../../scripts/evaluate-research-experiment.mjs) | `docs/evidence/2026-11-01-research-staged-execution-readiness.md:14` |
| [scripts/fixtures/arena-catalog.cjs](../../scripts/fixtures/arena-catalog.cjs) | `scripts/local-runtime/arena-live-browser.mjs:7`；`scripts/local-runtime/arena-live-list-browser.mjs:9` |
| [scripts/fund-calibration-acceptance.mjs](../../scripts/fund-calibration-acceptance.mjs) | `scripts/automation-market-consumer-final.mjs:5`；`scripts/automation-market-consumer.mjs:7` |
| [scripts/fund-calibration-case.mjs](../../scripts/fund-calibration-case.mjs) | `scripts/automation-market-consumer.mjs:13`；`scripts/automation-market-consumer.mjs:32` |
| [scripts/fund-calibration-case.test.mjs](../../scripts/fund-calibration-case.test.mjs) | `docs/evidence/2026-10-21-fund-calibration-plan.md:40` |
| [scripts/fund-calibration-guards.mjs](../../scripts/fund-calibration-guards.mjs) | `scripts/automation-market-consumer-final.mjs:6`；`scripts/automation-market-consumer.mjs:12` |
| [scripts/fund-calibration-runtime.cjs](../../scripts/fund-calibration-runtime.cjs) | `scripts/automation-market-consumer.mjs:34`；`scripts/fund-calibration-acceptance.mjs:27` |
| [scripts/fund-calibration-target.mjs](../../scripts/fund-calibration-target.mjs) | `scripts/ai-controlled-config-web.mjs:5`；`scripts/ai-credential-type-web.mjs:5` |
| [scripts/fund-disclosure-acceptance-guards.mjs](../../scripts/fund-disclosure-acceptance-guards.mjs) | `scripts/fund-disclosure-acceptance.mjs:22`；`scripts/fund-disclosure-acceptance.mjs:29` |
| [scripts/fund-disclosure-acceptance-runtime.cjs](../../scripts/fund-disclosure-acceptance-runtime.cjs) | `scripts/fund-disclosure-acceptance.mjs:30`；`scripts/fund-disclosure-acceptance.mjs:206` |
| [scripts/fund-disclosure-acceptance.mjs](../../scripts/fund-disclosure-acceptance.mjs) | `scripts/fund-error-benchmark.mjs:16`；`scripts/fund-disclosure-acceptance.test.mjs:19` |
| [scripts/fund-disclosure-acceptance.test.mjs](../../scripts/fund-disclosure-acceptance.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/fund-error-benchmark-runtime.cjs](../../scripts/fund-error-benchmark-runtime.cjs) | `scripts/fund-error-benchmark.mjs:36`；`scripts/fund-error-benchmark.mjs:273` |
| [scripts/fund-error-benchmark.mjs](../../scripts/fund-error-benchmark.mjs) | `scripts/fund-error-benchmark.test.mjs:9`；`docs/evidence/2026-10-21-fund-error-benchmark-plan.md:12` |
| [scripts/fund-error-benchmark.test.mjs](../../scripts/fund-error-benchmark.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/fund-nav-route-acceptance.mjs](../../scripts/fund-nav-route-acceptance.mjs) | `docs/evidence/2026-10-20-fund-nav-route-plan.md:12`；`docs/evidence/2026-10-20-fund-nav-route-plan.md:35` |
| [scripts/fund-nav-route-case.mjs](../../scripts/fund-nav-route-case.mjs) | `scripts/automation-market-consumer-final.mjs:14`；`scripts/automation-market-consumer.mjs:21` |
| [scripts/fund-nav-route-case.test.mjs](../../scripts/fund-nav-route-case.test.mjs) | `docs/evidence/2026-10-20-fund-nav-route-plan.md:42`；`docs/evidence/2026-10-20-fund-nav-source-acceptance.md:43` |
| [scripts/futu-market-target-check.mjs](../../scripts/futu-market-target-check.mjs) | `docs/evidence/2026-10-15-futu-minute-integration.md:111`；`docs/archive/tasks/2026-10-08-futu-openapi-full-integration.md:118` |
| [scripts/historical-public-fees-replay.mjs](../../scripts/historical-public-fees-replay.mjs) | `docs/evidence/2026-10-06-benchmark-net-return-target-b4.md:69`；`docs/evidence/2026-10-06-public-fees-backup-target.md:82` |
| [scripts/historical-public-fees-target.mjs](../../scripts/historical-public-fees-target.mjs) | `docs/evidence/2026-10-06-benchmark-net-return-target-b4.md:47`；`docs/evidence/2026-10-06-public-fees-backup-target.md:55` |
| [scripts/historical-trading-status-target.mjs](../../scripts/historical-trading-status-target.mjs) | `docs/evidence/2026-10-07-trading-status-target-acceptance.md:15`；`docs/evidence/2026-10-07-trading-status-target-acceptance.md:18` |
| [scripts/history-data-on-demand-target.mjs](../../scripts/history-data-on-demand-target.mjs) | `docs/archive/tasks/2026-10-09-history-data-on-demand-history.md:48`；`docs/archive/tasks/2026-10-09-history-data-on-demand-history.md:228` |
| [scripts/hithink-cash-reconciliation-independent.py](../../scripts/hithink-cash-reconciliation-independent.py) | `scripts/eastmoney-cash-reconciliation-independent.py:12`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:233` |
| [scripts/hithink-cash-reconciliation-target.mjs](../../scripts/hithink-cash-reconciliation-target.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:233` |
| [scripts/hk-share-window-target.mjs](../../scripts/hk-share-window-target.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/identity-target-acceptance.mjs](../../scripts/identity-target-acceptance.mjs) | `docs/evidence/2026-10-06-strategy-identity-target.md:41`；`docs/evidence/2026-10-06-strategy-identity-target.md:42` |
| [scripts/journal-model-content-target-smoke.mjs](../../scripts/journal-model-content-target-smoke.mjs) | `docs/evidence/2026-10-05-journal-model-content-v2.md:15` |
| [scripts/journal-review-target-smoke.mjs](../../scripts/journal-review-target-smoke.mjs) | `docs/evidence/2026-10-04-journal-review-contracts.md:133` |
| [scripts/journal-target-read-smoke.mjs](../../scripts/journal-target-read-smoke.mjs) | `docs/evidence/2026-10-05-journal-browser-j83.md:61`；`docs/evidence/2026-10-05-journal-review-completion.md:44` |
| [scripts/known-cash-research-independent.py](../../scripts/known-cash-research-independent.py) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:107`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:188` |
| [scripts/known-cash-research-target.mjs](../../scripts/known-cash-research-target.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:115`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:162` |
| [scripts/ledger-backtest-association-acceptance.mjs](../../scripts/ledger-backtest-association-acceptance.mjs) | `docs/evidence/2026-10-01-e03-backtest-association-closeout.md:37`；`docs/evidence/2026-10-01-e03-backtest-association-closeout.md:40` |
| [scripts/ledger-current-acceptance.ts](../../scripts/ledger-current-acceptance.ts) | `docs/evidence/2026-10-01-parallel-e03-d-http-runtime.md:15`；`docs/evidence/2026-10-01-parallel-e03-d-http-runtime.md:24` |
| [scripts/listing-lifecycle-independent.py](../../scripts/listing-lifecycle-independent.py) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/listing-lifecycle-target.mjs](../../scripts/listing-lifecycle-target.mjs) | `docs/evidence/2026-10-07-p6-lifecycle-extension.md:42` |
| [scripts/local-runtime/ai-provider-copy-acceptance.mjs](../../scripts/local-runtime/ai-provider-copy-acceptance.mjs) | `scripts/local-runtime/ai-provider-copy-acceptance.test.mjs:3`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:4` |
| [scripts/local-runtime/ai-provider-copy-acceptance.test.mjs](../../scripts/local-runtime/ai-provider-copy-acceptance.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:9` |
| [scripts/local-runtime/ai-provider-web-acceptance.mjs](../../scripts/local-runtime/ai-provider-web-acceptance.mjs) | `scripts/local-runtime/ai-provider-web-acceptance.test.mjs:3`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:14` |
| [scripts/local-runtime/ai-provider-web-acceptance.test.mjs](../../scripts/local-runtime/ai-provider-web-acceptance.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:19` |
| [scripts/local-runtime/arena-catalog-runtime-browser.mjs](../../scripts/local-runtime/arena-catalog-runtime-browser.mjs) | `docs/evidence/2026-11-12-autonomous-model-arena.md:203` |
| [scripts/local-runtime/arena-catalog-runtime-check.mjs](../../scripts/local-runtime/arena-catalog-runtime-check.mjs) | `docs/evidence/2026-11-12-autonomous-model-arena.md:197` |
| [scripts/local-runtime/arena-detail-runtime-browser.mjs](../../scripts/local-runtime/arena-detail-runtime-browser.mjs) | `docs/evidence/2026-11-12-arena-desktop-experience.md:40` |
| [scripts/local-runtime/arena-experience-browser.mjs](../../scripts/local-runtime/arena-experience-browser.mjs) | `docs/evidence/2026-11-12-arena-desktop-experience.md:34`；`docs/evidence/2026-11-12-arena-inline-round-navigation.md:33` |
| [scripts/local-runtime/arena-inline-round-browser.mjs](../../scripts/local-runtime/arena-inline-round-browser.mjs) | `docs/evidence/2026-11-12-arena-inline-round-navigation.md:32` |
| [scripts/local-runtime/arena-live-browser.mjs](../../scripts/local-runtime/arena-live-browser.mjs) | `docs/evidence/2026-11-12-arena-desktop-experience.md:33`；`docs/evidence/2026-11-12-arena-live-observation.md:40` |
| [scripts/local-runtime/arena-live-list-browser.mjs](../../scripts/local-runtime/arena-live-list-browser.mjs) | `docs/evidence/2026-11-12-arena-desktop-experience.md:32`；`docs/evidence/2026-11-12-arena-inline-round-navigation.md:34` |
| [scripts/local-runtime/arena-live-mobile-browser.mjs](../../scripts/local-runtime/arena-live-mobile-browser.mjs) | `docs/evidence/2026-11-12-arena-inline-validation.md:35`；`docs/evidence/2026-11-12-arena-optional-request-limits.md:37` |
| [scripts/local-runtime/arena-live-rule-preflight.mjs](../../scripts/local-runtime/arena-live-rule-preflight.mjs) | `docs/evidence/2026-11-12-autonomous-model-arena.md:123`；`docs/evidence/2026-11-12-autonomous-model-arena.md:131` |
| [scripts/local-runtime/arena-observation-browser.mjs](../../scripts/local-runtime/arena-observation-browser.mjs) | `docs/evidence/2026-11-12-arena-live-observation.md:38` |
| [scripts/local-runtime/arena-observation-runtime-browser.mjs](../../scripts/local-runtime/arena-observation-runtime-browser.mjs) | `docs/evidence/2026-11-12-arena-live-observation.md:9`；`docs/evidence/2026-11-12-arena-live-observation.md:46` |
| [scripts/local-runtime/arena-optional-dates-browser.mjs](../../scripts/local-runtime/arena-optional-dates-browser.mjs) | `docs/evidence/2026-11-12-arena-inline-validation.md:33`；`docs/evidence/2026-11-12-arena-optional-request-limits.md:36` |
| [scripts/local-runtime/arena-replay-browser.mjs](../../scripts/local-runtime/arena-replay-browser.mjs) | `docs/evidence/2026-11-12-arena-replay-live.md:41` |
| [scripts/local-runtime/arena-replay-create.mjs](../../scripts/local-runtime/arena-replay-create.mjs) | `docs/evidence/2026-11-12-arena-replay-live.md:51` |
| [scripts/local-runtime/arena-replay-observation-check.mjs](../../scripts/local-runtime/arena-replay-observation-check.mjs) | `docs/evidence/2026-11-13-arena-ai-first-history.md:26` |
| [scripts/local-runtime/arena-ui-consistency-browser.mjs](../../scripts/local-runtime/arena-ui-consistency-browser.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/local-runtime/authoring-target-delivery.mjs](../../scripts/local-runtime/authoring-target-delivery.mjs) | `scripts/authoring-target-recovery-run.mjs:8`；`scripts/local-runtime/authoring-target-delivery.test.mjs:6` |
| [scripts/local-runtime/authoring-target-delivery.test.mjs](../../scripts/local-runtime/authoring-target-delivery.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:54` |
| [scripts/local-runtime/authoring-target-queue-outage.mjs](../../scripts/local-runtime/authoring-target-queue-outage.mjs) | `scripts/authoring-target-recovery-run.mjs:9`；`scripts/local-runtime/authoring-target-queue-outage.test.mjs:6` |
| [scripts/local-runtime/authoring-target-queue-outage.test.mjs](../../scripts/local-runtime/authoring-target-queue-outage.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:64` |
| [scripts/local-runtime/authoring-target-recovery.mjs](../../scripts/local-runtime/authoring-target-recovery.mjs) | `scripts/authoring-target-recovery-run.mjs:4`；`scripts/local-runtime/authoring-target-recovery.test.mjs:7` |
| [scripts/local-runtime/authoring-target-recovery.test.mjs](../../scripts/local-runtime/authoring-target-recovery.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:74` |
| [scripts/local-runtime/capability-first-use-browser.mjs](../../scripts/local-runtime/capability-first-use-browser.mjs) | `docs/evidence/2026-11-11-capability-first-use-verification.md:70` |
| [scripts/local-runtime/capture-arena-historical-bars.mjs](../../scripts/local-runtime/capture-arena-historical-bars.mjs) | `thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:114` |
| [scripts/local-runtime/cleanup-backtest-test-resources.mjs](../../scripts/local-runtime/cleanup-backtest-test-resources.mjs) | `scripts/local-runtime/cleanup-backtest-test-resources.test.mjs:3`；`docs/archive/evidence/2026-11-11-backtest-return-research.md:39` |
| [scripts/local-runtime/cleanup-backtest-test-resources.test.mjs](../../scripts/local-runtime/cleanup-backtest-test-resources.test.mjs) | `.github/workflows/ci.yml（测试通配符）` |
| [scripts/local-runtime/dsa-state-retention.mjs](../../scripts/local-runtime/dsa-state-retention.mjs) | `thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:139` |
| [scripts/local-runtime/dsa-target-acceptance.sh](../../scripts/local-runtime/dsa-target-acceptance.sh) | `thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:159` |
| [scripts/local-runtime/journal-target-recovery.mjs](../../scripts/local-runtime/journal-target-recovery.mjs) | `scripts/local-runtime/journal-target-recovery.test.mjs:3`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:249` |
| [scripts/local-runtime/journal-target-recovery.test.mjs](../../scripts/local-runtime/journal-target-recovery.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:254` |
| [scripts/local-runtime/market-bar-cache-browser.mjs](../../scripts/local-runtime/market-bar-cache-browser.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/local-runtime/market-bar-cache-target-browser.mjs](../../scripts/local-runtime/market-bar-cache-target-browser.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/local-runtime/market-reference-routes.mjs](../../scripts/local-runtime/market-reference-routes.mjs) | `scripts/local-runtime/market-reference-routes.test.mjs:3`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:259` |
| [scripts/local-runtime/market-reference-routes.test.mjs](../../scripts/local-runtime/market-reference-routes.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:269` |
| [scripts/local-runtime/mobile-notification-acceptance.mjs](../../scripts/local-runtime/mobile-notification-acceptance.mjs) | `docs/specs/2026-11-03-mobile-notification-acceptance.md:7`；`scripts/local-runtime/mobile-notification-acceptance.test.mjs:3` |
| [scripts/local-runtime/mobile-notification-acceptance.runtime.mjs](../../scripts/local-runtime/mobile-notification-acceptance.runtime.mjs) | `scripts/local-runtime/mobile-notification-acceptance.mjs:9`；`scripts/local-runtime/mobile-notification-acceptance.mjs:107` |
| [scripts/local-runtime/mobile-notification-acceptance.test.mjs](../../scripts/local-runtime/mobile-notification-acceptance.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:294` |
| [scripts/local-runtime/model-arena-historical-fill-replay.mjs](../../scripts/local-runtime/model-arena-historical-fill-replay.mjs) | `thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:299` |
| [scripts/local-runtime/model-arena-historical-fill-runtime.mjs](../../scripts/local-runtime/model-arena-historical-fill-runtime.mjs) | `scripts/local-runtime/model-arena-historical-fill-replay.mjs:29`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:304` |
| [scripts/local-runtime/model-arena-replay-runtime.mjs](../../scripts/local-runtime/model-arena-replay-runtime.mjs) | `scripts/local-runtime/model-arena-replay.mjs:24`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:309` |
| [scripts/local-runtime/model-arena-replay-time.mjs](../../scripts/local-runtime/model-arena-replay-time.mjs) | `scripts/local-runtime/model-arena-historical-fill-replay.mjs:29`；`scripts/local-runtime/model-arena-replay.mjs:23` |
| [scripts/local-runtime/model-arena-replay-time.test.mjs](../../scripts/local-runtime/model-arena-replay-time.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:319` |
| [scripts/local-runtime/model-arena-replay.mjs](../../scripts/local-runtime/model-arena-replay.mjs) | `thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:324`；`daily-stock-analysis/docs/guides/local-runtime-tools.md:48` |
| [scripts/local-runtime/p0-target-acceptance.mjs](../../scripts/local-runtime/p0-target-acceptance.mjs) | `docs/archive/tasks/2026-10-18-indicator-availability-correctness.md:46`；`docs/archive/tasks/2026-10-18-performance-correctness.md:62` |
| [scripts/local-runtime/p0-target-contract.mjs](../../scripts/local-runtime/p0-target-contract.mjs) | `scripts/local-runtime/p0-target-acceptance.mjs:7`；`scripts/local-runtime/p0-target-acceptance.mjs:37` |
| [scripts/local-runtime/p0-target-contract.test.mjs](../../scripts/local-runtime/p0-target-contract.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:379` |
| [scripts/local-runtime/p0-target-runtime.mjs](../../scripts/local-runtime/p0-target-runtime.mjs) | `scripts/local-runtime/p0-target-acceptance.mjs:9`；`scripts/local-runtime/p0-target-acceptance.mjs:10` |
| [scripts/local-runtime/research-dual-read-consumers.mjs](../../scripts/local-runtime/research-dual-read-consumers.mjs) | `thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:434` |
| [scripts/local-runtime/research-dual-read-seal.mjs](../../scripts/local-runtime/research-dual-read-seal.mjs) | `thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:454` |
| [scripts/local-runtime/research-target-recovery.mjs](../../scripts/local-runtime/research-target-recovery.mjs) | `scripts/local-runtime/research-target-recovery.test.mjs:3`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:504` |
| [scripts/local-runtime/research-target-recovery.test.mjs](../../scripts/local-runtime/research-target-recovery.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:509` |
| [scripts/local-runtime/restart-server-for-acceptance.mjs](../../scripts/local-runtime/restart-server-for-acceptance.mjs) | `scripts/local-runtime/restart-server-for-acceptance.test.mjs:3`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:514` |
| [scripts/local-runtime/restart-server-for-acceptance.test.mjs](../../scripts/local-runtime/restart-server-for-acceptance.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:519`；`daily-stock-analysis/docs/guides/local-runtime-tools.md:89` |
| [scripts/local-runtime/test-market-period-runtime.mjs](../../scripts/local-runtime/test-market-period-runtime.mjs) | `scripts/local-runtime/test-market-period-runtime.test.mjs:3`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:524` |
| [scripts/local-runtime/test-market-period-runtime.test.mjs](../../scripts/local-runtime/test-market-period-runtime.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:529` |
| [scripts/local-runtime/verify-ai-adaptive-cache.mjs](../../scripts/local-runtime/verify-ai-adaptive-cache.mjs) | `scripts/local-runtime/verify-ai-adaptive-cache.test.mjs:3`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:534` |
| [scripts/local-runtime/verify-ai-adaptive-cache.test.mjs](../../scripts/local-runtime/verify-ai-adaptive-cache.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:539` |
| [scripts/local-runtime/verify-ai-timeout-postgres.mjs](../../scripts/local-runtime/verify-ai-timeout-postgres.mjs) | `scripts/local-runtime/verify-ai-timeout-postgres.test.mjs:6`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:544` |
| [scripts/local-runtime/verify-ai-timeout-postgres.test.mjs](../../scripts/local-runtime/verify-ai-timeout-postgres.test.mjs) | `.github/workflows/ci.yml（测试通配符）`；`thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:549` |
| [scripts/local-runtime/verify-hithink-arena-consumers.mjs](../../scripts/local-runtime/verify-hithink-arena-consumers.mjs) | `thesis-ledger-infra/docs/archive/evidence/2026-11-11-infra-script-migration.json:554`；`daily-stock-analysis/docs/guides/local-runtime-tools.md:37` |
| [scripts/local-runtime/verify-market-bar-cache-program.mjs](../../scripts/local-runtime/verify-market-bar-cache-program.mjs) | `scripts/local-runtime/verify-market-bar-cache.mjs:43` |
| [scripts/local-runtime/verify-market-bar-cache.mjs](../../scripts/local-runtime/verify-market-bar-cache.mjs) | `scripts/local-runtime/verify-market-bar-cache.test.mjs:3` |
| [scripts/local-runtime/verify-market-bar-cache.test.mjs](../../scripts/local-runtime/verify-market-bar-cache.test.mjs) | `.github/workflows/ci.yml（测试通配符）` |
| [scripts/market-additional-cache-acceptance.mjs](../../scripts/market-additional-cache-acceptance.mjs) | `scripts/market-additional-cache-acceptance.test.mjs:4`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:608` |
| [scripts/market-additional-cache-acceptance.test.mjs](../../scripts/market-additional-cache-acceptance.test.mjs) | `docs/evidence/2026-10-20-fund-nav-source-acceptance.md:43`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:608` |
| [scripts/market-additional-cache-case.mjs](../../scripts/market-additional-cache-case.mjs) | `scripts/market-additional-cache-acceptance.mjs:11`；`scripts/market-additional-cache-acceptance.test.mjs:3` |
| [scripts/market-additional-cache-case.test.mjs](../../scripts/market-additional-cache-case.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:608`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:630` |
| [scripts/market-cache-generation-acceptance.mjs](../../scripts/market-cache-generation-acceptance.mjs) | `scripts/market-quote-failure-acceptance.mjs:12`；`scripts/market-source-cache-acceptance.mjs:7` |
| [scripts/market-cache-generation-acceptance.test.mjs](../../scripts/market-cache-generation-acceptance.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:329`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:608` |
| [scripts/market-cache-generation-case.mjs](../../scripts/market-cache-generation-case.mjs) | `scripts/market-cache-generation-acceptance.mjs:15`；`scripts/market-source-cache-case.mjs:5` |
| [scripts/market-cache-request-evidence.mjs](../../scripts/market-cache-request-evidence.mjs) | `scripts/market-additional-cache-acceptance.mjs:12`；`scripts/market-cache-generation-acceptance.mjs:10` |
| [scripts/market-cache-request-evidence.test.mjs](../../scripts/market-cache-request-evidence.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:608`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:630` |
| [scripts/market-cache-target-reader.mjs](../../scripts/market-cache-target-reader.mjs) | `scripts/market-additional-cache-acceptance.mjs:13`；`scripts/market-additional-cache-acceptance.test.mjs:5` |
| [scripts/market-composition-artifacts.mjs](../../scripts/market-composition-artifacts.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:683`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:689` |
| [scripts/market-composition-record-input.mjs](../../scripts/market-composition-record-input.mjs) | `scripts/market-composition-submit-reconciliation.mjs:9`；`scripts/market-composition-target-acceptance.mjs:14` |
| [scripts/market-composition-record-input.test.mjs](../../scripts/market-composition-record-input.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:789`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:814` |
| [scripts/market-composition-response-acceptance.mjs](../../scripts/market-composition-response-acceptance.mjs) | `scripts/market-composition-response-acceptance.test.mjs:3`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:913` |
| [scripts/market-composition-response-acceptance.test.mjs](../../scripts/market-composition-response-acceptance.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/market-composition-run-submission.mjs](../../scripts/market-composition-run-submission.mjs) | `scripts/market-composition-submit-reconciliation.mjs:8`；`scripts/market-composition-target-acceptance.mjs:16` |
| [scripts/market-composition-run-submission.test.mjs](../../scripts/market-composition-run-submission.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:789` |
| [scripts/market-composition-submit-reconciliation.mjs](../../scripts/market-composition-submit-reconciliation.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:787`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:791` |
| [scripts/market-composition-target-acceptance.mjs](../../scripts/market-composition-target-acceptance.mjs) | `scripts/market-composition-success-reconciliation.mjs:8`；`scripts/market-composition-target-acceptance.test.mjs:3` |
| [scripts/market-composition-target-acceptance.test.mjs](../../scripts/market-composition-target-acceptance.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:691`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:789` |
| [scripts/market-composition-target-case.mjs](../../scripts/market-composition-target-case.mjs) | `scripts/market-composition-response-acceptance.mjs:10`；`scripts/market-composition-submit-reconciliation.mjs:7` |
| [scripts/market-composition-target-case.test.mjs](../../scripts/market-composition-target-case.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:691`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:789` |
| [scripts/market-composition-target-input.mjs](../../scripts/market-composition-target-input.mjs) | `scripts/market-composition-record-input.mjs:2`；`scripts/market-composition-response-acceptance.mjs:11` |
| [scripts/market-composition-target-input.test.mjs](../../scripts/market-composition-target-input.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:691` |
| [scripts/market-period-host-reader.mjs](../../scripts/market-period-host-reader.mjs) | `docs/evidence/2026-10-05-market-period-runtime-closure.md:15` |
| [scripts/market-period-runtime-probe.mjs](../../scripts/market-period-runtime-probe.mjs) | `scripts/local-runtime/test-market-period-runtime.mjs:18` |
| [scripts/market-period-target-smoke.mjs](../../scripts/market-period-target-smoke.mjs) | `docs/evidence/2026-10-05-market-period-runtime-closure.md:16` |
| [scripts/market-quote-failure-acceptance.mjs](../../scripts/market-quote-failure-acceptance.mjs) | `scripts/market-quote-failure-acceptance.test.mjs:5`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:834` |
| [scripts/market-quote-failure-acceptance.test.mjs](../../scripts/market-quote-failure-acceptance.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:834` |
| [scripts/market-quote-failure-driver.mjs](../../scripts/market-quote-failure-driver.mjs) | `scripts/market-quote-failure-acceptance.mjs:54`；`scripts/market-quote-failure-acceptance.test.mjs:19` |
| [scripts/market-quote-fault-boundary.mjs](../../scripts/market-quote-fault-boundary.mjs) | `scripts/market-quote-failure-acceptance.mjs:8`；`scripts/market-quote-fault-boundary.test.mjs:3` |
| [scripts/market-quote-fault-boundary.test.mjs](../../scripts/market-quote-fault-boundary.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:834` |
| [scripts/market-route-cold-acceptance.mjs](../../scripts/market-route-cold-acceptance.mjs) | `scripts/market-route-cold-acceptance.test.mjs:3` |
| [scripts/market-route-cold-acceptance.test.mjs](../../scripts/market-route-cold-acceptance.test.mjs) | `docs/evidence/2026-10-21-route-cold-primary.md:19` |
| [scripts/market-route-cold.runtime.py](../../scripts/market-route-cold.runtime.py) | `scripts/market-route-cold-acceptance.mjs:38`；`scripts/market-route-cold-acceptance.mjs:132` |
| [scripts/market-route-failover-acceptance.mjs](../../scripts/market-route-failover-acceptance.mjs) | `scripts/eastmoney-cash-research-policy.mjs:4`；`scripts/market-additional-cache-acceptance.mjs:14` |
| [scripts/market-route-failover-acceptance.test.mjs](../../scripts/market-route-failover-acceptance.test.mjs) | `docs/evidence/2026-10-21-route-failover-acceptance.md:31`；`docs/archive/reviews/2026-10-11-unified-data-capability-route-evidence.md:83` |
| [scripts/market-route-failover-case.mjs](../../scripts/market-route-failover-case.mjs) | `scripts/eastmoney-cash-research-policy.mjs:5`；`scripts/market-additional-cache-case.mjs:4` |
| [scripts/market-rule-diagnostics-check.mts](../../scripts/market-rule-diagnostics-check.mts) | `docs/evidence/2026-10-07-p6-hkus-target-acceptance.md:78` |
| [scripts/market-source-cache-acceptance.mjs](../../scripts/market-source-cache-acceptance.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:821`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:825` |
| [scripts/market-source-cache-case.mjs](../../scripts/market-source-cache-case.mjs) | `scripts/market-quote-failure-acceptance.mjs:11`；`scripts/market-source-cache-acceptance.mjs:8` |
| [scripts/market-source-cache-case.test.mjs](../../scripts/market-source-cache-case.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:823`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:834` |
| [scripts/market-split-clock-driver.test.mjs](../../scripts/market-split-clock-driver.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:1721`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:1777` |
| [scripts/market-split-target-acceptance.mjs](../../scripts/market-split-target-acceptance.mjs) | `scripts/market-split-clock-driver.test.mjs:5`；`scripts/market-split-target-acceptance.test.mjs:3` |
| [scripts/market-split-target-acceptance.test.mjs](../../scripts/market-split-target-acceptance.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/market-split-target-diagnostics.test.mjs](../../scripts/market-split-target-diagnostics.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:1672` |
| [scripts/market-status-epoch-acceptance.mjs](../../scripts/market-status-epoch-acceptance.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-route-evidence.md:247` |
| [scripts/market-status-epoch-acceptance.test.mjs](../../scripts/market-status-epoch-acceptance.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/market-status-epoch-case.mjs](../../scripts/market-status-epoch-case.mjs) | `scripts/market-status-epoch-acceptance.mjs:8`；`scripts/market-status-epoch-acceptance.test.mjs:4` |
| [scripts/market-status-epoch-driver.mjs](../../scripts/market-status-epoch-driver.mjs) | `scripts/market-status-epoch-acceptance.mjs:40` |
| [scripts/market-status-error-target.mjs](../../scripts/market-status-error-target.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:736`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:762` |
| [scripts/market-status-functional-acceptance.mjs](../../scripts/market-status-functional-acceptance.mjs) | `scripts/market-additional-cache-acceptance.mjs:15`；`scripts/market-cache-generation-acceptance.mjs:13` |
| [scripts/market-status-functional-acceptance.test.mjs](../../scripts/market-status-functional-acceptance.test.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-route-evidence.md:153` |
| [scripts/market-status-functional-case.mjs](../../scripts/market-status-functional-case.mjs) | `scripts/market-status-functional-acceptance.mjs:8`；`scripts/market-status-functional-acceptance.test.mjs:4` |
| [scripts/multimarket-rules-diagnostics-check.mts](../../scripts/multimarket-rules-diagnostics-check.mts) | `docs/evidence/2026-10-07-p6-hkus-target-acceptance.md:78` |
| [scripts/multimarket-rules-independent.py](../../scripts/multimarket-rules-independent.py) | `docs/evidence/2026-10-07-p6-hkus-target-acceptance.md:56` |
| [scripts/multimarket-rules-target.mjs](../../scripts/multimarket-rules-target.mjs) | `scripts/hk-share-window-target.mjs:23`；`scripts/public-fees-expansion-target.mjs:45` |
| [scripts/nav-target-acceptance.mjs](../../scripts/nav-target-acceptance.mjs) | `docs/evidence/2026-10-01-n4-nav-target.md:58` |
| [scripts/old-snapshot-backup-bundle.py](../../scripts/old-snapshot-backup-bundle.py) | `docs/evidence/2026-10-07-p6-completion-gates.md:25` |
| [scripts/old-snapshot-memory-replay.mjs](../../scripts/old-snapshot-memory-replay.mjs) | `docs/evidence/2026-10-07-p6-completion-gates.md:27` |
| [scripts/p0-target-inputs.mjs](../../scripts/p0-target-inputs.mjs) | `docs/evidence/2026-10-19-p0-target-acceptance.md:59`；`docs/evidence/2026-10-19-p0-target-acceptance.md:102` |
| [scripts/p0-target/automation-backup-projection.mjs](../../scripts/p0-target/automation-backup-projection.mjs) | `scripts/local-runtime/p0-target-runtime.mjs:56（动态加载）` |
| [scripts/p0-target/indicator-probe.mjs](../../scripts/p0-target/indicator-probe.mjs) | `scripts/local-runtime/p0-target-runtime.mjs:56（动态加载）` |
| [scripts/p0-target/performance-probe.mjs](../../scripts/p0-target/performance-probe.mjs) | `scripts/local-runtime/p0-target-runtime.mjs:56（动态加载）` |
| [scripts/p0-target/protected-baseline.mjs](../../scripts/p0-target/protected-baseline.mjs) | `scripts/local-runtime/p0-target-runtime.mjs:56（动态加载）` |
| [scripts/p0-target/risk-probe.mjs](../../scripts/p0-target/risk-probe.mjs) | `scripts/local-runtime/p0-target-runtime.mjs:56（动态加载）` |
| [scripts/portfolio-calibration-acceptance.mjs](../../scripts/portfolio-calibration-acceptance.mjs) | `scripts/portfolio-point-acceptance.mjs:6`；`scripts/portfolio-calibration-acceptance.test.mjs:3` |
| [scripts/portfolio-calibration-acceptance.test.mjs](../../scripts/portfolio-calibration-acceptance.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/portfolio-calibration-runtime.cjs](../../scripts/portfolio-calibration-runtime.cjs) | `scripts/portfolio-calibration-acceptance.mjs:45`；`scripts/portfolio-point-acceptance.mjs:79` |
| [scripts/portfolio-point-acceptance.mjs](../../scripts/portfolio-point-acceptance.mjs) | `scripts/portfolio-point-acceptance.test.mjs:3`；`docs/evidence/2026-10-17-ui-runtime-closeout.md:113` |
| [scripts/portfolio-point-acceptance.test.mjs](../../scripts/portfolio-point-acceptance.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/public-fees-expansion-target.mjs](../../scripts/public-fees-expansion-target.mjs) | `docs/evidence/2026-10-08-p6-expanded-fees-acceptance.md:43`；`docs/evidence/2026-10-08-p6-expanded-fees-acceptance.md:60` |
| [scripts/research-dual-read-consumer-fixtures.mjs](../../scripts/research-dual-read-consumer-fixtures.mjs) | `scripts/local-runtime/research-dual-read-consumers.mjs:36`；`scripts/research-dual-read-consumer-fixtures.test.mjs:8` |
| [scripts/research-dual-read-consumer-fixtures.test.mjs](../../scripts/research-dual-read-consumer-fixtures.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-economic-price-publish.mjs](../../scripts/research-economic-price-publish.mjs) | `scripts/research-economic-price-publish.test.mjs:4` |
| [scripts/research-economic-price-publish.test.mjs](../../scripts/research-economic-price-publish.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-args.mjs](../../scripts/research-live-experiment-args.mjs) | `scripts/research-live-experiment.mjs:6`；`scripts/research-live-experiment-authorization.test.mjs:4` |
| [scripts/research-live-experiment-authorization.mjs](../../scripts/research-live-experiment-authorization.mjs) | `scripts/research-live-experiment.mjs:13`；`scripts/research-live-experiment-authorization.test.mjs:3` |
| [scripts/research-live-experiment-authorization.test.mjs](../../scripts/research-live-experiment-authorization.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-checkpoint.mjs](../../scripts/research-live-experiment-checkpoint.mjs) | `scripts/research-live-experiment-continuation.mjs:6`；`scripts/research-live-experiment-history-input.mjs:1` |
| [scripts/research-live-experiment-checkpoint.test.mjs](../../scripts/research-live-experiment-checkpoint.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-continuation.mjs](../../scripts/research-live-experiment-continuation.mjs) | `scripts/research-live-experiment.mjs:7`；`scripts/research-live-experiment-continuation.test.mjs:4` |
| [scripts/research-live-experiment-continuation.test.mjs](../../scripts/research-live-experiment-continuation.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-failure-confirmation.mjs](../../scripts/research-live-experiment-failure-confirmation.mjs) | `scripts/research-live-experiment.mjs:15`；`scripts/research-live-experiment-failure-confirmation.test.mjs:4` |
| [scripts/research-live-experiment-failure-confirmation.test.mjs](../../scripts/research-live-experiment-failure-confirmation.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-history-input.mjs](../../scripts/research-live-experiment-history-input.mjs) | `scripts/research-live-experiment.mjs:11`；`scripts/research-lmstudio-experiment.mjs:15` |
| [scripts/research-live-experiment-http.mjs](../../scripts/research-live-experiment-http.mjs) | `scripts/research-live-experiment-transport.mjs:3`；`scripts/research-live-experiment-http.test.mjs:3` |
| [scripts/research-live-experiment-http.test.mjs](../../scripts/research-live-experiment-http.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-openrouter.mjs](../../scripts/research-live-experiment-openrouter.mjs) | `scripts/research-live-experiment-transport.mjs:2`；`scripts/research-live-experiment.mjs:42` |
| [scripts/research-live-experiment-openrouter.test.mjs](../../scripts/research-live-experiment-openrouter.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-probe-response.mjs](../../scripts/research-live-experiment-probe-response.mjs) | `scripts/research-live-experiment-supplemental.mjs:6` |
| [scripts/research-live-experiment-response.mjs](../../scripts/research-live-experiment-response.mjs) | `scripts/research-live-experiment-transport.mjs:4`；`scripts/research-live-experiment-response.test.mjs:3` |
| [scripts/research-live-experiment-response.test.mjs](../../scripts/research-live-experiment-response.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-seal.mjs](../../scripts/research-live-experiment-seal.mjs) | `scripts/research-live-experiment.mjs:16`；`scripts/research-lmstudio-experiment.mjs:20` |
| [scripts/research-live-experiment-source-fixture.mjs](../../scripts/research-live-experiment-source-fixture.mjs) | `scripts/research-live-experiment-continuation.test.mjs:6`；`scripts/research-live-experiment-terminal.test.mjs:6` |
| [scripts/research-live-experiment-supplemental.mjs](../../scripts/research-live-experiment-supplemental.mjs) | `scripts/research-live-experiment-checkpoint.mjs:6`；`scripts/research-live-experiment-history-input.mjs:2` |
| [scripts/research-live-experiment-supplemental.test.mjs](../../scripts/research-live-experiment-supplemental.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-target.mjs](../../scripts/research-live-experiment-target.mjs) | `scripts/research-live-experiment-transport.mjs:1`；`scripts/research-live-experiment.mjs:38` |
| [scripts/research-live-experiment-target.test.mjs](../../scripts/research-live-experiment-target.test.mjs) | `docs/evidence/2026-11-01-research-live-experiment.md:29` |
| [scripts/research-live-experiment-terminal.mjs](../../scripts/research-live-experiment-terminal.mjs) | `scripts/research-live-experiment.mjs:10`；`scripts/research-live-experiment-terminal.test.mjs:10` |
| [scripts/research-live-experiment-terminal.test.mjs](../../scripts/research-live-experiment-terminal.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment-transport.mjs](../../scripts/research-live-experiment-transport.mjs) | `scripts/research-live-experiment.mjs:14`；`scripts/research-live-experiment-transport.test.mjs:3` |
| [scripts/research-live-experiment-transport.test.mjs](../../scripts/research-live-experiment-transport.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-live-experiment.mjs](../../scripts/research-live-experiment.mjs) | `scripts/research-live-experiment-args.mjs:38`；`docs/evidence/2026-11-01-research-live-experiment.md:21` |
| [scripts/research-lmstudio-experiment-input.mjs](../../scripts/research-lmstudio-experiment-input.mjs) | `scripts/research-lmstudio-experiment.mjs:27`；`scripts/research-lmstudio-experiment-input.test.mjs:13` |
| [scripts/research-lmstudio-experiment-input.test.mjs](../../scripts/research-lmstudio-experiment-input.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-lmstudio-experiment.mjs](../../scripts/research-lmstudio-experiment.mjs) | `docs/evidence/2026-11-02-research-lmstudio-screening.md:21` |
| [scripts/research-recovery-cases.mjs](../../scripts/research-recovery-cases.mjs) | `scripts/research-recovery-driver.mjs:4` |
| [scripts/research-recovery-driver.mjs](../../scripts/research-recovery-driver.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-recovery-guards.mjs](../../scripts/research-recovery-guards.mjs) | `scripts/research-recovery-runtime.mjs:4`；`scripts/research-recovery-guards.test.mjs:3` |
| [scripts/research-recovery-guards.test.mjs](../../scripts/research-recovery-guards.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-recovery-processes.mjs](../../scripts/research-recovery-processes.mjs) | `scripts/research-recovery-driver.mjs:3` |
| [scripts/research-recovery-runtime.mjs](../../scripts/research-recovery-runtime.mjs) | `scripts/research-recovery-cases.mjs:4`；`scripts/research-recovery-driver.mjs:2` |
| [scripts/research-recovery-sdk.mjs](../../scripts/research-recovery-sdk.mjs) | `scripts/local-runtime/research-target-recovery.mjs:42`；`scripts/local-runtime/research-target-recovery.mjs:80` |
| [scripts/research-recovery-worker.mjs](../../scripts/research-recovery-worker.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-source-fault-acceptance.mjs](../../scripts/research-source-fault-acceptance.mjs) | `scripts/research-source-fault-acceptance.test.mjs:8`；`docs/evidence/2026-10-31-research-source-fault-acceptance.md:47` |
| [scripts/research-source-fault-acceptance.test.mjs](../../scripts/research-source-fault-acceptance.test.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/research-source-fault-controlled.mjs](../../scripts/research-source-fault-controlled.mjs) | `scripts/research-source-fault-acceptance.mjs:16`；`scripts/research-source-fault-runtime.mjs:7` |
| [scripts/research-source-fault-harness.mjs](../../scripts/research-source-fault-harness.mjs) | `scripts/research-source-fault-acceptance.mjs:14`；`scripts/research-source-fault-runtime.mjs:8` |
| [scripts/research-source-fault-relay.mjs](../../scripts/research-source-fault-relay.mjs) | `scripts/research-source-fault-acceptance.mjs:15`；`scripts/research-source-fault-harness.mjs:4` |
| [scripts/research-source-fault-runtime.mjs](../../scripts/research-source-fault-runtime.mjs) | `scripts/research-source-fault-acceptance.mjs:7`；`scripts/research-source-fault-acceptance.mjs:13` |
| [scripts/research-window-artifacts.mjs](../../scripts/research-window-artifacts.mjs) | `docs/evidence/2026-10-07-research-window-target-c32.md:42` |
| [scripts/research-window-diagnostics-check.mts](../../scripts/research-window-diagnostics-check.mts) | `docs/evidence/2026-10-07-research-window-browser-c34.md:38` |
| [scripts/research-window-independent.py](../../scripts/research-window-independent.py) | `docs/evidence/2026-10-07-research-window-replay-c33.md:30`；`docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:39` |
| [scripts/research-window-replay-target.mjs](../../scripts/research-window-replay-target.mjs) | `docs/evidence/2026-10-15-futu-minute-integration.md:138`；`docs/evidence/2026-10-15-futu-minute-integration.md:169` |
| [scripts/research-window-target-check.mjs](../../scripts/research-window-target-check.mjs) | `docs/evidence/2026-10-07-research-window-target-c31.md:29` |
| [scripts/research-window-target.mjs](../../scripts/research-window-target.mjs) | `scripts/tickflow-free-history-target.mjs:14`；`docs/evidence/2026-10-07-research-window-target-c32.md:19` |
| [scripts/test-backtest-recovery.mjs](../../scripts/test-backtest-recovery.mjs) | `docs/evidence/2026-10-04-backtest-recovery-parallel.md:83`；`docs/evidence/2026-10-04-backtest-recovery-parallel.md:89` |
| [scripts/test-data-quality-postgres.mjs](../../scripts/test-data-quality-postgres.mjs) | `docs/archive/evidence/2026-11-09-data-quality-observation-log.md:42` |
| [scripts/test-dev-database-rebuild.py](../../scripts/test-dev-database-rebuild.py) | `docs/archive/reviews/2026-09-14-dev-database-rebuild.md:27`；`docs/archive/reviews/2026-09-14-dev-database-rebuild.md:38` |
| [scripts/test-economic-price-postgres.mjs](../../scripts/test-economic-price-postgres.mjs) | `未检出可解析的显式入站引用；不代表未使用` |
| [scripts/test-experiment-price-research-runtime.mjs](../../scripts/test-experiment-price-research-runtime.mjs) | `docs/archive/evidence/2026-11-11-experiment-price-research.md:23`；`docs/archive/evidence/2026-11-12-independent-research-price-sources.md:20` |
| [scripts/test-ledger-current-postgres.mjs](../../scripts/test-ledger-current-postgres.mjs) | `docs/evidence/2026-10-20-trade-server-verification-boundary.md:20`；`docs/archive/reviews/2026-11-05-execution-cash-admission.md:28` |
| [scripts/test-market-routing-postgres.mjs](../../scripts/test-market-routing-postgres.mjs) | `docs/evidence/2026-11-09-hierarchical-market-routing.md:17`；`docs/evidence/2026-11-10-routing-legacy-inheritance.md:21` |
| [scripts/test-risk-monitoring-runtime.mjs](../../scripts/test-risk-monitoring-runtime.mjs) | `docs/evidence/2026-11-06-risk-monitoring-source-readiness.md:75`；`docs/evidence/2026-11-07-rule-driven-risk-monitoring.md:37` |
| [scripts/test-risk-source-dsa.mjs](../../scripts/test-risk-source-dsa.mjs) | `docs/evidence/2026-11-06-risk-monitoring-source-readiness.md:74` |
| [scripts/test-unlimited-backtest-budget-postgres.mjs](../../scripts/test-unlimited-backtest-budget-postgres.mjs) | `docs/archive/evidence/2026-11-11-unlimited-backtest-budget.md:23`；`docs/archive/evidence/2026-11-12-unlimited-ai-call-budget.md:8` |
| [scripts/tickflow-free-history-target.mjs](../../scripts/tickflow-free-history-target.mjs) | `docs/archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md:33` |
