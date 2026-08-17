/**
 * dsh-insight — 插件评测中心 (plugin insight center).
 *
 * One answer to "哪些值得装": merges requirement matching (plugin_guide),
 * environment recipes (recipe), quality scoring (plugin_rank), static
 * security scanning (plugin_audit), and a final install verdict
 * (plugin_verdict). Pure local logic — zero network, zero LLM calls.
 *
 * @module dsh-insight
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { loadPlugins, search } from "./match.js";
import { loadRecipes, installPlan, renderRecipe, searchRecipes, validateAll } from "./recipe.js";
import { scoreRecord, gradeBadge } from "./scoring.js";
import { runSecurityScan, hasVetoFinding } from "./security.js";
import { Storage } from "./storage.js";
import { listRecords } from "./audit.js";
import { verdictFor } from "./verdict.js";

/** Cordis plugin name (registered with the loader). */
const name = "insight";

/** Services this plugin must resolve before it applies. */
const inject = ["tools", "systemPrompt"];

/** Composition-row configuration. */
const Config = z.object({
  /** Default result count for guides/ranks. */
  limit: z.number().default(5),
  /** Directory holding catalog.json (scoring data). */
  dataDir: z.string().default(""),
  /** Prompt section order (ascending; persona is 0). */
  sectionOrder: z.number().default(5),
});

/** Prompt section teaching when to use the insight tools. */
const GUIDE_SECTION_TEXT = "The insight tools answer plugin questions: \"which plugin?\" (plugin_guide), \"a whole environment?\" (recipe), \"what is good?\" (plugin_rank), \"is this safe?\" (plugin_audit), and the single install decision (plugin_verdict). When the user asks whether a plugin is worth installing, run plugin_verdict: it combines the health score, optional security scan of a local checkout (dir), and need matching into install / caution / research / avoid. Do not translate the user's phrasing into plugin names yourself; let the tools match.";

/** Resolve the storage backend over the bundled catalog. */
function storageFor(config) {
  const dir = config.dataDir && config.dataDir.trim().length > 0
    ? config.dataDir
    : fileURLToPath(new URL("../data", import.meta.url));
  return new Storage(dir);
}

/** Scan a local plugin checkout directory (trusted path from the model). */
async function scanDir(dir) {
  const files = [];
  const root = new URL("file://" + dir.replaceAll("\\", "/").replace(/\/$/, ""));
  const read = (rel) => {
    const p = join(dir, rel);
    try {
      if (!statSync(p).isFile()) return;
      const text = readFileSync(p, "utf8");
      if (text.length <= 262144) files.push({ path: rel, text });
    } catch {}
  };
  read("package.json");
  try {
    for (const sub of ["lib", "scripts", "src"]) {
      let names;
      try { names = readdirSync(join(dir, sub)); } catch { continue; }
      for (const n of names) {
        if (n.endsWith(".js") || n.endsWith(".mjs") || n.endsWith(".ts")) read(sub + "/" + n);
        if (files.length >= 40) break;
      }
      if (files.length >= 40) break;
    }
  } catch {}
  return runSecurityScan(files);
}

/**
 * Register all insight tools and the guidance section.
 * @param ctx - registrant context carrying tools/systemPrompt.
 * @param config - validated plugin configuration.
 */
