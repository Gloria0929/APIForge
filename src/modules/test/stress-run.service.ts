import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { LocustProgress, LocustRunHooks } from "./locust.service";

export interface StressRun {
  id: string;
  status: "running" | "stopping" | "completed" | "failed" | "stopped";
  startedAt: string;
  finishedAt?: string;
  projectId?: string;
  scenarioId?: string;
  config?: Record<string, any>;
  progress: LocustProgress & { rps: number };
  timeline: Array<LocustProgress & { rps: number }>;
  logs: string[];
  reportId?: string;
  summary?: any;
  performance?: any;
  endpoints?: any[];
  stopReason?: string;
  error?: string;
}

/** Active runs survive browser refreshes; completed reports are stored by TestService. */
@Injectable()
export class StressRunService {
  private readonly runs = new Map<string, StressRun>();
  private readonly controllers = new Map<string, AbortController>();

  active(): StressRun | null {
    return [...this.runs.values()].find(run => ["running", "stopping"].includes(run.status)) || null;
  }

  create(context: { projectId?: string; scenarioId?: string; config?: Record<string, any> } = {}): StressRun {
    if (this.active()) throw new ConflictException("已有压力测试正在运行，请先停止或等待完成");
    const run: StressRun = {
      ...context, id: randomUUID(), status: "running", startedAt: new Date().toISOString(),
      progress: { total: 0, failed: 0, runs: 0, elapsedSeconds: 0, rps: 0 }, timeline: [], logs: [],
    };
    this.runs.set(run.id, run);
    this.controllers.set(run.id, new AbortController());
    if (this.runs.size > 20) {
      const oldest = [...this.runs.keys()][0];
      this.runs.delete(oldest);
      this.controllers.delete(oldest);
    }
    return run;
  }

  get(id: string): StressRun {
    const run = this.runs.get(id);
    if (!run) throw new NotFoundException("压测任务不存在或已过期，已生成的报告仍可在历史记录中查看");
    return run;
  }

  stop(id: string): StressRun {
    const run = this.get(id);
    if (run.status === "running") {
      run.status = "stopping";
      this.log(run, "收到停止请求，正在结束压测并保存已收集的结果…");
      this.controllers.get(id)?.abort();
    }
    return run;
  }

  private log(run: StressRun, line: string) {
    run.logs.push(line.slice(0, 4000));
    if (run.logs.length > 200) run.logs.splice(0, run.logs.length - 200);
  }

  async execute(run: StressRun, task: (hooks: LocustRunHooks) => Promise<any>): Promise<void> {
    const controller = this.controllers.get(run.id)!;
    this.log(run, `压测开始（${run.startedAt}）`);
    try {
      const result = await task({
        signal: controller.signal,
        onProgress: progress => {
          const seconds = progress.elapsedSeconds - run.progress.elapsedSeconds;
          const rps = seconds > 0 ? Math.max(0, (progress.total - run.progress.total) / seconds) : run.progress.rps;
          run.progress = { ...progress, rps: Math.round(rps * 10) / 10 };
          run.timeline.push({ ...run.progress });
          if (run.timeline.length > 600) run.timeline.shift();
        },
        onLog: line => this.log(run, line),
      });
      run.stopReason = controller.signal.aborted ? "manual" : result?.summary?.stopReason || "completed";
      run.status = ["manual", "failure_rate", "time_limit"].includes(run.stopReason) ? "stopped" : "completed";
      run.reportId = result?.reportId;
      run.summary = result?.summary;
      run.performance = result?.performance;
      run.endpoints = (result?.results || []).filter((item: any) => item.requestsPerSecond != null);
      run.progress = {
        ...run.progress,
        total: Number(result?.summary?.total ?? run.progress.total),
        failed: Number(result?.summary?.failed ?? 0) + Number(result?.summary?.error ?? 0),
        runs: Number(result?.summary?.completedRuns ?? run.progress.runs),
      };
      this.log(run, `${run.status === "stopped" ? "压测已停止" : "压测完成"}：${run.progress.total} 个请求，失败 ${run.progress.failed}，报告已保存`);
    } catch (error: any) {
      run.status = controller.signal.aborted ? "stopped" : "failed";
      run.stopReason = controller.signal.aborted ? "manual" : undefined;
      run.error = controller.signal.aborted ? undefined : error?.message || String(error);
      this.log(run, run.error ? `压测失败：${run.error}` : "压测已停止，尚未收集到可生成报告的结果");
    } finally {
      run.finishedAt = new Date().toISOString();
      this.controllers.delete(run.id);
    }
  }
}
