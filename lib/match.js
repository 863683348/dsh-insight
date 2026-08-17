/**
 * dsh-plugin-guide — pure search logic: requirement matching against the
 * curated plugin directory. Zero DSH/Cordis imports, unit-testable.
 *
 * Scoring: English term hits (name double-weighted), Chinese substring hits
 * (tags double-weighted), and a category fallback via the keyword lexicon.
 * @module dsh-plugin-guide/match
 */
import { readFileSync } from "node:fs";

/** Load the bundled curated directory. */
export function loadPlugins() {
  const text = readFileSync(new URL("./guide-data.json", import.meta.url), "utf8");
  const parsed = JSON.parse(text);
  return parsed.plugins ?? [];
}

/** Category → search keywords (English + Chinese). */
export const CATEGORY_KEYWORDS = {
  notify: ["notification", "notify", "toast", "alert", "remind", "sound", "bell", "提醒", "通知", "声音", "铃声", "打扰", "完成通知"],
  ui: ["ui", "interface", "panel", "dock", "sidebar", "皮肤", "界面", "面板", "侧边栏"],
  theme: ["theme", "skin", "外观", "主题", "配色"],
  tools: ["tool", "增强", "工具", "能力", "扩展"],
  memory: ["memory", "context", "note", "board", "记忆", "上下文", "笔记", "专注", "板"],
  session: ["session", "multi-session", "会话", "多会话", "状态"],
  vision: ["vision", "screenshot", "image", "ocr", "视觉", "截图", "看图", "图像"],
  dev: ["dev", "test", "audit", "security", "lint", "ci", "开发", "测试", "审计", "安全", "检查", "诊断"],
  market: ["market", "store", "manager", "市场", "商店", "插件管理", "安装插件"],
  workflow: ["workflow", "automation", "schedule", "工作流", "自动化", "定时"],
  model: ["model", "llm", "provider", "模型", "切换模型", "提供商"],
  skill: ["skill", "技能"],
  fun: ["fun", "game", "pet", "娱乐", "游戏", "宠物", "摸鱼"],
  usage: ["launcher", "start", "shortcut", "启动", "快捷方式", "桌面"],
};

const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "my", "i", "me", "want", "need", "do", "is", "are", "it", "that", "this", "can", "you", "your", "dsh", "plugin", "plugins", "harness", "deepseek", "for", "from", "at", "by", "be", "get", "make", "have", "token", "tokens"]);

/** Extract English search terms from a requirement. */
export function tokenizeEn(need) {
  const words = need.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

/** Extract Chinese substrings (length >= 2) from a requirement. */
export function tokenizeZh(need) {
  const runs = need.match(/[一-鿿]{2,}/g) ?? [];
  const out = new Set();
  for (const run of runs) {
    for (let i = 0; i + 2 <= run.length; i++) out.add(run.slice(i, i + 2));
    if (run.length >= 3) out.add(run);
  }
  return [...out];
}

/** Build the searchable corpus for one plugin. */
export function corpusOf(plugin) {
  return {
    name: plugin.name.toLowerCase(),
    text: (plugin.descEn + " " + (plugin.descZh ?? "")).toLowerCase(),
    tags: (plugin.tags ?? []).map((t) => t.toLowerCase()),
  };
}

/**
 * Score one plugin against token sets.
 * @returns { score, hits } — hits are human-readable reasons.
 */
export function scorePlugin(plugin, { en, zh }) {
  const c = corpusOf(plugin);
  let score = 0;
  const hits = [];
  for (const term of en) {
    if (c.name.includes(term)) {
      score += 3;
      hits.push("name:" + term);
    } else if (c.text.includes(term)) {
      score += 1;
      hits.push("desc:" + term);
    }
    if (c.tags.some((t) => t.includes(term) || (t.length >= 4 && term.includes(t)))) {
      score += 2;
      hits.push("tag:" + term);
    }
  }
  for (const run of zh) {
    const inDesc = (plugin.descZh ?? "").includes(run);
    const inTag = (plugin.tags ?? []).some((t) => t.includes(run));
    const inName = plugin.name.includes(run);
    if (inName) {
      score += 3;
      hits.push("名称:" + run);
    } else if (inTag) {
      score += 2;
      hits.push("标签:" + run);
    } else if (inDesc) {
      score += 1;
      hits.push("描述:" + run);
    }
  }
  // category fallback: requirement mentions a category keyword
  const cats = CATEGORY_KEYWORDS[plugin.category] ?? [];
  if (cats.some((k) => en.some((t) => k.toLowerCase().includes(t) || (k.length >= 4 && t.includes(k.toLowerCase()))))) {
    score += 2;
    hits.push("category:" + plugin.category);
  }
  const unique = [...new Set(hits)].slice(0, 5);
  return { score, hits: unique };
}

/**
 * Search the directory for the best matching plugins.
 * @param need - the natural-language requirement.
 * @param plugins - plugin list (defaults to the bundled directory).
 * @param limit - max results.
 * @returns ranked results with reasons.
 */
export function search(need, plugins = loadPlugins(), limit = 5) {
  if (typeof need !== "string" || need.trim().length === 0) {
    throw new Error('plugin_guide: "need" must be a non-empty string');
  }
  const en = tokenizeEn(need);
  const zh = tokenizeZh(need);
  const scored = plugins
    .map((plugin) => ({ plugin, ...scorePlugin(plugin, { en, zh }) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.plugin.name.localeCompare(b.plugin.name))
    .slice(0, Math.min(Math.max(1, limit), 10));
  return scored.map(({ plugin, score, hits }) => ({
    name: plugin.name,
    url: plugin.url,
    category: plugin.category,
    descEn: plugin.descEn,
    descZh: plugin.descZh ?? "",
    score,
    reasons: hits,
    install: "dsh plugin add " + plugin.url,
  }));
}