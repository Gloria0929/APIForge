/**
 * TypeORM Column transformer for storing structured data (object/array) in TEXT columns.
 *
 * Rationale: this repo uses SQLite with many columns declared as `text` while the
 * runtime values are objects/arrays. Without a transformer, SQLite will persist
 * them as "[object Object]" or similar, and reads come back as strings.
 *
 * We keep the DB schema unchanged (TEXT) and only adapt serialization at the ORM boundary.
 */

export type JsonTransformerOptions<T> = {
  /**
   * Value returned when DB value is null/undefined/empty string, or when JSON.parse fails.
   * Use `null` if you want to preserve nulls.
   */
  defaultValue: T;
};

export function jsonTextTransformer<T>(options: JsonTransformerOptions<T>): {
  to: (value: T | null | undefined) => string | null;
  from: (value: unknown) => T;
} {
  const { defaultValue } = options;

  return {
    to: (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string") {
        // Allow pre-serialized JSON to pass through without double-encoding.
        const trimmed = value.trim();
        if (
          (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]"))
        ) {
          return trimmed;
        }
      }
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    },
    from: (value) => {
      if (value === null || value === undefined) return defaultValue;
      if (typeof value !== "string") return value as T;
      const trimmed = value.trim();
      if (trimmed === "") return defaultValue;
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return defaultValue;
      }
    },
  };
}
