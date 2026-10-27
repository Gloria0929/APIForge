<template>
  <PageContainerLayout
    title="环境管理"
    description="集中管理 base URL、变量、密钥与激活环境，为接口调试、测试用例和场景执行提供统一上下文。"
  >
    <template #toolbar>
      <el-button @click="openImportDialog">导入</el-button>
      <el-button @click="exportEnvironments">导出</el-button>
      <el-button type="primary" @click="openCreateDialog">创建环境</el-button>
      <el-button
        v-if="selectedEnvironmentIds.length > 0"
        type="danger"
        plain
        :loading="deletingBulk"
        @click="deleteSelectedEnvironments"
      >
        批量删除 ({{ selectedEnvironmentIds.length }})
      </el-button>
    </template>
    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">环境列表</div>
            <div class="app-panel-subtitle">支持导入导出、连接测试、变量预览与分页查看。</div>
          </div>
        </div>
      </template>

      <el-table :data="pagedEnvironments" v-loading="loading" row-key="id" style="width: 100%" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" reserve-selection />
        <el-table-column prop="name" label="环境名称" min-width="140" />
        <el-table-column prop="baseUrl" label="基础 URL" min-width="200" show-overflow-tooltip />
        <el-table-column label="变量 / 前置" width="130">
          <template #default="scope">
            {{ (scope.row.variables || []).length }} / {{ setupStepCount(scope.row) }}
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="120">
          <template #default="scope">
            <el-tag v-if="scope.row.isActive" type="success">激活</el-tag>
            <el-tag v-else type="info">未激活</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="240" fixed="right">
          <template #default="scope">
            <div class="table-actions">
              <span class="table-action table-action--success" @click="activateEnvironment(scope.row.id)"><el-icon><CircleCheck /></el-icon>激活</span>
              <span class="table-action" @click="testEnvironment(scope.row.id)"><el-icon><Connection /></el-icon>测试</span>
              <span class="table-action" @click="openEditDialog(scope.row)"><el-icon><EditPen /></el-icon>编辑</span>
              <span class="table-action table-action--danger" @click="deleteEnvironment(scope.row.id)"><el-icon><Delete /></el-icon>删除</span>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && environments.length === 0" class="app-empty" description="添加 DEV、PROD 等环境，配置 baseUrl 和变量后即可在用例中使用" />

      <div v-else class="app-pagination">
        <div class="app-pagination-copy">共 {{ total }} 个环境</div>
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[5, 10, 20, 50]"
          @current-change="handleCurrentChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <el-dialog :title="editingId ? '编辑环境' : '创建环境'" v-model="dialogVisible" width="860px" append-to-body class="env-dialog">
      <el-form :model="form" label-width="100px">
        <el-form-item label="环境名称" required>
          <el-input v-model="form.name" placeholder="例如：DEV / TEST / PROD" />
        </el-form-item>
        <el-form-item label="基础 URL" required class="base-url-item">
          <el-input v-model="form.baseUrl" placeholder="例如：https://example.com" />
          <div class="field-hint">
            部署在 Docker 中时，<code>127.0.0.1</code> / <code>localhost</code> 会自动指向宿主机（host.docker.internal），两种写法都可以。
          </div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="设为激活">
          <el-switch v-model="form.isActive" />
        </el-form-item>

        <el-divider content-position="left">前置用例（获取 token / sessionId 等）</el-divider>
        <el-alert
          title="执行测试前会按顺序运行这些用例，把响应里提取的字段注入所有请求。例如先跑「登录」提取 token，再跑「获取会话列表」提取 sessionId。"
          type="info"
          :closable="false"
          show-icon
          class="mb-3"
        />
        <el-form-item label="前置步骤" class="setup-steps-item">
          <div class="w-full">
            <div class="setup-steps">
              <div v-for="(step, index) in form.setupSteps" :key="index" class="setup-step">
                <div class="setup-step__head">
                  <span class="setup-step__index">步骤 {{ index + 1 }}</span>
                  <el-select
                    v-model="step.testCaseId"
                    placeholder="选择前置用例"
                    clearable
                    filterable
                    class="setup-step__select"
                  >
                    <el-option v-for="tc in testCases" :key="tc.id" :label="tc.name" :value="tc.id" />
                  </el-select>
                  <el-button size="small" :disabled="index === 0" @click="moveSetupStep(index, -1)">上移</el-button>
                  <el-button size="small" :disabled="index === form.setupSteps.length - 1" @click="moveSetupStep(index, 1)">下移</el-button>
                  <span class="table-action table-action--danger" @click="removeSetupStep(index)"><el-icon><Delete /></el-icon>删除</span>
                </div>

                <div class="setup-step__rules">
                  <div v-for="(rule, ruleIndex) in step.extractRules" :key="ruleIndex" class="setup-rule">
                    <el-input v-model="rule.key" placeholder="变量名，如 sessionId" class="setup-rule__key" />
                    <span class="setup-rule__arrow">→</span>
                    <el-input v-model="rule.path" placeholder="JSON 路径，如 $.data[0].id" class="setup-rule__path" />
                    <span class="table-action table-action--danger setup-rule__remove" @click="removeSetupRule(step, ruleIndex)">
                      <el-icon><Delete /></el-icon>
                    </span>
                  </div>
                  <div class="setup-step__rules-foot">
                    <span class="setup-step__hint">
                      {{ step.extractRules.length === 0 ? '至少添加一条提取规则，否则该步骤不会生效' : '从该用例的响应中提取变量，右侧填 JSONPath' }}
                    </span>
                    <el-button size="small" class="shrink-0" @click="addSetupRule(step)">+ 添加变量</el-button>
                  </div>
                </div>
              </div>
              <el-empty v-if="form.setupSteps.length === 0" class="setup-steps__empty" description="还没有前置用例，点击下方按钮添加" :image-size="48" />
            </div>

            <el-button class="setup-step__add" @click="addSetupStep">+ 添加前置用例</el-button>
          </div>
        </el-form-item>

        <el-divider content-position="left">自定义变量（可选）</el-divider>
        <el-alert
          title="保存 userId、tenantId 等固定值，在请求中可通过 {{key}} 引用。"
          type="info"
          :closable="false"
          show-icon
          class="mb-3"
        />
        <el-form-item label="变量">
          <div class="mb-2 flex w-full items-center justify-between">
            <span class="text-sm text-muted" v-pre>固定值，用例中写 {{ userId }} 引用</span>
            <el-button size="small" class="ml-auto shrink-0" @click="addCustomVariable">新增</el-button>
          </div>
          <el-table :data="form.variables" size="small" style="width: 100%">
            <el-table-column label="键" width="160">
              <template #default="scope">
                <el-input v-model="scope.row.key" placeholder="如 userId" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="值">
              <template #default="scope">
                <el-input v-model="scope.row.value" placeholder="如 12345" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="scope">
                <span class="table-action table-action--danger" @click="removeCustomVariable(scope.$index)"><el-icon><Delete /></el-icon>删除</span>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>

      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveEnvironment">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog title="导入环境" v-model="importDialogVisible" width="860px" append-to-body>
      <el-alert title="支持粘贴导出的 JSON（export 的完整对象或 environments 数组均可）" type="info" show-icon :closable="false" />
      <div class="mt-3">
        <el-input v-model="importText" type="textarea" :rows="12" placeholder='粘贴 JSON，例如 {"projectId":"...","environments":[...]}' />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="importDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="importing" @click="doImport">导入</el-button>
        </span>
      </template>
    </el-dialog>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { CircleCheck, Connection, EditPen, Delete } from '@element-plus/icons-vue'
