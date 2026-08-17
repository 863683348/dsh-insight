/**
 * dsh-insight — runnable demo: guide / recipe / rank / verdict.
 * Run: node scripts/demo.mjs
 */
import { fileURLToPath } from "node:url";
import { search, loadPlugins } from "../lib/match.js";
import { loadRecipes, searchRecipes, renderRecipe } from "../lib/recipe.js";
import { Storage } from "../lib/storage.js";
import { scoreRecord } from "../lib/scoring.js";
import { listRecords } from "../lib/audit.js";
import { verdictFor } from "../lib/verdict.js";

console.log("── 1. plugin_guide: 需求 → 插件 ──");
for (const need of ["notify me when a task finishes", "手机远程访问 DSH", "抓取网页内容"]) {
  const hits = search(need, loadPlugins(), 3);
  console.log("\n需求: " + need);
  for (const h of hits) console.log("  " + h.name + " [" + h.category + "] — " + h.reasons.join(", "));
}

console.log("\n── 2. recipe: 需求 → 配方 ──");
for (const h of searchRecipes("安全审计", loadRecipes(), 2)) console.log("  " + h.recipe.id + " (score " + h.score + ")");

console.log("\n── 3. plugin_rank: 现场评分 top5 ──");
const storage = new Storage(fileURLToPath(new URL("../data", import.meta.url)));
const records = storage.loadCatalog().map((r) => ({ ...r, score: scoreRecord(r) }));
for (const r of listRecords({ records, sort: "score", limit: 5 })) {
  console.log("  " + r.score.grade + " " + String(r.score.total).padStart(3) + "  " + r.repo + "  " + (r.stars ?? "?") + "★");
}

console.log("\n── 4. plugin_verdict: 结论示例 ──");
const v = verdictFor({ record: { repo: "dsh-browser", category: "tools" }, score: { points: 80, grade: "A" }, findings: [], needMatch: 0.9 });
console.log("  " + v.decision.toUpperCase() + " — " + v.reasons.join("; "));
