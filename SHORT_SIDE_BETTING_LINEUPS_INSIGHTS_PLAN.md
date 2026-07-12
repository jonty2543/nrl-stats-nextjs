# Short Side Betting + Lineups Insights Plan

## Summary

Implement betting and lineup improvements inspired by the supplied NRL insights screenshots using only current Short Side data: model probabilities, market odds, named lineups, casualty outs, weather, recent results, player averages, try history, live state, and team logos.

The goal is to make each fixture feel like a concise match read, not just an odds table or lineup sheet.

## Key Changes

- Add a pre-game Match Read panel inside expanded lineup cards using generated matchup insights, recent form, weather, odds, and casualty data.
- Add What Is Driving The Pick factor bars for model-facing signals that can be derived from existing data: overall rating, attack vs defence, recent form, home ground, and team-list strength.
- Add smart tags on betting and lineups cards such as Wet Track, Fast Starter, Clutch, Late Mail, Try Edge, and Market Value.
- Add a Half-Time Watch panel for in-play prompts based on existing pre-game and live-state signals, clearly labelled as data prompts rather than live odds advice.
- Improve Team News & Line-ups with notable outs, named 1-17 lists, captain markers, and simple impact badges.
- Add a Season Form Guide per fixture showing record, last five, streak, points for/against, and home/away record where derivable.
- Strengthen betting-to-lineups navigation by keeping the existing Lineups link and adding clearer fixture context around betting market cards.

## Implementation Notes

- Primary files:
  - `src/components/views/lineups-dashboard.tsx`
  - `src/components/views/betting-dashboard.tsx`
  - `src/lib/lineups/matchup-insights.ts`
- Keep changes additive and mobile-first.
- Preserve existing lazy match-detail loading, tabs, premium gating, and betting table behaviour.
- Do not add external data sources or scrape FormPicks.
- Hide unavailable factors rather than rendering filler.
- Include responsible-gambling copy near enhanced betting reads: "Statistical estimates for information only, not betting advice. Gamble responsibly."

## Test Plan

- Run targeted ESLint on touched files.
- Verify lineups page with upcoming, live, completed, and fixture-only matches.
- Verify betting page across H2H, Line, Total, and Tryscorer markets.
- Check premium and non-premium states still hide model-sensitive values.
- Inspect mobile widths for clipped tags, bars, and lineup names.

## Assumptions

- The plan file lives at repo root as `SHORT_SIDE_BETTING_LINEUPS_INSIGHTS_PLAN.md`.
- Available data means existing repo/database-backed data only.
- First implementation prioritises lineup match cards, then betting market context labels.
