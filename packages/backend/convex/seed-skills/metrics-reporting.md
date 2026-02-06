---
name: metrics-reporting
description: KPI tracking, analytics reporting, burndown charts, DORA metrics, and team performance dashboards
---

# Metrics Reporting

## Overview

Establish and maintain a metrics-driven culture by tracking key performance indicators (KPIs), generating reports, and creating visibility into team velocity, quality, and business impact.

**Use this skill when:**
- Setting up team dashboards
- Creating KPI tracking systems
- Generating status reports for stakeholders
- Analyzing team velocity and capacity
- Measuring release quality and deployment frequency

## Core Metrics Framework

### DORA Metrics (DevOps Research & Assessment)

These four metrics correlate with organizational performance:

1. **Deployment Frequency**
   - How often code is deployed to production
   - Target: Multiple times per day (elite) to monthly (low)
   - Measured by: Commits merged to master / time period

2. **Lead Time for Changes**
   - Time from commit to production deployment
   - Target: <1 hour (elite) to >1 month (low)
   - Measured by: Avg days from merge to deploy tag

3. **Mean Time to Recovery (MTTR)**
   - Time to restore service after production incident
   - Target: <1 hour (elite) to >24 hours (low)
   - Measured by: Incident detection to resolution

4. **Change Failure Rate**
   - Percentage of deployments that cause incidents
   - Target: 0-15% (elite) to >46% (low)
   - Measured by: Failed deployments / total deployments

### Agile Team Metrics

1. **Velocity**
   - Story points completed per sprint
   - Use for: Capacity planning, forecasting
   - Tracked: Sprint dashboard, burndown chart

2. **Burn-down Chart**
   - Planned work vs. completed work over sprint
   - Visual tool for sprint progress
   - Y-axis: Story points remaining, X-axis: Sprint days

3. **Cycle Time**
   - Time from "In Progress" to "Done"
   - Helps identify bottlenecks
   - Target: <5 days (good), <2 days (excellent)

4. **Lead Time**
   - Time from "To Do" to "Done"
   - Includes backlog wait time
   - Higher than cycle time (includes waiting)

### Quality Metrics

1. **Test Coverage**
   - Percentage of code covered by tests
   - Target: >80% for critical paths
   - Tool: Istanbul, Nyc for JavaScript

2. **Bug Detection Rate**
   - Bugs found per release
   - Track: Pre-release vs. post-release
   - Goal: >90% found before release

3. **Code Review Defects**
   - Issues found during code review
   - Helps assess QA effectiveness
   - Target: <2% of changes have review issues

### Business Metrics

1. **Deployment Success Rate**
   - Successful deployments / total deployments
   - Target: >95%

2. **Incident Severity Distribution**
   - P1 (Critical), P2 (High), P3 (Medium), P4 (Low)
   - Track trends over time

3. **Technical Debt Ratio**
   - Time spent on debt work vs. feature work
   - Target: 20-30% on debt
   - Too low: Risk of system degradation
   - Too high: Slow feature delivery

## Dashboard Setup

### Essential Dashboard Components

**Dev Efficiency**
```
┌─────────────────────────────────────┐
│ Deployment Frequency (7-day avg)    │
│ 2.3 deployments/day (↑ 15%)        │
├─────────────────────────────────────┤
│ Lead Time (median)                  │
│ 4.2 hours (↓ 20%)                  │
├─────────────────────────────────────┤
│ MTTR (last 30 days)                 │
│ 22 minutes (↓ 10%)                 │
├─────────────────────────────────────┤
│ Change Failure Rate                 │
│ 8.5% (↑ 2%)                        │
└─────────────────────────────────────┘
```

**Team Velocity**
```
Sprint | Week 1 | Week 2 | Week 3 | Avg
SP     |   32   |   41   |   38   | 37
```

**Quality Gates**
```
Test Coverage: 87% (Target: 85%) ✅
Critical Bugs: 2 (Target: <1) ⚠️
Code Review: 1.2 issues/PR (Target: <1) 🔴
```

## Reporting Cadence

### Daily Standup Metric
- Sprint progress (% complete)
- At-risk items (red/yellow flags)
- Blocker summary

### Weekly Status Report
- Velocity on track?
- Key accomplishments
- Risks and mitigation
- Preview of next week

### Monthly Executive Report
- DORA metrics trend
- Team health score
- Business impact (features delivered, bugs fixed)
- Forecast for next month

### Quarterly Review
- OKR progress (% achieved)
- Key wins and learnings
- Process improvements
- Strategy adjustment

## Tools & Platforms

- **GitHub Insights**: Deployment frequency, PR metrics
- **JIRA Reports**: Velocity, burndown, burnup
- **Grafana**: Real-time dashboards
- **DataDog/New Relic**: Production metrics
- **Custom Dashboards**: Google Sheets, Tableau, Metabase

## Key Formulas

```markdown
### Deployment Frequency
(Commits merged to master) / (Days in period)

### Lead Time
(Date deployed) - (Date merged)

### Cycle Time
(Date done) - (Date started)

### Change Failure Rate
(Failed deployments) / (Total deployments) * 100

### Velocity Average
(Sum of story points completed) / (Number of sprints)

### Test Coverage
(Lines covered by tests) / (Total lines) * 100

### Bug Density
(Bugs found) / (1000 lines of code)
```

## Actionable Insights

When metrics are trending negatively:

1. **High lead time?**
   - Too much code review back-and-forth
   - Bottleneck in testing
   - Long deployment pipeline

2. **High MTTR?**
   - Monitoring gaps
   - Unclear incident response process
   - Slow root cause analysis

3. **High change failure rate?**
   - Insufficient testing
   - Unclear requirements
   - Too large deployments

4. **Low velocity?**
   - Team context-switching
   - Unclear requirements
   - Technical debt impact
   - External blockers

## Related Skills

- @sprint-planning - Set velocity targets
- @roadmap-planning - Align metrics with strategy
- @stakeholder-communication - Report metrics to leadership
- @test-automation - Improve coverage metrics
