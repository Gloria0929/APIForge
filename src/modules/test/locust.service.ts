import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { execFile, spawn } from "child_process";
import { promises as fs, existsSync } from "fs";
import * as os from "os";
import * as path from "path";

export const LOCUST_PROGRESS_PREFIX = "##APIFORGE_PROGRESS ";

export interface LocustProgress {
  total: number;
  failed: number;
  runs: number;
  elapsedSeconds: number;
  users?: number;
  avgResponseTime?: number;
  p95ResponseTime?: number;
  stopReason?: string;
}

export interface LocustRunHooks {
  signal?: AbortSignal;
  onProgress?: (progress: LocustProgress) => void;
  onLog?: (line: string) => void;
}

export function parseLocustProgress(line: string): LocustProgress | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(LOCUST_PROGRESS_PREFIX)) return null;
  try {
    const raw = JSON.parse(trimmed.slice(LOCUST_PROGRESS_PREFIX.length));
    const progress: LocustProgress = {
      total: Number(raw.total) || 0,
      failed: Number(raw.failed) || 0,
      runs: Number(raw.runs) || 0,
      elapsedSeconds: Number(raw.elapsedSeconds) || 0,
    };
    for (const key of ["users", "avgResponseTime", "p95ResponseTime"] as const) {
      if (Number.isFinite(raw[key])) progress[key] = Math.max(0, raw[key]);
    }
    if (typeof raw.stopReason === "string") progress.stopReason = raw.stopReason;
    return progress;
  } catch {
    return null;
  }
}

export interface LocustStep {
  name: string;
  method?: string;
  url: string;
  headers?: Record<string, any>;
  query?: Record<string, any>;
  body?: any;
  bodyType?: string;
  bodyForm?: any;
  extractRules?: Record<string, string>;
  repeat?: { sourceKey: string; itemPath?: string; itemVar: string };
  assertions?: any[];
  delayMs?: number;
}

export interface LocustPlan {
  mode: "duration" | "requests";
  durationSeconds?: number;
  totalRequests?: number;
  stopOnFailRate?: number;
  stepDelayMs?: number;
  host: string;
  timeoutMs?: number;
  variables?: Record<string, any>;
  steps: LocustStep[];
}

export interface LocustEndpoint {
  name: string;
  method: string;
  requestCount: number;
  failureCount: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
}

export interface LocustFailure {
  name: string;
  method: string;
  error: string;
  occurrences: number;
}

export interface LocustMetrics {
  stopReason?: string;
  completedRuns?: number;
  total: number;
  failures: number;
  failed: number;
  errors: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  durationMs: number;
  startedAt: Date;
  endedAt: Date;
  endpoints: LocustEndpoint[];
  failuresList: LocustFailure[];
  timeline: Array<{
    time: string;
    rps: number;
    failures: number;
    avgResponseTime: number;
  }>;
}

/**
 * Runs Locust (Python) headless against a resolved plan and reads its CSV output.
 * Requires `python3` + `locust` in the runtime image.
 */
@Injectable()
export class LocustService {
  private availability: { ok: boolean; detail: string } | null = null;

  /** Path to the runner shipped next to the compiled service. */
  private runnerPath(): string {
    const compiled = path.join(__dirname, "locust_runner.py");
    if (existsSync(compiled)) return compiled;
    return path.join(process.cwd(), "src/modules/test/locust_runner.py");
  }

  private pythonCommand(): string {
    return process.env.APIFORGE_LOCUST_PYTHON || "python3";
  }

  async isAvailable(): Promise<{ ok: boolean; detail: string }> {
    if (this.availability?.ok) return this.availability;
    const result = await this.execLocust(["--version"], 15000);
    this.availability = result.code === 0
      ? { ok: true, detail: (result.stdout || result.stderr).trim() }
      : {
          ok: false,
          detail: `未找到可用的 Locust（${this.pythonCommand()} -m locust）。请安装：pip install locust`,
        };
    return this.availability;
  }

