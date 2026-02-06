---
name: roadmap-planning
description: Strategic roadmap creation using OKR methodology, quarterly planning, and feature prioritization
---

# Roadmap Planning

## Overview

Create strategic product roadmaps aligned with business objectives using OKR (Objectives and Key Results) methodology. This skill guides quarterly planning, feature prioritization, and long-term vision articulation.

**Use this skill when:**
- Creating quarterly product roadmaps
- Setting product strategy and direction
- Prioritizing features across teams
- Communicating strategy to stakeholders
- Planning major releases or milestones

## Core Methodology: OKR Framework

### Objectives
- Qualitative goals that describe what you want to achieve
- Inspirational and motivational
- Time-bound (typically quarterly)
- Example: "Become the most reliable backend for mission-critical systems"

### Key Results
- Measurable outcomes (0-1.0 scale)
- Specific and quantified
- 3-5 per objective
- Example: "Reduce P95 latency from 500ms to 100ms" (0.5 achieved at 300ms)

## Roadmap Creation Process

### Phase 1: Strategy Definition
1. **Gather Business Context**
   - Review last quarter's results
   - Identify market opportunities
   - Understand team capacity
   - Survey customer feedback and requests

2. **Define Quarterly Objectives (3-5)**
   - Keep to max 5 major objectives
   - Use action-oriented language
   - Make them inspirational but achievable

3. **Create Key Results (3-5 per objective)**
   - Quantifiable and measurable
   - Use SMART criteria
   - Link to business metrics

### Phase 2: Feature Breakdown
1. **Map Features to OKRs**
   - Which features directly support each KR?
   - What are dependencies?
   - What are high-risk items?

2. **Prioritization Matrix**
   - Impact (high/medium/low)
   - Effort (small/medium/large)
   - Risk (low/medium/high)
   - Dependencies (blocking/none)

3. **Create Phased Timeline**
   - Week 1-2: Foundation features
   - Week 3-6: Core implementation
   - Week 7-10: Polish and integration
   - Week 11-12: Testing and buffer

### Phase 3: Stakeholder Communication

1. **Executive Summary Deck**
   - Vision and strategy
   - Quarterly objectives
   - Key results with targets
   - High-level timeline
   - Risk mitigation plan

2. **Detailed Technical Roadmap**
   - Feature breakdown
   - Engineering effort estimates
   - Dependency map
   - Team assignments
   - Milestone gates

3. **Communication Plan**
   - All-hands presentation
   - Team syncs
   - Customer communication
   - Status update frequency

## Tools & References

- **OKR Framework**: https://en.wikipedia.org/wiki/Objectives_and_key_results
- **DORA Metrics**: Track deployment frequency, lead time, MTTR, change failure rate
- **Roadmap Tools**: JIRA, Monday.com, Fibonacci/Roadmunk
- **Prioritization**: MoSCoW method (Must, Should, Could, Won't have)

## Example Roadmap Structure

```markdown
# Q1 2026 Product Roadmap

## Strategic Objectives
- **Objective 1:** Improve system reliability to enterprise grade
  - KR1: Achieve 99.99% uptime (currently 99.5%)
  - KR2: Reduce P95 latency to <100ms (currently 500ms)
  - KR3: Pass SOC 2 Type II audit

- **Objective 2:** Expand platform capabilities for scale
  - KR1: Support 10x concurrent users
  - KR2: Launch multi-tenancy features
  - KR3: Integrate 5 new data connectors

- **Objective 3:** Strengthen product-market fit
  - KR1: Grow NPS to 60+ (currently 45)
  - KR2: Reduce churn to <2% (currently 5%)
  - KR3: Achieve 50+ enterprise customers (currently 15)

## Featured Phases

### Phase 1: Foundation (Weeks 1-4)
- [ ] Database sharding implementation
- [ ] Cache layer optimization
- [ ] API rate limiting
- [ ] Security audit and hardening

### Phase 2: Expansion (Weeks 5-8)
- [ ] Multi-tenancy support
- [ ] Advanced analytics dashboard
- [ ] Data export capabilities
- [ ] API versioning strategy

### Phase 3: Polish (Weeks 9-12)
- [ ] Performance optimization
- [ ] Documentation updates
- [ ] QA and testing cycle
- [ ] Release preparation
```

## Review & Refinement

1. **Weekly Standup Review**
   - Are we on track against KRs?
   - Any blockers or risks emerging?
   - Adjustments needed?

2. **Mid-Quarter Check-in**
   - Progress on KRs (should be 50%)
   - Confidence levels
   - Scope adjustment if needed

3. **End-of-Quarter Review**
   - Final KR scores
   - What worked well?
   - What to improve next quarter?
   - Retrospective insights

## Related Skills

- @sprint-planning - Tactical sprint execution
- @metrics-reporting - Track progress against OKRs
- @stakeholder-communication - Keep teams aligned
- @capacity-planning - Resource allocation for roadmap execution
