import * as fs from "fs";
import * as path from "path";
import { createLogger } from "./logger";
import { MODEL_TO_OPENCLAW, type LLMModel } from "@packages/shared";

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
    contentMarkdown?: string;
  }>;
}

/**
 * Resolves SOUL content for writing to SOUL.md. Uses effectiveSoulContent when non-empty;
 * logs a warning if the content is empty.
 */
function resolveSoulContent(agent: AgentForProfile): string {
  const trimmed = agent.effectiveSoulContent?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;
  log.warn("SOUL content empty for agent; writing empty SOUL.md", {
    agentId: agent._id,
    slug: agent.slug,
    name: agent.name,
  });
  return "";
}

/** Options for syncOpenClawProfiles. */
export interface ProfileSyncOptions {
  workspaceRoot: string;
  configPath: string;
  /** Optional path to AGENTS.md to copy into each workspace; if unset, embedded default is used */
  agentsMdPath?: string;
  /** Optional path to HEARTBEAT.md to copy into each workspace; unset uses embedded default. */
  heartbeatMdPath?: string;
}

/** Default AGENTS.md content when file path is not available (e.g. in Docker runtime container). */
const DEFAULT_AGENTS_MD = `# AGENTS.md - OpenClaw Mission Control Operating Manual

## What you are

You are one specialist in a team of AI agents. You collaborate through OpenClaw Mission Control (tasks, threads, docs). Your job is to move work forward and leave a clear trail.

## Primary repository

- Writable clone (use for all work): /root/clawd/repos/openclaw-mission-control
- Use the writable clone for all git operations. Write artifacts under /root/clawd/deliverables for local use; to share with the primary user, use document_upsert and reference only as [Document](/document/<documentId>). Do not post paths like /deliverables/... in the thread — the user cannot open them.
- One branch per task: use branch feat/task-<taskId> (from your notification); create it from dev before editing, and push/PR only from that branch.

## Non-negotiable rules

1. Everything must be traceable to a task or a doc.
2. If it matters tomorrow, write it down today.
3. Never assume permissions. If you cannot access something, report it and mark the task BLOCKED.
4. Always include evidence when you claim facts.
5. Prefer small, finished increments over large vague progress.
6. Only change code that is strictly required by the current task: do not add nice-to-have changes, refactors, cleanup, or dummy code; if you discover related improvements, create a follow-up task instead.
7. Skill usage is mandatory for in-scope operations:
   - before each operation, check your assigned skills (TOOLS.md + skills/*/SKILL.md)
   - if one or more skills apply, use them instead of ad-hoc behavior
   - in your update, name the skill(s) you used; if none apply, explicitly write "No applicable skill"
8. Replies are single-shot: do not post progress updates. If you spawn subagents, wait and reply once with final results.

## Parallelization (subagents)

- Spawn subagents whenever work can be split into independent pieces; parallelize rather than doing everything sequentially.
- Use the sessions_spawn (or equivalent) capability to run focused sub-tasks in parallel, then aggregate results and reply once with the combined outcome.

## Document sharing (critical)

- When you produce a document or large deliverable, you must use the document_upsert tool (the document sharing tool) so the primary user can see it.
- After calling document_upsert, include the returned documentId and a Markdown link in your thread reply: [Document](/document/<documentId>). Do not post local paths (e.g. /deliverables/PLAN_*.md, /root/clawd/deliverables/...) — the primary user cannot open them.

## Capabilities and tools

- **task_status** — Update the current task's status before posting a reply.
- **task_update** — Update task fields (title, description, priority, labels, assignees, status, dueDate); call before posting when you modify the task.
- **task_create** — Create a new task when you need to spawn follow-up work.
- **document_upsert** — Create or update a document (deliverable, note, template, reference).
- **response_request** — Request a response from other agents; use instead of @mentions.
- **task_load** — Load full task details with recent thread messages.
- **get_agent_skills** — List skills per agent; orchestrator can query specific agents.
- **task_assign** — Assign agents to a task by slug. Use it to update current task assignees when another agent is better suited for the next step.
- **task_message** — Post a message to another task's thread.
- **task_list** (orchestrator only) — List tasks with optional filters.
- **task_get** (orchestrator only) — Fetch task details by ID.
- **task_thread** (orchestrator only) — Fetch recent task thread messages.
- **task_search** (orchestrator only) — Search tasks by title/description/blockers.
- **task_delete** (orchestrator only) — Archive a task with a required reason.
- **task_link_pr** (orchestrator only) — Link a task to a GitHub PR bidirectionally.

## Task state rules

- If you start work: move task to IN_PROGRESS.
- If you need human input, approval, or confirmation (e.g. clarification, design sign-off, credentials): move to BLOCKED and set blockedReason to describe what you need and from whom. Do not use REVIEW for human input — REVIEW is for QA validation only.
- If blocked: move to BLOCKED and explain in blockedReason.
- If done: move to DONE only after QA review passes (QA marks done when configured).
- When the blocker is resolved, an authorized actor (orchestrator or assignee with status permission) must move the task back to IN_PROGRESS before continuing work.
- Update status via the runtime task_status tool or HTTP fallback before claiming status in thread.

## Orchestrator ping requests (required)

When the primary user asks the orchestrator to "ping" one or more agents or tasks:

- Post a task-thread comment on each target task requesting an explicit response from the target agent(s). Use task_message for non-current tasks.
- Send response_request for the same task and recipients so notifications are delivered.
- For multiple tasks, repeat both actions per task.
- If either step fails for any task, report BLOCKED with the failed task IDs/agent slugs.

Before requesting QA or any reviewer to act, move the task to REVIEW first. Do not request QA approval while the task is still in_progress. When you need QA or any other agent to act (e.g. trigger CI, confirm review): call response_request with their slug in this reply — do not only post a thread message saying you are "requesting" or "asking" them; that does not notify them.

When following up on **heartbeat** (requesting status from assignees), use response_request only and put your summary in your final reply; do not use task_message.
`;

