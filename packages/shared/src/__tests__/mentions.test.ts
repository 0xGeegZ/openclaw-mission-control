import { describe, expect, it } from "vitest";
import {
  extractMentionCandidates,
  extractMentionCandidatesFromText,
  extractSimpleMentionStrings,
  findLongestMentionKey,
} from "../mentions";

describe("mentions helpers", () => {
  it("extracts unquoted and quoted mentions", () => {
    const result = extractMentionCandidatesFromText(
      'Hi @squad-lead and @"Guillaume Dieudonne"',
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.startsWith("squad-lead")).toBe(true);
    expect(result[1]).toBe("guillaume dieudonne");
  });

  it("extracts simple mention strings with strict token rules", () => {
    const result = extractSimpleMentionStrings(
      'Hi @squad-lead and @"Guillaume Dieudonne"',
    );
    expect(result).toEqual(["squad-lead", "guillaume dieudonne"]);
  });

  it("ignores code/quoted content in sanitized extraction", () => {
    const result = extractMentionCandidates(
      "```@hidden```\n> @quoted\nVisible @guillaume dieudonne",
    );
    expect(result).toEqual(["guillaume dieudonne"]);
  });

  it("finds longest matching mention key", () => {
    const key = findLongestMentionKey("guillaume dieudonne before merge", [
      "guillaume dieudonne",
      "guillaume",
    ]);
    expect(key).toBe("guillaume dieudonne");
  });
});
