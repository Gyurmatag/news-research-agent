import { expect, test } from "@playwright/test";

const PROMPT =
  "Find 5 recent news articles about AI safety and regulation from the last 7 days";
const MAX_RUN_MS = 3 * 60_000;

test.describe("Phase 3 demo scenarios", () => {
  for (const mcpOn of [true, false] as const) {
    test(`runs end-to-end with MCP ${mcpOn ? "on" : "off"} and shows all-green eval`, async ({
      page,
    }) => {
      test.setTimeout(MAX_RUN_MS + 60_000);

      await page.goto("/");

      // Toggle MCP if needed (default is on)
      const mcpSwitch = page.locator("#mcp-toggle");
      const initial = await mcpSwitch.getAttribute("data-state");
      const isOn = initial === "checked";
      if (mcpOn !== isOn) {
        await mcpSwitch.click();
        await expect(mcpSwitch).toHaveAttribute("data-state", mcpOn ? "checked" : "unchecked");
      }

      // Fill prompt and submit
      const textarea = page.getByPlaceholder(/Find 5 recent articles/i).first();
      await textarea.fill(PROMPT);
      await page.getByRole("button", { name: /^submit$/i }).click();

      // Wait for verdict card. The card heading is "Evaluation passed" on success.
      await expect(
        page.getByText(/Evaluation (passed|failed)/),
      ).toBeVisible({ timeout: MAX_RUN_MS });

      // Download CSV link should appear.
      const dl = page.getByRole("link", { name: /download csv/i });
      await expect(dl).toBeVisible();

      // Assert all four layers visible.
      await expect(page.getByText("Schema")).toBeVisible();
      await expect(page.getByText(/Content \(/)).toBeVisible();
      await expect(page.getByText(/Tool trace/)).toBeVisible();
      await expect(page.getByText(/LLM Judge/)).toBeVisible();

      // Success criterion: verdict must be "passed".
      await expect(page.getByText("Evaluation passed")).toBeVisible();
    });
  }
});