  private execLocust(
    args: string[],
    timeoutMs: number,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      execFile(
        this.pythonCommand(),
        ["-m", "locust", ...args],
        { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env, killSignal: "SIGKILL" },
        (error: any, stdout, stderr) => {
          resolve({
            code: error ? Number(error.code) || 1 : 0,
            stdout: String(stdout || ""),
            stderr: String(stderr || "") || String(error?.message || ""),
          });
        },
      );
    });
  }

  /** Stream stdout/stderr so callers can surface live progress and errors. */
  private streamLocust(
    args: string[],
    options: {
      timeoutMs: number;
      env: NodeJS.ProcessEnv;
      hooks?: LocustRunHooks;
    },
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonCommand(), ["-m", "locust", ...args], {
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let outBuffer = "";
      let errBuffer = "";
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const abort = () => {
        child.kill("SIGINT");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 7000);
        killTimer.unref?.();
      };
      options.hooks?.signal?.addEventListener("abort", abort, { once: true });
      if (options.hooks?.signal?.aborted) abort();
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        options.hooks?.signal?.removeEventListener("abort", abort);
      };

      const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
      timer.unref?.();

      const consume = (chunk: string, buffer: string, channel: "stdout" | "stderr") => {
        const lines = (buffer + chunk).split("\n");
        const rest = lines.pop() ?? "";
        for (const line of lines) this.handleLine(line, channel, options.hooks);
        return rest.slice(-256000);
      };

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout = (stdout + text).slice(-256000);
        outBuffer = consume(text, outBuffer, "stdout");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr = (stderr + text).slice(-256000);
        errBuffer = consume(text, errBuffer, "stderr");
      });
      child.on("error", (error: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new ServiceUnavailableException(
            `无法启动 Locust（${this.pythonCommand()}）：${error?.message || error}。请安装：pip install locust`,
          ),
        );
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (outBuffer) this.handleLine(outBuffer, "stdout", options.hooks);
        if (errBuffer) this.handleLine(errBuffer, "stderr", options.hooks);
        resolve({ code: code ?? 1, stdout, stderr });
      });
    });
  }

  private handleLine(
    raw: string,
    channel: "stdout" | "stderr",
    hooks?: LocustRunHooks,
  ) {
    const line = raw.trim();
    if (!line) return;
    const progress = parseLocustProgress(line);
    if (progress) {
      hooks?.onProgress?.(progress);
      return;
    }
    if (channel === "stderr" || /error|exception|traceback|failed|warning/i.test(line)) {
      hooks?.onLog?.(line);
    }
  }

  async run(
    plan: LocustPlan,
    options: {
      virtualUsers: number;
      rampUpSeconds?: number;
      signal?: AbortSignal;
      onProgress?: LocustRunHooks["onProgress"];
      onLog?: LocustRunHooks["onLog"];
    },
  ): Promise<LocustMetrics> {
    if (options.signal?.aborted) throw new Error("压测已停止");
    const available = await this.isAvailable();
    if (!available.ok) throw new ServiceUnavailableException(available.detail);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apiforge-locust-"));
    const planPath = path.join(dir, "plan.json");
    const csvPrefix = path.join(dir, "stats");
    try {
      await fs.writeFile(planPath, JSON.stringify(plan), "utf-8");

      const users = Math.max(1, Math.round(options.virtualUsers));
      const rampUp = Math.max(0, Number(options.rampUpSeconds) || 0);
      const spawnRate = rampUp > 0 ? Math.max(users / rampUp, 0.1) : users;
      const durationSeconds =
        plan.mode === "duration"
          ? Math.max(1, Number(plan.durationSeconds) || 30)
          : 1800;

      const startedAt = new Date();
      let stopReason: string | undefined;
      let completedRuns = 0;
      const result = await this.streamLocust(
        [
          "-f", this.runnerPath(),
          "--headless",
          "--only-summary",
          "--stop-timeout", "5",
          "--csv", csvPrefix,
          "--csv-full-history",
          "--loglevel", "WARNING",
          "-H", plan.host,
          "-u", String(users),
          "-r", String(spawnRate),
          "-t", `${durationSeconds}s`,
        ],
        {
          timeoutMs: (durationSeconds + 60) * 1000,
          env: { ...process.env, APIFORGE_LOCUST_PLAN: planPath, PYTHONUNBUFFERED: "1" },
          hooks: { signal: options.signal, onLog: options.onLog, onProgress: (progress) => {
            stopReason = progress.stopReason || stopReason;
            completedRuns = progress.runs;
            options.onProgress?.(progress);
          } },
        },
      );
      const endedAt = new Date();

      const metrics = await this.readMetrics(csvPrefix, startedAt, endedAt);
      if (metrics.total === 0 && !options.signal?.aborted) {
        const detail = (result.stderr || result.stdout || "").trim().split("\n").slice(-5).join("\n");
        throw new ServiceUnavailableException(
          `Locust 未产生任何请求结果。${detail ? `输出：${detail}` : ""}`,
        );
      }
      if (![0, 1].includes(result.code) && !options.signal?.aborted) {
        throw new ServiceUnavailableException("压测进程异常退出或运行超时，请检查运行日志");
      }
      metrics.stopReason = options.signal?.aborted ? "manual" : stopReason ||
        (plan.mode === "requests" && completedRuns < Number(plan.totalRequests) ? "time_limit" : "completed");
      metrics.completedRuns = completedRuns;
      return metrics;
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async readMetrics(
    csvPrefix: string,
    startedAt: Date,
    endedAt: Date,
  ): Promise<LocustMetrics> {
    const durationMs = Math.max(endedAt.getTime() - startedAt.getTime(), 1);
    const stats = await this.readCsv(`${csvPrefix}_stats.csv`);
    const failuresCsv = await this.readCsv(`${csvPrefix}_failures.csv`);
    const history = await this.readCsv(`${csvPrefix}_stats_history.csv`);

    const dataRows = stats.rows.filter((row) => row[1] !== "Aggregated");
    const aggregates = stats.rows.filter((row) => row[1] === "Aggregated");
    const pick = (row: string[], key: string) => {
      const index = stats.header.indexOf(key);
      return index >= 0 ? Number(row[index]) || 0 : 0;
    };

    const endpoints: LocustEndpoint[] = dataRows.map((row) => ({
      method: row[0] || "GET",
      name: row[1] || "request",
      requestCount: pick(row, "Request Count"),
      failureCount: pick(row, "Failure Count"),
      avgResponseTime: Math.round(pick(row, "Average Response Time")),
      minResponseTime: Math.round(pick(row, "Min Response Time")),
      maxResponseTime: Math.round(pick(row, "Max Response Time")),
      medianResponseTime: Math.round(pick(row, "Median Response Time")),
      p95ResponseTime: Math.round(pick(row, "95%")),
      p99ResponseTime: Math.round(pick(row, "99%")),
      requestsPerSecond: Number(pick(row, "Requests/s").toFixed(2)),
    }));

    const useAggregate = aggregates[0];
    const total = useAggregate
      ? pick(useAggregate, "Request Count")
      : endpoints.reduce((sum, item) => sum + item.requestCount, 0);
    const failureCount = useAggregate
      ? pick(useAggregate, "Failure Count")
      : endpoints.reduce((sum, item) => sum + item.failureCount, 0);

    const weighted = (key: "avgResponseTime" | "medianResponseTime") => {
      if (useAggregate) return Math.round(pick(useAggregate, key === "avgResponseTime" ? "Average Response Time" : "Median Response Time"));
      if (!total) return 0;
      return Math.round(
        endpoints.reduce((sum, item) => sum + item[key] * item.requestCount, 0) / total,
      );
    };

    const failuresList: LocustFailure[] = failuresCsv.rows.map((row) => {
      const header = failuresCsv.header;
      return {
        method: row[header.indexOf("Method")] || "GET",
        name: row[header.indexOf("Name")] || "request",
        error: cleanLocustError(row[header.indexOf("Error")] || "Unknown error"),
        occurrences: Number(row[header.indexOf("Occurrences")]) || 0,
      };
    });

    // Runner prefixes assertion/HTTP failures with FAILED:; everything else is a transport/runtime error.
    const errors = failuresList
      .filter((item) => !item.error.includes("FAILED:"))
      .reduce((sum, item) => sum + item.occurrences, 0);

    const historyIndex = history.header.reduce<Record<string, number>>((acc, key, index) => {
      acc[key] = index;
      return acc;
    }, {});
    // Locust writes cumulative counters; derive per-interval rates from deltas.
    const aggregated = history.rows.filter(
      (row) => row[historyIndex["Name"]] === "Aggregated",
    );
    const timeline: LocustMetrics["timeline"] = [];
    let previous: { ts: number; count: number; failures: number } | null = null;
    for (const row of aggregated) {
      const raw = Number(row[historyIndex["Timestamp"]]) || 0;
      const ts = raw > 1e12 ? raw : raw * 1000;
      const count = Number(row[historyIndex["Total Request Count"]]) || 0;
      const failuresSoFar = Number(row[historyIndex["Total Failure Count"]]) || 0;
      if (previous && ts > previous.ts) {
        const seconds = (ts - previous.ts) / 1000;
        timeline.push({
          time: new Date(ts).toISOString(),
          rps: Math.round(((count - previous.count) / seconds) * 10) / 10,
          failures: Math.max(0, Math.round((failuresSoFar - previous.failures) / seconds)),
          avgResponseTime: Math.round(Number(row[historyIndex["Total Average Response Time"]]) || 0),
        });
      }
      previous = { ts, count, failures: failuresSoFar };
    }

    const minOf = (values: number[]) => (values.length ? Math.min(...values) : 0);
    const maxOf = (values: number[]) => (values.length ? Math.max(...values) : 0);

    return {
      total,
      failures: failureCount,
      failed: failureCount - errors,
      errors,
      avgResponseTime: weighted("avgResponseTime"),
      minResponseTime: useAggregate
        ? Math.round(pick(useAggregate, "Min Response Time"))
        : minOf(endpoints.map((item) => item.minResponseTime)),
      maxResponseTime: useAggregate
        ? Math.round(pick(useAggregate, "Max Response Time"))
        : maxOf(endpoints.map((item) => item.maxResponseTime)),
      p95ResponseTime: useAggregate
        ? Math.round(pick(useAggregate, "95%"))
        : maxOf(endpoints.map((item) => item.p95ResponseTime)),
      p99ResponseTime: useAggregate
        ? Math.round(pick(useAggregate, "99%"))
        : maxOf(endpoints.map((item) => item.p99ResponseTime)),
      throughput: useAggregate
        ? Number(pick(useAggregate, "Requests/s").toFixed(2))
        : Number(endpoints.reduce((sum, item) => sum + item.requestsPerSecond, 0).toFixed(2)),
      durationMs,
      startedAt,
      endedAt,
      endpoints,
      failuresList,
      timeline: timeline.slice(-300),
    };
  }

  private async readCsv(file: string): Promise<{ header: string[]; rows: string[][] }> {
    try {
      const text = await fs.readFile(file, "utf-8");
      const rows = parseCsv(text);
      if (rows.length === 0) return { header: [], rows: [] };
      return { header: rows[0], rows: rows.slice(1) };
    } catch {
      return { header: [], rows: [] };
    }
  }
}

/** Locust stores catch_response failures as CatchResponseError('FAILED: ...'). */
export function cleanLocustError(message: string): string {
  const match = message.match(/^CatchResponseError\((.*)\)$/s);
  if (!match) return message;
  const inner = match[1];
  const quote = inner[0];
  if ((quote === "'" || quote === '"') && inner.endsWith(quote)) {
    return inner.slice(1, -1).replace(new RegExp(`\\\\${quote}`, "g"), quote);
  }
  return inner;
}

/** Minimal RFC4180 CSV reader (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell !== ""));
}
