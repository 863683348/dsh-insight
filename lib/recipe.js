/**
 * dsh-plugin-guide — pure recipe logic: validation, install planning, and
 * recipe search. Zero DSH/Cordis imports, unit-testable.
 *
 * A recipe is a JSON bundle: plugin list with per-plugin `order` (install
 * sequence), optional `exclusive` (pick-one) semantics, optional `notes`.
 * The plan output is DAG-friendly: an ordered list a workflow/package
 * manager can consume.
 * @module dsh-plugin-guide/recipe
 */
import { readFileSync } from "node:fs";
import { tokenizeEn, tokenizeZh } from "./match.js";

/** Load the bundled recipes. */
export function loadRecipes() {
  const parsed = JSON.parse(readFileSync(new URL("./recipes.json", import.meta.url), "utf8"));
  return parsed.recipes ?? [];
}

/**
 * Validate one recipe. Returns an array of problems (empty = valid).
 * @param recipe - the recipe object.
 * @param knownIds - recipe ids available (for dependsOn checks).
 * @returns problem strings.
 */
export function validateRecipe(recipe, knownIds = []) {
  const problems = [];
  if (!recipe || typeof recipe !== "object") return ["recipe is not an object"];
  if (typeof recipe.id !== "string" || recipe.id.length === 0) problems.push("missing id");
  if (typeof recipe.name !== "string" || recipe.name.length === 0) problems.push("missing name");
  if (!Array.isArray(recipe.plugins) || recipe.plugins.length === 0) problems.push("plugins must be a non-empty array");
  const isExclusive = recipe.exclusive === true;
  const orders = new Set();
  for (const p of recipe.plugins ?? []) {
    if (!p || typeof p.name !== "string" || p.name.length === 0) problems.push("plugin entry missing name");
    if (p.order !== undefined) {
      if (!Number.isInteger(p.order) || p.order < 1) problems.push("plugin order must be a positive integer: " + p.name);
      // Exclusive recipes may share an order slot ("pick one of these").
      if (!isExclusive && orders.has(p.order)) problems.push("duplicate plugin order " + p.order + " (" + p.name + ")");
      orders.add(p.order);
    }
  }
  if (Array.isArray(recipe.dependsOn)) {
    for (const dep of recipe.dependsOn) {
      if (!knownIds.includes(dep)) problems.push("dependsOn unknown recipe: " + dep);
    }
  }
  return problems;
}

/** Validate every bundled recipe; returns { valid, problems } grouped by id. */
export function validateAll(recipes = loadRecipes()) {
  const ids = recipes.map((r) => r.id);
  const problems = {};
  for (const r of recipes) {
    const p = validateRecipe(r, ids);
    if (p.length > 0) problems[r.id] = p;
  }
  return { valid: Object.keys(problems).length === 0, problems };
}

/**
 * Build the ordered install plan for a recipe.
 * @param recipe - the recipe.
 * @returns ordered steps: { name, install, required, order } plus flags.
 */
export function installPlan(recipe) {
  const steps = (recipe.plugins ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p) => ({
      name: p.name,
      install: "dsh plugin add " + (p.npm ?? p.url ?? p.name),
      required: p.required !== false,
      order: p.order ?? 0,
    }));
  return {
    id: recipe.id,
    name: recipe.name,
    exclusive: recipe.exclusive === true,
    steps,
    notes: recipe.notes ?? "",
  };
}

/** Render a recipe as human-readable markdown (for get/apply results). */
export function renderRecipe(recipe) {
  const plan = installPlan(recipe);
  const lines = [
    "## " + recipe.name + " (" + recipe.nameEn + ") [" + recipe.id + "]",
    recipe.description + " / " + recipe.descriptionEn,
    "",
  ];
  for (const s of plan.steps) {
    lines.push((s.required ? "* " : "~ ") + s.name + (s.required ? "" : " (optional)") + " — " + s.install);
  }
  if (plan.exclusive) lines.push("", "⚠ exclusive: pick exactly one of the plugins above.");
  if (plan.notes) lines.push("", "notes: " + plan.notes);
  return lines.join("\n");
}

/**
 * Rank recipes against a natural-language need (reuses the tokenizer).
 * @param need - the requirement.
 * @param recipes - recipe list.
 * @param limit - max results.
 * @returns ranked { recipe, score, hits } entries.
 */
export function searchRecipes(need, recipes = loadRecipes(), limit = 3) {
  if (typeof need !== "string" || need.trim().length === 0) {
    throw new Error('recipe: "need" must be a non-empty string');
  }
  const en = tokenizeEn(need);
  const zh = tokenizeZh(need);
  const scored = [];
  for (const r of recipes) {
    let score = 0;
    const hits = [];
    const corpus = (r.name + " " + r.nameEn + " " + r.description + " " + r.descriptionEn + " " + (r.tags ?? []).join(" ")).toLowerCase();
    for (const t of en) {
      if (corpus.includes(t)) {
        score += 2;
        hits.push(t);
      }
    }
    for (const run of zh) {
      if ((r.name + r.description + (r.tags ?? []).join("")).includes(run)) {
        score += 3;
        hits.push(run);
      }
    }
    if (score > 0) scored.push({ recipe: r, score, hits: [...new Set(hits)].slice(0, 4) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.min(Math.max(1, limit), 5));
}