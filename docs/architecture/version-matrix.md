# Architecture Version Matrix

| Component | Responsibility | Version Policy |
| --- | --- | --- |
| ThesisLedger | Product and business system | Application release version |
| DSA Adapter Contract | Market intelligence integration | Contract versioned independently |
| Schema Package | Shared data contracts | Backward compatible changes preferred |
| Infrastructure | Runtime orchestration | Environment pinned |

## Compatibility Rules

- Business modules must depend on contracts, not DSA implementation details.
- DSA changes require adapter compatibility validation.
- Schema changes require contract tests before release.
