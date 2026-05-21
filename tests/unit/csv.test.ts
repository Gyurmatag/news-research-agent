import { describe, expect, it } from "vitest";
import {
  hostOf,
  normalizeUrl,
  parseCsv,
  REQUIRED_COLUMNS,
  rowsToCsv,
  stripExcelPrefix,
  withExcelPrefix,
} from "../../lib/csv";

const sample = `title,source,url,date,summary
"Story one","BBC","https://www.bbc.com/news/story-1","2026-05-19","Summary one"
"Story two","Reuters","https://reuters.com/article/x","2026-05-18","Summary two"
`;

describe("csv prefix", () => {
  it("withExcelPrefix prepends BOM + sep directive", () => {
    const wrapped = withExcelPrefix("a,b\n1,2\n");
    expect(wrapped.charCodeAt(0)).toBe(0xfeff);
    expect(wrapped.slice(1, 7)).toBe("sep=,\n");
  });

  it("stripExcelPrefix removes BOM and sep directive", () => {
    const stripped = stripExcelPrefix(withExcelPrefix("a,b\n1,2\n"));
    expect(stripped).toBe("a,b\n1,2\n");
  });

  it("stripExcelPrefix is a no-op on plain CSV", () => {
    expect(stripExcelPrefix("a,b\n1,2\n")).toBe("a,b\n1,2\n");
  });
});

describe("parseCsv", () => {
  it("parses headers and trims rows", () => {
    const { rows, rawHeaders, parseErrors } = parseCsv(sample);
    expect(parseErrors).toEqual([]);
    expect(rawHeaders).toEqual([...REQUIRED_COLUMNS]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "Story one", source: "BBC" });
  });

  it("strips Excel prefix transparently", () => {
    const { rows } = parseCsv(withExcelPrefix(sample));
    expect(rows).toHaveLength(2);
  });

  it("is case-insensitive on headers (lowercases)", () => {
    const upper = sample.replace("title,source,url,date,summary", "Title,Source,URL,Date,Summary");
    const { rows } = parseCsv(upper);
    expect(rows[0]?.title).toBe("Story one");
  });
});

describe("rowsToCsv", () => {
  it("round-trips rows back to RFC 4180 CSV with required columns", () => {
    const { rows } = parseCsv(sample);
    const csv = rowsToCsv(rows);
    const reparsed = parseCsv(csv);
    expect(reparsed.rows).toEqual(rows);
  });
});

describe("normalizeUrl + hostOf", () => {
  it("normalizes host (drops www) and path", () => {
    expect(normalizeUrl("https://www.example.com/path/")).toBe("example.com/path");
    expect(normalizeUrl("https://example.com")).toBe("example.com/");
  });

  it("returns null for bad URLs", () => {
    expect(normalizeUrl("not a url")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });

  it("two URLs differing only in www are deduped", () => {
    expect(normalizeUrl("https://www.foo.com/a")).toBe(normalizeUrl("https://foo.com/a/"));
  });
});