/** Default HEARTBEAT.md content when file path is not available (e.g. in Docker runtime container). */
const DEFAULT_HEARTBEAT_MD = `# HEARTBEAT.md - Wake Checklist (Strict)

## 1) Load context (always)

- Read memory/WORKING.md
- Read today's note (memory/YYYY-MM-DD.md)
- Fetch:
  - unread notifications (mentions + thread updates)
  - tasks assigned to me where status != done
  - last 20 activities for the account
- If you are the orchestrator: also review assigned / in_progress / blocked tasks across the account.

## 2) Decide what to do (priority order)

1. A direct @mention to me
2. A task assigned to me and in IN_PROGRESS / ASSIGNED
3. A thread I'm subscribed to with new messages
4. If orchestrator: follow up on assigned / in_progress / blocked tasks even if assigned to others. When requesting status from assignees, use response_request only; put your follow-up summary in your reply (do not also post task_message).
5. Otherwise: scan the activity feed for something I can improve

Avoid posting review status reminders unless you have new feedback or a direct request.

**New assignment:** If the notification is an assignment, your first action must be to acknowledge in 1-2 sentences and ask clarifying questions if needed (@mention orchestrator or primary user). Only after that reply, proceed to substantive work on a later turn.

## 3) Execute one atomic action

Pick one action that can be completed quickly:

- post a clarifying question (only if truly blocked)
- write a doc section
- test a repro step and attach logs
- update a task status with explanation
- refactor a small component (developer agent)
- produce a small deliverable chunk

Do not narrate the checklist or your intent (avoid lines like "I'll check..."). Reply only with a concrete action update or \`HEARTBEAT_OK\`.

Action scope: only do work strictly required by the current task; do not add cleanup, refactors, or nice-to-have changes.
Before executing the action, check your assigned skills and use every relevant skill.
If no assigned skill applies, include "No applicable skill" in your task update.

## 4) Report + persist memory (always)

- If you took a concrete action on a task:
  - Post a thread update using the required format
  - Include a line: \`Task ID: <id>\` so the runtime can attach your update
  - Update WORKING.md (current task, status, next step)
  - Append a short entry to today's log with timestamp
- If you did not take a concrete action:
  - Reply with \`HEARTBEAT_OK\` only
  - Do not post a thread update

## 5) Stand down rules

If you did not act:

- Post \`HEARTBEAT_OK\` only
- Otherwise stay silent to avoid noise
`;

const VERCEL_GATEWAY_MODEL_PREFIX = "vercel-ai-gateway/";

/**
 * Check if the OpenClaw gateway should route models through Vercel AI Gateway.
 */
function isVercelGatewayEnabled(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_AI_GATEWAY_API_KEY?.trim(),
  );
}

/**
 * Maps Convex model identifier to OpenClaw provider/model string.
 * Returns undefined when no mapping exists so gateway defaults apply.
 */
export function mapModelToOpenClaw(
  model: string | undefined,
): string | undefined {
  if (!model || !model.trim()) return undefined;
  const trimmed = model.trim();
  const mapped = MODEL_TO_OPENCLAW[trimmed as LLMModel];
  if (!mapped) return undefined;
  return isVercelGatewayEnabled()
    ? `${VERCEL_GATEWAY_MODEL_PREFIX}${mapped}`
    : mapped;
}

