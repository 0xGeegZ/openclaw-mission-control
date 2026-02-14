import { describe, it, expect } from "vitest";
import {
  getEffectiveReadByAgents,
  getShouldShowTypingIndicator,
  type AgentLike,
} from "./taskThreadIndicators";

const a: AgentLike = { id: "a", name: "Agent A" };
const b: AgentLike = { id: "b", name: "Agent B" };
const c: AgentLike = { id: "c", name: "Agent C" };

describe("getEffectiveReadByAgents", () => {
  it("returns strict seen-by when present", () => {
    const strict = [a];
    const fallback = [b];
    const typing = [c];
    expect(getEffectiveReadByAgents(strict, fallback, typing)).toEqual([a]);
  });

  it("returns fallback when strict is empty and fallback present", () => {
    const strict: AgentLike[] = [];
    const fallback = [b];
    const typing = [c];
    expect(getEffectiveReadByAgents(strict, fallback, typing)).toEqual([b]);
  });

  it("returns typing agents as seen-by when strict and fallback are empty", () => {
    const strict: AgentLike[] = [];
    const fallback: AgentLike[] = [];
    const typing = [a, c];
    expect(getEffectiveReadByAgents(strict, fallback, typing)).toEqual([a, c]);
  });

  it("returns empty when all are empty", () => {
    expect(getEffectiveReadByAgents([], [], [])).toEqual([]);
  });
});

describe("getShouldShowTypingIndicator", () => {
  it("returns true when there are typing agents", () => {
    expect(getShouldShowTypingIndicator([a])).toBe(true);
    expect(getShouldShowTypingIndicator([a, b])).toBe(true);
  });

  it("returns false when there are no typing agents (e.g. all outside TYPING_WINDOW_MS)", () => {
    expect(getShouldShowTypingIndicator([])).toBe(false);
  });
});