import { usePagination } from '../../composables/usePagination'
import { message, confirmAction } from '../../utils/message'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'

const route = useRoute()
const projectId = route.params.id as string

interface Environment {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  description?: string;
  variables?: any[] | null;
  loginTestCaseId?: string | null;
  loginExtractRules?: Record<string, string> | null;
  setupSteps?: { testCaseId: string; name?: string; extractRules: Record<string, string> }[] | null;
}

interface EnvVar {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'secret';
  description?: string;
}

interface SetupStepForm {
  testCaseId: string;
  extractRules: { key: string; path: string }[];
}

const environments = ref<Environment[]>([])
const loading = ref(false)
const deletingBulk = ref(false)
const selectedEnvironments = ref<Environment[]>([])
const selectedEnvironmentIds = computed(() => selectedEnvironments.value.map((e) => e.id))
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const importDialogVisible = ref(false)
const importText = ref('')
const importing = ref(false)

const { currentPage, pageSize, total, pagedItems: pagedEnvironments, handleCurrentChange, handleSizeChange, resetPage } = usePagination(environments, 10)

const form = ref({
  name: '',
  baseUrl: '',
  description: '',
  isActive: false,
  variables: [] as EnvVar[],
  setupSteps: [] as SetupStepForm[]
})

const testCases = ref<{ id: string; name: string }[]>([])

