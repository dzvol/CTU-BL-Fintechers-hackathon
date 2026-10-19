# Contracts (`@semanticauth/contracts`)

The shared interface between gateway, web, agent and CLI. Owner: member 4, but everyone depends
on it, so every change here affects other people's work.

## Change rules

- **Additive** changes are fine without asking: a new schema, a new optional field, or a new enum
  value that consumers can ignore.
- **Breaking** changes need team agreement first: renaming or removing a field or schema, making
  a field required, changing a type or meaning, or removing an enum value. Describe the change to
  the user and stop; don't make it on your own.
- Mention every contract change in your summary.

## Conventions

- Zod only; no other runtime dependencies and no logic beyond schemas and tiny helpers.
- Each schema is `export const IntentSchema = z.object({ … })` plus
  `export type Intent = z.infer<typeof IntentSchema>`.
- One file per concept: `money.ts`, `ids.ts`, `intent.ts`, `task.ts`, `operation.ts`,
  `review.ts`, `verdict.ts`, `mcp.ts` (tool inputs/outputs), `dashboard-api.ts`. Re-export
  everything from `src/index.ts`.
- Amounts are decimal-integer strings of atomic units (`"100000"` = 0.1 USDC). Timestamps are ISO
  8601 strings. State names are lowercase snake_case; verdicts are `'ALLOW' | 'REVIEW' | 'BLOCK'`.
- State and verdict names must match `docs/architecture/overview.md`.
