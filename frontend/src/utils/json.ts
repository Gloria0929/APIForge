export function safeJsonParse<T>(input: string, fallback: T): T {
  const trimmed = (input || "").trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

export function prettyJson(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function formatAssertionValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Preserve the JSON types of scenario inputs; ordinary text stays text. */
export function parseLooseValue(raw: string): any {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  try { return JSON.parse(value); } catch { return value; }
}
