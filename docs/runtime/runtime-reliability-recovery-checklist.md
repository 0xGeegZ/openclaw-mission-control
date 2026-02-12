# Runtime Reliability Recovery Checklist

## Baseline Snapshot

Baseline source files:

- `/Users/guillaumedieudonne/.cursor/projects/Users-guillaumedieudonne-Desktop-mission-control/terminals/1.txt`
- `/Users/guillaumedieudonne/.cursor/projects/Users-guillaumedieudonne-Desktop-mission-control/terminals/6.txt`

Baseline signature scan performed for:

- `read tool called without path`
- `ENOENT`
- `EISDIR`
- `OpenClaw returned no response`
- `missing-session-key`
- `sessions_list empty`

Observed baseline counts at plan execution start:

- `read tool called without path`: 0
- `ENOENT`: 0
- `EISDIR`: 0
- `OpenClaw returned no response`: 0
- `missing-session-key`: 0
- `sessions_list empty`: 0

Post-implementation verification (same signature scan):

- `read tool called without path`: 0
- `ENOENT`: 0
- `EISDIR`: 0
- `OpenClaw returned no response`: 0
- `missing-session-key`: 0
- `sessions_list empty`: 0

## Feature Gates

Each gate must be checked before moving to the next feature slice.

1. Baseline signatures are captured and documented.
2. Profile sync memory scaffold tests pass.
3. Startup backfill prevents per-agent daily memory file errors on restart.
4. Prompt contract is aligned across runtime defaults, docs, and seed content.
5. Tool instructions are emitted only when corresponding tool schemas are available.
6. No-reply retry policy follows notification intent and remains observable.
7. Gateway placeholder parser classifies all known no-reply variants.
8. Heartbeat prompt hardening is stable and keeps explicit error visibility.
9. Integration soak run is clean against the baseline signatures.

## Validation Commands

Use these checks after each feature:

```bash
# Runtime unit tests
cd apps/runtime && npm run test:run

# Runtime typecheck
cd apps/runtime && npm run typecheck

# Signature scan in terminal logs
rg "read tool called without path|ENOENT|EISDIR|OpenClaw returned no response|missing-session-key|sessions_list empty" "/Users/guillaumedieudonne/.cursor/projects/Users-guillaumedieudonne-Desktop-mission-control/terminals/1.txt"
rg "read tool called without path|ENOENT|EISDIR|OpenClaw returned no response|missing-session-key|sessions_list empty" "/Users/guillaumedieudonne/.cursor/projects/Users-guillaumedieudonne-Desktop-mission-control/terminals/6.txt"
```

## Rollback Rule

If a gate fails, revert only the last feature slice and keep previously validated slices unchanged.
