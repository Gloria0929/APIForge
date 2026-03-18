import { defineStore } from "pinia";
import axios from "axios";
import { message } from "../utils/message";

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
  /** 批量分析进行中，切换路由不中断 */
  analyzingBulk: {
    projectId: string | null;
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
      this.loading = true;
      try {
        const response = await axios.get(
          `/api/ai/configs?projectId=${projectId}`,
        );
        if (response.data.length > 0) {
          const config = response.data[0];
          this.enabled = config.aiEnabled;
          this.configured = true;
          this.providerId = config.providerId ?? null;
          this.features = config.features || this.features;
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
      } catch (error) {
        console.error("Failed to get AI config:", error);
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
      this.loading = true;
      try {
        await axios.post("/api/ai/configs", {
          projectId,
          aiEnabled: config.aiEnabled,
          providerId: config.providerId ?? null,
        });
        this.enabled = config.aiEnabled;
        this.configured = true;
        this.providerId = config.providerId ?? null;
        if (config.features) this.features = config.features;
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
    async analyzeImportedApis(
      projectId: string,
      apiIds: string[],
      persist = true,
      onItemComplete?: (item: { apiId: string; tags: string[] }) => void,
    ) {
      const ids = Array.isArray(apiIds) ? apiIds.filter(Boolean) : [];
      if (ids.length === 0) {
        throw new Error("apiIds is required");
      }

      this.analyzingBulk = { projectId, total: ids.length, processed: 0 };
      let processed = 0;
      const errors: string[] = [];

      try {
        for (const apiId of ids) {
          try {
            const res = await axios.post("/api/ai/semantic-parse", {
              projectId,
              apiId,
              persist,
            });
            processed++;
            this.analyzingBulk = { projectId, total: ids.length, processed };
            const tags = res.data?.tags ?? [];
            onItemComplete?.({ apiId, tags });
          } catch (err: any) {
            errors.push(`${apiId}: ${this.getErrorMessage(err)}`);
          }
        }

        this.analyzingBulk = { projectId: null, total: 0, processed: 0 };
        if (errors.length > 0) {
          message.warning(
            `已完成 ${processed}/${ids.length} 个，${errors.length} 个失败`,
          );
        } else {
          message.success(`已完成 ${processed} 个接口的 AI 分析`);
        }
        return { processed, items: ids.map((id) => ({ apiId: id })) };
      } catch (error) {
        this.analyzingBulk = { projectId: null, total: 0, processed: 0 };
        message.error(error, "AI 批量分析失败");
        throw new Error(this.getErrorMessage(error));
      }
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