/**
 * Build TOOLS.md content from resolved skills.
 * Lists assigned skills; some may have real SKILL.md files in this workspace.
 * Empty or disabled skills produce "No assigned skills" for stable prompt.
 */
export function buildToolsMd(
  resolvedSkills: AgentForProfile["resolvedSkills"],
): string {
  const header =
    "# Assigned skills\n\nSkill usage policy: before each operation, check this list and use every relevant skill. If no listed skill applies, explicitly state `No applicable skill` in your task update. Some skills have real SKILL.md files in this workspace.\n\n";
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
 * Split YAML frontmatter from markdown content.
 * Returns null when content does not start with a valid frontmatter block.
 */
function splitFrontmatter(
  content: string,
): { frontmatterLines: string[]; body: string } | null {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return null;
  if (lines[0]?.trim() !== "---") return null;

  const endIndex = lines.findIndex(
    (line, idx) => idx > 0 && line.trim() === "---",
  );
  if (endIndex === -1) return null;

  const frontmatterLines = lines.slice(1, endIndex);
  const body = lines
    .slice(endIndex + 1)
    .join("\n")
    .replace(/^\n+/, "");

  return { frontmatterLines, body };
}

function parseYamlFrontmatterScalar(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
    } catch {
      // fall through to raw handling
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    const inner = trimmed.slice(1, -1).replace(/''/g, "'");
    return inner.trim() || null;
  }

  return trimmed;
}

function getFrontmatterField(
  frontmatterLines: string[],
  key: string,
): string | null {
  const prefix = `${key}:`;
  for (const line of frontmatterLines) {
    const trimmedLine = line.trimStart();
    if (!trimmedLine.startsWith(prefix)) continue;
    const rawValue = trimmedLine.slice(prefix.length);
    return parseYamlFrontmatterScalar(rawValue);
  }
  return null;
}

function formatFrontmatterDescription(description: string): string {
  // YAML 1.2 is a superset of JSON; JSON-style quoted strings are valid YAML scalars.
  return JSON.stringify(description);
}

/**
 * Parses the OpenClaw/AgentSkills frontmatter `name` from SKILL.md content.
 * OpenClaw matches skills.entries keys to this name. Returns null if not found.
 */
function parseSkillNameFromFrontmatter(content: string): string | null {
  const parsed = splitFrontmatter(content.trim());
  if (!parsed) return null;
  return getFrontmatterField(parsed.frontmatterLines, "name");
}

/**
 * Ensures content has OpenClaw-required frontmatter (name, description).
 * If missing, prepends frontmatter so the written SKILL.md is valid per docs.openclaw.ai/tools/skills.
 */
