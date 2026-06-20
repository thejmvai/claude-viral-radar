import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleDates, buildPlan, validatePlan } from "./planner.mjs";

// 2026-06-20 is a Saturday (anchor for these deterministic checks).
test("scheduleDates: all-days gives consecutive dates from startDate", () => {
  const out = scheduleDates("2026-06-20", ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], 3);
  assert.deepEqual(out.map((s) => s.date), ["2026-06-20", "2026-06-21", "2026-06-22"]);
});

test("scheduleDates: single weekday lands on that weekday, 7 days apart", () => {
  const out = scheduleDates("2026-06-20", ["Mon"], 2); // Sat -> next Mondays
  assert.deepEqual(out.map((s) => s.date), ["2026-06-22", "2026-06-29"]);
  assert.ok(out.every((s) => s.day === "Mon"));
});

test("scheduleDates: Mon/Wed/Fri cadence from a Saturday", () => {
  const out = scheduleDates("2026-06-20", ["Mon", "Wed", "Fri"], 4);
  assert.deepEqual(out.map((s) => s.date), ["2026-06-22", "2026-06-24", "2026-06-26", "2026-06-29"]);
  assert.deepEqual(out.map((s) => s.day), ["Mon", "Wed", "Fri", "Mon"]);
});

test("scheduleDates: guards bad input", () => {
  assert.deepEqual(scheduleDates("not-a-date", ["Mon"], 2), []);
  assert.deepEqual(scheduleDates("2026-06-20", [], 2), []);
  assert.deepEqual(scheduleDates("2026-06-20", ["Mon"], 0), []);
});

test("buildPlan assigns ideas in order to posting slots", () => {
  const ideas = [
    { hook: "idea one", format: "talking-head", angle: "a1", grounding: { ref: "x" } },
    { hook: "idea two", format: "screen demo", angle: "a2", grounding: { ref: "y" } },
  ];
  const plan = buildPlan(ideas, { startDate: "2026-06-20", daysOfWeek: ["Mon", "Wed", "Fri"] });
  assert.equal(plan.count, 2);
  assert.equal(plan.schedule[0].date, "2026-06-22");
  assert.equal(plan.schedule[0].day, "Mon");
  assert.equal(plan.schedule[0].hook, "idea one");
  assert.equal(plan.schedule[0].slot, 1);
  assert.equal(plan.schedule[1].date, "2026-06-24");
  assert.equal(plan.schedule[1].slot, 2);
});

test("validatePlan flags missing dates/hooks and empty schedules", () => {
  const good = buildPlan([{ hook: "h", format: "f" }], { startDate: "2026-06-20", daysOfWeek: ["Mon"] });
  assert.deepEqual(validatePlan(good), []);
  assert.match(validatePlan({ schedule: [{ date: null, hook: "h" }] })[0], /missing date/);
  assert.match(validatePlan({ schedule: [{ date: "2026-06-22", hook: "" }] })[0], /missing hook/);
  assert.deepEqual(validatePlan({ schedule: [] }), ["plan.schedule is empty"]);
  assert.deepEqual(validatePlan({}), ["plan.schedule is not an array"]);
});
