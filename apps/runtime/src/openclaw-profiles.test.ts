/**
 * Unit tests for OpenClaw profile sync: model mapping, TOOLS.md, slug safety, config shape.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect } from "vitest";
import {
  mapModelToOpenClaw,
  buildToolsMd,
  safeAgentSlug,
  safeSkillSlug,
  syncOpenClawProfiles,
  type AgentForProfile,
} from "./openclaw-profiles";

/**
 * Temporarily set environment variables for a single test.
 */
function withTempEnv(
  updates: Record<string, string | undefined>,
  fn: () => void,
): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("mapModelToOpenClaw", () => {
  it("maps known Convex model ids to OpenClaw provider/model strings", () => {
    withTempEnv(
      { AI_GATEWAY_API_KEY: undefined, VERCEL_AI_GATEWAY_API_KEY: undefined },
      () => {
        expect(mapModelToOpenClaw("minimax-m2.5")).toBe("minimax/minimax-m2.5");
        expect(mapModelToOpenClaw("claude-haiku-4.5")).toBe(
          "anthropic/claude-haiku-4.5",
        );
        expect(mapModelToOpenClaw("kimi-k2.5")).toBe("moonshotai/kimi-k2.5");
        expect(mapModelToOpenClaw("gpt-5-nano")).toBe("openai/gpt-5-nano");
      },
    );
  });

  it("maps models through Vercel AI Gateway when configured", () => {
    withTempEnv({ VERCEL_AI_GATEWAY_API_KEY: "test-key" }, () => {
      expect(mapModelToOpenClaw("minimax-m2.5")).toBe(
        "vercel-ai-gateway/minimax/minimax-m2.5",
      );
      expect(mapModelToOpenClaw("claude-haiku-4.5")).toBe(
        "vercel-ai-gateway/anthropic/claude-haiku-4.5",
      );
      expect(mapModelToOpenClaw("kimi-k2.5")).toBe(
        "vercel-ai-gateway/moonshotai/kimi-k2.5",
      );
      expect(mapModelToOpenClaw("gpt-5-nano")).toBe(
        "vercel-ai-gateway/openai/gpt-5-nano",
      );
    });
  });

  it("returns undefined for unknown model", () => {
    expect(mapModelToOpenClaw("unknown-model")).toBeUndefined();
    expect(mapModelToOpenClaw("claude-3-opus")).toBeUndefined();
  });

  it("returns undefined for empty or whitespace", () => {
    expect(mapModelToOpenClaw(undefined)).toBeUndefined();
    expect(mapModelToOpenClaw("")).toBeUndefined();
    expect(mapModelToOpenClaw("   ")).toBeUndefined();
  });

  it("trims input before lookup", () => {
    withTempEnv(
      { AI_GATEWAY_API_KEY: undefined, VERCEL_AI_GATEWAY_API_KEY: undefined },
      () => {
        expect(mapModelToOpenClaw("  gpt-5-nano  ")).toBe("openai/gpt-5-nano");
      },
    );
  });
});

describe("buildToolsMd", () => {
  it("returns header and 'No assigned skills' when empty", () => {
    const out = buildToolsMd([]);
    expect(out).toContain("# Assigned skills");
    expect(out).toContain("No assigned skills");
  });

  it("returns header and bullet list for one skill", () => {
    const out = buildToolsMd([
      {
        _id: "s1",
        name: "Web Search",
        slug: "web-search",
        description: "Search the web.",
      },
    ]);
    expect(out).toContain("# Assigned skills");
    expect(out).toContain("**Web Search**");
    expect(out).toContain("(web-search)");
    expect(out).toContain("Search the web.");
  });

  it("returns multiple bullets for multiple skills", () => {
    const out = buildToolsMd([
      { _id: "s1", name: "A", slug: "a" },
      { _id: "s2", name: "B", slug: "b", description: "B desc" },
    ]);
    expect(out).toContain("**A**");
    expect(out).toContain("**B**");
    expect(out).toContain("B desc");
  });

  it("handles missing description", () => {
    const out = buildToolsMd([{ _id: "s1", name: "X", slug: "x" }]);
    expect(out).toContain("**X** (x)");
    expect(out).not.toContain(" — ");
  });
});

