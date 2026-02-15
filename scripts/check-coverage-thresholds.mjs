#!/usr/bin/env node
/* global console, process */
/**
 * Parses Istanbul-style coverage-final.json (v8 output) and enforces
 * coverage thresholds per package. Exits 1 if any package is below threshold.
 *
 * Run after `npm run test:coverage`. Expects coverage in:
 *   packages/backend/coverage/coverage-final.json
 *   apps/web/coverage/coverage-final.json
 *   apps/runtime/coverage/coverage-final.json
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PACKAGES = [
  {
    name: "Backend",
    path: resolve(ROOT, "packages/backend/coverage/coverage-final.json"),
    thresholds: { lines: 70, functions: 70, statements: 70, branches: 60 },
  },
  {
    name: "Frontend",
    path: resolve(ROOT, "apps/web/coverage/coverage-final.json"),
    thresholds: { lines: 50, functions: 50, statements: 50, branches: 40 },
  },
  {
    name: "Runtime",
    path: resolve(ROOT, "apps/runtime/coverage/coverage-final.json"),
    thresholds: { lines: 60, functions: 60, statements: 60, branches: 50 },
  },
];

/**
 * Compute global coverage percentages from Istanbul coverage-final.json.
 * @param {Record<string, { s: Record<string, number>, f: Record<string, number>, b: Record<string, number[]>, statementMap?: Record<string, { start: { line: number }, end: { line: number } }> }>} cov
 * @returns {{ lines: number, functions: number, statements: number, branches: number }}
 */
function computeCoverage(cov) {
  let stTotal = 0,
    stCovered = 0;
  let fnTotal = 0,
    fnCovered = 0;
  let brTotal = 0,
    brCovered = 0;
  const linesByFile = new Map(); // file -> { total: number, covered: number } (unique lines)

  for (const [file, data] of Object.entries(cov)) {
    if (!data.s) continue;
    for (const [, count] of Object.entries(data.s)) {
      stTotal += 1;
      if (Number(count) > 0) stCovered += 1;
    }
    for (const [, count] of Object.entries(data.f || {})) {
      fnTotal += 1;
      if (Number(count) > 0) fnCovered += 1;
    }
    for (const [, pair] of Object.entries(data.b || {})) {
      const [hit] = Array.isArray(pair) ? pair : [0, 0];
      brTotal += 1;
      if (Number(hit) > 0) brCovered += 1;
    }
    if (data.statementMap) {
      let totalLines = new Set();
      let coveredLines = new Set();
      for (const [id, map] of Object.entries(data.statementMap)) {
        const line = map?.start?.line ?? map?.end?.line;
        if (line != null) totalLines.add(line);
        if (Number(data.s[id]) > 0 && line != null) coveredLines.add(line);
      }
      linesByFile.set(file, {
        total: totalLines.size,
        covered: coveredLines.size,
      });
    }
  }

  let lineTotal = 0,
    lineCovered = 0;
  for (const { total, covered } of linesByFile.values()) {
    lineTotal += total;
    lineCovered += covered;
  }
  if (lineTotal === 0 && stTotal > 0) {
    lineTotal = stTotal;
    lineCovered = stCovered;
  }

  return {
    lines: lineTotal ? (100 * lineCovered) / lineTotal : 0,
    functions: fnTotal ? (100 * fnCovered) / fnTotal : 0,
    statements: stTotal ? (100 * stCovered) / stTotal : 0,
    branches: brTotal ? (100 * brCovered) / brTotal : 0,
  };
}

function main() {
  console.log("Coverage thresholds (enforced by this step):\n");
  let failed = false;

  for (const pkg of PACKAGES) {
    if (!existsSync(pkg.path)) {
      console.error(`Missing coverage report: ${pkg.path}`);
      failed = true;
      continue;
    }
    const raw = readFileSync(pkg.path, "utf8");
    let cov;
    try {
      cov = JSON.parse(raw);
    } catch (e) {
      console.error(`Invalid JSON: ${pkg.path}`, e.message);
      failed = true;
      continue;
    }
    const pct = computeCoverage(cov);
    const t = pkg.thresholds;
    const linesOk = pct.lines >= t.lines;
    const fnOk = pct.functions >= t.functions;
    const stOk = pct.statements >= t.statements;
    const brOk = pct.branches >= t.branches;
    if (!linesOk || !fnOk || !stOk || !brOk) failed = true;
    const status = linesOk && fnOk && stOk && brOk ? "✓" : "✗";
    console.log(
      `  ${pkg.name}: ${status} lines ${pct.lines.toFixed(1)}% (≥${t.lines}%) | functions ${pct.functions.toFixed(1)}% (≥${t.functions}%) | statements ${pct.statements.toFixed(1)}% (≥${t.statements}%) | branches ${pct.branches.toFixed(1)}% (≥${t.branches}%)`,
    );
  }

  console.log("");
  if (failed) {
    console.error(
      "One or more packages are below the required coverage thresholds.",
    );
    process.exit(1);
  }
  console.log("All coverage thresholds met.");
}

main();
