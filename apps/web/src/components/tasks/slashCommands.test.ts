/**
 * Unit tests for slash command parsing.
 */
import { describe, it, expect } from "vitest";
import { parseSlashCommand } from "./slashCommands";

describe("parseSlashCommand", () => {
  it("returns stop command for /stop", () => {
    expect(parseSlashCommand("/stop")).toEqual({ command: "stop" });
  });

  it("returns stop command for /stop with trailing space", () => {
    expect(parseSlashCommand("/stop ")).toEqual({ command: "stop" });
  });

  it("returns stop command with reason for /stop reason", () => {
    expect(parseSlashCommand("/stop emergency")).toEqual({
      command: "stop",
      reason: "emergency",
    });
  });

  it("returns stop command with reason for /stop multi-word reason", () => {
    expect(parseSlashCommand("/stop pause everyone now")).toEqual({
      command: "stop",
      reason: "pause everyone now",
    });
  });

  it("returns null for non-slash content", () => {
    expect(parseSlashCommand("foo")).toBeNull();
    expect(parseSlashCommand("")).toBeNull();
  });

  it("returns null for non-string input (defensive)", () => {
    expect(parseSlashCommand(undefined as unknown as string)).toBeNull();
    expect(parseSlashCommand(null as unknown as string)).toBeNull();
  });

  it("returns null for content that does not start with /stop", () => {
    expect(parseSlashCommand("/start")).toBeNull();
    expect(parseSlashCommand("foo /stop")).toBeNull();
  });

  it("trims reason", () => {
    expect(parseSlashCommand("/stop  ")).toEqual({ command: "stop" });
    expect(parseSlashCommand("/stop  something  ")).toEqual({
      command: "stop",
      reason: "something",
    });
  });
});
