import { defineStore } from "pinia";
import axios from "axios";
import { message } from "../utils/message";

let bulkPollTimer: ReturnType<typeof setTimeout> | undefined;
let bulkPollGeneration = 0;
let configRequestGeneration = 0;

interface AIState {
  configured: boolean;
  enabled: boolean;
  available: boolean;
  providerId: number | null;
  features: {
    testGeneration: boolean;
    assertionGeneration: boolean;
    errorAnalysis: boolean;
    reportSummary: boolean;
    semanticParse: boolean;
  };
  usage: {
    today: number;
    total: number;
    limit?: number;
  };
  loading: boolean;
  startingBulk: boolean;
  /** 批量分析进行中，切换路由不中断 */
  analyzingBulk: {
    projectId: string | null;
    jobId?: string;
    completed?: number;
    failed?: number;
    total?: number;
    processed?: number;
  };
}

export const useAIStore = defineStore("ai", {
  state: (): AIState => ({
    configured: false,
    enabled: false,
    available: false,
    providerId: null,
    features: {
      testGeneration: false,
      assertionGeneration: false,
      errorAnalysis: false,
      reportSummary: false,
      semanticParse: false,
    },
    usage: {
      today: 0,
      total: 0,
    },
    loading: false,
    startingBulk: false,
    analyzingBulk: { projectId: null, total: 0, processed: 0 },
  }),
  actions: {
    getErrorMessage(error: any) {
      const message = error?.response?.data?.message;
      if (Array.isArray(message)) return message.join("；");
      if (typeof message === "string" && message.trim()) return message;
      if (typeof error?.message === "string" && error.message.trim()) {
        return error.message;
      }
      return "AI 请求失败";
    },
    async checkHealth() {
      this.loading = true;
      try {
        const response = await axios.get("/api/ai/health");
        this.available = response.data.available;
        // Backend health currently returns { available, providers }. Do not clobber feature flags here.
      } catch (error) {
        console.error("Failed to check AI health:", error);
        this.available = false;
      } finally {
        this.loading = false;
      }
    },
    async getProjectConfig(projectId: string) {
      const generation = ++configRequestGeneration;
      this.loading = true;
      try {
        const response = await axios.get(
          `/api/ai/configs?projectId=${projectId}`,
        );
        if (!Array.isArray(response.data)) throw new Error("配置响应格式无效");
        if (generation !== configRequestGeneration) return;
        if (response.data.length > 0) {
          const config = response.data[0];
          this.enabled = config.aiEnabled;
          this.configured = true;
          this.providerId = config.providerId ?? null;
          this.features = { testGeneration: false, assertionGeneration: false, errorAnalysis: false, reportSummary: false, semanticParse: false, ...config.features };
        } else {
          this.enabled = false;
          this.configured = false;
          this.providerId = null;
          this.features = {
            testGeneration: false,
            assertionGeneration: false,
            errorAnalysis: false,
            reportSummary: false,
            semanticParse: false,
          };
        }
        return { aiEnabled: this.enabled, providerId: this.providerId };
      } catch (error) {
        console.error("Failed to get AI config:", error);
        if (generation !== configRequestGeneration) return;
        this.enabled = false;
        this.configured = false;
        this.providerId = null;
        this.features = {
          testGeneration: false,
          assertionGeneration: false,
          errorAnalysis: false,
          reportSummary: false,
          semanticParse: false,
        };
      } finally {
        this.loading = false;
      }
    },
    async updateProjectConfig(projectId: string, config: any) {
      configRequestGeneration++;
      this.loading = true;
      try {
        const { data } = await axios.post("/api/ai/configs", {
          projectId,
          aiEnabled: config.aiEnabled,
          providerId: config.providerId ?? null,
        });
        this.enabled = config.aiEnabled;
        this.configured = true;
        this.providerId = config.providerId ?? null;
        if (data.features) this.features = data.features;
      } catch (error) {
        console.error("Failed to update AI config:", error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async generateTests(projectId: string, apiId: string) {
      this.loading = true;
      try {
        const response = await axios.post("/api/ai/generate-tests", {
          projectId,
          apiId,
        });
        return response.data;
      } catch (error) {
        console.error("Failed to generate tests:", error);
        throw new Error(this.getErrorMessage(error));
      } finally {
        this.loading = false;
      }
    },
    async semanticParseApi(projectId: string, apiId: string, persist = false) {
      this.loading = true;
      try {
        const response = await axios.post("/api/ai/semantic-parse", {
          projectId,
          apiId,
          persist,
        });
        return response.data;
      } catch (error) {
        console.error("Failed to semantic-parse api:", error);
        throw new Error(this.getErrorMessage(error));
      } finally {
        this.loading = false;
      }
    },
    stopBulkPolling() {
      bulkPollGeneration++;
      clearTimeout(bulkPollTimer);
      this.analyzingBulk = { projectId: null, total: 0, processed: 0 };
    },
    async restoreBulkAnalysis() {
      this.stopBulkPolling();
      const generation = bulkPollGeneration;
      try {
        const { data: active } = await axios.get("/api/ai/analysis-jobs/active");
        if (generation !== bulkPollGeneration) return;
        let job = active;
        const saved = localStorage.getItem("apiforge:analysisJob");
        if (!job && saved) {
          try { job = (await axios.get(`/api/ai/analysis-jobs/${saved}`)).data; }
          catch (error: any) {
            if (error?.response?.status === 404) localStorage.removeItem("apiforge:analysisJob");
            else throw error;
          }
        }
        if (generation !== bulkPollGeneration || !job) return;
        this.applyBulkJob(job);
        if (job.status === "running") this.pollBulkJob(job.id, generation);
      } catch (error) {
        if (generation === bulkPollGeneration) {
          bulkPollTimer = setTimeout(() => { void this.restoreBulkAnalysis(); }, 5000);
        }
      }
    },
    applyBulkJob(job: any) {
      if (job.status === "running") {
        localStorage.setItem("apiforge:analysisJob", job.id);
        this.analyzingBulk = { projectId: job.projectId, jobId: job.id, total: job.total, processed: job.processed, completed: job.completed, failed: job.failed };
        return;
      }
      localStorage.removeItem("apiforge:analysisJob");
      this.analyzingBulk = { projectId: null, total: 0, processed: 0 };
      if (job.status === "failed") message.error(job.errors?.[0] || "AI 批量分析失败");
      else if (job.failed) message.warning(`分析完成：${job.completed} 个成功，${job.failed} 个失败`);
      else message.success(`已完成 ${job.completed} 个接口的 AI 分析`);
    },
    pollBulkJob(id: string, generation = bulkPollGeneration) {
      clearTimeout(bulkPollTimer);
      bulkPollTimer = setTimeout(async () => {
        if (generation !== bulkPollGeneration) return;
        try {
          const { data } = await axios.get(`/api/ai/analysis-jobs/${id}`);
          if (generation !== bulkPollGeneration) return;
          this.applyBulkJob(data);
          if (data.status === "running") this.pollBulkJob(id, generation);
        } catch (error: any) {
          if (generation !== bulkPollGeneration) return;
          if (error?.response?.status === 404) {
            localStorage.removeItem("apiforge:analysisJob");
            this.stopBulkPolling();
          } else this.pollBulkJob(id, generation);
        }
      }, 1500);
    },
    async analyzeImportedApis(projectId: string, apiIds: string[], persist = true) {
      if (this.analyzingBulk.projectId || this.startingBulk) throw new Error("已有分析任务正在进行");
      this.startingBulk = true;
      const generation = bulkPollGeneration;
      try {
        const { data } = await axios.post("/api/ai/analysis-jobs", { projectId, apiIds, persist });
        if (generation !== bulkPollGeneration) return;
        this.applyBulkJob(data);
        if (data.status === "running") this.pollBulkJob(data.id);
        return data;
      } catch (error) {
        message.error(error, "启动 AI 批量分析失败");
        throw error;
      } finally { this.startingBulk = false; }
    },
    async generateAssertions(projectId: string, response: any) {
      this.loading = true;
      try {
        const res = await axios.post("/api/ai/generate-assertions", {
          projectId,
          response,
        });
        return res.data;
      } catch (error) {
        console.error("Failed to generate assertions:", error);
        throw new Error(this.getErrorMessage(error));
      } finally {
        this.loading = false;
      }
    },
    async analyzeError(projectId: string, error: any) {
      this.loading = true;
      try {
        const res = await axios.post("/api/ai/analyze-error", {
          projectId,
          error,
        });
        return res.data;
      } catch (error) {
        console.error("Failed to analyze error:", error);
        throw new Error(this.getErrorMessage(error));
      } finally {
        this.loading = false;
      }
    },
    async summarizeReport(projectId: string, report: any, reportId?: string) {
      this.loading = true;
      try {
        const res = await axios.post("/api/ai/summarize-report", {
          projectId,
          reportId,
          report,
        });
        return res.data;
      } catch (error) {
        console.error("Failed to summarize report:", error);
        throw new Error(this.getErrorMessage(error));
      } finally {
        this.loading = false;
      }
    },
  },
});
