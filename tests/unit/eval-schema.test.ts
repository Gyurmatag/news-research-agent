import { describe, expect, it } from "vitest";
import { runSchemaCheck, MIN_ROWS } from "../../src/eval/schema-check";

const HEADERS = "title,source,url,date,summary\n";
function makeRows(n: number): string {
  let csv = HEADERS;
  for (let i = 0; i < n; i++) {
    csv += `"Story ${i}","BBC","https://example.com/${i}","2026-05-19","S${i}"\n`;
  }
  return csv;
}

describe("schema-check", () => {
  it("requires MIN_ROWS == 5", () => {
    expect(MIN_ROWS).toBe(5);
  });

  it("passes on >=5 rows with the required columns", () => {
    const r = runSchemaCheck(makeRows(5));
    expect(r.pass).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.rowCount).toBe(5);
  });

  it("fails when fewer than 5 rows", () => {
    const r = runSchemaCheck(makeRows(3));
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes("Row count"))).toBe(true);
  });

  it("fails when required columns are missing", () => {
    const r = runSchemaCheck("title,url\n");
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => f.includes("Missing"))).toBe(true);
  });
});