function ensureOpenClawFrontmatter(
  content: string,
  slug: string,
  description: string,
): string {
  const trimmed = content.trim();
  const desc = (description || slug)
    .replace(/\r?\n/g, " ")
    .trim()
    .slice(0, 200);

  const parsed = splitFrontmatter(trimmed);
  if (!parsed) {
    return `---
name: ${slug}
description: ${formatFrontmatterDescription(desc)}
---

${trimmed}
`;
  }

  const existingName = getFrontmatterField(parsed.frontmatterLines, "name");
  const existingDescription = getFrontmatterField(
    parsed.frontmatterLines,
    "description",
  );
  if (existingName && existingDescription) return trimmed;

  const ensuredLines = [...parsed.frontmatterLines];

  if (!existingName) {
    ensuredLines.unshift(`name: ${slug}`);
  }

  if (!existingDescription) {
    const descriptionLine = `description: ${formatFrontmatterDescription(desc)}`;
    const nameIndex = ensuredLines.findIndex((l) =>
      l.trimStart().startsWith("name:"),
    );
    if (nameIndex !== -1) {
      ensuredLines.splice(nameIndex + 1, 0, descriptionLine);
    } else {
      ensuredLines.push(descriptionLine);
    }
  }

  return `---
${ensuredLines.join("\n")}
---

${parsed.body.trim()}
`;
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
 * Read HEARTBEAT.md from path or return embedded default.
 */
function getHeartbeatMdContent(heartbeatMdPath: string | undefined): string {
  if (heartbeatMdPath && fs.existsSync(heartbeatMdPath)) {
    try {
      return fs.readFileSync(heartbeatMdPath, "utf-8");
    } catch (e) {
      log.warn("Failed to read HEARTBEAT.md from path, using default", {
        path: heartbeatMdPath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return DEFAULT_HEARTBEAT_MD;
}

/**
 * Sanitize a slug for use in filesystem paths: alphanumeric, hyphen, underscore only.
 * Prevents path traversal (e.g. "..") and path separators. Single implementation for agent/skill slugs.
 * @internal
 */
function safeSlugForPath(slug: string): string | null {
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
 * Sanitize agent slug for use in paths. Same rules as safeSlugForPath.
 * Exported for tests.
 */
export function safeAgentSlug(slug: string): string | null {
  return safeSlugForPath(slug);
}

/**
 * Sanitize skill slug for use in paths. Same rules as safeSlugForPath.
 * Exported for tests.
 */
export function safeSkillSlug(slug: string): string | null {
  return safeSlugForPath(slug);
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
 * Writes SOUL.md, AGENTS.md, HEARTBEAT.md, TOOLS.md and, for skills with contentMarkdown, skills/<slug>/SKILL.md.
 * Generates openclaw.json with agents.list, load.extraDirs, and skills.entries for materialized skills.
 *
 * @returns { configChanged: boolean } — true when the generated config file was written (caller may trigger gateway reload when OPENCLAW_CONFIG_RELOAD=1).
 */
export function syncOpenClawProfiles(
  agents: AgentForProfile[],
  options: ProfileSyncOptions,
): { configChanged: boolean } {
  const { workspaceRoot, configPath, agentsMdPath, heartbeatMdPath } = options;
  const agentsMdContent = getAgentsMdContent(agentsMdPath);
  const heartbeatMdContent = getHeartbeatMdContent(heartbeatMdPath);

  ensureDir(workspaceRoot);

  const rootResolved = path.resolve(workspaceRoot);
  const validAgents: Array<{ agent: AgentForProfile; agentDir: string }> = [];
  const extraDirsSet = new Set<string>();
  /** OpenClaw skills.entries keys: must match frontmatter `name` in each SKILL.md. */
  const materializedSkillKeysSet = new Set<string>();

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

    writeIfChanged(path.join(agentDir, "SOUL.md"), resolveSoulContent(agent));
    writeIfChanged(path.join(agentDir, "AGENTS.md"), agentsMdContent);
    writeIfChanged(path.join(agentDir, "HEARTBEAT.md"), heartbeatMdContent);
    writeIfChanged(
      path.join(agentDir, "TOOLS.md"),
      buildToolsMd(agent.resolvedSkills),
    );

    const skillsDir = path.join(agentDir, "skills");
    for (const skill of agent.resolvedSkills) {
      const rawContent = skill.contentMarkdown?.trim();
      if (!rawContent) continue;
      const safeSlug = safeSkillSlug(skill.slug);
      if (!safeSlug) {
        log.warn("Skipping skill with unsafe slug", {
          skillId: skill._id,
          slug: skill.slug,
        });
        continue;
      }
      const contentToWrite = ensureOpenClawFrontmatter(
        rawContent,
        safeSlug,
        skill.description ?? skill.name,
      );
      const configKey =
        parseSkillNameFromFrontmatter(contentToWrite) ?? safeSlug;
      const skillDir = path.join(skillsDir, safeSlug);
      const skillMdPath = path.join(skillDir, "SKILL.md");
      try {
        ensureDir(skillDir);
        writeIfChanged(skillMdPath, contentToWrite);
        extraDirsSet.add(skillsDir);
        materializedSkillKeysSet.add(configKey);
      } catch (err) {
        log.error("Failed to write SKILL.md; skipping skill", {
          skillId: skill._id,
          slug: safeSlug,
          path: skillMdPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
    Array.from(extraDirsSet),
    Array.from(materializedSkillKeysSet),
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
  try {
    fs.writeFileSync(configPath, configJson, "utf-8");
  } catch (err) {
    log.error("Failed to write OpenClaw config; sync partial", {
      path: configPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return { configChanged: false };
  }
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
 * Build openclaw.json structure: agents.list[], load.extraDirs, skills.entries.
 * agents.defaults.skipBootstrap: true; per-agent model from mapModelToOpenClaw when configured.
 * skills.entries keys must match the frontmatter `name` in each SKILL.md (OpenClaw convention).
 */
function buildOpenClawConfig(
  agents: AgentWithWorkspacePath[],
  _workspaceRoot: string,
  extraDirs: string[],
  materializedSkillKeys: string[],
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

  const result: Record<string, unknown> = {
    agents: {
      defaults: {
        skipBootstrap: true,
      },
      list,
    },
  };

  if (extraDirs.length > 0) {
    result.load = { extraDirs };
  }
  if (materializedSkillKeys.length > 0) {
    const entries: Record<string, { enabled: boolean }> = {};
    for (const key of materializedSkillKeys) {
      entries[key] = { enabled: true };
    }
    result.skills = { entries };
  }

  return result;
}
