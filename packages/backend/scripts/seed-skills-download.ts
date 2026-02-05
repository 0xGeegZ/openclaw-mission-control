/**
 * Downloads SKILL.md content from GitHub for each entry in seed-skills-mapping.json
 * and writes them to convex/seed-skills/<slug>.md. For local use only (run from packages/backend).
 */

import * as fs from "fs";
import * as path from "path";
import { getBackendRoot } from "./local-paths";

const DEFAULT_BRANCH = "main";
const RAW_BASE = "https://raw.githubusercontent.com";

interface MappingEntry {
  source: string;
  path: string;
  branch?: string;
}

type Mapping = Record<string, MappingEntry>;

/**
 * Loads and validates seed-skills-mapping.json. Throws with an actionable message on invalid JSON or shape.
 */
function loadMapping(root: string): Mapping {
  const p = path.join(root, "convex", "seed-skills-mapping.json");
  let raw: string;
  try {
    raw = fs.readFileSync(p, "utf-8");
  } catch (err) {
    throw new Error(`Cannot read mapping file at ${p}: ${err instanceof Error ? err.message : err}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in seed-skills-mapping.json: ${err instanceof Error ? err.message : err}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("seed-skills-mapping.json must be an object mapping slug to { source, path }");
  }
  const mapping = data as Record<string, unknown>;
  for (const [slug, entry] of Object.entries(mapping)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Mapping entry for slug "${slug}" must be an object with source and path`);
    }
    const e = entry as Record<string, unknown>;
    const source = e.source;
    const filePath = e.path;
    if (typeof source !== "string" || !source.includes("/")) {
      throw new Error(`Mapping entry "${slug}": source must be "owner/repo" (got ${typeof source})`);
    }
    if (typeof filePath !== "string" || filePath.length === 0) {
      throw new Error(`Mapping entry "${slug}": path must be a non-empty string`);
    }
  }
  return mapping as Mapping;
}

function rawUrl(ownerRepo: string, filePath: string, branch: string): string {
  return `${RAW_BASE}/${ownerRepo}/${branch}/${filePath}`;
}

/**
 * Fetches one SKILL.md from GitHub raw and writes to outDir/<slug>.md.
 */
async function downloadOne(
  slug: string,
  entry: MappingEntry,
  outDir: string,
): Promise<void> {
  const parts = entry.source.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid source "${entry.source}" for slug ${slug}; expected "owner/repo"`);
  }
  const branch = entry.branch ?? DEFAULT_BRANCH;
  const url = rawUrl(entry.source, entry.path, branch);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const outPath = path.join(outDir, `${slug}.md`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, text, "utf-8");
  console.log(`  ${slug} -> ${path.relative(path.join(outDir, "..", ".."), outPath)}`);
}

/**
 * Entry point: loads mapping, downloads each skill to convex/seed-skills/, exits 1 on first failure.
 */
async function main(): Promise<void> {
  const root = getBackendRoot("seed-skills-mapping.json");
  const mapping = loadMapping(root);
  const outDir = path.join(root, "convex", "seed-skills");

  if (Object.keys(mapping).length === 0) {
    console.log("No entries in seed-skills-mapping.json; nothing to download.");
    return;
  }

  console.log("Seed skills download (from seed-skills-mapping.json)");
  for (const [slug, entry] of Object.entries(mapping)) {
    try {
      await downloadOne(slug, entry, outDir);
    } catch (err) {
      console.error(`Failed to download ${slug}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  console.log(`Done. ${Object.keys(mapping).length} skills written to convex/seed-skills/`);
}

main();
