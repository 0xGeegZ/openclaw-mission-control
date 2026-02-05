---
name: Reduce agent verbosity
overview: 'Reduce agent thread verbosity by making the required "Summary / Work done / Artifacts / Risks / Next step / Sources" format conditional: full structure only for substantive updates; short replies (1-2 sentences) for acknowledgments, confirmations, and when the thread already contains a full update from that agent.'
todos: []
isProject: false
---

# Reduce Agent Thread Verbosity

## 1. Context and goal

Agents in OpenClaw Mission Control are instructed to reply in a fixed structure (**Summary**, **Work done**, **Artifacts**, **Risks / blockers**, **Next step**, **Sources**) for every thread message. That leads to long, repetitive replies even for simple follow-ups (e.g. "Acknowledged. Ready for Phase 2.") and repeated restatements of the same content across multiple messages.

**Goal:** Keep the full format for substantive updates (new work, status change, deliverables, first reply) but allow — and explicitly instruct — short replies (1–2 sentences) when the agent is only acknowledging, confirming, or adding a brief follow-up. No new APIs or OpenClaw config; changes are prompt and documentation only.

**Constraints:** Backwards compatible (existing behavior for “substantive” replies unchanged). No change to Convex schema or runtime APIs. OpenClaw is controlled via the prompt we send ([delivery.ts](apps/runtime/src/delivery.ts)); no gateway response-length setting is required.

---

## 2. Codebase research summary

- **[apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)** — Builds the notification prompt sent to OpenClaw. Line 725: single instruction to use the full format; line 719: existing special case for task DONE (“acknowledge at most once”). `formatNotificationMessage()` has access to `context.notification`, `context.task`, `context.message`, `context.thread`.
- **[docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)** — Canonical agent manual; “Required output format for task thread updates” (lines 38–65) mandates the six-section structure with no escape hatch.
- **[packages/backend/convex/seed.ts](packages/backend/convex/seed.ts)** — `DOC_AGENTS_CONTENT` (and `buildSoulContent` for SOUL) mirrors AGENTS.md and is used for reference docs and agent personality. Same “Required output format” block and “Communication rules” (“Be short and concrete”).
- **Notification context** — `getNotificationForDelivery` (via [packages/backend/convex/service/notifications.ts](packages/backend/convex/service/notifications.ts) `getForDelivery`) provides `task.status`, `notification.type`, `message`, `thread` (array of messages with `authorType`, `authorId`, `content`). So we can derive “task is DONE” and, if needed, “latest message is from another agent” for follow-up hints.

Existing pattern: one conditional already exists in the prompt for DONE tasks (line 719). We extend that with an explicit “short reply only” instruction for DONE and add a general “short vs full format” rule everywhere.

---

## 3. High-level design

- **Single source of truth for “when short”:** Defined in the runtime prompt (delivery) and in the agent manual (AGENTS.md + seed DOC_AGENTS_CONTENT). The model is instructed:
  - **Short reply (1–2 sentences, no full structure):** When the task is DONE and you are only acknowledging; when you are adding a brief confirmation or follow-up and the thread already contains your full structured update; when the requested action is only “confirm” or “acknowledge.”
  - **Full format (Summary, Work done, Artifacts, Risks, Next step, Sources):** For substantive updates: first reply on a task, status change, new deliverables, or any reply that reports work done, artifacts, or next steps.
- **No backend or API changes.** Only:
  1. **delivery.ts** — Adjust the closing instruction and the DONE-task paragraph so “short reply” is explicit when task is DONE; add one line for the general “short when appropriate” rule.
  2. **AGENTS.md** — Add a “Short replies” subsection under the required format; keep the full structure as the default for substantive updates.
  3. **seed.ts** — Update `DOC_AGENTS_CONTENT` to match AGENTS.md (same “Short replies” rule). Optionally add one bullet in SOUL personality for each role: “Use full format only for substantive updates; for acknowledgments or brief follow-ups, reply in 1–2 sentences.”

Data flow is unchanged: Convex → runtime → `formatNotificationMessage(context)` → OpenClaw; response is still written back via existing `createMessageFromAgent`.

---

## 4. File and module changes

