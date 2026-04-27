# Agent Guidelines

## Token Discipline

The goal is to minimise token usage without reducing delivery quality. Prefer narrower context, smaller diffs, and targeted validation over broad exploration.

## Default Operating Rules

- Read only the files needed for the task.
- Do not scan the whole repo unless the user explicitly asks for repo-wide investigation.
- Prefer targeted `rg`, `sed`, `git diff`, and file reads over opening large files in full.
- Do not read generated output, dependency trees, or lockfiles unless the task directly requires it.
- Keep commentary short and factual.
- Keep final responses concise unless the user asks for detail.
- Avoid repeating prior context back to the user unless it materially affects the decision.

## Repo-Specific Hotspots

These files are large and expensive to pull into context. Avoid loading them in full unless necessary.

- `src/components/views/fantasy-dashboard.tsx`
- `src/app/page.tsx`
- `src/components/views/player-comparison.tsx`
- `src/components/views/betting-dashboard.tsx`
- `src/lib/supabase/queries.ts`
- `src/components/views/fantasy-draft-pricing-page.tsx`
- `package-lock.json`

If working in one of these files:

- First locate the relevant section with `rg`.
- Read the smallest surrounding span possible.
- Avoid rereading the same file repeatedly.
- Prefer focused edits over opportunistic refactors.

## Files To Avoid By Default

Do not inspect these unless the task explicitly requires them:

- `.next/`
- `node_modules/`
- `package-lock.json`
- large image assets in `public/`
- build artifacts, caches, and generated output

## How To Scope Work

When the task is specific:

- Identify the exact file or smallest likely set of files first.
- Confirm the path with `rg --files` or a narrow search.
- Read only the relevant function, component, or block.
- Run only targeted checks for touched files where possible.

When the task is unclear:

- Do one narrow discovery pass.
- Summarise the likely file(s) involved.
- Continue with the smallest viable context.

## Editing Strategy

- Make the minimum coherent change that solves the request.
- Do not bundle unrelated cleanups into the same edit.
- Preserve surrounding structure unless refactoring is required for correctness.
- If a file is monolithic, avoid restructuring it unless the user asked for that work.

## Validation Strategy

Prefer the cheapest validation that still gives confidence.

- Run targeted `eslint` on touched files instead of whole-repo lint when possible.
- Run targeted type checks or `tsc --noEmit` only when needed.
- Avoid repeated full validation after every small edit.
- If the change is UI-only and low risk, do not escalate validation without a reason.

## Git And Diff Discipline

- Inspect narrow diffs with file paths.
- Avoid broad `git diff` across the whole repo unless needed.
- Do not include unrelated modified files in a commit.
- If the worktree is dirty, isolate the files relevant to the current task.

## Communication Rules

- Do not narrate every small step.
- Use short progress updates only when they move the task forward.
- Avoid long explanations of obvious code changes.
- In the final response, prioritise outcome, important files changed, and any validation run.

## Preferred Request Pattern

If the user gives a broad request, implicitly narrow it to the smallest likely scope first. Good working assumptions:

- "Only inspect the files needed."
- "Do not scan broadly."
- "Prefer targeted checks."
- "Keep the response short."

## Exception Rule

Do not optimise for token usage at the expense of correctness. If broader context is genuinely required to avoid breaking behavior, take it, but do so deliberately and explain why briefly.
