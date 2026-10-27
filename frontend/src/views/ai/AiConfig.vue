<template>
  <PageContainerLayout
    title="模型服务配置"
    description="配置模型提供商、按功能分配模型、检测连接状态，并为接口分析与测试生成提供统一入口。"
    container-class="ai-config"
  >
    <template #toolbar>
      <div class="ai-status-pill" :class="aiStore.available ? 'is-ok' : 'is-err'">
        <span class="ai-status-dot" />
        {{ aiStore.available ? "服务可用" : "服务不可用" }}
      </div>
    </template>

    <!-- ── 功能与模型 ── -->
    <div class="config-section">
      <div class="config-section__header">
        <div class="config-section__heading">
          <h3 class="config-section__title">功能与模型</h3>
          <p class="config-section__desc">
            为每项功能指定已启用的模型，或保持「自动选择」由系统分配。模型仅承担其「启用功能」中勾选的能力。
          </p>
        </div>
        <el-button text :loading="routingLoading" @click="loadRouting">
          <el-icon class="mr-1"><Refresh /></el-icon>刷新
        </el-button>
      </div>

      <el-skeleton v-if="routingLoading && !routing" :rows="4" animated />
      <el-table v-else :data="routingRows" size="small" class="feature-routing__table">
          <el-table-column label="功能" min-width="150">
            <template #default="{ row }">
              <div class="feature-routing__name">{{ row.label }}</div>
              <div class="feature-routing__source">
                {{ sourceLabel(row.source) }}<template v-if="row.candidates.length > 1"> · {{ row.candidates.length }} 个模型可选</template>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="使用的模型" min-width="230">
            <template #default="{ row }">
              <el-select
                v-if="row.candidates.length"
                :model-value="explicitBinding(row.feature)"
                :disabled="bindingSaving === row.feature"
                :loading="bindingSaving === row.feature"
                size="small"
                style="width: 100%"
                popper-class="ai-config-dropdown"
                @change="(value: number) => saveFeatureBinding(row.feature, value || null)"
              >
                <el-option label="自动选择" :value="0" />
                <el-option
                  v-for="candidate in row.candidates"
                  :key="candidate.id"
                  :label="candidate.model || '未设置模型'"
                  :value="candidate.id"
                >
                  <span class="feature-routing__option-model">{{ candidate.model || "未设置模型" }}</span>
                  <span class="feature-routing__option-provider">{{ candidate.name }}</span>
                </el-option>
              </el-select>
              <span v-else class="text-muted feature-routing__empty">没有已启用的模型勾选此功能</span>
            </template>
          </el-table-column>
          <el-table-column label="实际生效" min-width="200" align="center">
            <template #default="{ row }">
              <template v-if="row.providerName">
                <div class="feature-routing__effective">
                  <span class="provider-dot is-ok" />
                  <span class="feature-routing__effective-model">{{ row.model || "未设置模型" }}</span>
                </div>
                <div class="feature-routing__effective-provider">{{ row.providerName }}</div>
              </template>
              <el-tag v-else size="small" type="info">不可用</el-tag>
              <div v-if="row.staleProviderId" class="feature-routing__warn">原先指定的模型已不可用，已自动改选</div>
            </template>
          </el-table-column>
      </el-table>
    </div>

    <!-- ── 模型列表 ── -->
    <div class="config-section">
      <div class="config-section__header">
        <div class="config-section__heading">
          <div class="config-section__title-row">
            <h3 class="config-section__title">模型列表</h3>
            <span v-if="providers.length" class="config-section__count">{{ providers.length }}</span>
          </div>
          <p class="config-section__desc">维护模型名称、启用功能与连接状态。新增并启用模型后，AI 辅助功能自动开启。</p>
        </div>
        <div class="config-section__actions">
          <el-button
            :loading="healthRefreshing"
            title="对所有模型执行一次真实连通性检测，并刷新状态列"
            @click="refreshHealth(false)"
          >
            <el-icon class="mr-1"><Refresh /></el-icon>测试连接
          </el-button>
          <el-button type="primary" @click="openProviderDialog">
            <el-icon class="mr-1"><Plus /></el-icon>新增模型
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="providers.length && !aiStore.available"
        title="AI 服务不可用"
        description="请检查网络连接或 API Key 配置，也可以点击「测试连接」重新检测。"
        type="warning"
        show-icon
        :closable="false"
        class="config-section__alert"
      />

      <el-empty v-if="providers.length === 0" class="app-empty" description="新增 OpenAI、DeepSeek、Gemini 等模型提供商后即可使用 AI 辅助功能" />

      <el-table v-else :data="pagedProviders" style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="100" show-overflow-tooltip />
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
            <span v-else class="text-muted">未配置</span>
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

      <div v-if="providers.length > 0 && providerTotal > providerSize" class="app-pagination">
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
        <el-form-item label="API Key" class="field-hint-item">
          <el-input v-model="providerForm.apiKey" type="password" show-password placeholder="sk-...（Ollama 等本地服务可留空）" />
          <div class="field-hint">Ollama 等本地服务无需 Key，留空即可。</div>
        </el-form-item>
        <el-form-item label="默认模型" required class="provider-model-item">
          <ProviderModelSelect v-model="providerForm.model" :provider-type="providerForm.providerType" :base-url="providerForm.baseUrl" :api-key="providerForm.apiKey" />
        </el-form-item>
        <ProviderReasoningSelect v-model="providerForm.reasoningEffort" :model="providerForm.model"
          :provider-type="providerForm.providerType" :base-url="providerForm.baseUrl" :api-key="providerForm.apiKey"
          @loading="providerReasoningLoading = $event" />
        <el-form-item label="上下文长度">
          <el-select v-model="providerForm.contextWindow" placeholder="选填，默认使用模型自身限制" aria-label="上下文长度（Token）"
            style="width: 100%" popper-class="ai-config-dropdown">
            <el-option label="模型默认值（选填）" :value="0" />
            <el-option v-for="value in contextWindowOptions(providerForm.contextWindow)" :key="value"
              :label="contextWindowLabel(value)" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用功能" class="feature-select-item">
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
          <div class="field-hint">只有勾选的功能会使用该模型；同一功能可以勾选多个模型，实际调用哪个在上方「功能与模型」中指定。</div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="providerForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="providerDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="providerSaving" :disabled="providerReasoningLoading" @click="createProvider">确定</el-button>
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
        <el-form-item label="API Key" class="field-hint-item">
          <el-input v-model="providerEditForm.apiKey" type="password" show-password placeholder="留空保留已保存的 Key" />
          <div class="field-hint">Ollama 等本地服务无需 Key，留空即可。</div>
        </el-form-item>
        <el-form-item label="默认模型" required class="provider-model-item">
          <ProviderModelSelect v-model="providerEditForm.model" :provider-id="providerEditingId" :provider-type="providerEditForm.providerType" :base-url="providerEditForm.baseUrl" :api-key="providerEditForm.apiKey" />
        </el-form-item>
        <ProviderReasoningSelect v-model="providerEditForm.reasoningEffort" :model="providerEditForm.model" :provider-id="providerEditingId"
          :provider-type="providerEditForm.providerType" :base-url="providerEditForm.baseUrl" :api-key="providerEditForm.apiKey"
          @loading="providerReasoningLoading = $event" />
        <el-form-item label="上下文长度">
          <el-select v-model="providerEditForm.contextWindow" placeholder="选填，默认使用模型自身限制" aria-label="上下文长度（Token）"
            style="width: 100%" popper-class="ai-config-dropdown">
            <el-option label="模型默认值（选填）" :value="0" />
            <el-option v-for="value in contextWindowOptions(providerEditForm.contextWindow)" :key="value"
              :label="contextWindowLabel(value)" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用功能" class="feature-select-item">
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
          <div class="field-hint">只有勾选的功能会使用该模型；同一功能可以勾选多个模型，实际调用哪个在上方「功能与模型」中指定。</div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="providerEditForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="providerEditDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="providerSaving" :disabled="providerReasoningLoading" @click="saveProviderEdit">保存</el-button>
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
import ProviderModelSelect from "../../components/ai/ProviderModelSelect.vue";
import ProviderReasoningSelect from "../../components/ai/ProviderReasoningSelect.vue";
import PageContainerLayout from "../../components/layout/PageContainerLayout.vue";

