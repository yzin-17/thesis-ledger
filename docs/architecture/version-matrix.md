# Architecture Version Matrix

| Component | Responsibility | Version Policy |
| --- | --- | --- |
| ThesisLedger | Product and business system | Application release version |
| DSA Adapter Contract | Market intelligence integration | Independently versioned |
| Schema Package | Shared contracts | Prefer backward compatible changes |
| Infrastructure | Runtime orchestration | Environment pinned |

## Rules

- Business modules depend on contracts, not DSA internals.
- DSA changes require adapter validation.
- Schema changes require contract tests.
