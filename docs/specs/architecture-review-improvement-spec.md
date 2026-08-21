# ThesisLedger Architecture Improvement Spec

## Background

Review three repositories:

- thesis-ledger
- thesis-ledger-infra
- daily_stock_analysis

Goal: improve long-term maintainability while keeping DSA changes minimal.

## Architecture Principle

ThesisLedger remains the product and business system.

DSA remains an external Market Intelligence Provider.

Do not refactor DSA into a ThesisLedger internal module.

## Target Architecture

```
Desktop / Mobile
        |
ThesisLedger API
        |
Application Layer
        |
Domain Layer
        |
Provider Adapter
        |
DSA Contract API
```

## Scope

### ThesisLedger

- Add stronger provider abstraction.
- Keep DSA integration behind adapter.
- Add research result persistence model.
- Prepare async task execution.
- Improve contract validation.

### DSA

No large refactor.

Only maintain:

- existing API contract
- compatibility layer
- capability discovery
- integration stability

### Infra

Improve:

- version matrix
- contract tests
- CI validation

## Non Goals

- Rewrite DSA architecture.
- Move DSA data models into ThesisLedger.
- Couple business logic with LLM output.

## Future Direction

ThesisLedger should consume structured intelligence results instead of directly depending on DSA implementation details.
