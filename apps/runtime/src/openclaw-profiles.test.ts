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

describe("mapModelToOpenClaw", () => {
  it("maps known Convex model ids to OpenClaw provider/model strings", () => {
    expect(mapModelToOpenClaw("claude-sonnet-4-20250514")).toBe(
      "anthropic/claude-sonnet-4-5",
    );
    expect(mapModelToOpenClaw("claude-opus-4-20250514")).toBe(
      "anthropic/claude-opus-4-5",
    );
    expect(mapModelToOpenClaw("gpt-4o")).toBe("openai/gpt-4o");
    expect(mapModelToOpenClaw("gpt-4o-mini")).toBe("openai/gpt-4o-mini");
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
    expect(mapModelToOpenClaw("  gpt-4o  ")).toBe("openai/gpt-4o");
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
  it("writes openclaw.json with agents.list and skipBootstrap", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const agents: AgentForProfile[] = [
      {
        _id: "agent1",
        name: "Engineer",
        slug: "engineer",
        role: "Engineer",
        sessionKey: "agent:engineer:acc1",
        effectiveSoulContent: "# SOUL\n",
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

  it("skips agents with unsafe slug and does not add them to config", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Bad",
        slug: "..",
        role: "Role",
        sessionKey: "agent:..:acc1",
        effectiveSoulContent: "# SOUL",
        resolvedSkills: [],
      },
      {
        _id: "a2",
        name: "Good",
        slug: "good",
        role: "Role",
        sessionKey: "agent:good:acc1",
        effectiveSoulContent: "# SOUL",
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-profiles-"));
    const configPath = path.join(tmp, "openclaw.json");
    const agents: AgentForProfile[] = [
      {
        _id: "a1",
        name: "Sonnet",
        slug: "sonnet",
        role: "R",
        sessionKey: "agent:sonnet:acc1",
        openclawConfig: { model: "claude-sonnet-4-20250514" },
        effectiveSoulContent: "# SOUL",
        resolvedSkills: [],
      },
    ];
    syncOpenClawProfiles(agents, {
      workspaceRoot: path.join(tmp, "agents"),
      configPath,
    });
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.agents.list[0].model).toBe("anthropic/claude-sonnet-4-5");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes SKILL.md for resolved skills with contentMarkdown", () => {
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
        sessionKey: "agent:engineer:acc1",
        effectiveSoulContent: "# SOUL",
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
    expect(fs.readFileSync(skillPath, "utf-8")).toBe(skillContent.trim());
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
        sessionKey: "agent:engineer:acc1",
        effectiveSoulContent: "# SOUL",
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
    fs.rmSync(tmp, { recursive: true, force: true });
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
        sessionKey: "agent:engineer:acc1",
        effectiveSoulContent: "# SOUL",
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
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
