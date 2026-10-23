import { defineStore } from "pinia";
import axios from "axios";
import { message } from "../utils/message";

export interface StressConfig {
  executionMode: "duration" | "requests";
  virtualUsers: number;
  durationSeconds: number;
  totalRequests: number;
  rampUpSeconds: number;
  stopOnFailRate: number;
  stepDelayMs: number;
  timeoutMs: number;
  reportName: string;
  environmentId: string;
}
export const defaultStressConfig = (): StressConfig => ({
  executionMode: "duration", virtualUsers: 10, durationSeconds: 30, totalRequests: 100,
  rampUpSeconds: 0, stopOnFailRate: 0, stepDelayMs: 0, timeoutMs: 30000, reportName: "", environmentId: "",
});
const STORAGE_KEY = "apiforge:stressRun";
const active = (run: any) => ["running", "stopping"].includes(run?.status);
let pollGeneration = 0;
const remember = (id?: string) => {
  try { if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY); } catch {}
};

export const useStressStore = defineStore("stress", {
  state: () => ({
    run: null as any, running: false, starting: false, restoring: false,
    dialogOpen: false, connectionError: "", projectId: "", scenarioId: "",
    config: defaultStressConfig(),
  }),
  getters: {
    percent(state): number {
      if (!state.run?.progress) return 0;
      if (state.run.status === "completed") return 100;
      const progress = state.run.progress;
      const value = state.config.executionMode === "requests"
        ? progress.runs / Math.max(1, state.config.totalRequests)
        : progress.elapsedSeconds / Math.max(1, state.config.durationSeconds);
      return Math.max(0, Math.min(99, Math.round(value * 100)));
    },
    statusText(state): string {
      if (state.starting) return "正在启动";
      if (state.run?.status === "stopping") return "正在停止";
      if (state.run?.status === "completed") return "已完成";
      if (state.run?.status === "stopped") {
        if (state.run.stopReason === "failure_rate") return "达到失败率阈值";
        if (state.run.stopReason === "time_limit") return "达到最长运行时间";
        return "已停止";
      }
      if (state.run?.status === "failed") return "运行失败";
      return state.running ? "运行中" : "准备就绪";
    },
  },
  actions: {
    applyRun(run: any) {
      this.run = run;
      this.running = active(run);
      this.projectId = run.projectId || this.projectId;
      this.scenarioId = run.scenarioId || this.scenarioId;
      this.config = { ...defaultStressConfig(), ...this.config, ...run.config };
      remember(run.id);
    },
    async start(payload: StressConfig & { projectId: string; scenarioId: string }) {
      if (this.running || this.starting || this.restoring) return false;
      const generation = ++pollGeneration;
      this.starting = true;
      this.running = true;
      this.connectionError = "";
      this.projectId = payload.projectId;
      this.scenarioId = payload.scenarioId;
      this.config = { ...payload };
      this.run = { status: "running", progress: { total: 0, failed: 0, runs: 0, elapsedSeconds: 0, rps: 0 }, logs: [], timeline: [] };
      try {
        const { data } = await axios.post("/api/tests/scenarios/stress", payload);
        if (generation !== pollGeneration) return false;
        this.run.id = data.runId;
        remember(data.runId);
        void this.poll(data.runId, generation);
        return true;
      } catch (error: any) {
        if (generation !== pollGeneration) return false;
        this.run = { ...this.run, status: "failed", error: this.errorText(error) };
        this.running = false;
        this.starting = false;
        remember();
        if (error?.response?.status === 409 || !error?.response) {
          // Another tab may have started a run, or a POST response may be lost.
          // Recover its actual state before permitting another start.
          await this.restore();
          if (this.running) {
            message.info("已恢复后台正在运行的压测任务");
            return this.scenarioId === payload.scenarioId;
          }
        }
        message.error(error, "无法启动压力测试");
        return false;
      } finally {
        if (generation === pollGeneration) this.starting = false;
      }
    },
    async poll(id: string, generation: number) {
      while (generation === pollGeneration) {
        try {
          const { data } = await axios.get(`/api/tests/stress-runs/${id}`);
          if (generation !== pollGeneration) return;
          this.connectionError = "";
          this.applyRun(data);
          if (!this.running) {
            if (data.status === "completed") message.success("压力测试完成，报告已保存");
            else if (data.status === "stopped") message.info("压测已停止，已保留收集到的结果");
            else message.error(data.error || "压力测试失败");
            return;
          }
        } catch (error: any) {
          if (generation !== pollGeneration) return;
          if ([401, 404].includes(error?.response?.status)) {
            this.run = { ...this.run, status: "failed", error: this.errorText(error) };
            this.running = false;
            remember();
            return;
          }
          // A lost poll is not a failed load test. Keep the task and reconnect.
          this.connectionError = "进度连接暂时中断，正在自动重连；后台任务可能仍在运行。";
        }
        await new Promise(resolve => setTimeout(resolve, this.connectionError ? 3000 : 1000));
      }
    },
    async restore() {
      if (this.running || this.starting || this.restoring) return;
      this.restoring = true;
      const generation = ++pollGeneration;
      try {
        let id: string | null = null;
        try { id = localStorage.getItem(STORAGE_KEY); } catch {}
        let run: any;
        if (id) {
          try { run = (await axios.get(`/api/tests/stress-runs/${id}`)).data; }
          catch (error: any) { if (error?.response?.status !== 404) throw error; remember(); }
        }
        if (!run?.id) run = (await axios.get('/api/tests/stress-runs/active')).data;
        if (generation !== pollGeneration || !run?.id) return;
        this.applyRun(run);
        if (this.running) void this.poll(run.id, generation);
      } catch {
        // A later visit to the workbench retries restoration without losing its draft.
      } finally {
        if (generation === pollGeneration) this.restoring = false;
      }
    },
    async stop() {
      if (!this.run?.id || !this.running || this.run.status === "stopping") return;
      try {
        const { data } = await axios.post(`/api/tests/stress-runs/${this.run.id}/stop`);
        this.applyRun(data);
      } catch (error) { message.error(error, "停止请求未送达，请重试"); }
    },
    dismiss() {
      if (this.running || this.starting) return;
      this.clear();
    },
    clear() {
      pollGeneration++;
      this.run = null;
      this.running = false;
      this.starting = false;
      this.restoring = false;
      this.connectionError = "";
      remember();
    },
    errorText(error: any): string {
      return String(error?.response?.data?.message || error?.message || "无法获取压测任务");
    },
  },
});
