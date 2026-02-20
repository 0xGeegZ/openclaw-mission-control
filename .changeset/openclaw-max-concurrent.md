---
"runtime-service": patch
---

OpenClaw gateway max concurrent sessions (single env knob)

- Set `agents.defaults.maxConcurrent` from `OPENCLAW_MAX_CONCURRENT` (default 5, clamp 1–16) so Lead can respond in orchestrator and task threads at once.
- Gateway startup script: `applyMaxConcurrent()` with robust parse; env wins over runtime-generated config after merge. Template and .env.example/README documented.
