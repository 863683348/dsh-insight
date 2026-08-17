import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadRecipes,
  validateAll,
  validateRecipe,
  installPlan,
  renderRecipe,
  searchRecipes,
} from "../lib/recipe.js";

const recipes = loadRecipes();

test("bundled recipes are present and valid", () => {
  assert.ok(recipes.length >= 6, "expected >= 6 recipes, got " + recipes.length);
  const { valid, problems } = validateAll(recipes);
  assert.equal(valid, true, JSON.stringify(problems));
});

test("recipe ids are unique", () => {
  const ids = recipes.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("validateRecipe catches bad structure", () => {
  const problems = validateRecipe({ id: "x", plugins: [] });
  assert.ok(problems.length > 0, "empty plugins must fail");
  const dup = validateRecipe({ id: "x", name: "x", plugins: [{ name: "a", order: 1 }, { name: "b", order: 1 }] });
  assert.ok(dup.some((p) => p.includes("duplicate")), "duplicate orders must fail");
});

test("installPlan orders plugins ascending and prefers npm names", () => {
  const plan = installPlan(recipes.find((r) => r.id === "memory-set"));
  assert.ok(plan.steps.length >= 3);
  for (let i = 1; i < plan.steps.length; i++) {
    assert.ok(plan.steps[i - 1].order <= plan.steps[i].order, "ordered by order");
  }
  const focus = plan.steps.find((s) => s.name === "863683348/dsh-plugin-focus");
  assert.ok(focus, "focus present in memory-set");
  assert.equal(focus.install, "dsh plugin add dsh-plugin-focus", "npm name preferred");
});

test("installPlan marks exclusive recipes", () => {
  const plan = installPlan(recipes.find((r) => r.id === "im-bridge"));
  assert.equal(plan.exclusive, true);
});

test("renderRecipe includes install commands and notes", () => {
  const text = renderRecipe(recipes.find((r) => r.id === "notify-suite"));
  assert.ok(text.includes("dsh plugin add"));
  assert.ok(text.includes("notes:"));
});

test("searchRecipes matches Chinese needs", () => {
  const hits = searchRecipes("我想要一个通知提醒套装", recipes, 3);
  assert.ok(hits.length > 0, "got hits");
  assert.equal(hits[0].recipe.id, "notify-suite", "notify-suite ranked first");
});

test("searchRecipes matches English needs", () => {
  const hits = searchRecipes("security audit kit for my plugins", recipes, 3);
  assert.ok(hits.length > 0);
  assert.ok(hits.some((h) => h.recipe.id === "security-audit"));
});

test("searchRecipes with noise returns empty", () => {
  const hits = searchRecipes("asdfghjkl qwertyuiop zxcvbnm", recipes, 3);
  assert.equal(hits.length, 0);
});

test("searchRecipes rejects empty need", () => {
  assert.throws(() => searchRecipes("  "), /non-empty/);
});

test("installPlan handles exclusive recipes (same order slot)", () => {
  const plan = installPlan(loadRecipes().find((r) => r.id === "im-bridge"));
  assert.equal(plan.exclusive, true);
  const orders = plan.steps.map((s) => s.order);
  assert.ok(orders.every((o) => o === 1), "all exclusive slots share order 1");
});
