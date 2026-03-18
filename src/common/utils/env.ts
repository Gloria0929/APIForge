export function envString(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === null || v === "") return fallback;
  return v;
}

export function envNumber(name: string, fallback?: number): number | undefined {
  const v = envString(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function envBoolean(name: string, fallback = false): boolean {
  const v = envString(name);
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