| File                                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [apps/runtime/src/delivery.ts](apps/runtime/src/delivery.ts)       | (1) When `task?.status === "done"`, extend the existing DONE paragraph to: “Reply in 1–2 sentences only (e.g. 'Acknowledged.' or 'Ready for Phase 2.'). Do not use the full Summary/Work done/Artifacts format.” (2) Replace the single closing format line with: “Use the full format (Summary, Work done, Artifacts, Risks, Next step, Sources) for substantive updates (new work, status change, deliverables). For acknowledgments or brief follow-ups, reply in 1–2 sentences only; do not repeat all sections. Keep replies concise.” |
| [docs/runtime/AGENTS.md](docs/runtime/AGENTS.md)                   | After “Required output format for task thread updates” and the six-section description, add a **Short replies** subsection: “When replying with an acknowledgment, a quick confirmation, or when the thread already contains your full structured update, reply in 1–2 sentences only. Do not repeat the full structure. Use the full structure only for substantive updates (first reply on a task, status change, new deliverables, or reporting work/artifacts/next steps).”                                                             |
| [packages/backend/convex/seed.ts](packages/backend/convex/seed.ts) | (1) In `DOC_AGENTS_CONTENT`, add the same “Short replies” rule after the required format block (so it matches AGENTS.md). (2) In `buildSoulContent` for each role (squad-lead, engineer, qa), add one personality bullet: “Use full format only for substantive updates; for acknowledgments or brief follow-ups, reply in 1–2 sentences.”                                                                                                                                                                                                  |

No new files. No changes to Convex schema, service actions, or gateway API.

---

## 5. Step-by-step tasks

1. **delivery.ts — DONE-task instruction**
   In `formatNotificationMessage`, locate the line that starts with `${task?.status === "done" ? "\nThis task is DONE...`. Extend it to explicitly say that for this reply the agent must use 1–2 sentences only and must not use the full Summary/Work done/Artifacts format.
2. **delivery.ts — General format instruction**
   Replace the current single-sentence instruction that lists the six sections and “Keep your reply concise” with the two-sentence version: (a) use full format for substantive updates; (b) for acknowledgments or brief follow-ups, reply in 1–2 sentences and do not repeat all sections; (c) keep replies concise.
3. **AGENTS.md — Short replies subsection**
   In “Required output format for task thread updates”, after the **Sources** section and before “Task state rules”, add a subsection “Short replies” with the rule: when to use 1–2 sentences only and when to use the full structure.
4. **seed.ts — DOC_AGENTS_CONTENT**
   Add the same “Short replies” wording to the seed doc content so it matches AGENTS.md (the template that feeds reference docs / agent context).
5. **seed.ts — SOUL personality**
   In `buildSoulContent` for `squad-lead`, `engineer`, and `qa`, add one bullet under “Personality constraints”: “Use full format only for substantive updates; for acknowledgments or brief follow-ups, reply in 1–2 sentences.”
6. **Optional: FALLBACK_NO_REPLY_AFTER_TOOLS**
   Leave as-is (full structure) so fallback messages remain clear and consistent; no change required.

---

## 6. Edge cases and risks

- **Model still outputs full format for short cases:** Mitigated by being explicit in both the notification prompt and AGENTS.md that “do not use the full format” for DONE acknowledgments and brief follow-ups. We can later add a second conditional (e.g. “if notification is thread_update and latest message is from another agent and task is review”) to suggest short reply for “approval” style replies, but that is out of scope for this plan.
- **Ambiguity between “brief follow-up” and “substantive”:** AGENTS.md and the prompt define substantive as “first reply, status change, new deliverables, or reporting work/artifacts/next steps.” If the model over-shortens, the next iteration can tighten the wording or add examples.
- **Backwards compatibility:** Existing flows (substantive updates) still get the same “use the full format” guidance; we only add the escape hatch and strengthen the DONE case. No API or schema change.

---

## 7. Testing strategy

- **Manual QA:** (1) Trigger a notification for a task in DONE; confirm the prompt includes the “1–2 sentences only, do not use full format” instruction. (2) Trigger a notification for a task in progress; confirm the prompt still asks for full format for substantive updates and mentions short replies for acknowledgments. (3) Post an agent reply for a DONE task and verify the agent tends to reply with 1–2 sentences (no guarantee from the model, but prompt should be clear).
- **No new unit tests required** for prompt string changes; optional: a small test that `formatNotificationMessage` output contains “1–2 sentences” when `task.status === "done"` and contains “full format” for substantive updates.

---

## 8. Rollout / migration

- No feature flag or migration. Deploy updated runtime and ensure reference docs (AGENTS.md / seed) are in sync. Existing agents will receive the new instructions on next notification delivery.

---

## 9. TODO checklist

- **delivery.ts** — Extend DONE-task paragraph to explicitly require 1–2 sentences only and no full format.
- **delivery.ts** — Replace single format instruction with full-format vs short-reply wording and “keep concise.”
- **AGENTS.md** — Add “Short replies” subsection under required output format.
- **seed.ts** — Add same “Short replies” rule to DOC_AGENTS_CONTENT.
- **seed.ts** — Add one SOUL personality bullet (short vs full format) for squad-lead, engineer, qa.
- Manual QA: DONE-task notification prompt and one in-progress notification; optionally verify one agent reply on a DONE task.
