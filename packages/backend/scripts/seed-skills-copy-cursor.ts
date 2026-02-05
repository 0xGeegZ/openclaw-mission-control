/**
 * Copies each .cursor/skills subdir SKILL.md to convex/seed-skills (slug = dir name)
 * so seed-skills:generate includes them in contentBySlug. Run from packages/backend.
 */

import * as fs from "fs";
import * as path from "path";
import { getBackendRoot } from "./local-paths";

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
    fs.copyFileSync(src, dest);
    copied++;
  }
  console.log(
    `Copied ${copied} skills from .cursor/skills to convex/seed-skills/`,
  );
}

main();
