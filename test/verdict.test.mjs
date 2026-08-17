import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictFor } from "../lib/verdict.js";

const rec = { repo: "a/b", category: "tools" };

test("high-severity security finding vetoes to avoid", () => {
  const v = verdictFor({ record: rec, score: { points: 90, grade: "A" }, findings: [{ severity: "high", kind: "credential-exfil" }] });
  assert.equal(v.decision, "avoid");
  assert.equal(v.security, "veto");
  assert.ok(v.reasons.some((r) => r.includes("veto")));
});

test("clean high score with need match -> install", () => {
  const v = verdictFor({ record: rec, score: { points: 85, grade: "A" }, findings: [], needMatch: 0.8 });
  assert.equal(v.decision, "install");
  assert.equal(v.security, "not-scanned");
});

test("high score without need match still installs (curated quality)", () => {
  const v = verdictFor({ record: rec, score: { points: 80, grade: "A" }, findings: [] });
  assert.equal(v.decision, "install");
});

test("mid score -> caution", () => {
  const v = verdictFor({ record: rec, score: { points: 55, grade: "C" }, findings: [] });
  assert.equal(v.decision, "caution");
});

test("low score or low need match -> research", () => {
  const v1 = verdictFor({ record: rec, score: { points: 20, grade: "F" }, findings: [] });
  assert.equal(v1.decision, "research");
  const v2 = verdictFor({ record: rec, score: { points: 75, grade: "A" }, findings: [], needMatch: 0.05 });
  assert.equal(v2.decision, "research");
});

test("no score -> research with clear reason", () => {
  const v = verdictFor({ record: rec, score: null, findings: [] });
  assert.equal(v.decision, "research");
  assert.ok(v.reasons.some((r) => r.includes("no health score")));
});

test("low-severity findings warn but do not veto", () => {
  const v = verdictFor({ record: rec, score: { points: 80, grade: "A" }, findings: [{ severity: "low", kind: "eval-usage" }] });
  assert.equal(v.decision, "install");
  assert.equal(v.security, "warn");
});


test("verdict with findings param default (undefined) is safe", () => {
  const v = verdictFor({ record: rec, score: { points: 80, grade: "A" } });
  assert.equal(v.decision, "install");
  assert.equal(v.security, "not-scanned");
});

test("verdict reasons include category", () => {
  const v = verdictFor({ record: rec, score: { points: 80, grade: "A" } });
  assert.ok(v.reasons.some((r) => r.includes("tools")));
});
