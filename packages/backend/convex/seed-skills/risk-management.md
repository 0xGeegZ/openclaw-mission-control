---
name: risk-management
description: Risk identification, mitigation planning, dependency tracking, contingency planning, and risk monitoring throughout development
---

# Risk Management

## Overview

Identify, assess, and mitigate risks to project success. This skill enables proactive risk management, reducing surprises and enabling contingency planning.

**Use this skill when:**
- Planning sprints (identify potential blockers)
- Starting new epics (assess technical risk)
- Managing dependencies (track external blockers)
- Monitoring project health (catch issues early)
- Planning releases (prepare for worst-case scenarios)

## Risk Identification Framework

### Risk Categories

#### Technical Risks
- **New technology:** Unfamiliar stack, learning curve
- **Architecture decisions:** Wrong technology choice, scalability issues
- **Performance:** Database queries too slow, memory leaks
- **Integration:** Third-party API reliability, version compatibility
- **Security:** Vulnerability exposure, compliance risk

#### Resource Risks
- **Team availability:** Key person leaving, unexpected absences
- **Skill gaps:** Nobody knows required technology
- **Capacity:** Underestimated scope, team overcommitted
- **Dependency:** Waiting on another team's work

#### Business Risks
- **Scope creep:** Requirements unclear, stakeholder changes
- **Priorities shift:** Business priorities change mid-sprint
- **Market change:** Competitive pressure, customer needs shift
- **Timeline pressure:** Hard deadline, unrealistic schedule

### Risk Register Template

```markdown
## Risk Register

### Risk 1: Database Query Performance

**Category:** Technical
**Probability:** Medium (50%)
**Impact:** High (would delay release 2+ weeks)
**Severity:** High (50% × High)

**Description:** Query optimization for 1M+ user records not yet tested at scale

**Mitigation Strategy:**
- Week 1: Load test with production-like data
- Week 2: Profile slow queries with APM tools
- Week 3: Implement indexing strategy
- Fallback: Cache frequently-accessed data

**Owner:** Senior database engineer
**Review date:** End of sprint 1
**Status:** Identified, mitigation in progress

---

### Risk 2: Third-party API Reliability

**Category:** Integration
**Probability:** Low (20%)
**Impact:** High (feature doesn't work)
**Severity:** Medium (20% × High)

**Description:** Payment processor API has 99.5% uptime SLA, no fallback

**Mitigation Strategy:**
- Implement retry logic with exponential backoff
- Use local fallback queue if API fails
- Monitor API health continuously
- Test failure scenarios in staging

**Fallback Plan:**
- If API unavailable, queue transactions locally
- Retry after recovery
- Notify ops team for investigation

**Owner:** Backend engineer
**Review date:** Before release
**Status:** Mitigation in progress

---

### Risk 3: Scope Creep

**Category:** Business
**Probability:** High (70%)
**Impact:** Medium (delays sprint, rework)
**Severity:** High (70% × Medium)

**Description:** Stakeholders often request "small changes" mid-sprint

**Mitigation Strategy:**
- Freeze requirements 2 days before sprint start
- Require scope change approval (PM + tech lead)
- Track change requests in separate backlog
- Communicate impact of changes upfront

**Owner:** Product Manager
**Review date:** Before each sprint
**Status:** Prevention strategy implemented
```

## Risk Assessment Matrix

### Probability × Impact Grid

```
                IMPACT
           Low    Medium   High
P    High   🟡      🔴      🔴
R    Med    🟢      🟡      🔴
O    Low    🟢      🟢      🟡
B
A
B
I
L
I
T
Y

🟢 Green (Low risk): Monitor only
🟡 Yellow (Medium risk): Active mitigation required
🔴 Red (High risk): Must resolve before proceeding
```

### Example Assessment

```
Risk: Database query performance
Probability: Medium (50%) - not tested at scale yet
Impact: High - would delay release 2+ weeks
Severity: High (🔴) - requires active mitigation

Risk: Key developer vacation
Probability: Known (100%) - scheduled time off
Impact: Medium - 1 feature delayed but team can compensate
Severity: Medium (🟡) - manageable with planning

Risk: Competitor releases similar feature
Probability: Low (20%) - unlikely this month
Impact: Low - market still has room for multiple solutions
Severity: Low (🟢) - monitor, not urgent
```

## Dependency Tracking

### Dependency Types

#### Intra-Team Dependencies
```
Story 2: "Setup database" (Blocks Story 3, 4)
    ↓
Story 3: "User authentication" (Depends on database)
    ↓
Story 4: "Authorization system" (Depends on database)
```

