import { describe, expect, it } from "vitest";
import { exceedsCap, MAX_USD_PER_RUN, usdFromUsage } from "../../lib/cost";

describe("cost", () => {
  it("MAX_USD_PER_RUN is 1.0", () => {
    expect(MAX_USD_PER_RUN).toBe(1.0);
  });

  it("usdFromUsage prices input+output at Sonnet 4.6 rates", () => {
    // 1M input + 1M output = $3 + $15 = $18
    expect(usdFromUsage({ inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(18, 6);
  });

  it("usdFromUsage handles a small realistic call (~10k in, 2k out)", () => {
    const usd = usdFromUsage({ inputTokens: 10_000, outputTokens: 2_000 });
    expect(usd).toBeCloseTo((10_000 * 3 + 2_000 * 15) / 1_000_000, 6);
  });

  it("cache-create costs 1.25x input; cache-read costs 0.1x input", () => {
    const create = usdFromUsage({ cacheCreationInputTokens: 1_000_000 });
    const read = usdFromUsage({ cacheReadInputTokens: 1_000_000 });
    expect(create).toBeCloseTo(3.75, 6);
    expect(read).toBeCloseTo(0.3, 6);
  });

  it("exceedsCap triggers at or above the cap", () => {
    expect(exceedsCap(0.99)).toBe(false);
    expect(exceedsCap(1.0)).toBe(true);
    expect(exceedsCap(1.5)).toBe(true);
  });
});
