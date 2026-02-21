# Audit: Why Fast Acknowledge Then Subagent Isn’t Observed

**Branch:** feat/subagent-fast-ack  
**Date:** 2026-02-21  
**Scope:** Runtime delivery prompt and notification input; why agents skip acknowledgment and go straight to work.

---

## Summary

The branch adds prompt text for “acknowledge first, then do substantive work (including subagents) on a later turn,” but **only one request is sent per assignment notification**, and several parts of the prompt **compete with** or **weaken** that rule. The model is never forced to ack-only; it’s only instructed to, so it often optimizes for “do the work” in a single reply.

---

## Intended Behavior (from plan and prompts)

1. **First reply (this notification):** Short acknowledgment (1–2 sentences) and optional clarifying questions. No substantive work, no full Summary/Work done/Artifacts format.
2. **Later turn:** After that reply is posted, a future notification (e.g. thread_update when user/orchestrator replies) triggers the agent again; then it does substantive work and may use subagents.

So: one delivery per notification; for assignments we want the **first** delivery to produce **ack-only**; the “later turn” is a **different** notification, not a second request in the same delivery.

---

## Root Causes (Why the Model Skips Ack)

### 1. Single-reply pressure vs ack-only

- Scope rules say: _“This system captures only one reply per notification. Do not send progress updates.”_ and _“When work can be parallelized, spawn sub-agents... and reply once with combined results.”_
- So the model sees “you get one reply” and “reply once with combined results.” That favors “do work and reply once” over “reply with ack only and do work on a later notification.”

### 2. Assignment ack is buried and not dominant

- **Placement:** `assignmentAckBlock` is inside `operationalBlock` after status, task create, document, response_request, orchestrator, review/done/blocked. It is not at the top of instructions.
- **Order vs scope rules:** Scope rules (including “spawn sub-agents and reply once with combined results”) appear **before** operational instructions. So “do work + reply once” is seen before “Assignment — first reply only: ack only.”
- The model may treat the ack rule as one of many and prioritize the “one reply with combined results” rule.

### 3. Input tail encourages “substantive” format

- `buildNotificationInput()` always appends (line 553):  
  _“Use the full format (Summary, Work done, Artifacts, Risks, Next step, Sources) for substantive updates (new work, status change, deliverables). For acknowledgments or brief follow-ups, reply in 1–2 sentences only.”_
- For an assignment, the notification is “new work” and the task description is full. That nudges the model toward “substantive update” and full format. We do say “do not use the full format in this first reply” in instructions, but the **last** thing in the payload is “use full format for substantive updates,” which can win.

### 4. “Later turn” is only in natural language

- We say “Begin substantive work only after this acknowledgment” and (in AGENTS/HEARTBEAT) “Only after that reply, proceed to substantive work on a later turn.”
- There is no **structural** guarantee (e.g. two-phase API or ack-only first request). The model can satisfy “one reply per notification” by doing work in that single reply and effectively ignore “later turn.”

### 5. No automated guard that assignment → ack-only

- Delivery tests do not assert that for `notification.type === "assignment"` the built instructions contain the ack-only / first-reply-only wording.
- So we can’t regress on presence or strength of that rule.

---

## Evidence in Code

| Location                                    | What it does / says                                                                                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delivery/prompt.ts` 361–364                | `assignmentAckBlock`: “Assignment — first reply only: … do not use the full Summary/Work done/Artifacts format in this first reply. Begin substantive work only after this acknowledgment.” Only when `notification?.type === "assignment"`. |
| `delivery/prompt.ts` 395–401                | `scopeRules`: “one reply per notification”, “When work can be parallelized, spawn sub-agents... reply once with combined results”. No exception here for “assignment → ack only first”.                                                      |
| `delivery/prompt.ts` 404–424                | `operationalBlock` order: HTTP fallback, status, task create, document, response_request, orchestrator, review/done/blocked, **then** `assignmentAckBlock`, then multi-assignee blocks.                                                      |
| `delivery/prompt.ts` 553                    | End of `buildNotificationInput`: “Use the full format... for substantive updates... For acknowledgments or brief follow-ups, reply in 1–2 sentences only.” Same for all notification types.                                                  |
| `delivery.ts` 503–520                       | One call to `buildDeliveryInstructions` + `buildNotificationInput` per notification; one `sendToOpenClaw(sessionKey, input, sendOptions)`. No second “continuation” request for assignments.                                                 |
| `openclaw-profiles.ts` 182, seed, HEARTBEAT | “Only after that reply, proceed to substantive work on a **later turn**.” Consistent with “later turn” = future notification, not same request.                                                                                              |
| `delivery.test.ts`                          | No test that assignment instructions include “acknowledgment” / “first reply only” / “do not use the full format in this first reply”.                                                                                                       |

---

## Recommendations

### High impact (prompt-only)

1. **Prioritize ack for assignments**  
   When `notification.type === "assignment"`, surface the ack rule at the **top** of the instruction block (e.g. right after identity or in a dedicated “Assignment (this notification)” section) and use strict language, e.g.:  
   “**Assignment — this reply only:** You MUST reply with only a short acknowledgment (1–2 sentences) and optional clarifying questions. Do NOT perform substantive work, use the full Summary/Work done/Artifacts format, or call sessions_spawn in this reply. Substantive work happens on a later notification after this ack is posted.”

2. **Scope rule exception for assignment**  
   In `scopeRules`, add an explicit exception for assignment, e.g.:  
   “On assignment notifications, your only reply for this notification must be the short acknowledgment; do not do substantive work or spawn sub-agents in this reply.”

3. **Assignment-specific input tail**  
   In `buildNotificationInput()`, when `notification.type === "assignment"`, replace (or prefix) the generic “Use the full format... For acknowledgments...” line with:  
   “This is an assignment. Reply with acknowledgment only (1–2 sentences) and any clarifying questions. Do not perform substantive work or use the full format in this reply.”

### Medium impact (tests + observability)

4. **Tests**  
   In `delivery.test.ts`, add (or extend) `buildDeliveryInstructions` tests for `type: "assignment"` that assert the instructions include:
   - “acknowledgment” (or “first reply only”),
   - “do not use the full Summary/Work done/Artifacts format in this first reply” (or equivalent),
   - and optionally “Do not perform substantive work” / “later notification.”

5. **Observability**  
   Log or expose whether the notification was assignment and whether the first reply was short (e.g. below a character threshold) to detect when ack-only is not followed.

### Larger change (two-phase delivery)

6. **Two-phase assignment delivery (optional)**  
   For `type === "assignment"`:
   - First request: instructions + input that only ask for ack (minimal or no full task description).
   - Post the ack to the thread and mark notification delivered.
   - Enqueue a “continuation” notification (or reuse a mechanism like thread_update) so the agent gets a **second** delivery with full task context to do substantive work and use subagents.  
     This would require backend/runtime changes (e.g. new notification type or trigger) but would structurally enforce ack-then-work.

---

## Conclusion

The fast-ack-then-subagent behavior is not seen because:

- The model gets **one** request per assignment and is also told to “reply once with combined results” and “use full format for substantive updates,” which encourages doing work in that single reply.
- The “ack only for this reply” rule is not at the top of the instructions and has no exception in the scope rules; the input tail does not tell the model “this reply = ack only” for assignments.

Implementing the high-impact prompt changes (1–3) and adding the tests (4) should make ack-first behavior much more likely without changing the one-request-per-notification design. Two-phase delivery (6) is the way to **guarantee** ack-first then work on a later turn.

**Implementation:** This plan (fast-ack prompt fix) applies recommendations 1–3 and 4 (tests).
