import { describe, it, expect } from "vitest";
import { parseOpenClawResponseBody } from "./gateway";

describe("parseOpenClawResponseBody", () => {
  it("returns empty texts and toolCalls for empty body", () => {
    const result = parseOpenClawResponseBody("");
    expect(result.texts).toEqual([]);
    expect(result.toolCalls).toEqual([]);
  });

  it("returns single part for non-JSON body", () => {
    const body = "Plain text reply from agent.";
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual([body]);
    expect(result.toolCalls).toEqual([]);
  });

  it("returns one part when only output_text is present", () => {
    const body = JSON.stringify({
      output_text: "Single message from output_text.",
    });
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual(["Single message from output_text."]);
    expect(result.toolCalls).toEqual([]);
  });

  it("returns multiple ordered parts from output array", () => {
    const body = JSON.stringify({
      output: [
        { text: "First part." },
        { text: "Second part." },
        { text: "Third part." },
      ],
    });
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual(["First part.", "Second part.", "Third part."]);
    expect(result.toolCalls).toEqual([]);
  });

  it("skips function_call items and returns only text parts in order", () => {
    const body = JSON.stringify({
      output: [
        { text: "Before tool." },
        {
          type: "function_call",
          call_id: "call_1",
          name: "task_status",
          arguments: "{}",
        },
        { text: "After tool." },
      ],
    });
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual(["Before tool.", "After tool."]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      call_id: "call_1",
      name: "task_status",
      arguments: "{}",
    });
  });

  it("extracts content from object items in output array", () => {
    const body = JSON.stringify({
      output: [
        { content: "Content block one." },
        { content: "Content block two." },
      ],
    });
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual(["Content block one.", "Content block two."]);
    expect(result.toolCalls).toEqual([]);
  });

  it("falls back to data.text when output array yields no texts", () => {
    const body = JSON.stringify({
      output: [],
      text: "Fallback text.",
    });
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual(["Fallback text."]);
    expect(result.toolCalls).toEqual([]);
  });

  it("falls back to data.content when output and output_text are empty", () => {
    const body = JSON.stringify({
      output: [],
      content: "Fallback content.",
    });
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual(["Fallback content."]);
    expect(result.toolCalls).toEqual([]);
  });

  it("returns single part for malformed JSON (fallback to raw string)", () => {
    const body = "not valid json {";
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual([body]);
    expect(result.toolCalls).toEqual([]);
  });

  it("prefers output array parts over output_text when both present", () => {
    const body = JSON.stringify({
      output_text: "Ignored output_text.",
      output: [{ text: "From output array." }],
    });
    const result = parseOpenClawResponseBody(body);
    expect(result.texts).toEqual(["From output array."]);
    expect(result.toolCalls).toEqual([]);
  });
});
