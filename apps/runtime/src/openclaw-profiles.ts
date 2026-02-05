import * as fs from "fs";
import * as path from "path";
import { createLogger } from "./logger";

const log = createLogger("[OpenClawProfiles]");

/** Agent payload from listAgentsForRuntime (effectiveSoulContent, resolvedSkills). */
export interface AgentForProfile {
  _id: string;
  name: string;
  slug: string;
  role: string;
  sessionKey: string;
  openclawConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    skillIds?: unknown[];
    [key: string]: unknown;
  };
  effectiveSoulContent: string;
  resolvedSkills: Array<{
    _id: string;
    name: string;
    slug: string;
    description?: string;
  }>;
}

/** Options for syncOpenClawProfiles. */
export interface ProfileSyncOptions {
  workspaceRoot: string;
  configPath: string;
  /** Optional path to AGENTS.md to copy into each workspace; if unset, embedded default is used */
  agentsMdPath?: string;
}

/** Default AGENTS.md content when file path is not available (e.g. in Docker runtime container). */
const DEFAULT_AGENTS_MD = `# AGENTS.md - OpenClaw Mission Control Operating Manual

## What you are

You are one specialist in a team of AI agents. You collaborate through OpenClaw Mission Control (tasks, threads, docs). Your job is to move work forward and leave a clear trail.

## Primary repository

- Writable clone (use for all work): /root/clawd/repos/openclaw-mission-control
- Use the writable clone for all git operations. Write artifacts to /root/clawd/deliverables.

## Non-negotiable rules

1. Everything must be traceable to a task or a doc.
2. If it matters tomorrow, write it down today.
3. Never assume permissions. If you cannot access something, report it and mark the task BLOCKED.
4. Always include evidence when you claim facts.
5. Prefer small, finished increments over large vague progress.

## Task state rules

- If you start work: move task to IN_PROGRESS.
- If you need human review: move to REVIEW.
- If blocked: move to BLOCKED and explain.
- If done: move to DONE, post final summary.
- Update status via the runtime task_status tool or HTTP fallback before claiming status in thread.
`;

const MODEL_MAP: Record<string, string> = {
  "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4-5",
  "claude-opus-4-20250514": "anthropic/claude-opus-4-5",
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
};

/**
 * Maps Convex model identifier to OpenClaw provider/model string.
 * Returns undefined when no mapping exists so gateway defaults apply.
 */
export function mapModelToOpenClaw(
  model: string | undefined,
): string | undefined {
  if (!model || !model.trim()) return undefined;
  const trimmed = model.trim();
  return MODEL_MAP[trimmed];
}

/**
 * Build TOOLS.md content from resolved skills (prompt-only list).
 * Empty or disabled skills produce "No assigned skills" for stable prompt.
 */
export function buildToolsMd(
  resolvedSkills: AgentForProfile["resolvedSkills"],
): string {
  const header =
    "# Assigned skills\n\nUse these capabilities when relevant. Prompt-only; no SKILL.md files.\n\n";
  if (!resolvedSkills || resolvedSkills.length === 0) {
    return header + "- No assigned skills\n";
  }
  const bullets = resolvedSkills
    .map((s) => {
      const desc = s.description?.trim() ? ` — ${s.description}` : "";
      return `- **${s.name}** (${s.slug})${desc}`;
    })
    .join("\n");
  return header + bullets + "\n";
}

/**
 * Simple content hash for change detection (non-crypto).
 */
function contentHash(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return String(h);
}

/**
 * Ensure directory exists; create and parent chain if needed.
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Read AGENTS.md from path or return embedded default.
 */
