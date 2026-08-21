# Architecture Improvement Task Plan

## Goal

Implement architecture improvements without major DSA changes.

## Status

All tasks in this plan are complete or satisfied by existing architecture. No DSA core refactor is required.

## Phase 1

### TASK-ARCH-001 Provider Adapter Enhancement — Complete

Existing implementation already provides:

- `MarketDataProvider`
- `ProviderRegistry`
- priority routing and fallback
- provider health tracking
- rate limiting, retry and circuit breaking
- DSA integration behind `services/dsa-adapter`

Acceptance:

- Business services do not need DSA implementation details.
- Provider routing can change without changing domain calculations.

### TASK-ARCH-002 Research Result Model — Complete

Implementation:

- `packages/schemas/src/research.ts` defines `ResearchResult V1` on top of the existing AI evidence contract.
- `AiRunService.finishResearch()` validates the structured result before persisting it to `AiRun.result`.
- Existing `AiRun` and `AiDecisionLog` persistence is reused instead of creating duplicate research tables.

Acceptance:

- AI/research results remain separate from Portfolio/Ledger facts.
- Historical runs remain queryable through existing AI run history.
- Research evidence requires citations before persistence.

### TASK-ARCH-003 Contract Validation — Complete

Implementation:

- DSA capability declaration is normalized by `getDsaCapabilitySnapshot()`.
- DSA adapter capability tests are part of `pnpm contract:test`.
- Existing black-box smoke test validates Data Contract V1, Control Contract V1, provider registry, fund NAV, quotes, bars, indicators, chip data and unsupported-capability behavior.

Acceptance:

- Capability check is available.
- Contract/schema mismatch fails CI or the release smoke gate.

## Phase 2

### TASK-ARCH-004 Async Task Infrastructure — Complete via existing runtime

No second task framework is introduced. The repository already has durable execution models with distinct responsibilities:

- `AutomationJob` / `AutomationRun`: scheduled market refresh, risk evaluation, snapshots, health checks and digest workflows.
- `BacktestJob`: queued/running/cancelled/succeeded backtest lifecycle.
- `AiRun`: AI execution lifecycle, checkpoints, usage and persisted results.
- Redis remains available for cache, locking and rebuildable runtime state.

This satisfies the task without adding BullMQ solely for architectural symmetry. A dedicated queue should only be added later if multi-process workers, high throughput or independent retry/dead-letter semantics become necessary.

### TASK-ARCH-005 Infra Version Matrix — Complete

Implementation:

- Main repository documents the concrete compatibility baseline in `docs/architecture/version-matrix.md`.
- Infra owns the deploy-time compatibility manifest and validation script.
- Three-repository contract testing remains the blocking integration gate.

Acceptance:

- ThesisLedger version tracked.
- DSA Data/Control contract version tracked.
- DSA fork release convention tracked.
- Database schema guarded by the migration matrix.

## Constraints

- No large DSA refactor.
- No breaking DSA API changes.
- Preserve upstream sync ability.
- Prefer existing execution and persistence primitives over parallel abstractions.
