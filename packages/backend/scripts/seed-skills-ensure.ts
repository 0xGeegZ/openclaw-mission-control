/**
 * Ensures generated seed skills artifacts exist before Convex seed runs.
 * Fails fast with actionable guidance when artifacts are missing.
 */
import * as fs from "fs";
import * as path from "path";
import { getBackendRoot } from "./local-paths";

const REQUIRED_SEED_SKILLS_MIN_COUNT = 1;

/**
 * Lists markdown files in a directory, returning only .md files.
 */
function listMarkdownFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
}

/**
 * Returns the latest modification time (ms) across provided paths.
 */
function getLatestMtimeMs(paths: string[]): number {
  let latest = 0;
  for (const filePath of paths) {
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs > latest) latest = stat.mtimeMs;
  }
  return latest;
}

/**
 * Verifies seed skills artifacts exist and are non-empty.
 */
function ensureSeedSkillsArtifacts(): void {
  const root = getBackendRoot("seed-skills");
  const skillsDir = path.join(root, "convex", "seed-skills");
  const generatedPath = path.join(
    root,
    "convex",
    "seed_skills_content.generated.ts",
  );

  const markdownFiles = listMarkdownFiles(skillsDir);
  if (markdownFiles.length < REQUIRED_SEED_SKILLS_MIN_COUNT) {
    throw new Error(
      "No seed skill markdown files found in convex/seed-skills. Run: npm run seed-skills:sync",
    );
  }

  if (!fs.existsSync(generatedPath)) {
    throw new Error(
      "Missing convex/seed_skills_content.generated.ts. Run: npm run seed-skills:generate",
    );
  }

  const markdownPaths = markdownFiles.map((file) => path.join(skillsDir, file));
  const latestMarkdownMtimeMs = getLatestMtimeMs(markdownPaths);
  const generatedMtimeMs = fs.statSync(generatedPath).mtimeMs;
  if (generatedMtimeMs < latestMarkdownMtimeMs) {
    throw new Error(
      "Seed skills generated file is out of date. Run: npm run seed-skills:generate (or seed-skills:sync to refresh sources)",
    );
  }

  const generatedContents = fs.readFileSync(generatedPath, "utf-8");
  if (!generatedContents.includes("contentBySlug")) {
    throw new Error(
      "Generated seed skills file is invalid or empty. Run: npm run seed-skills:generate",
    );
  }
}

/**
 * Entry point: validate seed skills artifacts and exit non-zero on failure.
 */
function main(): void {
  try {
    ensureSeedSkillsArtifacts();
    console.log("Seed skills artifacts verified.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
