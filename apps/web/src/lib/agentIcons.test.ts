/**
 * Unit tests for agent icon helpers.
 */
import { describe, it, expect } from "vitest";
import {
  AGENT_ICON_MAP,
  AGENT_ICON_NAMES,
  getAgentIconComponent,
} from "./agentIcons";

describe("agentIcons", () => {
  describe("AGENT_ICON_MAP", () => {
    it("contains expected seed icon names", () => {
      expect(AGENT_ICON_MAP["Crown"]).toBeDefined();
      expect(AGENT_ICON_MAP["Code2"]).toBeDefined();
      expect(AGENT_ICON_MAP["TestTube"]).toBeDefined();
      expect(AGENT_ICON_MAP["Palette"]).toBeDefined();
      expect(AGENT_ICON_MAP["PenLine"]).toBeDefined();
      expect(AGENT_ICON_MAP["Bot"]).toBeDefined();
    });

    it("returns undefined for unknown names", () => {
      expect(AGENT_ICON_MAP["UnknownIcon"]).toBeUndefined();
      expect(AGENT_ICON_MAP[""]).toBeUndefined();
    });
  });

  describe("AGENT_ICON_NAMES", () => {
    it("is sorted and includes seed icons", () => {
      expect(AGENT_ICON_NAMES).toEqual([...AGENT_ICON_NAMES].sort());
      expect(AGENT_ICON_NAMES).toContain("Crown");
      expect(AGENT_ICON_NAMES).toContain("Bot");
    });

    it("matches map keys", () => {
      expect(AGENT_ICON_NAMES).toHaveLength(Object.keys(AGENT_ICON_MAP).length);
      for (const name of AGENT_ICON_NAMES) {
        expect(AGENT_ICON_MAP[name]).toBeDefined();
      }
    });
  });

  describe("getAgentIconComponent", () => {
    it("returns Bot for undefined", () => {
      const Icon = getAgentIconComponent(undefined);
      expect(Icon).toBe(AGENT_ICON_MAP["Bot"]);
    });

    it("returns Bot for empty string", () => {
      const Icon = getAgentIconComponent("");
      expect(Icon).toBe(AGENT_ICON_MAP["Bot"]);
    });

    it("returns Bot for unknown icon name", () => {
      const Icon = getAgentIconComponent("NonExistent");
      expect(Icon).toBe(AGENT_ICON_MAP["Bot"]);
    });

    it("returns correct component for valid names", () => {
      expect(getAgentIconComponent("Crown")).toBe(AGENT_ICON_MAP["Crown"]);
      expect(getAgentIconComponent("Code2")).toBe(AGENT_ICON_MAP["Code2"]);
      expect(getAgentIconComponent("Bot")).toBe(AGENT_ICON_MAP["Bot"]);
    });
  });
});
