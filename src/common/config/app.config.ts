export type AppConfig = {
  nodeEnv: string;
  port: number;
};

export function appConfig(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 3000),
  };
}

