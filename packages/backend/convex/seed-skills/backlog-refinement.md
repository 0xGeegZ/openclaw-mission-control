---
name: backlog-refinement
description: Epic breakdown, user story creation, acceptance criteria definition, MoSCoW prioritization, and backlog hygiene
---

# Backlog Refinement

## Overview

Refine product backlog by breaking down epics into user stories, defining clear acceptance criteria, and prioritizing work using structured frameworks. This skill bridges strategic goals and tactical sprint execution.

**Use this skill when:**
- Breaking down epics into implementable stories
- Writing user stories with clear acceptance criteria
- Prioritizing backlog using MoSCoW or similar framework
- Estimating story complexity with story points
- Grooming backlog for upcoming sprints

## User Story Framework

### Story Structure

```markdown
## [Story Title]

**As a** [user type]
**I want to** [capability/feature]
**So that** [business value/outcome]

### Acceptance Criteria

- [ ] Criterion 1 (specific, measurable, testable)
- [ ] Criterion 2
- [ ] Criterion 3

### Definition of Done

- [ ] Code complete and peer reviewed
- [ ] Unit tests passing (>80% coverage)
- [ ] Integration tests passing
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] QA approved

### Story Points Estimate

5 points (small, <2 days)
```

### Good User Stories (INVEST)

- **I**ndependent: Can be developed independently
- **N**egotiable: Details can be discussed
- **V**aluable: Delivers business value
- **E**stimable: Can be estimated by dev team
- **S**mall: Completable in one sprint
- **T**estable: Clear acceptance criteria

### Bad Examples to Avoid

```markdown
❌ "Fix the bug" - Too vague, no context
❌ "Add authentication" - Too large, needs breakdown
❌ "Make the UI better" - Not testable, no acceptance criteria
❌ "As a user, I want a feature" - No specific capability stated
```

## Epic Breakdown Process

### Step 1: Identify Epic Goal

```
Epic: "User authentication and authorization"
Goal: Enable secure user access with role-based permissions
```

### Step 2: Break into Stories

Story 1: "User login with email and password"
Story 2: "Password reset flow"
Story 3: "Role-based access control (RBAC)"
Story 4: "OAuth2 social login integration"
Story 5: "Session management and logout"

### Step 3: Add Details to Each Story

```markdown
## User Story: Login with Email and Password

**As a** new user
**I want to** log in with email and password
**So that** I can access my account securely

### Acceptance Criteria

- [ ] User can enter email and password
- [ ] Invalid credentials show error message
- [ ] Successful login creates session
- [ ] Session persists across page refreshes
- [ ] User can access protected routes
- [ ] Password is hashed (never stored plaintext)

### Definition of Done

- [ ] Login page UI complete
- [ ] Backend authentication endpoint implemented
- [ ] Session management integrated
- [ ] Error handling for invalid credentials
- [ ] Security audit passed
- [ ] QA approval received

### Estimated Points

8 points (medium, 2-3 days)
```

## MoSCoW Prioritization

Prioritize backlog items by business value and urgency:

### Must Have (Critical)
- **Definition:** Essential for product launch, legal/compliance requirements
- **Example:** User authentication, GDPR compliance
- **Target:** 50% of sprint capacity

### Should Have (High)
- **Definition:** Important for user experience but can be deferred
- **Example:** Password reset, email verification
- **Target:** 30% of sprint capacity

### Could Have (Medium)
- **Definition:** Nice-to-have, low business impact
- **Example:** Social login, advanced search
- **Target:** 20% of sprint capacity

### Won't Have (Low)
- **Definition:** Out of scope for current release
- **Example:** Internationalization, advanced analytics
- **Target:** 0% (deferred to future)

## Story Point Estimation

### Fibonacci Scale

- **1 point:** Trivial (1-2 hours, routine task)
- **2 points:** Very small (2-4 hours, straightforward)
- **3 points:** Small (4-8 hours, some complexity)
- **5 points:** Medium (1-2 days, moderate complexity)
- **8 points:** Large (2-3 days, significant complexity)
- **13 points:** Very large (3-5 days, high complexity or unknowns)
- **21+ points:** Too large, needs breakdown

### Estimation Technique: Planning Poker

1. **Present story** to team
2. **Discuss** questions and unknowns
3. **Each estimator** selects a card
4. **Reveal simultaneously**
5. **Discuss outliers** (high/low estimates)
6. **Re-estimate** if needed

## Acceptance Criteria Checklist

Good acceptance criteria should be:

- [ ] **Specific** — Concrete, measurable, not vague
- [ ] **Testable** — QA can verify with clear pass/fail
- [ ] **Realistic** — Achievable within sprint
- [ ] **Business-focused** — Aligned with user value, not technical details
- [ ] **Complete** — Cover main paths and edge cases

**Example:**

```markdown
✅ Good:
- User can click "Login" button and be redirected to login page
- Invalid email format shows error "Please enter a valid email"
- After 3 failed attempts, account is locked for 15 minutes
- Session expires after 30 minutes of inactivity

❌ Bad:
- Use JWT tokens (implementation detail)
- Make it secure (vague)
- Database should have user table (not user-facing)
- The system should work (not testable)
```

## Backlog Grooming Cadence

### Weekly Refinement

- **Duration:** 1-2 hours
- **Participants:** PM, tech lead, optional engineers
- **Agenda:**
  - Review next 2-3 sprints of backlog
  - Break down large epics into stories
  - Add/update acceptance criteria
  - Estimate new stories
  - Prioritize using MoSCoW

### Sprint Planning (Before Each Sprint)

- **Duration:** 1-2 hours
- **Participants:** Full team
- **Agenda:**
  - Select top-priority items
  - Ensure stories are ready (estimated, criteria defined)
  - Assign to developers
  - Discuss technical approach
  - Commit to capacity

### Sprint Review & Retro (End of Sprint)

- **Duration:** 1-2 hours
- **Participants:** Full team + stakeholders
- **Agenda:**
  - Demo completed stories
  - Get stakeholder feedback
  - Discuss velocity and improvements
  - Update backlog priorities based on feedback

## Related Skills

- @capacity-planning - Estimate team velocity and capacity
- @risk-management - Identify risks in story execution
- @metrics-reporting - Track backlog health and velocity trends
- @sprint-planning - Execute backlog in sprints
