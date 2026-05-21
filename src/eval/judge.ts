import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { Env } from "../env";

export const JudgeResponseSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Integer 0-100 quality score. NOT a 0-1 ratio. Examples: 85, 90, 95. Never values like 0.86.",
    ),
  pass: z.boolean().describe("Whether the CSV meaningfully addresses the user's query."),
  queryAddressed: z
    .boolean()
    .describe("Whether the rows are on-topic for the user's research query."),
  freshnessOk: z
    .boolean()
    .describe("Whether the articles look recent (within the acceptable window)."),
  reasoning: z.string().describe("1-3 sentence rationale for the score."),
  failures: z.array(z.string()).describe("Specific issues; empty when pass is true."),
});

export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

export const JUDGE_PASS_THRESHOLD = 70;
const SAMPLE_BYTES = 32_000;

export function sampleCsvForJudge(csv: string, maxBytes = SAMPLE_BYTES): string {
  if (csv.length <= maxBytes) return csv;
  const head = csv.slice(0, maxBytes);
  const nl = head.lastIndexOf("\n");
  return (
    (nl > 0 ? head.slice(0, nl) : head) +
    "\n\n[TRUNCATED — do NOT flag the final row as incomplete; only judge complete rows above.]"
  );
}

export function buildJudgePrompt(args: {
  query: string;
  csvSample: string;
  today?: Date;
}): string {
  const today = (args.today ?? new Date()).toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const sevenDaysAgo = isoDaysAgo(args.today ?? new Date(), 7);
  const thirtyDaysAgo = isoDaysAgo(args.today ?? new Date(), 30);
  return `CURRENT DATE: ${today}
RECENT WINDOW (last 7 days): ${sevenDaysAgo} to ${today}
ACCEPTABLE WINDOW (last 30 days): ${thirtyDaysAgo} to ${today}

You are evaluating a CSV of news articles produced by a research agent for the
following user query:

USER QUERY:
${args.query}

CSV (columns: title,source,url,date,summary):
${args.csvSample}

Judge:
- Does the CSV address the user's query (on-topic, useful, not generic noise)?
- Are the articles recent (within the acceptable window above)?
- Are the sources plausible publishers (not made up)?
- Are the dates plausible? Do NOT flag ${year} dates as "future" or "fabricated".
- Do NOT flag model names, companies, or organizations you don't recognize as
  fabricated. Your training cutoff is older than ${today}; many real entities
  will look unfamiliar.
- Note: score is an INTEGER 0-100, never a 0-1 ratio. Examples: 85, 90, 95.

Set pass = true only when the CSV is genuinely useful: most rows on-topic,
acceptable freshness, no obvious fabrication. Otherwise pass = false.`;
}

function isoDaysAgo(now: Date, days: number): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function resolveJudgeModel(env: Env, modelId: string) {
  if (modelId.startsWith("gpt-") || /^o\d/i.test(modelId)) {
    const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return provider(modelId);
  }
  const provider = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return provider(modelId);
}

export async function runJudge(args: {
  env: Env;
  query: string;
  csvText: string;
  today?: Date;
}): Promise<JudgeResponse> {
  const csvSample = sampleCsvForJudge(args.csvText);
  const prompt = buildJudgePrompt({ query: args.query, csvSample, today: args.today });
  const model = resolveJudgeModel(args.env, args.env.JUDGE_MODEL);
  const { object } = await generateObject({
    model,
    schema: JudgeResponseSchema,
    prompt,
  });
  // Normalize: if model returned 0..1 ratio, scale to 0..100.
  const score = object.score <= 1 ? Math.round(object.score * 100) : Math.round(object.score);
  return { ...object, score };
}
