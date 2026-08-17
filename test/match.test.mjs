import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadPlugins,
  search,
  tokenizeEn,
  tokenizeZh,
  scorePlugin,
} from "../lib/match.js";

const plugins = loadPlugins();

test("bundled directory is non-empty and well-formed", () => {
  assert.ok(plugins.length >= 50, "expected >= 50 curated plugins, got " + plugins.length);
  for (const p of plugins.slice(0, 20)) {
    assert.ok(p.name && p.url && p.category && p.descEn, "well-formed entry: " + p.name);
  }
});

test("dsh-plugin-focus is in the directory under memory", () => {
  const found = plugins.find((p) => p.name === "863683348/dsh-plugin-focus");
  assert.ok(found, "dsh-plugin-focus present");
  assert.equal(found.category, "memory");
});

test("tokenizeEn extracts lowercase terms and drops stop words", () => {
  const terms = tokenizeEn("I want to notify me when a task finishes on my phone");
  assert.ok(terms.includes("notify"));
  assert.ok(terms.includes("finishes"));
  assert.ok(!terms.includes("want"));
  assert.ok(!terms.includes("a"));
});

test("tokenizeZh extracts 2-grams and full runs", () => {
  const grams = tokenizeZh("我想在任务完成时收到通知");
  assert.ok(grams.includes("通知"));
  assert.ok(grams.includes("任务"));
});

test("search finds notify plugins for an English need", () => {
  const results = search("notify me when a task finishes", plugins, 3);
  assert.ok(results.length > 0, "got results");
  const top = results[0];
  assert.equal(top.category, "notify");
  assert.ok(top.reasons.length > 0, "has reasons");
  assert.ok(top.install.startsWith("dsh plugin add"));
});

test("search matches Chinese needs via category lexicon", () => {
  const results = search("任务完成时通知我", plugins, 3);
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.category === "notify"), "notify category surfaced");
});

test("search ranks higher scores first", () => {
  const results = search("notification sound when task done", plugins, 10);
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score, "sorted by score descending");
  }
});

test("search with unmatched gibberish returns empty (no false positives)", () => {
  const results = search("asdfghjkl qwertyuiop zxcvbnm", plugins, 5);
  assert.equal(results.length, 0);
});

test("search rejects empty need", () => {
  assert.throws(() => search("   ", plugins), /non-empty/);
});

test("scorePlugin returns structured hits", () => {
  const s = scorePlugin(plugins[0], { en: ["notify"], zh: [] });
  assert.ok(typeof s.score === "number");
  assert.ok(Array.isArray(s.hits));
});


test("search handles CJK mixed with latin needs", () => {
  const results = search("我想在手机上看 DSH 的 web 界面", plugins, 3);
  assert.ok(results.length > 0);
});

test("search caps limit at 10", () => {
  const results = search("notification sound alert", plugins, 100);
  assert.ok(results.length <= 10);
});

test("loadPlugins entries all have valid categories", () => {
  const valid = new Set(["ui","theme","model","session","memory","tools","skill","workflow","notify","dev","market","fun","usage","vision"]);
  for (const p of plugins) assert.ok(valid.has(p.category), "category valid: " + p.name);
});
