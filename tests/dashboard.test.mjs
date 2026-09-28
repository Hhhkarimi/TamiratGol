import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const snapshot = JSON.parse(await readFile(new URL("../src/data.json", import.meta.url), "utf8"));

test("dashboard snapshot preserves the reviewed source coverage", () => {
  const monthly = snapshot.queries.monthly_costs.rows;
  assert.equal(monthly.length, 80);
  assert.equal(monthly.reduce((total, row) => total + row.records, 0), 54809);
  assert.deepEqual([...new Set(monthly.map((row) => row.year))], ["1402", "1403", "1404", "1405"]);
  assert.deepEqual([...new Set(monthly.map((row) => row.site))].sort(), ["سایت کارخانه اشتهارد", "سایت کارخانه تاکستان"].sort());
});

test("exchange-rate defaults remain unverified and empty", () => {
  const rates = snapshot.queries.exchange_rates.rows;
  assert.equal(rates.length, 4);
  assert.ok(rates.every((row) => row.rate === null));
  assert.ok(rates.every((row) => row.status === "draft"));
});

test("financial totals reconcile across the site and monthly aggregates", () => {
  const monthlyTotal = snapshot.queries.monthly_costs.rows.reduce((total, row) => total + row.amount, 0);
  const siteTotal = snapshot.queries.site_summary.rows.reduce((total, row) => total + row.amount, 0);
  assert.ok(Math.abs(monthlyTotal - siteTotal) < 0.1);
});