function getAgentsMdContent(agentsMdPath: string | undefined): string {
  if (agentsMdPath && fs.existsSync(agentsMdPath)) {
    try {
      return fs.readFileSync(agentsMdPath, "utf-8");
    } catch (e) {
      log.warn("Failed to read AGENTS.md from path, using default", {
        path: agentsMdPath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return DEFAULT_AGENTS_MD;
}

/**
 * Sanitize agent slug for use in paths: allow only alphanumeric, hyphen, underscore.
 * Prevents path traversal (e.g. "..") and subpaths. Returns null if invalid.
 * Exported for tests.
 */
export function safeAgentSlug(slug: string): string | null {
  if (typeof slug !== "string" || !slug.trim()) return null;
  const trimmed = slug.trim();
  const sanitized = trimmed.replace(/^\/+|\/+$/g, "");
  if (!sanitized || sanitized.includes("..") || /[\/\\]/.test(sanitized)) {
    return null;
  }
  if (/[^a-zA-Z0-9_-]/.test(sanitized)) return null;
  return sanitized;
}

/**
 * Resolve agent directory path and ensure it stays under workspaceRoot.
 * Returns null if slug is unsafe or path would escape workspace.
 */
function resolveAgentDir(workspaceRoot: string, slug: string): string | null {
  const safe = safeAgentSlug(slug);
  if (!safe) return null;
  const rootResolved = path.resolve(workspaceRoot);
  const agentDir = path.resolve(rootResolved, safe);
  if (!agentDir.startsWith(rootResolved) || agentDir === rootResolved) {
    return null;
  }
  const relative = path.relative(rootResolved, agentDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return agentDir;
}

/**
 * Write file only if content changed (by hash) to avoid unnecessary churn.
 */
function writeIfChanged(filePath: string, content: string): boolean {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const newHash = contentHash(content);
  let existing = "";
  try {
    existing = fs.readFileSync(filePath, "utf-8");
  } catch {
    // file missing, write
  }
  if (contentHash(existing) === newHash) return false;
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

/**
 * Sync per-agent workspace files and generate openclaw.json.
 * Returns true if the generated config file changed (caller may trigger gateway reload).
 */
export function syncOpenClawProfiles(
  agents: AgentForProfile[],
  options: ProfileSyncOptions,
): { configChanged: boolean } {
  const { workspaceRoot, configPath, agentsMdPath } = options;
  const agentsMdContent = getAgentsMdContent(agentsMdPath);

  ensureDir(workspaceRoot);

  const rootResolved = path.resolve(workspaceRoot);
  const validAgents: Array<{ agent: AgentForProfile; agentDir: string }> = [];

  for (const agent of agents) {
    const agentDir = resolveAgentDir(workspaceRoot, agent.slug);
    if (!agentDir) {
      log.warn("Skipping agent with unsafe slug", {
        agentId: agent._id,
        slug: agent.slug,
      });
      continue;
    }
    validAgents.push({ agent, agentDir });
    ensureDir(agentDir);

    writeIfChanged(path.join(agentDir, "SOUL.md"), agent.effectiveSoulContent);
    writeIfChanged(path.join(agentDir, "AGENTS.md"), agentsMdContent);
    writeIfChanged(
      path.join(agentDir, "TOOLS.md"),
      buildToolsMd(agent.resolvedSkills),
    );

    const memoryDir = path.join(agentDir, "memory");
    const deliverablesDir = path.join(agentDir, "deliverables");
    ensureDir(memoryDir);
    ensureDir(deliverablesDir);

    const memoryMd = path.join(agentDir, "MEMORY.md");
    const workingMd = path.join(memoryDir, "WORKING.md");
    if (!fs.existsSync(memoryMd)) {
      fs.writeFileSync(
        memoryMd,
        "# MEMORY\n\nStable decisions and key learnings.\n",
        "utf-8",
      );
    }
    if (!fs.existsSync(workingMd)) {
      fs.writeFileSync(
        workingMd,
        "# WORKING\n\nWhat I'm doing right now.\n",
        "utf-8",
      );
    }
  }

  const openclawConfig = buildOpenClawConfig(
    validAgents.map(({ agent, agentDir }) => ({
      ...agent,
      _workspacePath: agentDir,
    })),
    rootResolved,
  );
  const configJson = JSON.stringify(openclawConfig, null, 2);
  const configDir = path.dirname(configPath);
  ensureDir(configDir);

  let configChanged = false;
  let existingConfig = "";
  try {
    existingConfig = fs.readFileSync(configPath, "utf-8");
  } catch {
    configChanged = true;
  }
  if (
    !configChanged &&
    contentHash(existingConfig) === contentHash(configJson)
  ) {
    return { configChanged: false };
  }
  fs.writeFileSync(configPath, configJson, "utf-8");
  configChanged = true;
  log.info("OpenClaw config written", {
    path: configPath,
    agentsCount: validAgents.length,
    skipped: agents.length - validAgents.length,
  });
  return { configChanged };
}

/** Agent with resolved workspace path (from safe-slug validation). */
interface AgentWithWorkspacePath extends AgentForProfile {
  _workspacePath: string;
}

/**
 * Build openclaw.json structure: agents.list[] with id=slug, workspace path, identity name.
 * agents.defaults.skipBootstrap: true; per-agent model from mapModelToOpenClaw when mapped.
 * Caller must pass only agents that passed resolveAgentDir (use _workspacePath).
 */
function buildOpenClawConfig(
  agents: AgentWithWorkspacePath[],
  _workspaceRoot: string,
): Record<string, unknown> {
  const list = agents.map((agent) => {
    const entry: Record<string, unknown> = {
      id: agent.slug,
      workspace: agent._workspacePath,
      identity: { name: agent.name },
    };
    const mappedModel = mapModelToOpenClaw(agent.openclawConfig?.model);
    if (mappedModel) {
      entry.model = mappedModel;
    }
    return entry;
  });

  return {
    agents: {
      defaults: {
        skipBootstrap: true,
      },
      list,
    },
  };
}
