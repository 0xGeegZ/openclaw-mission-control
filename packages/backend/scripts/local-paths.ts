/**
 * Path resolution for local scripts that run from packages/backend.
 * Resolves the backend root (directory containing convex/) from cwd or script location.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Returns the backend package root (directory containing convex/).
 * Tries process.cwd() first (e.g. when run via `npm run` from packages/backend), then script dir.
 * @param relativePathFromConvex - Path under convex/ used to detect root (e.g. "seed-skills", "seed-skills-mapping.json").
 * @returns Absolute path to packages/backend.
 * @throws Error if neither cwd nor script dir contains convex/<relativePathFromConvex>.
 */
export function getBackendRoot(relativePathFromConvex: string): string {
  const fromCwd = path.resolve(process.cwd(), "convex", relativePathFromConvex);
  if (fs.existsSync(fromCwd)) {
    return process.cwd();
  }
  const fromScript = path.resolve(
    __dirname,
    "..",
    "convex",
    relativePathFromConvex,
  );
  if (fs.existsSync(fromScript)) {
    return path.resolve(__dirname, "..");
  }
  throw new Error(
    `Could not find convex/${relativePathFromConvex} from cwd (${process.cwd()}) or script dir. Run from packages/backend.`,
  );
}
