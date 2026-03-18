import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { databaseConfig } from "../common/config/database.config";

export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const cfg = databaseConfig();

  if (cfg.type === "postgres") {
    if (cfg.url) {
      return {
        type: "postgres",
        url: cfg.url,
        ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
        synchronize: cfg.synchronize,
      };
    }

    return {
      type: "postgres",
      host: cfg.host || "localhost",
      port: cfg.port || 5432,
      username: cfg.username || "postgres",
      password: cfg.password || "",
      database: cfg.database || "apiforge",
      ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
      autoLoadEntities: true,
      synchronize: cfg.synchronize,
    };
  }

  return {
    type: "sqlite",
    database: cfg.sqlitePath,
    autoLoadEntities: true,
    synchronize: cfg.synchronize,
  };
}
