# Kora OS Agent Orchestration

The main Claude Code session is the engineering lead.

Available specialists (project-level subagents in `.claude/agents/`):

- cto-architect
- backend-engineer
- frontend-engineer
- mobile-engineer
- database-engineer
- appointments-workflow-engineer
- billing-payments-engineer
- qa-engineer
- security-reviewer
- devops-engineer

For substantial tasks:

1. Understand the request and inspect repository context.

2. Use cto-architect when architecture or multiple systems are affected.

3. Use backend-engineer for APIs/server/business logic.

4. Use frontend-engineer for Kora web/dashboard UI.

5. Use mobile-engineer for Android/mobile work.

6. Use database-engineer for schema, migration or data-integrity work.

7. Use appointments-workflow-engineer for appointments, booking,
   availability, scheduling and service-delivery workflows.

8. Use billing-payments-engineer for subscriptions, entitlements, service
   payments and financial workflows.

9. Use security-reviewer when authentication, authorization, tenant
   isolation, payments, public APIs, marketplace or sensitive data are
   affected.

10. Use devops-engineer for deployment, environment, builds and
    production.

11. Use qa-engineer after implementation for independent validation.

12. Main Claude session consolidates findings and determines final
    completion status.

## Parallelism

Agents may work in parallel when tasks are genuinely independent.

Safe examples:

- frontend inspection + backend inspection
- mobile inspection + web inspection
- security review + QA planning
- appointments workflow audit + billing audit

Unsafe examples:

- two agents modifying the same API route
- multiple agents editing the same schema
- multiple agents modifying authentication simultaneously
- frontend and appointment engineer independently changing the same
  component

Never permit uncontrolled overlapping edits. The main Claude session owns
coordination.

## Completion standard

Never report a Kora feature complete simply because code was written.

Completion requires appropriate validation, potentially including:

- tests
- typecheck
- lint
- web build
- API build
- Android/mobile build
- API validation
- UI validation
- workflow validation
- authorization validation
- workspace-isolation validation
- migration validation
- security review
- deployment review

The repository is always the source of truth.
