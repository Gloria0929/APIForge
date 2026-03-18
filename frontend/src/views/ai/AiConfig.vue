<template>
  <PageContainerLayout
    title="模型服务配置"
    description="配置模型提供商、启用 AI 能力、检测健康状态，并为接口分析与测试生成提供统一入口。"
    container-class="ai-config"
  >
    <template #toolbar>
      <div class="ai-status-pill" :class="aiStore.available ? 'is-ok' : 'is-err'">
        <span class="ai-status-dot" />
        {{ aiStore.available ? "服务可用" : "服务不可用" }}
      </div>
    </template>

    <!-- ── 功能设置 ── -->
    <div class="config-section">
      <div class="config-section__header">
        <div>
          <h3 class="config-section__title">辅助功能设置</h3>
        </div>
      </div>

      <el-form label-width="130px" label-position="left" class="config-form">
        <el-form-item label="辅助功能">
          <el-switch v-model="aiConfig.aiEnabled" :loading="autoSavingEnabled" />
        </el-form-item>

        <el-form-item label="模型提供商">
          <div class="provider-row">
            <el-select v-model="aiConfig.providerId" placeholder="选择提供商" class="provider-select" popper-class="ai-config-dropdown">
              <el-option v-for="p in providers" :key="p.id" :label="p.name" :value="p.id">
                <span>{{ p.name }}</span>
                <el-tag v-if="!p.isActive" size="small" type="info" class="ml-2">未启用</el-tag>
              </el-option>
            </el-select>
            <el-button type="primary" @click="openProviderDialog">
              <el-icon class="mr-1"><Plus /></el-icon>新增
            </el-button>
          </div>
        </el-form-item>
        <div class="config-hint">启用功能需在编辑各提供商时单独配置</div>

        <el-form-item>
          <div class="config-actions">
            <el-button type="primary" @click="saveConfig">保存设置</el-button>
            <el-button :loading="testConnectionLoading" @click="testConnection">测试连接</el-button>
          </div>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="!aiStore.available"
        title="AI 服务不可用"
        description="请检查网络连接或 API Key 配置是否正确。"
        type="warning"
        show-icon
        :closable="false"
        class="mt-4"
      />
    </div>

    <!-- ── 提供商列表 ── -->
    <div class="config-section">
      <div class="config-section__header">
        <div>
          <h3 class="config-section__title">提供商列表</h3>
        </div>
        <el-button :loading="healthRefreshing" @click="() => refreshHealth()">
          <el-icon class="mr-1"><Refresh /></el-icon>刷新状态
        </el-button>
      </div>

      <el-empty v-if="providers.length === 0" class="app-empty" description="新增 OpenAI、DeepSeek、Gemini 等模型提供商后启用 AI 辅助功能" />

      <el-table v-else :data="pagedProviders" style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="100" />
        <el-table-column prop="providerType" label="提供商" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.providerType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="模型" min-width="160">
          <template #default="{ row }">
            <span class="text-xs font-mono" style="color: var(--text-secondary)">{{ row.model || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="启用功能" min-width="200">
          <template #default="{ row }">
            <span v-if="row.features && Object.values(row.features).some(Boolean)" class="text-xs">
              {{ featureList.filter((f) => row.features?.[f.key]).map((f) => f.name).join('、') || '-' }}
            </span>
            <span v-else class="text-slate-500">未配置</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140" align="center">
          <template #default="{ row }">
            <div class="provider-status-cell" :key="`${row.id}-${healthMapVersion}`">
              <span class="provider-dot" :class="healthMap[row.id]?.available ? 'is-ok' : 'is-err'" />
              <span>{{ healthMap[row.id]?.available ? "可用" : "不可用" }}</span>
              <span v-if="!row.isActive" class="provider-inactive">(未启用)</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <span class="table-action" @click="testProvider(row.id)"><el-icon><Connection /></el-icon>测试</span>
              <span class="table-action table-action--primary" @click="openEditProviderDialog(row)"><el-icon><EditPen /></el-icon>编辑</span>
              <span class="table-action table-action--danger" @click="deleteProvider(row.id)"><el-icon><Delete /></el-icon>删除</span>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="providers.length > 0" class="app-pagination">
        <div class="app-pagination-copy">共 {{ providerTotal }} 个提供商</div>
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="providerTotal"
          :current-page="providerPage"
          :page-size="providerSize"
          :page-sizes="[5, 10, 20]"
          @current-change="handleProviderPage"
          @size-change="handleProviderSize"
        />
      </div>
    </div>

    <!-- ── 新增提供商 ── -->
    <el-dialog v-model="providerDialogVisible" title="新增模型提供商" width="520px" destroy-on-close append-to-body>
      <el-form :model="providerForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="providerForm.name" placeholder="例如：OpenAI Production" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="providerForm.providerType" style="width: 100%" popper-class="ai-config-dropdown">
            <el-option v-for="opt in providerTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="API 地址" required>
          <el-input v-model="providerForm.baseUrl" placeholder="https://api.openai.com/v1/chat/completions" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="providerForm.apiKey" type="password" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item label="默认模型" required>
          <el-input v-model="providerForm.model" placeholder="gpt-4o-mini / deepseek-chat" />
        </el-form-item>
        <el-form-item label="启用功能">
          <el-select
            v-model="providerForm.features"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择该模型要启用的 AI 功能"
            style="width: 100%"
            popper-class="ai-config-dropdown"
          >
            <el-option v-for="f in featureList" :key="f.key" :label="f.name" :value="f.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="providerForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="providerDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createProvider">确定</el-button>
      </template>
    </el-dialog>

    <!-- ── 编辑提供商 ── -->
    <el-dialog v-model="providerEditDialogVisible" title="编辑 AI 提供商" width="520px" destroy-on-close append-to-body>
      <el-form :model="providerEditForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="providerEditForm.name" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="providerEditForm.providerType" style="width: 100%" popper-class="ai-config-dropdown">
            <el-option v-for="opt in providerTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="API 地址" required>
          <el-input v-model="providerEditForm.baseUrl" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="providerEditForm.apiKey" type="password" show-password />
        </el-form-item>
        <el-form-item label="默认模型" required>
          <el-input v-model="providerEditForm.model" placeholder="gpt-4o-mini / deepseek-chat" />
        </el-form-item>
        <el-form-item label="启用功能">
          <el-select
            v-model="providerEditForm.features"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择该模型要启用的 AI 功能"
            style="width: 100%"
            popper-class="ai-config-dropdown"
          >
            <el-option v-for="f in featureList" :key="f.key" :label="f.name" :value="f.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="providerEditForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="providerEditDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveProviderEdit">保存</el-button>
      </template>
    </el-dialog>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { Connection, EditPen, Delete, Plus, Refresh } from "@element-plus/icons-vue";
import { useAIStore } from "../../store/ai";
import axios from "axios";
import { usePagination } from "../../composables/usePagination";
import { message, confirmAction } from "../../utils/message";
import PageContainerLayout from "../../components/layout/PageContainerLayout.vue";

const route = useRoute();
const aiStore = useAIStore();
const projectId = computed(() => route.params.id as string);

const aiConfig = ref({
  aiEnabled: false,
  providerId: null as number | null,
});

const hydrated = ref(false);
const autoSavingEnabled = ref(false);
const lastCommittedAiEnabled = ref(false);
let autoSaveTimer: any = null;

const featureList = ref([
  { key: "semanticParse", name: "接口语义分析" },
  { key: "testGeneration", name: "自动生成测试用例" },
  { key: "assertionGeneration", name: "自动生成断言" },
  { key: "errorAnalysis", name: "测试失败分析" },
  { key: "reportSummary", name: "报告智能总结" },
]);

interface Provider {
  id: number;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
  model?: string;
  features?: Record<string, boolean> | null;
}

const providers = ref<Provider[]>([]);
const {
  currentPage: providerPage,
  pageSize: providerSize,
  total: providerTotal,
  pagedItems: pagedProviders,
  handleCurrentChange: handleProviderPage,
  handleSizeChange: handleProviderSize,
  resetPage: resetProviderPage,
} = usePagination(providers, 10);
const providerDialogVisible = ref(false);
const providerEditDialogVisible = ref(false);
const providerEditingId = ref<number | null>(null);
const skipProviderTypeWatch = ref(false);
const healthMap = ref<Record<number, any>>({});
const healthMapVersion = ref(0);
const healthRefreshing = ref(false);
const testConnectionLoading = ref(false);
const providerForm = ref({
  name: "",
  providerType: "openai",
  baseUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "",
  features: [] as string[],
  isActive: true,
});
const providerEditForm = ref({
  name: "",
  providerType: "openai",
  baseUrl: "",
  apiKey: "",
  model: "",
  features: [] as string[],
  isActive: true,
});

watch(providers, () => resetProviderPage());

const providerTypeOptions = [
  { label: "OpenAI", value: "openai" },
  { label: "DeepSeek", value: "deepseek" },
  { label: "Azure OpenAI", value: "azure" },
  { label: "Grok", value: "grok" },
  { label: "通义千问 (Qwen)", value: "qwen" },
  { label: "月之暗面 (Moonshot)", value: "moonshot" },
  { label: "智谱 (GLM)", value: "zhipu" },
  { label: "Anthropic (Claude)", value: "anthropic" },
  { label: "Google (Gemini)", value: "gemini" },
  { label: "自定义", value: "custom" },
];

const getProviderDefaults = (providerType: string) => {
  switch (providerType) {
    case "openai":
      return { baseUrl: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" };
    case "deepseek":
      return { baseUrl: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" };
    case "azure":
      return { baseUrl: "https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-02-15", model: "gpt-4o-mini" };
    case "grok":
      return { baseUrl: "https://api.x.ai/v1/chat/completions", model: "grok-2" };
    case "qwen":
      return { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" };
    case "moonshot":
      return { baseUrl: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-8k" };
    case "zhipu":
      return { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" };
    case "anthropic":
      return { baseUrl: "https://api.anthropic.com/v1/messages", model: "claude-3-5-sonnet-20241022" };
    case "gemini":
      return { baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-1.5-flash" };
    default:
      return { baseUrl: "", model: "" };
  }
};

onMounted(async () => {
  await fetchProviders();
  await aiStore.getProjectConfig(projectId.value);
  await refreshHealth();

  aiConfig.value = {
    aiEnabled: aiStore.enabled,
    providerId: aiStore.providerId,
  };
  lastCommittedAiEnabled.value = aiConfig.value.aiEnabled;
  hydrated.value = true;
});

watch(
  () => aiConfig.value.aiEnabled,
  () => {
    if (!hydrated.value) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    autoSaveTimer = setTimeout(async () => {
      const desired = Boolean(aiConfig.value.aiEnabled);
      if (desired === lastCommittedAiEnabled.value) return;

      autoSavingEnabled.value = true;
      try {
        await aiStore.updateProjectConfig(projectId.value, {
          aiEnabled: desired,
          providerId: aiConfig.value.providerId,
        });
        lastCommittedAiEnabled.value = desired;
        message.success(desired ? "AI 辅助已启用" : "AI 辅助已关闭");
      } catch (e) {
        console.error("Failed to auto-save aiEnabled:", e);
        aiConfig.value.aiEnabled = lastCommittedAiEnabled.value;
        message.error("自动保存失败，已回滚");
      } finally {
        autoSavingEnabled.value = false;
      }
    }, 250);
  },
);

watch(
  () => providerForm.value.providerType,
  (t) => {
    const d = getProviderDefaults(t);
    providerForm.value.baseUrl = d.baseUrl;
    providerForm.value.model = d.model;
  },
);

watch(
  () => providerEditForm.value.providerType,
  (t) => {
    if (skipProviderTypeWatch.value) return;
    const d = getProviderDefaults(t);
    providerEditForm.value.baseUrl = d.baseUrl;
    providerEditForm.value.model = d.model;
  },
);

const fetchProviders = async () => {
  try {
    const response = await axios.get("/api/ai/providers");
    providers.value = response.data;
  } catch (error) {
    console.error("Failed to fetch providers:", error);
  }
};

const refreshHealth = async (silent = false) => {
  if (!silent) healthRefreshing.value = true;
  try {
    // 用户点击「刷新状态」时执行与「测试连接」相同的实际健康检查，测试所有提供商
    const url = silent ? "/api/ai/health" : "/api/ai/providers/test-all";
    const method = silent ? "get" : "post";
    const res = await axios[method](url);
    const list = res.data.providers || [];
    const map: Record<number, any> = {};
    list.forEach((p: any) => {
      map[p.id] = p;
    });
    healthMap.value = map;
    healthMapVersion.value += 1;
    aiStore.available = Boolean(res.data.available);
    if (!silent) message.success("状态已刷新");
  } catch (e) {
    console.error("Failed to refresh AI health:", e);
    if (!silent) message.error("刷新失败，请检查网络或后端服务");
  } finally {
    if (!silent) healthRefreshing.value = false;
  }
};

const openProviderDialog = () => {
  const defaults = getProviderDefaults("openai");
  providerForm.value = {
    name: "",
    providerType: "openai",
    baseUrl: defaults.baseUrl,
    apiKey: "",
    model: defaults.model,
    features: [],
    isActive: true,
  };
  providerDialogVisible.value = true;
};

const createProvider = async () => {
  if (!providerForm.value.model.trim()) {
    providerForm.value.model = getProviderDefaults(providerForm.value.providerType).model;
  }
  if (!providerForm.value.model.trim()) {
    message.warning("请填写模型名称");
    return;
  }
  try {
    const payload = {
      ...providerForm.value,
      features: providerForm.value.features.length
        ? Object.fromEntries(
            featureList.value.map((f) => [f.key, providerForm.value.features.includes(f.key)]),
          )
        : undefined,
    };
    await axios.post("/api/ai/providers", payload);
    providerDialogVisible.value = false;
    await fetchProviders();
    await refreshHealth(true);
    message.success("提供商创建成功");
  } catch (error) {
    console.error("Failed to create provider:", error);
    message.error("创建提供商失败");
  }
};

const featuresToArray = (f?: Record<string, boolean> | null): string[] =>
  f ? Object.entries(f).filter(([, v]) => v).map(([k]) => k) : [];

const openEditProviderDialog = (p: Provider) => {
  const defaults = getProviderDefaults(p.providerType);
  providerEditingId.value = p.id;
  skipProviderTypeWatch.value = true;
  providerEditForm.value = {
    name: p.name,
    providerType: p.providerType,
    baseUrl: p.baseUrl || defaults.baseUrl,
    apiKey: p.apiKey,
    model: p.model || defaults.model,
    features: featuresToArray(p.features),
    isActive: Boolean(p.isActive),
  };
  providerEditDialogVisible.value = true;
  nextTick(() => {
    skipProviderTypeWatch.value = false;
  });
};

const saveProviderEdit = async () => {
  if (!providerEditingId.value) return;
  if (!providerEditForm.value.model.trim()) {
    providerEditForm.value.model = getProviderDefaults(providerEditForm.value.providerType).model;
  }
  if (!providerEditForm.value.model.trim()) {
    message.warning("请填写模型名称");
    return;
  }
  try {
    const payload = {
      ...providerEditForm.value,
      features: providerEditForm.value.features.length
        ? Object.fromEntries(
            featureList.value.map((f) => [f.key, providerEditForm.value.features.includes(f.key)]),
          )
        : undefined,
    };
    await axios.put(`/api/ai/providers/${providerEditingId.value}`, payload);
    providerEditDialogVisible.value = false;
    await fetchProviders();
    await refreshHealth(true);
    message.success("提供商已更新");
  } catch (e) {
    console.error("Failed to update provider:", e);
    message.error("更新失败");
  }
};

const deleteProvider = async (id: number) => {
  try {
    await confirmAction("确定删除该提供商吗？此操作不可恢复。", "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await axios.delete(`/api/ai/providers/${id}`);
    if (aiConfig.value.providerId === id) {
      aiConfig.value.providerId = null;
    }
    await fetchProviders();
    await refreshHealth(true);
    message.success("已删除");
  } catch (e) {
    console.error("Failed to delete provider:", e);
    message.error("删除失败");
  }
};

const testProvider = async (id: number) => {
  try {
    const response = await axios.post(`/api/ai/providers/${id}/test`);
    if (response.data.available) {
      message.success("连接成功");
    } else {
      const detail =
        response.data.error ||
        (response.data.statusCode ? `HTTP ${response.data.statusCode}` : "");
      const urlHint = response.data.healthUrl
        ? ` (${response.data.healthUrl})`
        : "";
      message.error(detail ? `连接失败：${detail}${urlHint}` : "连接失败");
    }
    await refreshHealth(true);
  } catch (e) {
    console.error("Failed to test provider:", e);
    message.error("连接失败");
  }
};

const saveConfig = async () => {
  try {
    await aiStore.updateProjectConfig(projectId.value, {
      aiEnabled: aiConfig.value.aiEnabled,
      providerId: aiConfig.value.providerId,
    });
    lastCommittedAiEnabled.value = Boolean(aiConfig.value.aiEnabled);
    message.success("设置已保存");
  } catch (error) {
    console.error("Failed to save config:", error);
    message.error("配置保存失败");
  }
};

const testConnection = async () => {
  if (!aiConfig.value.providerId) {
    message.warning("请选择 AI 提供商");
    return;
  }
  testConnectionLoading.value = true;
  try {
    const response = await axios.post(
      `/api/ai/providers/${aiConfig.value.providerId}/test`,
    );
    if (response.data.available) {
      message.success("连接成功");
    } else {
      const detail =
        response.data.error ||
        (response.data.statusCode ? `HTTP ${response.data.statusCode}` : "");
      const urlHint = response.data.healthUrl
        ? ` (${response.data.healthUrl})`
        : "";
      message.error(detail ? `连接失败：${detail}${urlHint}` : "连接失败");
    }
    await refreshHealth(true);
  } catch (error) {
    console.error("Failed to test connection:", error);
    message.error("连接失败");
  } finally {
    testConnectionLoading.value = false;
  }
};
</script>

<style scoped>
.config-section {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-background);
  padding: 20px;
}

.config-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.config-section__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 4px 0 0;
}

.config-form {
  max-width: 680px;
  margin: 0 auto;
}

.config-form--centered :deep(.el-form-item__content) {
  justify-content: center;
}

.config-form--centered .provider-row {
  justify-content: center;
}

.config-form--centered .config-actions {
  justify-content: center;
}

/* ── AI status pill ── */
.ai-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--border-color);
  background: var(--card-background);
}

.ai-status-pill.is-ok {
  border-color: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.ai-status-pill.is-err {
  border-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.ai-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.provider-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.provider-select {
  flex: 1;
}

:deep(.config-form .el-select .el-select__wrapper .el-select__selected-item),
:deep(.config-form .el-select .el-select__placeholder) {
  color: #ededf0 !important;
}

.provider-status-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.provider-inactive {
  font-size: 12px;
  color: var(--text-muted);
}

.config-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 4px 0 16px 130px;
}

/* ── Config actions ── */
.config-actions {
  display: flex;
  gap: 8px;
}

/* ── Provider dot ── */
.provider-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.provider-dot.is-ok {
  background: #4ade80;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

.provider-dot.is-err {
  background: #f87171;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.3);
}

@media (max-width: 768px) {
  .provider-row {
    flex-direction: column;
  }

  .config-actions {
    flex-direction: column;
  }
}
</style>
