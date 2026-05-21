export const MAX_USD_PER_RUN = 1.0;

// Sonnet 4.6 pricing per million tokens.
const SONNET_INPUT_USD_PER_MTOK = 3;
const SONNET_OUTPUT_USD_PER_MTOK = 15;

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};

export function usdFromUsage(usage: Usage): number {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cacheCreate = usage.cacheCreationInputTokens ?? 0;
  const cacheRead = usage.cacheReadInputTokens ?? 0;
  // Cache-create is billed at 1.25x input; cache-read at 0.1x.
  return (
    (input * SONNET_INPUT_USD_PER_MTOK +
      output * SONNET_OUTPUT_USD_PER_MTOK +
      cacheCreate * SONNET_INPUT_USD_PER_MTOK * 1.25 +
      cacheRead * SONNET_INPUT_USD_PER_MTOK * 0.1) /
    1_000_000
  );
}

export function exceedsCap(usd: number): boolean {
  return usd >= MAX_USD_PER_RUN;
}