describe("safeAgentSlug", () => {
  it("accepts alphanumeric, hyphen, underscore", () => {
    expect(safeAgentSlug("engineer")).toBe("engineer");
    expect(safeAgentSlug("squad-lead")).toBe("squad-lead");
    expect(safeAgentSlug("agent_1")).toBe("agent_1");
  });

  it("rejects path traversal and path separators", () => {
    expect(safeAgentSlug("..")).toBeNull();
    expect(safeAgentSlug("../etc")).toBeNull();
    expect(safeAgentSlug("a/../b")).toBeNull();
    expect(safeAgentSlug("a/b")).toBeNull();
  });

  it("rejects empty or invalid", () => {
    expect(safeAgentSlug("")).toBeNull();
    expect(safeAgentSlug("   ")).toBeNull();
    expect(safeAgentSlug("slug with spaces")).toBeNull();
    expect(safeAgentSlug("slug.dots")).toBeNull();
  });

  it("trims and strips leading/trailing slashes", () => {
    expect(safeAgentSlug("  engineer  ")).toBe("engineer");
    expect(safeAgentSlug("/engineer/")).toBe("engineer");
  });
});

describe("safeSkillSlug", () => {
  it("accepts alphanumeric, hyphen, underscore", () => {
    expect(safeSkillSlug("github-issue-triage")).toBe("github-issue-triage");
    expect(safeSkillSlug("skill_1")).toBe("skill_1");
  });

  it("rejects path traversal and path separators", () => {
    expect(safeSkillSlug("..")).toBeNull();
    expect(safeSkillSlug("a/b")).toBeNull();
  });

  it("rejects empty or invalid", () => {
    expect(safeSkillSlug("")).toBeNull();
    expect(safeSkillSlug("slug with spaces")).toBeNull();
  });
});

