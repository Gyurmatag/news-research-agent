import { parseCsv, REQUIRED_COLUMNS } from "../../lib/csv";

export type SchemaCheckResult = {
  pass: boolean;
  failures: string[];
  rowCount: number;
  headers: string[];
};

export const MIN_ROWS = 5;

export function runSchemaCheck(csvText: string): SchemaCheckResult {
  const failures: string[] = [];
  const { rows, rawHeaders, parseErrors } = parseCsv(csvText);

  if (parseErrors.length > 0) {
    failures.push(`CSV parse errors: ${parseErrors.slice(0, 3).join("; ")}`);
  }

  const missing = REQUIRED_COLUMNS.filter((c) => !rawHeaders.includes(c));
  if (missing.length > 0) {
    failures.push(`Missing required columns: ${missing.join(", ")}`);
  }
  const extras = rawHeaders.filter((h) => !REQUIRED_COLUMNS.includes(h as (typeof REQUIRED_COLUMNS)[number]));
  if (extras.length > 0) {
    failures.push(`Unexpected columns: ${extras.join(", ")}`);
  }

  if (rows.length < MIN_ROWS) {
    failures.push(`Row count ${rows.length} < required minimum ${MIN_ROWS}`);
  }

  return {
    pass: failures.length === 0,
    failures,
    rowCount: rows.length,
    headers: rawHeaders,
  };
}
