export type DatabaseConfig =
  | {
      type: "sqlite";
      sqlitePath: string;
      synchronize: boolean;
    }
  | {
      type: "postgres";
      url?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      database?: string;
      ssl?: boolean;
      synchronize: boolean;
    };

export function databaseConfig(): DatabaseConfig {
  const type = (process.env.DB_TYPE || "sqlite").toLowerCase();
  const synchronize = (process.env.DB_SYNC || "true").toLowerCase() === "true";

  if (type === "postgres") {
    const ssl = (process.env.DB_SSL || "false").toLowerCase() === "true";
    return {
      type: "postgres",
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
      username: process.env.DB_USERNAME || process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl,
      synchronize,
    };
  }

  return {
    type: "sqlite",
    sqlitePath: process.env.DB_SQLITE_PATH || "apiforge.db",
    synchronize,
  };
}