describe("syncOpenClawProfiles", () => {
  /**
   * Build a YYYY-MM-DD date string in UTC with day offset.
   */
  function utcDayString(now: Date, offsetDays: number): string {
    const utc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
    );
    return new Date(utc).toISOString().slice(0, 10);
  }

  it("writes openclaw.json with agents.list and skipBootstrap", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const agents: AgentForProfile[] = [
      {
        _id: "agent1",
        name: "Engineer",
        slug: "engineer",
        role: "Engineer",
        effectiveSoulContent: "# SOUL\n",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [],
      },
    ];
    const result = syncOpenClawProfiles(agents, {
      workspaceRoot: path.join(tmp, "agents"),
      configPath,
    });
    expect(result.configChanged).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.agents?.defaults?.skipBootstrap).toBe(true);
    expect(Array.isArray(config.agents?.list)).toBe(true);
    expect(config.agents.list).toHaveLength(1);
    expect(config.agents.list[0]).toMatchObject({
      id: "engineer",
      identity: { name: "Engineer" },
    });
    expect(config.agents.list[0].workspace).toContain("engineer");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("maps workspace paths in generated config when configWorkspaceRoot differs", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const workspaceRoot = path.join(tmp, "agents-runtime");
    const configWorkspaceRoot = "/root/clawd/agents";
    const agents: AgentForProfile[] = [
      {
        _id: "agent1",
        name: "Engineer",
        slug: "engineer",
        role: "Engineer",
        effectiveSoulContent: "# SOUL\n",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [
          {
            _id: "s1",
            name: "Web Search",
            slug: "web-search",
            contentMarkdown: "# Web Search\n\nSearch the web.\n",
          },
        ],
      },
    ];
    syncOpenClawProfiles(agents, {
      workspaceRoot,
      configWorkspaceRoot,
      configPath,
    });
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.agents.list[0].workspace).toBe("/root/clawd/agents/engineer");
    expect(config.load.extraDirs).toContain(
      "/root/clawd/agents/engineer/skills",
    );

    const sourceWorkspaceDir = path.join(workspaceRoot, "engineer");
    expect(fs.existsSync(sourceWorkspaceDir)).toBe(true);
    expect(fs.existsSync(path.join(sourceWorkspaceDir, "SOUL.md"))).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("skips agents with unsafe slug and does not add them to config", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Bad",
        slug: "..",
        role: "Role",
        effectiveSoulContent: "# SOUL",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [],
      },
      {
        _id: "a2",
        name: "Good",
        slug: "good",
        role: "Role",
        effectiveSoulContent: "# SOUL",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [],
      },
    ];
    syncOpenClawProfiles(agents, {
      workspaceRoot: path.join(tmp, "agents"),
      configPath,
    });
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.agents.list).toHaveLength(1);
    expect(config.agents.list[0].id).toBe("good");
    const agentsDir = path.join(tmp, "agents");
    const entries = fs.readdirSync(agentsDir);
    expect(entries).not.toContain("..");
    expect(entries).toContain("good");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("includes per-agent model when mapped", () => {
    withTempEnv(
      { AI_GATEWAY_API_KEY: undefined, VERCEL_AI_GATEWAY_API_KEY: undefined },
      () => {
        const tmp = fs.mkdtempSync(
          path.join(os.tmpdir(), "openclaw-profiles-"),
        );
        const configPath = path.join(tmp, "openclaw.json");
        const agents: AgentForProfile[] = [
          {
            _id: "a1",
            name: "GPT-5 Nano",
            slug: "gpt-5-nano",
            role: "R",
            openclawConfig: { model: "gpt-5-nano" },
            effectiveSoulContent: "# SOUL",
            effectiveUserMd: "# User\n",
            effectiveIdentityContent: "# IDENTITY\n",
            resolvedSkills: [],
          },
        ];
        syncOpenClawProfiles(agents, {
          workspaceRoot: path.join(tmp, "agents"),
          configPath,
        });
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        expect(config.agents.list[0].model).toBe("openai/gpt-5-nano");
        fs.rmSync(tmp, { recursive: true, force: true });
      },
    );
  });

  it("writes SKILL.md for resolved skills with contentMarkdown (OpenClaw frontmatter ensured)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const workspaceRoot = path.join(tmp, "agents");
    const skillContent = "# Test skill\n\nDo something useful.\n";
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Engineer",
        slug: "engineer",
        role: "R",
        effectiveSoulContent: "# SOUL",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [
          {
            _id: "s1",
            name: "Test Skill",
            slug: "test-skill",
            description: "A test",
            contentMarkdown: skillContent,
          },
        ],
      },
    ];
    syncOpenClawProfiles(agents, {
      workspaceRoot,
      configPath,
    });
    const skillPath = path.join(
      workspaceRoot,
      "engineer",
      "skills",
      "test-skill",
      "SKILL.md",
    );
    expect(fs.existsSync(skillPath)).toBe(true);
    const written = fs.readFileSync(skillPath, "utf-8");
    expect(written).toContain("# Test skill");
    expect(written).toContain("Do something useful");
    expect(written).toMatch(/^---\s/);
    expect(written).toContain("name: test-skill");
    expect(written).toContain("description:");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not prepend a second frontmatter block when SKILL.md already has frontmatter but no name", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const workspaceRoot = path.join(tmp, "agents");
    const skillContent = `---
description: Existing description
disable-model-invocation: true
---

# Body
`;
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Engineer",
        slug: "engineer",
        role: "R",
        effectiveSoulContent: "# SOUL",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [
          {
            _id: "s1",
            name: "Test Skill",
            slug: "test-skill",
            contentMarkdown: skillContent,
          },
        ],
      },
    ];
    syncOpenClawProfiles(agents, {
      workspaceRoot,
      configPath,
    });

    const skillPath = path.join(
      workspaceRoot,
      "engineer",
      "skills",
      "test-skill",
      "SKILL.md",
    );
    const written = fs.readFileSync(skillPath, "utf-8");
    const delimiterCount = written
      .split(/\r?\n/)
      .filter((l) => l.trim() === "---").length;
    expect(delimiterCount).toBe(2);
    expect(written).toContain("name: test-skill");
    expect(written).toContain("disable-model-invocation: true");

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.skills?.entries?.["test-skill"]).toEqual({ enabled: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("generated openclaw.json includes load.extraDirs and skills.entries when skills have content", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const workspaceRoot = path.join(tmp, "agents");
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Engineer",
        slug: "engineer",
        role: "R",
        effectiveSoulContent: "# SOUL",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [
          {
            _id: "s1",
            name: "Web Search",
            slug: "web-search",
            contentMarkdown: "# Web Search\n\nSearch the web.\n",
          },
        ],
      },
    ];
    syncOpenClawProfiles(agents, {
      workspaceRoot,
      configPath,
    });
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(Array.isArray(config.load?.extraDirs)).toBe(true);
    expect(config.load.extraDirs.length).toBeGreaterThan(0);
    expect(config.load.extraDirs[0]).toContain("skills");
    expect(config.skills?.entries).toBeDefined();
    expect(config.skills.entries["web-search"]).toEqual({ enabled: true });
    expect(config.skills?.allowBundled).toBeUndefined();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("uses frontmatter name as skills.entries key when present (OpenClaw convention)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const workspaceRoot = path.join(tmp, "agents");
    const contentWithCustomName = `---
name: custom-skill-name
description: Custom name in frontmatter
---

# Body
`;
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Engineer",
        slug: "engineer",
        role: "R",
        effectiveSoulContent: "# SOUL",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [
          {
            _id: "s1",
            name: "Display Name",
            slug: "our-slug",
            contentMarkdown: contentWithCustomName,
          },
        ],
      },
    ];
    syncOpenClawProfiles(agents, {
      workspaceRoot,
      configPath,
    });
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.skills?.entries?.["custom-skill-name"]).toEqual({
      enabled: true,
    });
    expect(config.skills?.entries?.["our-slug"]).toBeUndefined();
    const skillPath = path.join(
      workspaceRoot,
      "engineer",
      "skills",
      "our-slug",
      "SKILL.md",
    );
    expect(fs.readFileSync(skillPath, "utf-8")).toContain(
      "name: custom-skill-name",
    );
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes default AGENTS.md with workflow rules: human dependency -> BLOCKED, unblock -> IN_PROGRESS, QA request after REVIEW", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    try {
      const configPath = path.join(tmp, "openclaw.json");
      const workspaceRoot = path.join(tmp, "agents");
      const agents: AgentForProfile[] = [
        {
          _id: "a1",
          name: "Engineer",
          slug: "engineer",
          role: "Engineer",
          effectiveSoulContent: "# SOUL\n",
          effectiveUserMd: "# User\n",
          effectiveIdentityContent: "# IDENTITY\n",
          resolvedSkills: [],
        },
      ];
      syncOpenClawProfiles(agents, { workspaceRoot, configPath });
      const agentsMdPath = path.join(workspaceRoot, "engineer", "AGENTS.md");
      expect(fs.existsSync(agentsMdPath)).toBe(true);
      const content = fs.readFileSync(agentsMdPath, "utf-8");
      expect(content).toContain("human input");
      expect(content).toContain("BLOCKED");
      expect(content).toContain("blockedReason");
      expect(content).toContain("move the task back to IN_PROGRESS");
      expect(content).toContain("REVIEW is for QA validation only");
      expect(content).toContain("Before requesting QA");
      expect(content).toContain("move the task to REVIEW first");
      expect(content).not.toContain("If you need human review: move to REVIEW");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not write SKILL.md or add to skills.entries for skills without contentMarkdown", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const workspaceRoot = path.join(tmp, "agents");
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Engineer",
        slug: "engineer",
        role: "R",
        effectiveSoulContent: "# SOUL",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [
          {
            _id: "s1",
            name: "No Content",
            slug: "no-content",
            description: "Metadata only",
          },
          {
            _id: "s2",
            name: "With Content",
            slug: "with-content",
            contentMarkdown: "# With content\n\nReal skill.\n",
          },
        ],
      },
    ];
    syncOpenClawProfiles(agents, {
      workspaceRoot,
      configPath,
    });
    const skillNoContentPath = path.join(
      workspaceRoot,
      "engineer",
      "skills",
      "no-content",
      "SKILL.md",
    );
    const skillWithContentPath = path.join(
      workspaceRoot,
      "engineer",
      "skills",
      "with-content",
      "SKILL.md",
    );
    expect(fs.existsSync(skillNoContentPath)).toBe(false);
    expect(fs.existsSync(skillWithContentPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.skills?.entries?.["no-content"]).toBeUndefined();
    expect(config.skills?.entries?.["with-content"]).toEqual({ enabled: true });
    expect(config.skills?.allowBundled).toBeUndefined();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates per-agent memory scaffold including rolling daily notes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const workspaceRoot = path.join(tmp, "agents");
    const agentSlug = "engineer";
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Engineer",
        slug: agentSlug,
        role: "R",
        effectiveSoulContent: "# SOUL",
        effectiveUserMd: "# User\n",
        effectiveIdentityContent: "# IDENTITY\n",
        resolvedSkills: [],
      },
    ];

    syncOpenClawProfiles(agents, {
      workspaceRoot,
      configPath,
    });

    const now = new Date();
    const memoryRoot = path.join(workspaceRoot, agentSlug);
    const memoryDir = path.join(memoryRoot, "memory");
    const deliverablesDir = path.join(memoryRoot, "deliverables");
    expect(fs.existsSync(path.join(memoryRoot, "MEMORY.md"))).toBe(true);
    expect(fs.existsSync(path.join(memoryDir, "WORKING.md"))).toBe(true);
    expect(fs.existsSync(deliverablesDir)).toBe(true);
    expect(
      fs.existsSync(path.join(memoryDir, `${utcDayString(now, -1)}.md`)),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(memoryDir, `${utcDayString(now, 0)}.md`)),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(memoryDir, `${utcDayString(now, 1)}.md`)),
    ).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