const route = useRoute();
const aiStore = useAIStore();
const projectId = computed(() => route.params.id as string);

/** 项目级默认模型仍保留在后端配置里，保存功能绑定时原样带回，页面不再单独提供选择器 */
const defaultProviderId = ref<number | null>(null);

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
  reasoningEffort?: string;
  contextWindow?: number | null;
  features?: Record<string, boolean> | null;
}

const providers = ref<Provider[]>([]);

interface FeatureRouteRow {
  feature: string;
  label: string;
  providerId: number | null;
  providerName: string | null;
  model: string | null;
  source: "explicit" | "default" | "auto" | "none";
  staleProviderId: number | null;
  candidates: { id: number; name: string; model: string | null }[];
}
interface FeatureRouting {
  aiEnabled: boolean;
  defaultProviderId: number | null;
  featureProviders: Record<string, number>;
  routes: FeatureRouteRow[];
}
const routing = ref<FeatureRouting | null>(null);
const routingLoading = ref(false);
const bindingSaving = ref<string | null>(null);
const routingRows = computed(() => routing.value?.routes || []);
const explicitBinding = (feature: string) => Number(routing.value?.featureProviders?.[feature] || 0);
const SOURCE_LABELS: Record<string, string> = {
  explicit: "手动指定",
  default: "默认模型承接",
  auto: "自动分配",
  none: "未配置",
};
const sourceLabel = (source: string) => SOURCE_LABELS[source] || "";

