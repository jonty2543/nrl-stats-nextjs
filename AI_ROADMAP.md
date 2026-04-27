# AI Chatbot Roadmap

## Goal

Build a native AI section inside the Next.js app that can answer NRL questions using internal data and internal tools, produce summary statistics, and render structured visualisations without sending large raw datasets to OpenAI.

## Product Direction

The AI experience should be a native `/dashboard/ai` feature, not a generic embedded chatbot. The model should act as a planner and interpreter, while the app remains the source of truth for data access, filtering, calculations, and chart rendering.

## Guardrails

### Token and data guardrails

- Do not send large datasets directly to OpenAI unless a request explicitly requires a bounded sample.
- Prefer model tool calls over raw context stuffing.
- The model should request structured internal function calls.
- Internal tools should design and execute the real queries inside the app.
- Tool outputs should be bounded, validated, and intentionally small.
- Responses should favor summaries, metric cards, tables, and chart specs over raw row dumps.
- Cap tool call count, row count, and output size per request.
- Add daily usage limits and per-request safeguards before public rollout.

### Output guardrails

- Do not let the model generate arbitrary React chart code.
- Return chart specifications and render them with site-native chart components.
- Keep write actions out of scope for v1.
- Keep open web browsing out of scope for v1.
- Keep code execution out of scope for v1 unless a later phase clearly requires it.
- Keep clarification loops short: the assistant should ask no more than 2 follow-up questions before making the best reasonable assumption and stating it clearly.

## Access and Usage Tiers

- Free: 1 AI chat per day
- Pro: 20 AI chats per day
- Premium: 50 AI chats per day with deeper reasoning

These limits should be enforced server-side and surfaced clearly in the UI.

### Tier data gates

- Free cannot access projections, breakevens, betting model info, line odds, or total odds.
- Pro can access projections and breakevens, but cannot access betting model info, line odds, or total odds.
- Premium can access the full AI toolset, including model info, line odds, and total odds.
- These restrictions must be enforced in the internal tool layer, API responses, persisted-thread replay, and rendered UI state.
- Locked data must not become visible through prompt injection, thread history replay, or runtime metadata leakage.

## Recommended Architecture

### 1. Chat UI

- Add `/dashboard/ai`
- Build a native chat interface with:
  - message thread
  - chat composer
  - tool activity panel
  - rendered charts and tables
  - follow-up suggestions
  - selectable clarification options when ambiguity is narrow

### 2. AI API route

- Add `/api/ai/chat`
- Use the OpenAI Responses API as the orchestration layer
- Support function calling into internal app tools
- Keep model access behind a single server entry point

### 3. Internal tool layer

- Create `src/lib/ai/tools/`
- Wrap existing app queries and calculations as internal tools
- Example tools:
  - `get_player_stats`
  - `get_team_stats`
  - `get_betting_snapshot`
  - `compare_players`
  - `list_available_years`
  - `build_chart_dataset`
  - `summarize_rows`

### 4. Structured rendering layer

- The model should return:
  - narrative text
  - summary metrics
  - tables
  - chart specs
  - optional clarification choices
- The frontend should render those with existing app components

## Roadmap

### Phase 1: Scope and scaffold

- Define the first supported use cases
- Add the `/dashboard/ai` page shell
- Add `/api/ai/chat` route scaffold
- Add an internal tool registry structure
- Add usage-tier plumbing for free, pro, and premium
- Keep the feature explicitly labeled as Phase 1 / scaffold until the model loop is connected

### Phase 2: Tool contract

- Define stable tool input/output shapes
- Validate every tool input server-side
- Bound every tool output size
- Reuse existing query functions where possible

### Phase 3: Model orchestration

- Connect the OpenAI Responses API
- Register the internal tools
- Implement the tool-call loop
- Return structured assistant outputs for the UI to render

### Phase 4: Persistence and Thread Memory

- Add Supabase tables for:
  - AI threads
  - AI messages
  - optional rendered artifacts
- Save history for replay and debugging
- Preserve enough structured context to support follow-up prompts like `plot that instead`, `compare to Storm`, or `use totals not averages`
- Keep the assistant stateful across turns without resending large raw datasets
- Redact persisted assistant replies when a user no longer has access to the data originally used in that reply

### Phase 5: Rich results and Guided Follow-ups

- Add metric cards, tables, and chart cards
- Support deep links into existing Fantasy, Betting, and Stats pages
- Let assistant responses include clickable choices for:
  - ambiguity resolution
  - display format changes
  - common follow-up actions
- Clicking a choice should continue the same thread with structured payloads rather than forcing a typed follow-up
- Add explicit locked-result cards when a saved reply contains tier-restricted data
- Add tier-aware follow-up chips so Free and Pro never receive CTA paths that target locked outputs

### Phase 6: Guardrails and limits

- Add server-side usage quotas
- Add per-request row caps and tool caps
- Track token usage and latency
- Log tool calls and failures
- Track clarification count per thread and prefer decisive answers after 2 follow-up questions
- Enforce tier redaction on thread reload, continuation, and downgrade scenarios
- Strip runtime metadata from Free and Pro responses so model details cannot leak through the UI
- Add audit coverage for restricted-tool attempts and rejected premium-only requests

### Phase 7: Premium expansion

- Give Premium deeper analysis, more charts, longer sessions, and stronger models if needed
- Keep free/pro experience bounded and predictable
- Premium-only reasoning depth should be configured server-side rather than by client prompt
- Premium-only betting responses may include model info, line odds, and total odds once the full UI renderers are in place

## Suggested File Layout

- `src/app/dashboard/ai/page.tsx`
- `src/components/views/ai-chat-page.tsx`
- `src/app/api/ai/chat/route.ts`
- `src/lib/ai/access.ts`
- `src/lib/ai/tools/index.ts`
- `src/lib/ai/tools/types.ts`
- `src/lib/ai/openai.ts`

## Phase 1 Deliverables

- Native AI section visible in dashboard nav
- AI page shell in the app
- Server-side plan resolution for free/pro/premium
- Daily usage-limit definitions in code
- Initial internal tool registry scaffold
- Chat API scaffold ready for Responses API integration
- Tier restrictions documented before rollout so Free, Pro, and Premium behaviour is unambiguous

## Notes

- Start with a small, safe toolset.
- Keep model context tight.
- Prefer deterministic app logic for queries and chart building.
- Treat OpenAI as the reasoning layer, not the data engine.
- The best UX is thread-first, tool-first, and decisive: short clarification loops, clear options when needed, and structured continuation of prior results.
