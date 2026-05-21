import { hostOf, normalizeUrl, parseCsv, type ArticleRow } from "../../lib/csv";

export type ContentCheckResult = {
  pass: boolean;
  failures: string[];
  uniqueDomains: string[];
  duplicateUrls: string[];
  oldRows: number;
  totalRows: number;
};

export const MIN_UNIQUE_DOMAINS = 3;
export const MAX_AGE_DAYS = 30;

export function runContentCheck(
  csvText: string,
  now: Date = new Date(),
): ContentCheckResult {
  const failures: string[] = [];
  const { rows } = parseCsv(csvText);

  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - MAX_AGE_DAYS);

  const domains = new Set<string>();
  const normalizedSeen = new Map<string, number>();
  let oldRows = 0;
  let invalidDateRows = 0;
  let invalidUrlRows = 0;

  rows.forEach((row, idx) => {
    issuesForRow(row, idx + 1, cutoff, now).forEach((f) => failures.push(f));
    const host = hostOf(row.url);
    if (host) domains.add(host);
    else invalidUrlRows++;
    const norm = normalizeUrl(row.url);
    if (norm) {
      normalizedSeen.set(norm, (normalizedSeen.get(norm) ?? 0) + 1);
    }
    const dt = parseIsoDate(row.date);
    if (!dt) {
      invalidDateRows++;
    } else if (dt < cutoff) {
      oldRows++;
    }
  });

  if (invalidDateRows > 0) failures.push(`${invalidDateRows} row(s) have unparseable dates`);
  if (invalidUrlRows > 0) failures.push(`${invalidUrlRows} row(s) have unparseable URLs`);
  if (oldRows > 0)
    failures.push(`${oldRows} row(s) have a date older than ${MAX_AGE_DAYS} days`);

  const duplicateUrls = [...normalizedSeen.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k);
  if (duplicateUrls.length > 0)
    failures.push(`Duplicate URL(s) (host+path): ${duplicateUrls.slice(0, 3).join("; ")}`);

  if (domains.size < MIN_UNIQUE_DOMAINS)
    failures.push(
      `Only ${domains.size} unique source domain(s); need >= ${MIN_UNIQUE_DOMAINS}`,
    );

  return {
    pass: failures.length === 0,
    failures,
    uniqueDomains: [...domains],
    duplicateUrls,
    oldRows,
    totalRows: rows.length,
  };
}

function issuesForRow(
  row: ArticleRow,
  idx: number,
  _cutoff: Date,
  _now: Date,
): string[] {
  const out: string[] = [];
  if (!row.title) out.push(`row ${idx}: missing title`);
  if (!row.source) out.push(`row ${idx}: missing source`);
  if (!row.url) out.push(`row ${idx}: missing url`);
  if (!row.date) out.push(`row ${idx}: missing date`);
  if (!row.summary) out.push(`row ${idx}: missing summary`);
  return out;
}

function parseIsoDate(value: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Accept YYYY-MM-DD strictly; tolerate full ISO timestamps.
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