**Management:**
- Identify blocking stories early
- Schedule dependent work in sequence
- Build dependencies first
- Communicate dependencies in sprint planning

#### Inter-Team Dependencies
```
Mobile Team: "iOS app" (Depends on API)
    ↓
API Team: "User endpoints" (Blocks mobile team)
```

**Management:**
- Establish API contracts early (OpenAPI)
- Use mocks/stubs for parallel work
- Weekly sync on integration schedule
- Plan ahead for blockers

#### Third-Party Dependencies
```
Our Team: "Payment feature" (Depends on Stripe API)
    ↓
Stripe: "Account setup, API access"
```

**Management:**
- Get accounts/access early
- Test integration in staging
- Have fallback plan (different provider)
- Monitor third-party service status

### Dependency Risk Register

```markdown
## External Dependencies

### Stripe Payment API

**Dependency Type:** Third-party service
**Criticality:** High (payment processing)
**Probability of Delay:** Low (20%)
**Mitigation:**
- Established account and test keys in week 1
- Integration tested in staging by week 2
- Fallback: Use alternative provider (Square) if needed
- Monitor API status dashboard

**Owner:** Backend lead
**Status:** On track (account approved, sandbox ready)

---

### Backend Team: User Service

**Dependency Type:** Intra-team (blocking)
**Criticality:** High (frontend depends on it)
**Timeline:** Needed by end of sprint 1
**Mitigation:**
- User Service story: 13 points, priority Must-Have
- Frontend mocks endpoints by sprint 1 start
- API contract defined in week 1
- Integration test suite ready by week 2

**Owner:** Backend lead
**Status:** Planned, no delays expected
```

## Contingency Planning

### "What If" Scenarios

```
Scenario: Senior database engineer gets sick for 2 weeks

Impact:
- Database optimization delayed
- Performance testing at risk
- Could miss release date

Contingency Plan:
- Have mid-level engineer as backup (pair programming now)
- Document all decisions in wiki
- Contact external consultant if needed
- Shift performance testing to sprint 3

Trigger: If engineer is out >3 days, activate plan

---

Scenario: Third-party API changes pricing mid-project

Impact:
- Cost increases, business impact
- Might need to switch providers
- Code changes required

Contingency Plan:
- Review pricing terms before integration
- Evaluate alternatives (Square, PayPal) in parallel
- Keep abstraction layer for payment provider
- Alert business team immediately if changes occur

Trigger: Any change in payment terms/availability
```

## Risk Monitoring

### Weekly Risk Review

**Duration:** 15 minutes
**Participants:** PM, tech lead
**Cadence:** Every Friday

**Checklist:**
- [ ] Any new risks identified?
- [ ] Any risks escalated in severity?
- [ ] Are mitigations on track?
- [ ] Should any risks be added to sprint?
- [ ] Any dependencies becoming critical?

### Sprint Planning Risk Check

**Before committing to sprint:**

```
Risk Review Checklist:

□ Database risks: Performance testing complete?
□ Third-party risks: APIs working in sandbox?
□ Resource risks: Team available? No conflicts?
□ Scope risks: Requirements frozen and clear?
□ Integration risks: Dependency owners on same timeline?
□ External risks: Any planned outages/changes?

APPROVAL: Tech lead signs off on risk mitigation plan
```

### Release Gate Risk Assessment

**Before shipping to production:**

```
Final Risk Assessment:

Risk Level: Low / Medium / High

Outstanding risks:
1. [List any remaining risks]

Mitigation status:
- [Mitigation 1]: Implemented ✅
- [Mitigation 2]: Fallback ready ✅
- [Mitigation 3]: Monitoring active ✅

Contingency plan: [1-2 sentence fallback plan]

Approval: PM + Tech Lead + QA confirm ready to ship
```

## Risk Management Best Practices

### Do's ✅
- Identify risks early (planning stage, not execution)
- Be specific (not "project is risky" but "third-party API reliability")
- Assign owners (who's responsible for mitigation)
- Update risk register weekly
- Escalate early when risks materialize
- Have concrete contingency plans
- Test fallback plans before needed
- Communicate risks to stakeholders

### Don'ts ❌
- Ignore risks hoping they disappear
- Assume worst-case will happen (waste resources)
- Over-engineer solutions for low-probability risks
- Hide risks from stakeholders
- Fail to update risk status
- Plan contingencies without triggers
- Make contingencies too theoretical (test them!)

## Related Skills

- @backlog-refinement - Identify risks in story definition
- @capacity-planning - Risk from underestimation or resource constraints
- @metrics-reporting - Track risk KPIs and early warning signals
- @sprint-planning - Execute risk mitigations in sprints
