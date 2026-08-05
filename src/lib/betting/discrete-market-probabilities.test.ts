import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's type-stripping test runner requires the source extension.
import { calculateEdgePercentagePoints } from "./calculations.ts";
// @ts-expect-error Node's type-stripping test runner requires the source extension.
import { applyDiscreteProbabilityToRow, buildDiscreteProbabilityLookup, parseMarginSelection, type DiscreteMarketProbabilityRow } from "./discrete-market-probabilities.ts";
import type { BettingMarket, BettingOddsRow, BettingOddsTable } from "./types.ts";

const date = "2026-08-07";
const match = "Brisbane Broncos v Melbourne Storm";

function oddsRow(overrides: Partial<BettingOddsRow> = {}): BettingOddsRow {
  return {
    table: "NRL Line Odds",
    market: "Line",
    date,
    match,
    result: "Brisbane Broncos",
    value: -5.5,
    model: 99,
    bestBookie: "Sportsbet",
    bestPrice: 1.91,
    marketPercentage: null,
    Sportsbet: 1.91,
    Pointsbet: null,
    Unibet: null,
    Palmerbet: null,
    Betright: null,
    Betr: null,
    ...overrides,
  };
}

function probabilityRow(overrides: Partial<DiscreteMarketProbabilityRow> = {}): DiscreteMarketProbabilityRow {
  return {
    match_date: date,
    match,
    market: "Line",
    selection: "Brisbane Broncos",
    outcome_key: "cover",
    line_value: -5.5,
    model_probability: 0.511,
    generated_at: "2026-08-05T00:00:00Z",
    ...overrides,
  };
}

test("individual Line offers use their exact half-point probability", () => {
  const lookup = buildDiscreteProbabilityLookup([
    probabilityRow({ line_value: -5.5, model_probability: 0.511 }),
    probabilityRow({ line_value: -6.5, model_probability: 0.473 }),
  ]);
  const minusFive = applyDiscreteProbabilityToRow(oddsRow({ value: -5.5 }), lookup);
  const minusSix = applyDiscreteProbabilityToRow(oddsRow({ value: -6.5, bestBookie: "Unibet" }), lookup);
  assert.equal(minusFive.model, 51.1);
  assert.equal(minusSix.model, 47.3);
  assert.notEqual(minusFive.model, minusSix.model);
});

test("Margin selections are parsed strictly", () => {
  assert.deepEqual(parseMarginSelection("Team 1-12"), { selection: "Team", outcomeKey: "1_12" });
  assert.deepEqual(parseMarginSelection("Team 13+"), { selection: "Team", outcomeKey: "13_plus" });
  assert.deepEqual(parseMarginSelection("Team 1–12"), { selection: "Team", outcomeKey: "1_12" });
  assert.equal(parseMarginSelection("Team 1-12 special"), null);
  assert.equal(parseMarginSelection("Team 13"), null);
});

test("all four Margin outcomes from one match receive their supplied probabilities", () => {
  const probabilities = [
    ["Brisbane Broncos", "1_12", 0.28],
    ["Brisbane Broncos", "13_plus", 0.24],
    ["Melbourne Storm", "1_12", 0.27],
    ["Melbourne Storm", "13_plus", 0.21],
  ] as const;
  const lookup = buildDiscreteProbabilityLookup(probabilities.map(([selection, outcome_key, model_probability]) =>
    probabilityRow({ market: "Margin", selection, outcome_key, line_value: null, model_probability })
  ));

  const models = probabilities.map(([selection, outcomeKey]) => {
    const suffix = outcomeKey === "1_12" ? "1-12" : "13+";
    return applyDiscreteProbabilityToRow(oddsRow({
      table: "NRL Margin Odds",
      market: "Margin",
      result: `${selection} ${suffix}`,
      value: null,
    }), lookup).model;
  });
  assert.deepEqual(models.map((model) => Number(model?.toFixed(8))), [28, 24, 27, 21]);
});

test("missing discrete rows clear Line and Margin models without affecting other markets", () => {
  const lookup = buildDiscreteProbabilityLookup([]);
  assert.equal(applyDiscreteProbabilityToRow(oddsRow(), lookup).model, null);
  assert.equal(applyDiscreteProbabilityToRow(oddsRow({ table: "NRL Margin Odds", market: "Margin" }), lookup).model, null);

  for (const [market, table] of [
    ["H2H", "NRL Odds"],
    ["Total", "NRL Total Odds"],
    ["Tryscorer", "NRL Tryscorers"],
  ] as Array<[BettingMarket, BettingOddsTable]>) {
    const row = oddsRow({ market, table, model: 62 });
    assert.equal(applyDiscreteProbabilityToRow(row, lookup), row);
  }
});

test("edge remains (model probability - inverse decimal odds) in percentage points", () => {
  assert.ok(Math.abs((calculateEdgePercentagePoints(0.6, 2) ?? 0) - 10) < 1e-9);
  assert.equal(calculateEdgePercentagePoints(null, 2), null);
});
