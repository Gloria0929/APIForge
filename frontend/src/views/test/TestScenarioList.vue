<template>
  <PageContainerLayout
    title="场景测试"
    description="把登录、鉴权、上下文变量和后续接口串成完整业务链路，像搭建自动化回归流水线一样组织测试步骤。"
    :container-class="(editorVisible || extractDialogVisible) ? 'dialog-open' : ''"
  >
    <template #toolbar>
      <el-button
        :loading="generatingScenario"
        :disabled="!canUseAiScenario"
        @click="openAiCreateDialog"
      >
        <el-icon class="mr-1"><MagicStick /></el-icon>AI 编排场景
      </el-button>
      <el-button type="primary" @click="openCreateDialog">创建场景</el-button>
      <el-button
        v-if="selectedScenarioIds.length > 0"
        type="danger"
        plain
        :loading="deletingBulk"
        @click="deleteSelectedScenarios"
      >
        批量删除 ({{ selectedScenarioIds.length }})
      </el-button>
    </template>
    <el-card class="scenario-card app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">场景目录</div>
            <div class="app-panel-subtitle">支持编排步骤、变量提取、请求覆盖与分页浏览。</div>
          </div>
        </div>
      </template>

      <el-table :data="pagedScenarios" v-loading="loading" row-key="id" style="width: 100%" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" reserve-selection />
        <el-table-column prop="name" label="场景名称" min-width="100" />
        <el-table-column prop="description" label="描述" min-width="120" show-overflow-tooltip />
        <el-table-column label="步骤数" width="100">
          <template #default="scope">
            {{ scope.row.steps?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="scope">
            <div class="table-actions">
              <span class="table-action table-action--primary" @click="navigateToScenario(scope.row.id)"><el-icon><View /></el-icon>详情</span>
              <span class="table-action" @click="openEditDialog(scope.row)"><el-icon><EditPen /></el-icon>编辑</span>
              <span class="table-action table-action--danger" @click="deleteScenario(scope.row.id)"><el-icon><Delete /></el-icon>删除</span>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && scenarios.length === 0" class="app-empty" description="创建场景后编排步骤、变量提取与请求覆盖，支持完整业务流程回归" />

      <div v-else-if="scenarios.length > 0" class="app-pagination">
        <div class="app-pagination-copy">共 {{ currentPage }} 场景</div>
        <el-pagination background layout="total, sizes, prev, pager, next" :total="total" :current-page="currentPage"
          :page-size="pageSize" :page-sizes="[5, 10, 20, 50]" @current-change="handleCurrentChange"
          @size-change="handleSizeChange" />
      </div>

      <el-dialog v-model="editorVisible" :title="editorMode === 'create' ? '创建场景' : '编辑场景'" width="960px" top="6vh"
        destroy-on-close append-to-body>
        <el-form :model="form" label-width="110px">
          <el-form-item label="场景名称" required>
            <el-input v-model="form.name" placeholder="例如：登录后获取用户信息" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="可选" />
          </el-form-item>

          <el-divider content-position="left">场景变量</el-divider>
          <div class="section-actions">
            <el-button size="small" @click="addVariableRow">新增变量</el-button>
          </div>
          <el-table :data="form.variables" size="small" style="width: 100%">
            <el-table-column label="变量名" width="240">
              <template #default="scope">
                <el-input v-model="scope.row.key" placeholder="例如：token" />
              </template>
            </el-table-column>
            <el-table-column label="值">
              <template #default="scope">
                <el-input v-model="scope.row.value" :placeholder="varValuePlaceholder" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="scope">
                <span class="table-action table-action--danger" @click="removeVariableRow(scope.$index)"><el-icon><Delete /></el-icon>删除</span>
              </template>
            </el-table-column>
          </el-table>

          <el-divider content-position="left">步骤</el-divider>
          <div class="section-actions">
            <el-button size="small" type="primary" @click="addStep">新增步骤</el-button>
          </div>
          <el-table :data="form.steps" size="small" style="width: 100%" class="scenario-steps-table">
            <el-table-column label="步骤" min-width="120">
              <template #default="scope">
                <el-input v-model="scope.row.name" placeholder="可选" />
                <div
                  v-if="scope.row.repeat"
                  class="step-repeat-hint"
                  :title="`循环 ${scope.row.repeat.itemVar} ← ${scope.row.repeat.sourceKey}`"
                >
                  循环 {{ scope.row.repeat.itemVar }} ← {{ scope.row.repeat.sourceKey }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="关联测试用例" min-width="120">
              <template #default="scope">
                <el-select v-model="scope.row.testCaseId" filterable placeholder="选择用例" style="width: 100%">
                  <el-option v-for="tc in testCases" :key="tc.id" :label="tc.name" :value="tc.id" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="提取规则" min-width="60" align="center">
              <template #default="scope">
                <el-button size="small" @click="openExtractDialog(scope.$index)">
                  {{ scope.row.extractRules.length }} 条
                </el-button>
              </template>
            </el-table-column>
            <el-table-column label="请求覆盖" min-width="60" align="center">
              <template #default="scope">
                <el-button size="small" @click="openOverrideDialog(scope.$index)">
                  {{ getOverrideCount(scope.row.requestOverrides) }} 项
                </el-button>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="130" align="center">
              <template #default="scope">
                <div class="table-actions">
                  <el-button size="small" :icon="ArrowUp" :disabled="scope.$index === 0" @click="moveStep(scope.$index, -1)" />
                  <el-button size="small" :icon="ArrowDown" :disabled="scope.$index === form.steps.length - 1" @click="moveStep(scope.$index, 1)" />
                  <el-button size="small" type="danger" :icon="Delete" @click="removeStep(scope.$index)" />
                </div>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="duplicateTestCaseSteps.length" class="hint text-warning">
            <strong>注意：</strong>步骤 {{ duplicateTestCaseSteps.join('、') }} 使用了相同的测试用例，会导致该用例执行多次。请检查是否配置正确。
          </div>
          <div class="hint text-muted">
            AI 编排场景时会自动为缺失的接口创建测试用例；若需手动补充，可前往
            <router-link :to="`/projects/${projectId}/apis`" class="text-[var(--el-color-primary)] hover:underline">接口文档</router-link>
            使用「批量生成测试用例」。
          </div>
          <div class="hint">
            支持变量占位：<code v-text="mustacheExample"></code>，场景变量与步骤提取变量会覆盖同名环境变量。
          </div>
        </el-form>

        <template #footer>
          <el-button @click="editorVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveScenario">
            {{ editorMode === "create" ? "创建" : "保存" }}
          </el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="extractDialogVisible" title="变量提取规则" width="640px" top="10vh" destroy-on-close append-to-body>
        <div class="section-actions">
          <el-button size="small" @click="addExtractRow">新增规则</el-button>
        </div>
        <el-table :data="extractWorkingRows" size="small" style="width: 100%">
          <el-table-column label="变量名" width="220">
            <template #default="scope">
              <el-input v-model="scope.row.key" placeholder="例如：token" />
            </template>
          </el-table-column>
          <el-table-column label="JSON 路径">
            <template #default="scope">
              <el-input v-model="scope.row.path" placeholder="例如：$.data.token" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="scope">
              <span class="table-action table-action--danger" @click="removeExtractRow(scope.$index)"><el-icon><Delete /></el-icon>删除</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="hint">
          JSONPath 示例：<code>$.data.id</code>、<code>$.items[0].name</code>。
        </div>
        <template #footer>
          <el-button @click="extractDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmExtractDialog">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="overrideDialogVisible" title="请求覆盖配置" width="760px" top="8vh" destroy-on-close append-to-body>
        <div class="hint" style="margin-bottom: 12px">
          用于给当前步骤额外注入请求参数。比如第 1 步登录提取出 <code v-text="mustacheExample"></code> 后，
          在第 2 步的 Headers 中填写 <code>Authorization</code> = <code>Bearer <span v-text="mustacheExample"></span></code>。
        </div>

        <el-form-item label="请求 URL">
          <el-input v-model="overrideWorking.url" placeholder="留空沿用用例 URL，例如 /users/{{userId}}" />
        </el-form-item>
        <el-divider content-position="left">Headers</el-divider>
        <div class="section-actions">
          <el-button size="small" @click="addOverrideRow('headers')">新增 Header</el-button>
        </div>
        <el-table :data="overrideWorking.headers" size="small" style="width: 100%">
          <el-table-column label="键" width="220">
            <template #default="scope">
              <el-input v-model="scope.row.key" placeholder="例如：Authorization" />
            </template>
          </el-table-column>
          <el-table-column label="值">
            <template #default="scope">
              <el-input v-model="scope.row.value" placeholder="例如：Bearer {{token}}" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="scope">
              <span class="table-action table-action--danger" @click="removeOverrideRow('headers', scope.$index)"><el-icon><Delete /></el-icon>删除</span>
            </template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">Query</el-divider>
        <div class="section-actions">
          <el-button size="small" @click="addOverrideRow('query')">新增 Query</el-button>
        </div>
        <el-table :data="overrideWorking.query" size="small" style="width: 100%">
          <el-table-column label="键" width="220">
            <template #default="scope">
              <el-input v-model="scope.row.key" placeholder="例如：token" />
            </template>
          </el-table-column>
          <el-table-column label="值">
            <template #default="scope">
              <el-input v-model="scope.row.value" placeholder="支持 {{token}} / 123 / true / JSON" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="scope">
              <span class="table-action table-action--danger" @click="removeOverrideRow('query', scope.$index)"><el-icon><Delete /></el-icon>删除</span>
            </template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">Body</el-divider>
        <div class="section-actions">
          <el-button size="small" @click="addOverrideRow('body')">新增 Body 字段</el-button>
        </div>
        <el-table :data="overrideWorking.body" size="small" style="width: 100%">
          <el-table-column label="键" width="220">
            <template #default="scope">
              <el-input v-model="scope.row.key" placeholder="例如：token" />
            </template>
          </el-table-column>
          <el-table-column label="值">
            <template #default="scope">
              <el-input v-model="scope.row.value" placeholder="支持 {{token}} / JSON" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="scope">
              <span class="table-action table-action--danger" @click="removeOverrideRow('body', scope.$index)"><el-icon><Delete /></el-icon>删除</span>
            </template>
          </el-table-column>
        </el-table>

        <template #footer>
          <el-button @click="overrideDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmOverrideDialog">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog
        v-model="aiCreateDialogVisible"
        title="AI 编排场景"
        width="720px"
        destroy-on-close
        append-to-body
        :close-on-click-modal="!generatingScenario"
        :close-on-press-escape="!generatingScenario"
        :show-close="!generatingScenario"
        class="ai-create-scenario-dialog"
      >
        <div class="scenario-compose">
          <div class="scenario-compose__field">
            <div class="scenario-compose__label">
              场景描述<span class="scenario-compose__required">*</span>
              <span class="scenario-compose__label-hint">写清业务意图即可，不必指定接口</span>
            </div>
            <el-input
              v-model="aiCreatePrompt"
              type="textarea"
              :autosize="{ minRows: 5, maxRows: 12 }"
              resize="none"
              maxlength="2000"
              show-word-limit
              :disabled="generatingScenario"
              placeholder="用一句话描述业务链路，例如：登录获取 token，查询个人信息，再更新昵称"
            />
          </div>

          <div v-if="!apisLoading && recommendedScenarios.length" class="scenario-compose__templates">
            <span class="scenario-compose__templates-label">推荐</span>
            <button
              v-for="item in recommendedScenarios"
              :key="item"
              type="button"
              class="scenario-compose__chip"
              :disabled="generatingScenario"
              :title="item"
              @click="aiCreatePrompt = item"
            >{{ item }}</button>
          </div>

          <div class="scenario-compose__apis">
            <div class="scenario-compose__apis-head">
              <span class="scenario-compose__apis-title">可编排接口</span>
              <span class="scenario-compose__apis-count">{{ availableApis.length }}</span>
              <button
                v-if="availableApis.length > 6"
                type="button"
                class="scenario-compose__apis-toggle"
                @click="apisExpanded = !apisExpanded"
              >{{ apisExpanded ? '收起' : '展开全部' }}</button>
            </div>
            <div v-if="apisLoading" class="scenario-compose__apis-empty">
              <el-icon class="is-loading"><Loading /></el-icon>
              正在读取接口…
            </div>
            <div v-else-if="availableApis.length === 0" class="scenario-compose__apis-empty">
              当前项目还没有接口，请先导入后再编排。
            </div>
            <ul v-else class="scenario-compose__api-list">
              <li v-for="api in visibleApis" :key="api.id">
                <span class="scenario-compose__method" :class="`is-${String(api.method).toLowerCase()}`">
                  {{ String(api.method).toUpperCase() }}
                </span>
                <code class="scenario-compose__path">{{ api.path }}</code>
                <span class="scenario-compose__summary">{{ api.summary }}</span>
              </li>
            </ul>
          </div>

          <div v-if="generatingScenario" class="scenario-compose__progress">
            <el-icon class="is-loading"><Loading /></el-icon>
            正在分析接口依赖并编排步骤，通常需要 10–30 秒…
          </div>
          <div v-else class="scenario-compose__note">
            生成的是可编辑草稿，自动配置变量传递；仅为所选步骤补齐用例，不会执行接口。
          </div>
        </div>
        <template #footer>
          <el-button :disabled="generatingScenario" @click="aiCreateDialogVisible = false">取消</el-button>
          <el-button
            type="primary"
            :loading="generatingScenario"
            :disabled="!aiCreatePrompt.trim() || generatingScenario"
            @click="runAiGenerateScenario"
          >
            生成场景
          </el-button>
        </template>
      </el-dialog>
    </el-card>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "axios";
import { parseLooseValue as parseLoose } from "../../utils/json";
import { buildRecommendedScenarios } from "../../utils/scenario-recommendations";
import { ArrowUp, ArrowDown, Delete, View, EditPen, MagicStick, Loading } from "@element-plus/icons-vue";
import { usePagination } from "../../composables/usePagination";
import { message, confirmAction } from "../../utils/message";
import PageContainerLayout from "../../components/layout/PageContainerLayout.vue";
import { useAIStore } from "../../store/ai";

const route = useRoute();
const router = useRouter();
const aiStore = useAIStore();
const projectId = route.params.id as string;
const canUseAiScenario = computed(
  () => aiStore.enabled && aiStore.features?.testGeneration && aiStore.available,
);

interface TestScenario {
  id: string;
  name: string;
  description?: string;
  steps?: any[];
  variables?: Record<string, any>;
}

interface TestCase {
  id: string;
  name: string;
}

interface ApiSummary {
  id: string;
  method: string;
  path: string;
  summary?: string;
}

interface VariableRow {
  key: string;
  value: string;
}

interface ExtractRuleRow {
  key: string;
  path: string;
}

interface StepRow {
  name: string;
  testCaseId: string;
  repeat?: { sourceKey: string; itemVar: string; itemPath?: string };
  extractRules: ExtractRuleRow[];
  requestOverrides: {
    url?: string;
    headers: Array<{ key: string; value: string }>;
    query: Array<{ key: string; value: string }>;
    body: Array<{ key: string; value: string }>;
  };
}

const scenarios = ref<TestScenario[]>([]);
const loading = ref(false);
const deletingBulk = ref(false);
const selectedScenarios = ref<TestScenario[]>([]);
const selectedScenarioIds = computed(() => selectedScenarios.value.map((s) => s.id));
const testCases = ref<TestCase[]>([]);
const { currentPage, pageSize, total, pagedItems: pagedScenarios, handleCurrentChange, handleSizeChange, resetPage } = usePagination(scenarios, 10);

const editorVisible = ref(false);
const saving = ref(false);
const editorMode = ref<"create" | "edit">("create");

const form = reactive<{
  id: string;
  name: string;
  description: string;
  steps: StepRow[];
  variables: VariableRow[];
}>({
  id: "",
  name: "",
  description: "",
  steps: [],
  variables: [],
});

const aiCreateDialogVisible = ref(false);
const aiCreatePrompt = ref("");
const generatingScenario = ref(false);
const availableApis = ref<ApiSummary[]>([]);
const apisLoading = ref(false);
const apisExpanded = ref(false);
const visibleApis = computed(() =>
  apisExpanded.value ? availableApis.value : availableApis.value.slice(0, 6),
);

/** 推荐标签可视觉截断，点击后填入完整描述 */
const recommendedScenarios = computed(() => buildRecommendedScenarios(availableApis.value));
const extractDialogVisible = ref(false);
const extractEditingStepIndex = ref(-1);
const extractWorkingRows = ref<ExtractRuleRow[]>([]);
const overrideDialogVisible = ref(false);
const overrideEditingStepIndex = ref(-1);
const overrideWorking = reactive<{
  url: string;
  headers: Array<{ key: string; value: string }>;
  query: Array<{ key: string; value: string }>;
  body: Array<{ key: string; value: string }>;
}>({
  url: "",
  headers: [],
  query: [],
  body: [],
});
const varValuePlaceholder =
  '支持 JSON/数字/布尔，例如："abc" 或 123 或 true 或 {"a":1}';

const duplicateTestCaseSteps = computed(() => {
  const ids = form.steps.map((s, i) => ({ id: s.testCaseId, idx: i + 1 })).filter((x) => x.id);
  const seen = new Map<string, number[]>();
  ids.forEach(({ id, idx }) => {
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id)!.push(idx);
  });
  return Array.from(seen.values())
    .filter((arr) => arr.length > 1)
    .flat();
});

watch(scenarios, () => resetPage());
const mustacheExample = "{{token}}";

const handleSelectionChange = (rows: TestScenario[]) => {
  selectedScenarios.value = rows;
};

onMounted(async () => {
  await aiStore.getProjectConfig(projectId);
  await aiStore.checkHealth();
  await fetchScenarios();
  await fetchTestCases();

  const editId = String((route.query.edit as any) || "").trim();
  if (editId) {
    await openEditById(editId);
    const q = { ...route.query };
    delete (q as any).edit;
    router.replace({ query: q });
  }
});

const fetchScenarios = async () => {
  loading.value = true;
  try {
    const response = await axios.get(
      `/api/tests/scenarios?projectId=${projectId}`,
    );
    if (Array.isArray(response.data)) {
      scenarios.value = response.data;
    } else {
      console.error(
        "Invalid scenarios response (expected array):",
        response.data,
      );
      scenarios.value = [];
      // Most common cause: API requests are not proxied and you get HTML back.
      if (typeof response.data === "string") {
        message.error(
          "加载场景失败：API 返回了非 JSON 数据，请检查 /api 代理或后端路由",
        );
      }
    }
  } catch (error) {
    console.error("Failed to fetch scenarios:", error);
    scenarios.value = [];
  } finally {
    loading.value = false;
  }
};

const openCreateDialog = () => {
  editorMode.value = "create";
  resetForm();
  if (form.steps.length === 0) addStep();
  editorVisible.value = true;
};

const loadAvailableApis = async () => {
  apisLoading.value = true;
  try {
    const res = await axios.get(`/api/apis?projectId=${projectId}`);
    availableApis.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    availableApis.value = [];
  } finally {
    apisLoading.value = false;
  }
};

const openAiCreateDialog = () => {
  aiCreatePrompt.value = "";
  apisExpanded.value = false;
  aiCreateDialogVisible.value = true;
  if (availableApis.value.length === 0) void loadAvailableApis();
};

const runAiGenerateScenario = async () => {
  if (generatingScenario.value) return;
  const prompt = aiCreatePrompt.value?.trim();
  if (!prompt) {
    message.warning("请填写场景描述");
    return;
  }
  generatingScenario.value = true;
  try {
    const res = await axios.post("/api/ai/generate-scenario", {
      projectId,
      prompt,
    });
    const data = res.data;
    await fetchTestCases();
    resetForm();
    form.name = data.name || "AI 生成场景";
    form.description = data.description || "";
    form.variables = Object.entries(data.variables || {}).map(([k, v]) => ({
      key: String(k),
      value: typeof v === "string" ? v : JSON.stringify(v),
    }));
    form.steps = (data.steps || []).map((s: any) => ({
      name: String(s.name || ""),
      testCaseId: String(s.testCaseId || ""),
      repeat: s.repeat || undefined,
      extractRules: Array.isArray(s.extractRules)
        ? s.extractRules.map((r: any) => ({ key: String(r.key || ""), path: String(r.path || "") }))
        : [],
      requestOverrides: objectToOverrideRows(s.requestOverrides),
    }));
    if (form.steps.length === 0) throw new Error("AI 未返回有效步骤，请重试");
    aiCreateDialogVisible.value = false;
    editorMode.value = "create";
    editorVisible.value = true;
    const notes = [...(data.warnings || [])];
    if (data.usedFallbackCount > 0) {
      notes.push(`其中 ${data.usedFallbackCount} 个接口因 AI 失败已使用规则回退`);
    }
    message.success(`AI 已生成场景草稿，请检查并保存${notes.length ? `；${notes.join("；")}` : ""}`);
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || "AI 生成场景失败";
    message.error(typeof msg === "string" ? msg : msg.join?.("；") || "AI 生成场景失败");
  } finally {
    generatingScenario.value = false;
  }
};

const openEditDialog = (scenario: TestScenario) => {
  openEditById(scenario.id);
};

const openEditById = async (id: string) => {
  editorMode.value = "edit";
  saving.value = true;
  try {
    const res = await axios.get(`/api/tests/scenarios/${id}`);
    const s = res.data as TestScenario;
    resetForm();
    form.id = s.id;
    form.name = String(s.name || "");
    form.description = String(s.description || "");

    const steps = Array.isArray((s as any).steps) ? (s as any).steps : [];
    form.steps = steps.map((raw: any) => ({
      name: String(raw?.name || ""),
      testCaseId: String(raw?.testCaseId || ""),
      repeat: raw?.repeat || undefined,
      extractRules: Object.entries(raw?.extractRules || {}).map(([k, v]) => ({
        key: String(k),
        path: String(v ?? ""),
      })),
      requestOverrides: objectToOverrideRows(raw?.requestOverrides),
    }));
    if (form.steps.length === 0) addStep();

    const vars =
      (s as any).variables && typeof (s as any).variables === "object"
        ? (s as any).variables
        : {};
    form.variables = Object.entries(vars).map(([k, v]) => ({
      key: String(k),
      value: typeof v === "string" ? v : safeStringify(v),
    }));
    editorVisible.value = true;
  } catch (error) {
    console.error("Failed to load scenario:", error);
    message.error("加载场景失败");
  } finally {
    saving.value = false;
  }
};

const fetchTestCases = async () => {
  try {
    const response = await axios.get(`/api/tests?projectId=${projectId}`);
    testCases.value = Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error("Failed to fetch test cases:", error);
    testCases.value = [];
  }
};

const resetForm = () => {
  form.id = "";
  form.name = "";
  form.description = "";
  form.steps = [];
  form.variables = [];
};

const addVariableRow = () => {
  form.variables.push({ key: "", value: "" });
};

const removeVariableRow = (idx: number) => {
  form.variables.splice(idx, 1);
};

const addStep = () => {
  form.steps.push({
    name: "",
    testCaseId: "",
    extractRules: [],
    requestOverrides: {
      headers: [],
      query: [],
      body: [],
    },
  });
};

const removeStep = (idx: number) => {
  form.steps.splice(idx, 1);
};

const moveStep = (idx: number, delta: -1 | 1) => {
  const next = idx + delta;
  if (next < 0 || next >= form.steps.length) return;
  const tmp = form.steps[idx];
  form.steps[idx] = form.steps[next];
  form.steps[next] = tmp;
};

const openExtractDialog = (stepIndex: number) => {
  extractEditingStepIndex.value = stepIndex;
  const current = form.steps[stepIndex]?.extractRules || [];
  extractWorkingRows.value = current.map((r) => ({ key: r.key, path: r.path }));
  extractDialogVisible.value = true;
};

const addExtractRow = () => {
  extractWorkingRows.value.push({ key: "", path: "" });
};

const removeExtractRow = (idx: number) => {
  extractWorkingRows.value.splice(idx, 1);
};

const confirmExtractDialog = () => {
  const idx = extractEditingStepIndex.value;
  if (idx < 0 || idx >= form.steps.length) {
    extractDialogVisible.value = false;
    return;
  }
  form.steps[idx].extractRules = extractWorkingRows.value
    .map((r) => ({
      key: String(r.key || "").trim(),
      path: String(r.path || "").trim(),
    }))
    .filter((r) => r.key && r.path);
  extractDialogVisible.value = false;
};

const objectToOverrideRows = (raw: any) => {
  const toRows = (section: "headers" | "query" | "body") => {
    const src = raw?.[section];
    if (Array.isArray(src)) {
      return src.map((r: any) => ({
        key: String(r?.key ?? ""),
        value: typeof r?.value === "string" ? r.value : safeStringify(r?.value ?? ""),
      }));
    }
    return Object.entries(src || {}).map(([key, value]) => ({
      key: String(key),
      value: section === "headers" ? String(value ?? "") : (typeof value === "string" ? value : safeStringify(value)),
    }));
  };
  return {
    url: String(raw?.url || ""),
    headers: toRows("headers"),
    query: toRows("query"),
    body: toRows("body"),
  };
};

const openOverrideDialog = (stepIndex: number) => {
  overrideEditingStepIndex.value = stepIndex;
  const current: StepRow["requestOverrides"] = form.steps[stepIndex]?.requestOverrides || {
    headers: [],
    query: [],
    body: [],
  };
  overrideWorking.url = current.url || "";
  overrideWorking.headers = current.headers.map((r) => ({ ...r }));
  overrideWorking.query = current.query.map((r) => ({ ...r }));
  overrideWorking.body = current.body.map((r) => ({ ...r }));
  overrideDialogVisible.value = true;
};

const addOverrideRow = (section: "headers" | "query" | "body") => {
  overrideWorking[section].push({ key: "", value: "" });
};

const removeOverrideRow = (
  section: "headers" | "query" | "body",
  idx: number,
) => {
  overrideWorking[section].splice(idx, 1);
};

const confirmOverrideDialog = () => {
  const idx = overrideEditingStepIndex.value;
  if (idx < 0 || idx >= form.steps.length) {
    overrideDialogVisible.value = false;
    return;
  }
  form.steps[idx].requestOverrides = {
    url: overrideWorking.url.trim(),
    headers: overrideWorking.headers
      .map((r) => ({
        key: String(r.key || "").trim(),
        value: String(r.value ?? ""),
      }))
      .filter((r) => r.key),
    query: overrideWorking.query
      .map((r) => ({
        key: String(r.key || "").trim(),
        value: String(r.value ?? ""),
      }))
      .filter((r) => r.key),
    body: overrideWorking.body
      .map((r) => ({
        key: String(r.key || "").trim(),
        value: String(r.value ?? ""),
      }))
      .filter((r) => r.key),
  };
  overrideDialogVisible.value = false;
};

const getOverrideCount = (requestOverrides: StepRow["requestOverrides"]) => {
  const data: StepRow["requestOverrides"] = requestOverrides || { headers: [], query: [], body: [] };
  return (
    (data.url ? 1 : 0) + (data.headers?.length || 0) +
    (data.query?.length || 0) +
    (data.body?.length || 0)
  );
};

const rowsToObject = (rows: Array<{ key: string; value: any }>) => {
  const out: Record<string, any> = {};
  for (const r of rows) {
    const key = String(r.key || "").trim();
    if (!key) continue;
    out[key] = r.value;
  }
  return out;
};

const safeStringify = (v: any) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const saveScenario = async () => {
  const name = String(form.name || "").trim();
  if (!name) {
    message.warning("请输入场景名称");
    return;
  }
  if (form.steps.length === 0) {
    message.warning("请至少添加一个步骤");
    return;
  }
  const invalidStep = form.steps.findIndex(
    (s) => !String(s.testCaseId || "").trim(),
  );
  if (invalidStep >= 0) {
    message.warning(`第 ${invalidStep + 1} 步未选择测试用例`);
    return;
  }

  const steps = form.steps.map((s) => ({
    name: String(s.name || "").trim() || undefined,
    testCaseId: String(s.testCaseId || "").trim(),
    ...(s.repeat ? { repeat: s.repeat } : {}),
    extractRules: rowsToObject(
      s.extractRules.map((r) => ({ key: r.key, value: r.path })),
    ),
    requestOverrides: {
      ...(s.requestOverrides?.url?.trim() ? { url: s.requestOverrides.url.trim() } : {}),
      headers: rowsToObject(
        (s.requestOverrides?.headers || []).map((r) => ({
          key: r.key,
          value: r.value,
        })),
      ),
      query: rowsToObject(
        (s.requestOverrides?.query || []).map((r) => ({
          key: r.key,
          value: parseLoose(r.value),
        })),
      ),
      body: rowsToObject(
        (s.requestOverrides?.body || []).map((r) => ({
          key: r.key,
          value: parseLoose(r.value),
        })),
      ),
    },
  }));

  const variables = rowsToObject(
    form.variables
      .map((r) => ({ key: r.key, value: parseLoose(r.value) }))
      .filter((r) => String(r.key || "").trim()),
  );

  saving.value = true;
  try {
    if (editorMode.value === "create") {
      await axios.post("/api/tests/scenarios", {
        projectId,
        name,
        description: String(form.description || ""),
        steps,
        variables,
      });
      message.success("已创建");
    } else {
      await axios.put(`/api/tests/scenarios/${form.id}`, {
        name,
        description: String(form.description || ""),
        steps,
        variables,
      });
      message.success("已保存");
    }
    editorVisible.value = false;
    await fetchScenarios();
  } catch (error) {
    console.error("Failed to save scenario:", error);
    const e: any = error;
    const msg =
      e?.response?.data?.message ||
      e?.response?.data?.error ||
      e?.message ||
      "保存失败";
    message.error(String(msg));
  } finally {
    saving.value = false;
  }
};

const deleteScenario = async (id: string) => {
  try {
    await confirmAction(
      "确定删除该测试场景吗？此操作不可恢复。",
      "删除确认",
      {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
      },
    );
  } catch {
    return;
  }

  try {
    await axios.delete(`/api/tests/scenarios/${id}`);
    selectedScenarios.value = selectedScenarios.value.filter((s) => s.id !== id);
    await fetchScenarios();
    message.success("已删除");
  } catch (error) {
    console.error("Failed to delete scenario:", error);
    message.error("删除失败");
  }
};

const deleteSelectedScenarios = async () => {
  const ids = selectedScenarioIds.value;
  if (ids.length === 0) return;
  try {
    await confirmAction(
      `确定删除选中的 ${ids.length} 个测试场景吗？此操作不可恢复。`,
      "批量删除确认",
      { confirmButtonText: "删除", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }

  deletingBulk.value = true;
  try {
    const res = await axios.post("/api/tests/scenarios/bulk-delete", { ids });
    await fetchScenarios();
    selectedScenarios.value = [];
    message.success(
      `已删除 ${(res.data as { deleted?: number })?.deleted ?? ids.length} 个场景`,
    );
  } catch (error) {
    console.error("Failed to bulk delete scenarios:", error);
    message.error(error, "批量删除失败");
  } finally {
    deletingBulk.value = false;
  }
};

const navigateToScenario = (id: string) => {
  router.push(`/projects/${projectId}/scenarios/${id}`);
};
</script>

<style scoped>
.step-repeat-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 步骤列有循环提示时，整行控件顶部对齐，避免输入框被小字挤高 */
.scenario-steps-table :deep(.el-table__cell) {
  vertical-align: top;
}

.section-actions {
  display: flex;
  justify-content: flex-end;
  margin: 10px 0;
}

.hint {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.hint code {
  background: var(--card-background-strong);
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.steps-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(var(--primary-rgb), 0.1);
  color: var(--accent-soft);
  font-size: 12px;
  font-weight: 600;
}

.scenario-compose {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scenario-compose__label {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-regular);
}

.scenario-compose__required {
  color: var(--error-color);
}

.scenario-compose__label-hint {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}

.scenario-compose__templates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: -4px;
}

.scenario-compose__templates-label {
  font-size: 12px;
  color: var(--text-muted);
}

.scenario-compose__chip {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--card-background-strong);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.scenario-compose__chip:hover:not(:disabled) {
  color: var(--primary-color);
  border-color: rgba(var(--primary-rgb), 0.4);
  background: rgba(var(--primary-rgb), 0.06);
}

.scenario-compose__chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.scenario-compose__apis {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-background-strong);
  padding: 12px 14px;
}

.scenario-compose__apis-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.scenario-compose__apis-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(var(--primary-rgb), 0.1);
  color: var(--accent-soft);
  font-family: var(--font-mono);
  font-size: 11px;
}

.scenario-compose__apis-toggle {
  margin-left: auto;
  border: none;
  background: none;
  color: var(--primary-color);
  font-size: 12px;
  cursor: pointer;
}

.scenario-compose__apis-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 0 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.scenario-compose__api-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.scenario-compose__api-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}

.scenario-compose__method {
  flex: none;
  width: 54px;
  padding: 2px 0;
  border-radius: 4px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  background: rgba(var(--border-rgb), 0.08);
  color: var(--text-secondary);
}

.scenario-compose__method.is-get {
  color: var(--success-color);
  background: rgba(var(--success-rgb), 0.12);
}

.scenario-compose__method.is-post {
  color: var(--primary-color);
  background: rgba(var(--primary-rgb), 0.12);
}

.scenario-compose__method.is-put,
.scenario-compose__method.is-patch {
  color: var(--warning-color);
  background: rgba(var(--warning-rgb), 0.12);
}

.scenario-compose__method.is-delete {
  color: var(--error-color);
  background: rgba(var(--error-rgb), 0.12);
}

.scenario-compose__path {
  flex: none;
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
}

.scenario-compose__summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
}

.scenario-compose__progress,
.scenario-compose__note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.scenario-compose__progress {
  color: var(--primary-color);
}

</style>
