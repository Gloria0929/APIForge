export function safeJsonParse<T>(
  input: unknown,
  fallback: T,
  opts?: { acceptNonString?: boolean },
): T {
  if (input === null || input === undefined) return fallback;
  if (typeof input !== "string") {
    return opts?.acceptNonString ? (input as T) : fallback;
  }
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(input: unknown, fallback = "null"): string {
  try {
    return JSON.stringify(input);
  } catch {
    return fallback;
  }
}