/** 各功能当前实际使用的模型（以后端路由结果为准，避免前后端规则不一致） */
const loadRouting = async () => {
  routingLoading.value = true;
  try {
    const { data } = await axios.get("/api/ai/feature-routing", {
      params: { projectId: projectId.value },
    });
    routing.value = data;
  } catch (error) {
    console.error("Failed to load feature routing:", error);
  } finally {
    routingLoading.value = false;
  }
};

const saveFeatureBinding = async (feature: string, providerId: number | null) => {
  if (!routing.value || bindingSaving.value) return;
  const next = { ...(routing.value.featureProviders || {}) };
  if (providerId) next[feature] = providerId;
  else delete next[feature];
  bindingSaving.value = feature;
  try {
    await axios.post("/api/ai/configs", {
      projectId: projectId.value,
      aiEnabled: true,
      providerId: defaultProviderId.value,
      featureProviders: next,
    });
    await Promise.all([loadRouting(), aiStore.getProjectConfig(projectId.value)]);
    message.success("功能绑定已更新");
  } catch (error) {
    console.error("Failed to save feature binding:", error);
    message.error(error, "保存失败");
    await loadRouting();
  } finally {
    bindingSaving.value = null;
  }
};
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
const providerSaving = ref(false);
const providerEditDialogVisible = ref(false);
const providerEditingId = ref<number | null>(null);
const skipProviderTypeWatch = ref(false);
const healthMap = ref<Record<number, any>>({});
const healthMapVersion = ref(0);
const healthRefreshing = ref(false);
const providerForm = ref({
  name: "",
  providerType: "openai",
  baseUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "",
  reasoningEffort: "",
  contextWindow: undefined as number | undefined,
  features: [] as string[],
  isActive: true,
});
const providerEditForm = ref({
  name: "",
  providerType: "openai",
  baseUrl: "",
  apiKey: "",
  model: "",
  reasoningEffort: "",
  contextWindow: undefined as number | undefined,
  features: [] as string[],
  isActive: true,
});

const providerReasoningLoading = ref(false);

const contextWindowPresets = [4000, 8000, 16000, 32000, 64000, 128000, 200000, 256000, 512000, 1000000, 2000000];
const contextWindowOptions = (current?: number) =>
  [...new Set([...contextWindowPresets, ...(current ? [current] : [])])].sort((a, b) => a - b);
const contextWindowLabel = (value: number) =>
  `${value >= 1000000 ? `${value / 1000000}M` : `${value / 1000}K`}（${value.toLocaleString('en-US')} Token）`;

watch(providers, () => resetProviderPage());

