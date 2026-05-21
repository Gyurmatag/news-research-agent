import Papa from "papaparse";

export const REQUIRED_COLUMNS = ["title", "source", "url", "date", "summary"] as const;
export type ArticleRow = Record<(typeof REQUIRED_COLUMNS)[number], string>;

export function withExcelPrefix(text: string): string {
  return `\uFEFF` + `sep=,\n` + text;
}

export function stripExcelPrefix(text: string): string {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/^sep=.\r?\n/i, "");
}

export type ParseResult = {
  rows: ArticleRow[];
  rawHeaders: string[];
  parseErrors: string[];
};

export function parseCsv(text: string): ParseResult {
  const cleaned = stripExcelPrefix(text);
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const headers = result.meta.fields ?? [];
  const rows: ArticleRow[] = (result.data ?? []).map((r) => ({
    title: (r.title ?? "").trim(),
    source: (r.source ?? "").trim(),
    url: (r.url ?? "").trim(),
    date: (r.date ?? "").trim(),
    summary: (r.summary ?? "").trim(),
  }));
  const parseErrors = (result.errors ?? []).map((e) => `${e.type}@${e.row}: ${e.message}`);
  return { rows, rawHeaders: headers, parseErrors };
}

export function rowsToCsv(rows: ArticleRow[]): string {
  return Papa.unparse(rows, { columns: [...REQUIRED_COLUMNS], header: true, newline: "\n" });
}

export function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