function apply(ctx, config) {
  const plugins = loadPlugins();
  const storage = storageFor(config);
  const records = storage.loadCatalog();

  ctx.tools.register(defineTool({
    name: "plugin_guide",
    description: "Semantic plugin finder for DeepSeek Harness: given a natural-language need (not a plugin name), return the best-matching plugins from a curated directory (84 plugins / 14 categories), each with a reason and install command. Use when the user describes WHAT they want — e.g. 'notify me when a task finishes', '手机上看 DSH', '抓取网页'.",
    parameters: {
      need: { type: "string", required: true, description: "The user's requirement in natural language (English or Chinese)." },
      limit: { type: "integer", description: "Max results (1-10)." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: true,
        properties: {
          need: { type: "string", required: true },
          count: { type: "integer", required: true },
          results: {
            type: "array", required: true,
            items: {
              type: "object", additionalProperties: false, required: true,
              properties: {
                name: { type: "string", required: true },
                url: { type: "string", required: true },
                category: { type: "string", required: true },
                descEn: { type: "string", required: true },
                descZh: { type: "string", required: true },
                score: { type: "integer", required: true },
                reasons: { type: "array", required: true, items: { type: "string" } },
                install: { type: "string", required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ["Matched " + value.count + " plugin(s) for: " + value.need, ""];
        for (const r of value.results) {
          lines.push("## " + r.name + " [" + r.category + "] (score " + r.score + ")");
          lines.push(r.descEn || r.descZh);
          lines.push("reasons: " + r.reasons.join(", "));
          lines.push("install: " + r.install);
          lines.push("");
        }
        if (value.count === 0) lines.push("No match in the curated directory — try plugin_rank or search the dsh-plugin topic on GitHub.");
        return [{ type: "text", text: lines.join("\n").trimEnd() }];
      },
    },
    execute: async (args) => {
      const limit = Number.isInteger(args.limit) ? args.limit : config.limit;
      const results = search(args.need, plugins, limit);
      return { need: args.need, count: results.length, results };
    },
    presentCall: (args) => ({ card: "generic", title: "Find plugins for: " + String(args.need).slice(0, 60), kind: "other", rawInput: args }),
  }));

  ctx.tools.register(defineTool({
    name: "recipe",
    description: "Bundle installer for DeepSeek Harness (插件界的 dotfiles): list, search, inspect, or get the ordered install plan for community plugin recipes (通知全家桶, 安全审计套装, 移动远程套装, ...). Use when the user wants a whole environment/setup/套装/环境 rather than a single plugin.",
    parameters: {
      action: { type: "string", required: true, enum: ["list", "search", "get", "apply"], description: "list / search / get / apply." },
      need: { type: "string", description: "Natural-language need, required for action=search." },
      id: { type: "string", description: "Recipe id, required for get/apply." },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false, required: true,
        properties: {
          action: { type: "string", required: true },
          count: { type: "integer", required: true },
          recipes: {
            type: "array", required: true,
            items: {
              type: "object", additionalProperties: false, required: true,
              properties: {
                id: { type: "string", required: true },
                name: { type: "string", required: true },
                nameEn: { type: "string", required: true },
                description: { type: "string", required: true },
                descriptionEn: { type: "string", required: true },
                exclusive: { type: "boolean", required: true },
                steps: {
                  type: "array", required: true,
                  items: {
                    type: "object", additionalProperties: false, required: true,
                    properties: {
                      name: { type: "string", required: true },
                      install: { type: "string", required: true },
                      required: { type: "boolean", required: true },
                      order: { type: "integer", required: true },
                    },
                  },
                },
                notes: { type: "string", required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ["Recipe " + value.action + ": " + value.count + " result(s)", ""];
        for (const rc of value.recipes) {
          lines.push(renderRecipe({ id: rc.id, name: rc.name, nameEn: rc.nameEn, description: rc.description, descriptionEn: rc.descriptionEn, exclusive: rc.exclusive, notes: rc.notes, plugins: rc.steps.map((s) => ({ name: s.name, order: s.order, required: s.required })) }));
          lines.push("");
        }
        return [{ type: "text", text: lines.join("\n").trimEnd() }];
      },
    },
    execute: async (args) => {
      const recipes = loadRecipes();
      const { action } = args;
      if ((action === "get" || action === "apply") && !recipes.some((r) => r.id === args.id)) {
        throw new Error('recipe: unknown id "' + args.id + '" — call list or search first');
      }
      let list = recipes;
      if (action === "search") list = searchRecipes(args.need ?? "", recipes).map((s) => s.recipe);
      const out = list.map((r) => ({ id: r.id, name: r.name, nameEn: r.nameEn, description: r.description, descriptionEn: r.descriptionEn, exclusive: r.exclusive === true, steps: installPlan(r).steps, notes: r.notes ?? "" }));
      return { action, count: out.length, recipes: out };
    },
    presentCall: (args) => ({ card: "generic", title: "Recipe " + String(args.action), kind: "other", rawInput: args }),
  }));

  ctx.tools.register(defineTool({
    name: "plugin_rank",
    description: "Leaderboard over the curated plugin catalog by health score (maintenance/docs/npm/ecosystem), stars, newest, or name, with optional category filter. Answer to '哪些插件值得装' at a glance.",
    parameters: {
      sort: { type: "string", enum: ["score", "stars", "new", "name"], description: "Sort key (default score)." },
      category: { type: "string", description: "Optional category filter, e.g. 'tools' or 'ui'." },
      limit: { type: "integer", description: "Rows (default 10, max 50)." },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false, required: true,
        properties: {
          total: { type: "integer", required: true },
          rows: {
            type: "array", required: true,
            items: {
              type: "object", additionalProperties: false, required: true,
              properties: {
                repo: { type: "string", required: true },
                grade: { type: "string" },
                score: { type: "integer" },
                stars: { type: "integer" },
                category: { type: "string" },
                curated: { type: "boolean" },
                npm: { type: "boolean" },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ["Top " + value.rows.length + " of " + value.total + " plugins:"];
        for (const r of value.rows) {
          lines.push("  " + (r.grade ? gradeBadge(r.grade) + " " + r.grade + " " + String(r.score).padStart(3) : "   ?   ") + "  " + r.repo + "  " + (r.stars ?? "?") + "★" + (r.curated ? " curated" : "") + (r.npm ? " npm" : "") + (r.category ? " [" + r.category + "]" : ""));
        }
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    execute: (args) => {
      // catalog stores raw fields; score is computed on the fly
      const withScore = records.map((r) => ({ ...r, score: scoreRecord(r) }));
      const rows = listRecords({ records: withScore, sort: args.sort ?? "score", category: args.category, limit: Math.min(args.limit ?? 10, 50) }).map((r) => ({
        repo: r.repo,
        grade: r.score?.grade,
        score: r.score?.total,
        stars: r.stars,
        category: r.category,
        curated: r.curated === true,
        npm: r.npm === true,
      }));
      return { total: records.length, rows };
    },
    presentCall: (args) => ({ card: "generic", title: "Plugin rank by " + (args.sort ?? "score"), kind: "other", rawInput: args }),
  }));

  ctx.tools.register(defineTool({
    name: "plugin_audit",
    description: "Static security scan of a local plugin checkout (directory): reads package.json + lib/scripts/src JS files (capped), runs heuristics for exfiltration / credentials / obfuscation / persistence, and reports findings with severities. Give it a trusted local checkout path of the plugin under review.",
    parameters: {
      dir: { type: "string", required: true, description: "Absolute path to the plugin's local checkout directory." },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false, required: true,
        properties: {
          scanned: { type: "integer", required: true },
          findings: { type: "array", required: true, items: { type: "string" } },
          vetoed: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => {
        const lines = ["Scanned " + value.scanned + " file(s). " + (value.findings.length === 0 ? "No suspicious patterns." : value.findings.length + " finding(s).")];
        if (value.vetoed) lines.push("⚠ VETO: high-severity findings — do not install without review.");
        for (const f of value.findings) lines.push("  - " + f);
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    execute: async (args) => {
      const findings = await scanDir(String(args.dir));
      return { scanned: findings.length, findings: findings.map((f) => "[" + (f.severity ?? "info") + "] " + (f.kind ?? "finding") + ": " + (f.path ?? "")), vetoed: hasVetoFinding(findings) };
    },
    presentCall: (args) => ({ card: "generic", title: "Audit " + String(args.dir).slice(0, 40), kind: "other", rawInput: args }),
  }));

  ctx.tools.register(defineTool({
    name: "plugin_verdict",
    description: "The single install decision for one plugin: combines the health score (catalog), an optional static security scan of a local checkout (dir), and need matching (need) into install / caution / research / avoid with reasons. Answer to '这个插件值得装吗 / is it worth installing'.",
    parameters: {
      repo: { type: "string", required: true, description: "Plugin repo or name, e.g. 'owner/repo' or a URL." },
      need: { type: "string", description: "Optional natural-language need to compute match strength." },
      dir: { type: "string", description: "Optional absolute path to a local checkout for a security scan." },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false, required: true,
        properties: {
          repo: { type: "string", required: true },
          decision: { type: "string", required: true },
          security: { type: "string", required: true },
          score: { type: "integer" },
          grade: { type: "string" },
          reasons: { type: "array", required: true, items: { type: "string" } },
        },
      },
      render: (_args, value) => {
        const badge = { install: "✅", caution: "⚠️", research: "🔍", avoid: "🚫" }[value.decision] ?? "?";
        const lines = [badge + " " + value.repo + " — " + value.decision.toUpperCase()];
        for (const r of value.reasons) lines.push("  - " + r);
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    execute: async (args) => {
      const repo = String(args.repo).replace(/^https?:\/\/github\.com\//, "");
      const record = records.find((r) => r.repo === repo || r.name === repo || r.url === repo);
      if (!record) throw new Error('plugin_verdict: "' + repo + '" not in the catalog — try plugin_guide first');
      const score = scoreRecord(record);
      let findings = [];
      if (args.dir) findings = await scanDir(String(args.dir));
      let needMatch;
      if (args.need) {
        const hits = search(String(args.need), plugins, 10);
        const top = hits[0]?.score ?? 1;
        const hit = hits.find((h) => h.name === record.repo || h.name === record.name);
        if (hit && top > 0) needMatch = hit.score / top;
      }
      const verdict = verdictFor({ record, score, findings, needMatch });
      return { repo: verdict.repo, decision: verdict.decision, security: verdict.security, score: verdict.score, grade: verdict.grade, reasons: verdict.reasons };
    },
    presentCall: (args) => ({ card: "generic", title: "Verdict for " + String(args.repo).slice(0, 50), kind: "other", rawInput: args }),
  }));

  const recipeProblems = validateAll(loadRecipes());
  if (!recipeProblems.valid) {
    ctx.root?.logger?.("insight").warn("recipe validation failed: " + JSON.stringify(recipeProblems.problems));
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: "insight:instructions",
    order: config.sectionOrder,
    text: GUIDE_SECTION_TEXT,
  }), "insight.section()");
}

export { Config, GUIDE_SECTION_TEXT, apply, inject, name };