watch(environments, () => resetPage())

const handleSelectionChange = (rows: Environment[]) => {
  selectedEnvironments.value = rows
}

onMounted(async () => {
  await fetchEnvironments()
})

const fetchEnvironments = async () => {
  loading.value = true
  try {
    const response = await axios.get(`/api/environments?projectId=${projectId}`)
    environments.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    console.error('Failed to fetch environments:', error)
    environments.value = []
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  editingId.value = null
  form.value = {
    name: '',
    baseUrl: '',
    description: '',
    isActive: false,
    variables: [],
    setupSteps: []
  }
  dialogVisible.value = true
  fetchTestCases()
}

const openEditDialog = (environment: Environment) => {
  editingId.value = environment.id
  const env = environment as any
  form.value = {
    name: environment.name,
    baseUrl: environment.baseUrl,
    description: environment.description || '',
    isActive: Boolean(environment.isActive),
    variables: (environment.variables || []).map((v: any) => ({
      key: String(v?.key || ''),
      value: v?.value ?? '',
      type: (v?.type || 'string') as any,
      description: v?.description || ''
    })),
    setupSteps: normalizeSetupStepsForForm(env)
  }
  dialogVisible.value = true
  fetchTestCases()
}

/** 新配置优先；老环境只有一个登录用例，编辑时兼容展示为单个步骤 */
const normalizeSetupStepsForForm = (env: any): SetupStepForm[] => {
  const steps = Array.isArray(env?.setupSteps) ? env.setupSteps : []
  if (steps.length > 0) {
    return steps.map((step: any) => ({
      testCaseId: String(step?.testCaseId || ''),
      extractRules: Object.entries(step?.extractRules || {}).map(([key, path]) => ({
        key,
        path: String(path ?? '')
      }))
    }))
  }
  if (env?.loginTestCaseId) {
    const rules = env.loginExtractRules && typeof env.loginExtractRules === 'object'
      ? Object.entries(env.loginExtractRules).map(([key, path]) => ({ key, path: String(path ?? '') }))
      : []
    return [{ testCaseId: String(env.loginTestCaseId), extractRules: rules }]
  }
  return []
}

const fetchTestCases = async () => {
  try {
    const res = await axios.get(`/api/tests?projectId=${projectId}`)
    testCases.value = Array.isArray(res.data) ? res.data : []
  } catch {
    testCases.value = []
  }
}

const addSetupStep = () => {
  form.value.setupSteps.push({ testCaseId: '', extractRules: [{ key: '', path: '' }] })
}

const removeSetupStep = (index: number) => {
  form.value.setupSteps.splice(index, 1)
}

const moveSetupStep = (index: number, offset: number) => {
  const target = index + offset
  const steps = form.value.setupSteps
  if (target < 0 || target >= steps.length) return
  const [item] = steps.splice(index, 1)
  steps.splice(target, 0, item)
}

const addSetupRule = (step: SetupStepForm) => {
  step.extractRules.push({ key: '', path: '' })
}

const removeSetupRule = (step: SetupStepForm, index: number) => {
  step.extractRules.splice(index, 1)
}

const addCustomVariable = () => {
  form.value.variables.push({
    key: '',
    value: '',
    type: 'string',
    description: ''
  })
}

const removeCustomVariable = (index: number) => {
  form.value.variables.splice(index, 1)
}

const setupStepCount = (row: any) => {
  if (Array.isArray(row?.setupSteps) && row.setupSteps.length) return row.setupSteps.length
  return row?.loginTestCaseId ? 1 : 0
}

const deleteEnvironment = async (id: string) => {
  try {
    await confirmAction('确定删除该环境吗？此操作不可恢复。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  try {
    await axios.delete(`/api/environments/${id}`)
    selectedEnvironments.value = selectedEnvironments.value.filter((e) => e.id !== id)
    await fetchEnvironments()
    message.success('环境已删除')
  } catch (error) {
    console.error('Failed to delete environment:', error)
    message.error(error, '删除失败')
  }
}

const deleteSelectedEnvironments = async () => {
  const ids = selectedEnvironmentIds.value
  if (ids.length === 0) return
  try {
    await confirmAction(`确定删除选中的 ${ids.length} 个环境吗？此操作不可恢复。`, '批量删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  deletingBulk.value = true
  try {
    const res = await axios.post('/api/environments/bulk-delete', {
      projectId,
      ids
    })
    await fetchEnvironments()
    selectedEnvironments.value = []
    message.success(`已删除 ${(res.data as { deleted?: number })?.deleted ?? ids.length} 个环境`)
  } catch (error) {
    console.error('Failed to bulk delete environments:', error)
    message.error(error, '批量删除失败')
  } finally {
    deletingBulk.value = false
  }
}

const activateEnvironment = async (id: string) => {
  try {
    await axios.put(`/api/environments/${id}/activate`)
    await fetchEnvironments()
    message.success('环境已激活')
  } catch (error) {
    console.error('Failed to activate environment:', error)
    message.error(error, '激活失败')
  }
}

const testEnvironment = async (id: string) => {
  try {
    const res = await axios.post(`/api/environments/${id}/test`)
    if (res.data.reachable) {
      message.success(`主机可连通 (${res.data.latencyMs}ms)`)
    } else {
      message.error(res.data.error ? `不可连通：${res.data.error}` : '不可连通')
    }
  } catch (e) {
    console.error('Failed to test environment:', e)
    message.error(e, '测试失败')
  }
}

const openImportDialog = () => {
  importText.value = ''
  importDialogVisible.value = true
}

const doImport = async () => {
  const text = (importText.value || '').trim()
  if (!text) {
    message.warning('请粘贴 JSON')
    return
  }

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    message.error('JSON 解析失败')
    return
  }

  importing.value = true
  try {
    await axios.post('/api/environments/import', {
      projectId,
      ...(Array.isArray(parsed) ? { environments: parsed } : parsed)
    })
    importDialogVisible.value = false
    await fetchEnvironments()
    message.success('环境已导入')
  } catch (e) {
    console.error('Failed to import environments:', e)
    message.error(e, '导入失败')
  } finally {
    importing.value = false
  }
}

const exportEnvironments = async () => {
  try {
    await confirmAction('确定导出当前项目下的所有环境吗？', '导出确认')
  } catch {
    return
  }
  try {
    const res = await axios.get(`/api/environments/export?projectId=${projectId}`)
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `environments-${projectId}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    message.success('环境已导出')
  } catch (e) {
    console.error('Failed to export environments:', e)
    message.error(e, '导出失败')
  }
}

const saveEnvironment = async () => {
  if (!form.value.name.trim() || !form.value.baseUrl.trim()) {
    message.warning('请填写环境名称和基础 URL')
    return
  }

  // 前置步骤：选了用例就必须填提取规则，否则这步等于没配
  const setupSteps: { testCaseId: string; extractRules: Record<string, string> }[] = []
  for (let index = 0; index < form.value.setupSteps.length; index++) {
    const step = form.value.setupSteps[index]
    const testCaseId = String(step.testCaseId || '').trim()
    const rules: Record<string, string> = {}
    for (const rule of step.extractRules) {
      const key = String(rule.key || '').trim()
      const path = String(rule.path || '').trim()
      if (key && path) rules[key] = path
    }
    if (!testCaseId && Object.keys(rules).length === 0) continue
    if (!testCaseId) {
      message.warning(`步骤 ${index + 1} 还没有选择前置用例`)
      return
    }
    if (Object.keys(rules).length === 0) {
      message.warning(`步骤 ${index + 1} 还没有填写变量提取规则`)
      return
    }
    setupSteps.push({ testCaseId, extractRules: rules })
  }

  const variables = form.value.variables
    .filter((v) => String(v?.key || '').trim())
    .map((v) => ({
      key: String(v.key).trim(),
      value: String(v?.value ?? ''),
      type: (v?.type || 'string') as 'string' | 'number' | 'boolean' | 'secret',
      description: v?.description ? String(v.description) : undefined
    }))

  const payload = {
    projectId,
    name: form.value.name,
    baseUrl: form.value.baseUrl,
    description: form.value.description || undefined,
    isActive: form.value.isActive,
    variables: variables.length ? variables : [],
    setupSteps: setupSteps.length ? setupSteps : [],
    // 新配置以 setupSteps 为准，清掉旧字段避免两份配置同时生效
    loginTestCaseId: null,
    loginExtractRules: null
  }

  try {
    if (editingId.value) {
      await axios.put(`/api/environments/${editingId.value}`, payload)
    } else {
      await axios.post('/api/environments', payload)
    }
    dialogVisible.value = false
    await fetchEnvironments()
    message.success('环境已保存')
  } catch (error) {
    console.error('Failed to save environment:', error)
    message.error(error, '保存失败')
  }
}
</script>

<style scoped>
/* 说明文字在输入框下方时，标签与输入框顶部对齐，避免标签落到整块中间 */
.base-url-item {
  align-items: flex-start !important;
}
.base-url-item :deep(.el-form-item__label) {
  align-self: flex-start !important;
  height: 40px;
  align-items: center;
  line-height: normal;
}
.field-hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-muted);
}
.field-hint code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--background-color-soft);
  font: 11px var(--font-mono);
}

.setup-steps {
  padding-right: 2px;
}

/* 内容较高时标签贴顶，避免“前置步骤”飘在整块中间 */
.setup-steps-item {
  align-items: flex-start !important;
}

.setup-steps-item :deep(.el-form-item__label) {
  align-self: flex-start !important;
  height: 36px;
  align-items: center;
  line-height: normal;
}

.setup-step {
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--card-background-strong);
}

.setup-step:last-child {
  margin-bottom: 0;
}

.setup-step__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.setup-step__index {
  min-width: 52px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 下拉框与同一行的按钮保持 36px 高度，避免“太细” */
.setup-step__select {
  flex: 1;
  min-width: 200px;
}

.setup-step__select :deep(.el-select__wrapper) {
  min-height: 36px;
  padding-top: 0;
  padding-bottom: 0;
}

.setup-step__rules {
  margin-top: 8px;
}

.setup-rule {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.setup-rule__key {
  width: 200px;
  flex: none;
}

.setup-rule__path {
  flex: 1;
  min-width: 160px;
}

/* 卡片内输入框统一 36px，与同一区域的按钮齐平 */
.setup-rule :deep(.el-input__wrapper) {
  min-height: 36px;
}

.setup-rule__arrow {
  color: var(--text-muted);
  font-size: 12px;
}

.setup-rule__remove {
  flex: none;
}

.setup-step__rules-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setup-step__hint {
  font-size: 12px;
  color: var(--text-muted);
}

.setup-step__add {
  width: 100%;
  margin-top: 10px;
}

.setup-steps__empty {
  padding: 8px 0;
}
</style>
