# Architecture Version Matrix

This matrix records the compatibility boundary between ThesisLedger, the DSA fork and the runtime stack. DSA remains an external Market Intelligence Provider; this matrix does not require restructuring DSA internals.

| Component | Current baseline | Compatibility boundary | Blocking gate |
| --- | --- | --- | --- |
| ThesisLedger | `0.1.0` | Product/API release | `pnpm contract:test` |
| DSA Data Contract | `V1` | `/api/v1/thesis-ledger` | capability + black-box contract smoke |
| DSA Control Contract | `V1` | handshake/provider policy/catalog control | control contract smoke |
| DSA fork release | `v3.28.0-thesisledger.1` convention | upstream version + ThesisLedger patch revision | immutable GHCR digest + contract smoke |
| `@thesis-ledger/schemas` | `0.1.0` | versioned shared contracts | schema tests |
| PostgreSQL schema | migration controlled | ordered Prisma migrations | `pnpm migration:matrix` |
| Infrastructure | immutable image digests | Compose + persistent volume contract | infra compatibility + contract tests |

## Rules

- Business modules depend on ThesisLedger contracts and adapters, never on DSA implementation details.
- DSA upstream sync is allowed as long as Data/Control Contract V1 still passes the black-box suite.
- A contract-version, capability, schema or control-token mismatch blocks release; there is no silent compatibility downgrade.
- Research output is persisted through `AiRun.result` only after crossing the structured `ResearchResult V1` validation boundary. Portfolio, Ledger and other user facts remain separate.
- Existing asynchronous models remain authoritative: `AutomationJob`/`AutomationRun` for scheduled workflows, `BacktestJob` for backtests and `AiRun` for AI execution. Do not introduce a second queue abstraction unless these models become insufficient.

## Required checks

```bash
pnpm contract:test
pnpm migration:matrix
pnpm provider:failover
```

For a running three-repository stack, use `thesis-ledger-infra/scripts/contract-test.sh` against both the ThesisLedger facade and the DSA Contract endpoint as documented in the infra repository.
