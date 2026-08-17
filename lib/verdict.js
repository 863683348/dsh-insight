/**
 * dsh-insight — pure verdict logic: combine health score, security findings,
 * and need match into one decision ("值得装吗"). Zero deps, unit-testable.
 * @module dsh-insight/verdict
 */

/**
 * Decide install-worthiness for one plugin.
 * @param record - catalog record (repo, url, category, ...).
 * @param score - health score from scoring.scoreRecord, or null.
 * @param findings - security findings array (severity high/low + kind).
 * @param needMatch - 0..1 need-match from plugin_guide, or undefined.
 * @returns { decision, security, reasons }
 */
export function verdictFor({ record, score, findings = [], needMatch }) {
  const reasons = [];
  const high = [];
  const warns = [];
  for (const f of findings) {
    if (f && (f.severity === "high" || f.severity === "veto")) high.push(f.kind ?? "finding");
    else if (f && f.severity) warns.push((f.kind ?? "finding") + ":" + f.severity);
  }
  const vetoed = high.length > 0;

  let decision;
  if (vetoed) decision = "avoid";
  else if (needMatch !== undefined && needMatch < 0.25) decision = "research"; // great plugin, wrong fit
  else if (score && score.points >= 70) decision = "install";
  else if (score && score.points >= 40) decision = "caution";
  else decision = "research";

  reasons.push(score ? "health " + score.points + "/100 (" + score.grade + ")" : "no health score");
  if (vetoed) reasons.push("security veto: " + high.join(", "));
  else if (warns.length > 0) reasons.push("security warnings: " + warns.join(", "));
  else if (findings.length === 0) reasons.push("security: not scanned (no local files provided)");
  else reasons.push("security: no high-severity findings");
  if (needMatch !== undefined) reasons.push("need match " + Math.round(needMatch * 100) + "%");
  if (record) reasons.push("category " + (record.category ?? "?"));

  return {
    repo: record?.repo ?? record?.name ?? "?",
    decision,
    security: vetoed ? "veto" : findings.length > 0 ? "warn" : "not-scanned",
    score: score ? score.points : null,
    grade: score ? score.grade : null,
    reasons,
  };
}