# Documentation Guide

## Document Categories

| Category | Location | Purpose |
| --- | --- | --- |
| Architecture | `docs/architecture` | Current system architecture and technical constraints |
| Domain | `docs/domain` | Domain concepts and models |
| ADR | `docs/adr` | Accepted technical decisions |
| Specs | `docs/specs` | Product requirements and design proposals |
| Tasks | `docs/tasks` | Implementation execution plans |
| Guides | `docs/guides` | Usage and operational guides |
| Operations | `docs/operations` | Deployment and maintenance documentation |
| Reviews | `docs/reviews` | Periodic documentation reviews |
| Archive | `docs/archive` | Historical or replaced documents |

## Lifecycle Rules

1. Each topic should have one source of truth (SSOT).
2. New designs should start in `specs`.
3. Completed architecture changes should update `architecture`.
4. Completed tasks should be moved to archive when no longer active.
5. Deprecated documents should be archived instead of deleted when they contain historical decisions.
6. Avoid duplicating the same design information across specs, tasks and architecture documents.

## Review Checklist

During documentation reviews:

- Remove duplicated explanations.
- Merge documents covering the same feature or decision.
- Move obsolete plans into `archive`.
- Keep active documents discoverable from `docs/README.md`.
