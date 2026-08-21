# Architecture Improvement Task Plan

## Goal

Implement architecture improvements without major DSA changes.

## Phase 1

### TASK-ARCH-001 Provider Adapter Enhancement

- Add unified market provider interface.
- Keep DSA implementation behind adapter.
- Add fallback capability.

Acceptance:

- Business services do not call DSA directly.
- Provider can be replaced without changing domain logic.

### TASK-ARCH-002 Research Result Model

Add persistence model for structured research results.

Acceptance:

- AI results are separated from portfolio facts.
- Historical research can be queried.

### TASK-ARCH-003 Contract Validation

Improve DSA integration checks.

Acceptance:

- Capability check available.
- Schema mismatch blocks deployment.

## Phase 2

### TASK-ARCH-004 Async Task Infrastructure

Introduce background execution for:

- market refresh
- risk scan
- AI research
- backtest

### TASK-ARCH-005 Infra Version Matrix

Add component compatibility tracking.

Acceptance:

- ThesisLedger version
- DSA contract version
- database schema version

## Constraints

- No large DSA refactor.
- No breaking DSA API changes.
- Preserve upstream sync ability.