const providerTypeOptions = [
  { label: "Ollama（本地）", value: "ollama" },
  { label: "OpenAI", value: "openai" },
  { label: "DeepSeek", value: "deepseek" },
  { label: "Azure OpenAI", value: "azure" },
  { label: "Grok", value: "grok" },
  { label: "通义千问 (Qwen)", value: "qwen" },
  { label: "月之暗面 (Moonshot)", value: "moonshot" },
  { label: "智谱 (GLM)", value: "zhipu" },
  { label: "Anthropic (Claude)", value: "anthropic" },
  { label: "Google (Gemini)", value: "gemini" },
  { label: "硅基流动 (SiliconFlow)", value: "siliconflow" },
  { label: "火山方舟 (豆包)", value: "volcengine" },
  { label: "MiniMax", value: "minimax" },
  { label: "OpenRouter", value: "openrouter" },
  { label: "Groq", value: "groq" },
  { label: "Mistral AI", value: "mistral" },
  { label: "NVIDIA NIM", value: "nvidia" },
  { label: "自定义", value: "custom" },
];

const getProviderDefaults = (providerType: string) => {
  switch (providerType) {
    // Ollama 的 OpenAI 兼容端点；容器内部署时 localhost 会被自动改写为 host.docker.internal
    case "ollama":
      return { baseUrl: "http://localhost:11434/v1", model: "" };
    case "openai":
      return { baseUrl: "https://api.openai.com/v1/chat/completions", model: "" };
    case "deepseek":
      return { baseUrl: "https://api.deepseek.com/v1/chat/completions", model: "" };
    case "azure":
      return { baseUrl: "https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-02-15", model: "" };
    case "grok":
      return { baseUrl: "https://api.x.ai/v1/chat/completions", model: "" };
    case "qwen":
      return { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "" };
    case "moonshot":
      return { baseUrl: "https://api.moonshot.cn/v1/chat/completions", model: "" };
    case "zhipu":
      return { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "" };
    case "anthropic":
      return { baseUrl: "https://api.anthropic.com/v1/messages", model: "" };
    case "gemini":
      return { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "" };
    case "siliconflow":
      return { baseUrl: "https://api.siliconflow.cn/v1/chat/completions", model: "" };
    case "volcengine":
      return { baseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "" };
    case "minimax":
      return { baseUrl: "https://api.minimax.cn/v1/chat/completions", model: "" };
    case "openrouter":
      return { baseUrl: "https://openrouter.ai/api/v1/chat/completions", model: "" };
    case "groq":
      return { baseUrl: "https://api.groq.com/openai/v1/chat/completions", model: "" };
    case "mistral":
      return { baseUrl: "https://api.mistral.ai/v1/chat/completions", model: "" };
    case "nvidia":
      return { baseUrl: "https://integrate.api.nvidia.com/v1/chat/completions", model: "" };
    default:
      return { baseUrl: "", model: "" };
  }
};

const loadProjectConfig = async () => {
  const config = await aiStore.getProjectConfig(projectId.value);
  defaultProviderId.value = config?.providerId ?? null;
};

onMounted(async () => {
  await Promise.all([fetchProviders(), loadProjectConfig()]);
  void loadRouting();
  void refreshHealth(true);
});

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
    // 唯一的连接检测入口：非静默时对所有提供商执行一次真实连通性检测（含状态刷新）
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
    if (!silent) message.success("连接检测完成，状态已刷新");
  } catch (e) {
    console.error("Failed to refresh AI health:", e);
    if (!silent) message.error("检测失败，请检查网络或后端服务");
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
    reasoningEffort: "",
    contextWindow: undefined,
    features: [],
    isActive: true,
  };
  providerDialogVisible.value = true;
};

const createProvider = async () => {
  if (providerSaving.value || providerReasoningLoading.value) return;
  if (!providerForm.value.model.trim()) {
    providerForm.value.model = getProviderDefaults(providerForm.value.providerType).model;
  }
  if (!providerForm.value.model.trim()) {
    message.warning("请填写模型名称");
    return;
  }
  providerSaving.value = true;
  try {
    const payload = {
      ...providerForm.value,
      contextWindow: providerForm.value.contextWindow || null,
      features: providerForm.value.features.length
        ? Object.fromEntries(
            featureList.value.map((f) => [f.key, providerForm.value.features.includes(f.key)]),
          )
        : undefined,
    };
    await axios.post("/api/ai/providers", payload);
    providerDialogVisible.value = false;
    await fetchProviders();
    await loadRouting();
    await refreshHealth(true);
    message.success("提供商创建成功");
  } catch (error) {
    console.error("Failed to create provider:", error);
    message.error(error, "创建提供商失败");
  } finally { providerSaving.value = false; }
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
    apiKey: "",
    model: p.model || defaults.model,
    reasoningEffort: p.reasoningEffort || "",
    contextWindow: p.contextWindow ?? undefined,
    features: featuresToArray(p.features),
    isActive: Boolean(p.isActive),
  };
  providerEditDialogVisible.value = true;
  nextTick(() => {
    skipProviderTypeWatch.value = false;
  });
};

