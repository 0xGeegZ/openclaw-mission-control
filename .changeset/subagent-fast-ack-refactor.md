---
"runtime-service": patch
---

Subagent fast-ack refactor: delivery prompt and config updates, prompt-fragment reuse, security and doc fixes. Subagent limits (maxConcurrent 10, maxChildrenPerAgent 5) in template; parent-skill-context rule and SKILLS_LOCATION_SENTENCE used everywhere applicable; README delivery env vars; prompt sanitization and notification truncation; session key redaction in logs and redactForExposure; TOOLS_AUDIT pointer to AGENTS.md; buildNotificationInput(context) only; remove dead resolveAgentIdFromSessionKey.
