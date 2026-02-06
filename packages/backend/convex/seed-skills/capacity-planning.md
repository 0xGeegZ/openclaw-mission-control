---
name: capacity-planning
description: Team velocity forecasting, resource allocation, sprint capacity planning, estimation techniques, and workload balancing
---

# Capacity Planning

## Overview

Plan team capacity by measuring velocity, forecasting story completion, allocating resources effectively, and balancing workload across sprints. This skill enables realistic sprint planning and prevents overcommitment.

**Use this skill when:**
- Planning sprint capacity before sprint starts
- Forecasting when features will be complete
- Allocating team members to stories
- Identifying bottlenecks and capacity constraints
- Adjusting team composition or workload

## Velocity Measurement

Velocity = sum of story points completed in a sprint

### Tracking Velocity

**Example:** Last 4 sprints

```
Sprint 1: 32 points completed
Sprint 2: 41 points completed
Sprint 3: 38 points completed
Sprint 4: 35 points completed

Average Velocity: 36.5 points/sprint
```

### Establishing Baseline

**First Sprint (Unproven Team):**
- Start conservative (60% capacity)
- Plan 20-24 points for 4-person team
- Measure actual completion

**Sprints 2-4:**
- Adjust based on actual velocity
- Account for holidays, planned absences
- Target 85-90% capacity utilization

**After Sprint 4+:**
- Use historical average as baseline
- Plan within 5-10% of average
- Account for context-switching, meetings, support

## Capacity Planning Formula

```
Available Capacity = Team Size × Hours/Day × Days/Sprint × Utilization%

Example:
4 people × 6 productive hours/day × 10 days × 85% = 204 person-hours
Assuming 1 story point = 4-6 hours
→ Plan 34-51 story points (conservative: ~40 points)
```

### Adjusting for Reality

Actual productivity < theoretical maximum due to:

- **Meetings:** 15-20% of time (standups, planning, refinement)
- **Support:** 10-15% (production issues, mentoring, code review)
- **Context-switching:** 5-10% (task switching overhead)
- **Vacation/PTO:** % of team out
- **Onboarding:** New team members reduce velocity initially

**Realistic Utilization:** 70-80% (not 100%)

## Resource Allocation

### Team Composition Model

```
Sprint Team: 4 engineers

Distribution by Skill Level:
- 1 Senior (mentoring, complex tasks, architectural decisions)
- 2 Mid-level (core feature development)
- 1 Junior (bug fixes, documentation, small features)

Story Assignment Strategy:
Senior: 5-8 points (complex, risky, mentoring)
Mid-level: 8-13 points each (core work, some complexity)
Junior: 3-5 points (clear scope, low risk)
```

### Balancing Workload

**Anti-pattern:** One person gets all complex work

```
❌ Bad Distribution:
- Senior: 20 points (overloaded, no mentoring)
- Mid-level: 15 points
- Mid-level: 12 points
- Junior: 3 points (underutilized, doesn't grow)

✅ Good Distribution:
- Senior: 8 points (complex) + mentoring
- Mid-level: 12 points each (balanced)
- Junior: 4 points (clear scope) + learning
```

## Sprint Capacity Planning

### Pre-Sprint Planning Meeting

**1. Calculate Available Capacity**

```
Team: 4 engineers
Planned absences: 0.5 person (2 days)
Effective team: 3.5 people

Historical velocity: 36 points
Confidence: 85% (after 4 sprints of data)
Conservative estimate: 30 points
Optimistic estimate: 42 points
```

**2. Inspect Backlog**

```
Top stories by priority:
- Story 1: 5 points (Must Have)
- Story 2: 8 points (Must Have)
- Story 3: 3 points (Must Have)
- Story 4: 13 points (Should Have)
- Story 5: 8 points (Should Have)
```

**3. Commit to Stories**

```
Must Have: 5 + 8 + 3 = 16 points (REQUIRED)
Should Have: 13 + 8 = 21 points (STRETCH GOAL)
Total: 16 + 21 = 37 points (within 85-90% of velocity)
```

**4. Allocate Resources**

```
Story 1 (5 pts, Login): Mid-level engineer
Story 2 (8 pts, Database schema): Senior engineer (architect)
Story 3 (3 pts, Bug fix): Junior engineer
Story 4 (13 pts, Authorization): Mid-level + Senior pair
Story 5 (8 pts, API design): Senior engineer (review + feedback)
```

## Velocity Forecasting

### Release Planning

**Question:** When will feature X be ready?

**Data:**
- Epic is 40 story points
- Team velocity: 36 points/sprint
- Planned absences: 0.5 days in next 2 weeks

**Calculation:**

```
40 points ÷ 36 points/sprint = 1.1 sprints
1.1 sprints × 2 weeks = 2.2 weeks (accounting for sprint boundary)
= ~3 weeks

Accounting for 0.5 days absence: Add 1 day buffer
Revised estimate: 3.5 weeks = End of sprint 2
```

### Burndown Tracking

**Sprint Progress:**

```
Sprint Started: 37 points committed
Day 1:  37 remaining (0 completed) - kicked off
Day 3:  28 remaining (9 completed) - on track
Day 5:  18 remaining (19 completed) - ahead of schedule
Day 7:  8 remaining (29 completed) - strong progress
Day 9:  2 remaining (35 completed) - finishing strong
Day 10: 0 remaining (37 completed) - SPRINT COMPLETE ✅
```

## Constraint Management

### Identifying Bottlenecks

**Database Performance:** Only senior engineer knows tuning
**Solution:** Knowledge sharing session, document patterns

**Third-party Dependency:** Waiting on API response
**Solution:** Build mock, parallelize work

**Skill Gap:** New tech stack, nobody expert
**Solution:** Spike story, allocate learning time

### Adjusting Capacity

**If velocity trending down:**
- Investigate blockers (dependencies, unclear requirements)
- Reduce sprint commitment (lower scope)
- Add resources or pair programming
- Reassess utilization %

**If velocity trending up:**
- Gradually increase commitment (safer to underpromise)
- Celebrate wins, identify what's working
- Invest in tech debt/refactoring

## Capacity Planning Metrics

### Key Indicators

| Metric | Target | Warning |
|--------|--------|---------|
| Velocity Consistency | ±5% variation | >10% variation suggests instability |
| Sprint Completion | 85-95% | <80% = overcommitted, >100% = undercommitted |
| Planned vs Actual | 1:1 ratio | Consistent miss indicates estimation bias |
| Team Utilization | 70-80% | <60% = underutilized, >90% = burnout risk |

### Forecasting Confidence

```
After 1 sprint: Low confidence (30%) - too much variance
After 4 sprints: Medium confidence (70%) - pattern emerging
After 8+ sprints: High confidence (85%+) - stable velocity
```

## Related Skills

- @backlog-refinement - Estimate and refine stories for capacity planning
- @sprint-planning - Execute capacity plan in sprints
- @metrics-reporting - Track velocity trends and forecast accuracy
- @risk-management - Plan for unknowns and resource constraints
