import { describe, expect, it } from "vitest";
import { runContentCheck, MIN_UNIQUE_DOMAINS, MAX_AGE_DAYS } from "../../src/eval/content-check";

const NOW = new Date("2026-05-21T00:00:00Z");
const RECENT = "2026-05-19";
const OLD = "2026-01-01"; // older than 30 days

function csv(rows: Array<{ title?: string; source?: string; url: string; date: string; summary?: string }>): string {
  return (
    "title,source,url,date,summary\n" +
    rows
      .map(
        (r) =>
          `"${r.title ?? "T"}","${r.source ?? "BBC"}","${r.url}","${r.date}","${r.summary ?? "S"}"`,
      )
      .join("\n") +
    "\n"
  );
}

describe("content-check", () => {
  it("MIN_UNIQUE_DOMAINS == 3, MAX_AGE_DAYS == 30", () => {
    expect(MIN_UNIQUE_DOMAINS).toBe(3);
    expect(MAX_AGE_DAYS).toBe(30);
  });

  it("passes when all rows recent, 3 unique hosts, no duplicates", () => {
    const r = runContentCheck(
      csv([
        { url: "https://a.com/1", date: RECENT },
        { url: "https://b.com/2", date: RECENT },
        { url: "https://c.com/3", date: RECENT },
        { url: "https://d.com/4", date: RECENT },
        { url: "https://e.com/5", date: RECENT },
      ]),
      NOW,
    );
    expect(r.pass).toBe(true);
    expect(r.uniqueDomains.length).toBe(5);
    expect(r.duplicateUrls).toEqual([]);
  });

  it("flags rows older than 30 days", () => {
    const r = runContentCheck(
      csv([
        { url: "https://a.com/1", date: OLD },
        { url: "https://b.com/2", date: RECENT },
        { url: "https://c.com/3", date: RECENT },
      ]),
      NOW,
    );
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes("older"))).toBe(true);
  });

  it("flags fewer than 3 unique domains", () => {
    const r = runContentCheck(
      csv([
        { url: "https://a.com/1", date: RECENT },
        { url: "https://a.com/2", date: RECENT },
        { url: "https://a.com/3", date: RECENT },
        { url: "https://b.com/1", date: RECENT },
        { url: "https://b.com/2", date: RECENT },
      ]),
      NOW,
    );
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes("unique source domain"))).toBe(true);
  });

  it("flags duplicate URLs (normalized host+path)", () => {
    const r = runContentCheck(
      csv([
        { url: "https://www.a.com/x", date: RECENT },
        { url: "https://a.com/x/", date: RECENT },
        { url: "https://b.com/1", date: RECENT },
        { url: "https://c.com/1", date: RECENT },
        { url: "https://d.com/1", date: RECENT },
      ]),
      NOW,
    );
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes("Duplicate URL"))).toBe(true);
  });

  it("flags unparseable dates", () => {
    const r = runContentCheck(
      csv([
        { url: "https://a.com/1", date: "tomorrow" },
        { url: "https://b.com/2", date: RECENT },
        { url: "https://c.com/3", date: RECENT },
        { url: "https://d.com/4", date: RECENT },
        { url: "https://e.com/5", date: RECENT },
      ]),
      NOW,
    );
    expect(r.failures.some((f) => f.includes("unparseable dates"))).toBe(true);
  });
});