const saveProviderEdit = async () => {
  if (providerSaving.value || providerReasoningLoading.value) return;
  if (!providerEditingId.value) return;
  if (!providerEditForm.value.model.trim()) {
    providerEditForm.value.model = getProviderDefaults(providerEditForm.value.providerType).model;
  }
  if (!providerEditForm.value.model.trim()) {
    message.warning("请填写模型名称");
    return;
  }
  providerSaving.value = true;
  try {
    const payload = {
      ...providerEditForm.value,
      contextWindow: providerEditForm.value.contextWindow || null,
      features: Object.fromEntries(featureList.value.map((f) => [f.key, providerEditForm.value.features.includes(f.key)])),
    };
    await axios.put(`/api/ai/providers/${providerEditingId.value}`, payload);
    providerEditDialogVisible.value = false;
    await fetchProviders();
    await loadRouting();
    await refreshHealth(true);
    message.success("提供商已更新");
  } catch (e) {
    console.error("Failed to update provider:", e);
    message.error(e, "更新失败");
  } finally { providerSaving.value = false; }
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
    if (defaultProviderId.value === id) {
      defaultProviderId.value = null;
    }
    await fetchProviders();
    await loadRouting();
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

</script>

<style scoped>
.provider-model-item,
.feature-select-item,
.field-hint-item {
  align-items: flex-start !important;
}
.provider-model-item :deep(.el-form-item__label),
.provider-reasoning-field :deep(.el-form-item__label),
.feature-select-item :deep(.el-form-item__label),
.field-hint-item :deep(.el-form-item__label) {
  align-self: flex-start !important;
  height: 40px;
  align-items: center;
  line-height: normal;
}

.config-section {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-background);
}

.config-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.config-section__heading {
  min-width: 0;
}

.config-section__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-section__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-primary);
}

.config-section__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-secondary);
  background: var(--card-background-strong);
}

.config-section__desc {
  max-width: 720px;
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-muted);
}

.config-section__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.config-section__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.config-section__alert {
  margin-bottom: 16px;
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
  border-color: rgba(var(--success-rgb), 0.2);
  color: var(--success-color);
}

.ai-status-pill.is-err {
  border-color: rgba(var(--error-rgb), 0.2);
  color: var(--error-color);
}

.ai-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
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

/* ── 功能与模型路由 ── */
.feature-routing__table {
  width: 100%;
}

.feature-routing__table :deep(.el-table__cell) {
  padding: 10px 0;
  vertical-align: middle;
}

.feature-routing__name {
  font-size: 13px;
  color: var(--text-primary);
}

.feature-routing__source {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-muted);
}

.feature-routing__effective {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
}

.feature-routing__effective-model {
  overflow: hidden;
  font: 12px var(--font-mono);
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feature-routing__effective-provider {
  margin-top: 4px;
  overflow: hidden;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feature-routing__warn {
  margin-top: 4px;
  font-size: 11px;
  color: var(--warning-color);
}

.feature-routing__empty {
  font-size: 12px;
}

.feature-routing__option-model {
  font: 12px var(--font-mono);
  color: var(--text-primary);
}

.feature-routing__option-provider {
  float: right;
  margin-left: 16px;
  overflow: hidden;
  max-width: 45%;
  font-size: 11px;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .config-section {
    padding: 16px;
  }

  .config-section__header {
    flex-direction: column;
    gap: 12px;
  }

  .config-section__actions {
    width: 100%;
  }
}

/* ── Provider dot ── */
.provider-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.provider-dot.is-ok {
  background: var(--success-color);
}

.provider-dot.is-err {
  background: var(--error-color);
}
</style>
