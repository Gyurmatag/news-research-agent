import { describe, expect, it } from "vitest";
import {
  buildJudgePrompt,
  JUDGE_PASS_THRESHOLD,
  JudgeResponseSchema,
  sampleCsvForJudge,
} from "../../src/eval/judge";

describe("judge", () => {
  it("JUDGE_PASS_THRESHOLD == 70", () => {
    expect(JUDGE_PASS_THRESHOLD).toBe(70);
  });

  it("buildJudgePrompt declares CURRENT DATE and explicit anti-future instruction", () => {
    const today = new Date("2026-05-21T00:00:00Z");
    const prompt = buildJudgePrompt({ query: "AI news", csvSample: "a,b\n1,2\n", today });
    expect(prompt).toContain("CURRENT DATE: 2026-05-21");
    expect(prompt).toContain("ACCEPTABLE WINDOW (last 30 days): 2026-04-21 to 2026-05-21");
    expect(prompt).toContain('Do NOT flag 2026 dates as "future" or "fabricated"');
    expect(prompt).toContain("score is an INTEGER 0-100");
    expect(prompt).toContain("USER QUERY:\nAI news");
    expect(prompt).toContain("a,b\n1,2");
  });

  it("sampleCsvForJudge truncates at the last newline, not mid-row", () => {
    const csv =
      "title,source,url,date,summary\n" +
      Array.from({ length: 200 })
        .map((_, i) => `"Long title ${i}","Source","https://example.com/${i}","2026-05-19","Summary text ${i}"`)
        .join("\n") +
      "\n";
    const sampled = sampleCsvForJudge(csv, 2000);
    expect(sampled.length).toBeLessThan(csv.length);
    // After truncation we must end on a complete row + a TRUNCATED marker.
    const beforeMarker = sampled.split("\n\n[TRUNCATED")[0];
    const lastLine = beforeMarker.split("\n").filter(Boolean).slice(-1)[0];
    // Last surviving row should be quoted to closing quote, indicating it's complete.
    expect(lastLine.endsWith(`"`)).toBe(true);
    expect(sampled).toContain("[TRUNCATED");
  });

  it("JudgeResponseSchema rejects 0-1 ratio that exceeds 100 only", () => {
    expect(JudgeResponseSchema.safeParse({
      score: 85, pass: true, queryAddressed: true, freshnessOk: true,
      reasoning: "ok", failures: [],
    }).success).toBe(true);
    // Schema allows 0..100 inclusive; production wrapper rescales <=1 ratios.
    expect(JudgeResponseSchema.safeParse({
      score: 0.85, pass: true, queryAddressed: true, freshnessOk: true,
      reasoning: "ok", failures: [],
    }).success).toBe(true);
    expect(JudgeResponseSchema.safeParse({
      score: 105, pass: true, queryAddressed: true, freshnessOk: true,
      reasoning: "ok", failures: [],
    }).success).toBe(false);
  });
});
