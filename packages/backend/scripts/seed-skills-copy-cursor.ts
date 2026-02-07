/**
 * Copies each .cursor/skills subdir SKILL.md to convex/seed-skills (slug = dir name)
 * so seed-skills:generate includes them in contentBySlug. Run from packages/backend.
 */

import * as fs from "fs";
import * as path from "path";
import { getBackendRoot } from "./local-paths";

/**
 * Remove disable-model-invocation from frontmatter so model lists these skills.
 */
function stripDisableModelInvocation(content: string): string {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return content;
  const endIndex = lines.findIndex(
    (line, idx) => idx > 0 && line.trim() === "---",
  );
  if (endIndex === -1) return content;

  const frontmatter = lines.slice(1, endIndex);
  const filtered = frontmatter.filter(
    (line) => !line.trimStart().startsWith("disable-model-invocation:"),
  );
  if (filtered.length === frontmatter.length) return content;

  return ["---", ...filtered, "---", ...lines.slice(endIndex + 1)].join("\n");
}

/**
 * Copies each .cursor/skills/<dir>/SKILL.md to convex/seed-skills/<dir>.md.
 * Repo root is assumed to be two levels above backend root (monorepo).
 */
function main(): void {
  const root = getBackendRoot("seed-skills");
  const repoRoot = path.join(root, "..", "..");
  const cursorSkillsDir = path.join(repoRoot, ".cursor", "skills");
  const outDir = path.join(root, "convex", "seed-skills");

  if (!fs.existsSync(cursorSkillsDir)) {
    console.warn(".cursor/skills not found; skipping copy.");
    return;
  }

  const dirs = fs
    .readdirSync(cursorSkillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let copied = 0;
  for (const dir of dirs) {
    const src = path.join(cursorSkillsDir, dir, "SKILL.md");
    if (!fs.existsSync(src)) continue;
    const dest = path.join(outDir, `${dir}.md`);
    const raw = fs.readFileSync(src, "utf-8");
    const cleaned = stripDisableModelInvocation(raw);
    fs.writeFileSync(dest, cleaned, "utf-8");
    copied++;
  }
  console.log(
    `Copied ${copied} skills from .cursor/skills to convex/seed-skills/`,
  );
}

main();
