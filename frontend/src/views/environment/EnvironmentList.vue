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
        <el-table-column type="selection" width="48" :reserve-selection="false" />
        <el-table-column prop="name" label="环境名称" min-width="140" />
        <el-table-column prop="baseUrl" label="基础 URL" min-width="200" show-overflow-tooltip />
        <el-table-column label="变量" width="100">
          <template #default="scope">
            {{ (scope.row.variables || []).length }}
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

    <el-dialog :title="editingId ? '编辑环境' : '创建环境'" v-model="dialogVisible" width="860px" append-to-body>
      <el-form :model="form" label-width="100px">
        <el-form-item label="环境名称" required>
          <el-input v-model="form.name" placeholder="例如：DEV / TEST / PROD" />
        </el-form-item>
        <el-form-item label="基础 URL" required>
          <el-input v-model="form.baseUrl" placeholder="例如：https://example.com" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="设为激活">
          <el-switch v-model="form.isActive" />
        </el-form-item>

        <el-divider content-position="left">全局变量（可选）</el-divider>
        <el-alert
          title="配置后，执行测试前会先执行登录用例一次，提取的变量（如 token）供所有步骤使用，无需重复添加登录步骤。"
          type="info"
          :closable="false"
          show-icon
          class="mb-3"
        />
        <el-form-item label="登录用例">
          <el-select
            v-model="form.loginTestCaseId"
            placeholder="选择登录用例（留空则不预登录）"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="tc in testCases"
              :key="tc.id"
              :label="tc.name"
              :value="tc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.loginTestCaseId" label="变量提取规则">
          <div class="mb-2 flex w-full items-center justify-between">
            <span class="text-sm text-slate-400">变量名 → JSON 路径，如 token → $.data.token</span>
            <el-button size="small" class="ml-auto shrink-0" @click="addLoginExtractRule">新增</el-button>
          </div>
          <el-table :data="form.loginExtractRules" size="small" style="width: 100%">
            <el-table-column label="变量名" width="140">
              <template #default="scope">
                <el-input v-model="scope.row.key" placeholder="如 token" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="JSON 路径">
              <template #default="scope">
                <el-input v-model="scope.row.path" placeholder="如 $.data.token" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="scope">
                <span class="table-action table-action--danger" @click="removeLoginExtractRule(scope.$index)"><el-icon><Delete /></el-icon>删除</span>
              </template>
            </el-table-column>
          </el-table>
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
            <span class="text-sm text-slate-400">键值对，如 userId → 12345</span>
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
}

interface EnvVar {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'secret';
  description?: string;
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
  loginTestCaseId: '' as string | null,
  loginExtractRules: [] as { key: string; path: string }[]
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
    loginTestCaseId: null,
    loginExtractRules: []
  }
  dialogVisible.value = true
  fetchTestCases()
}

const openEditDialog = (environment: Environment) => {
  editingId.value = environment.id
  const env = environment as any
  const rules = env.loginExtractRules && typeof env.loginExtractRules === 'object'
    ? Object.entries(env.loginExtractRules).map(([key, path]) => ({ key, path: String(path ?? '') }))
    : []
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
    loginTestCaseId: env.loginTestCaseId || null,
    loginExtractRules: rules
  }
  dialogVisible.value = true
  fetchTestCases()
}

const fetchTestCases = async () => {
  try {
    const res = await axios.get(`/api/tests?projectId=${projectId}`)
    testCases.value = Array.isArray(res.data) ? res.data : []
  } catch {
    testCases.value = []
  }
}

const addLoginExtractRule = () => {
  form.value.loginExtractRules.push({ key: '', path: '' })
}

const removeLoginExtractRule = (index: number) => {
  form.value.loginExtractRules.splice(index, 1)
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

  const loginExtractRulesObj: Record<string, string> = {}
  if (form.value.loginTestCaseId && form.value.loginExtractRules.length) {
    for (const r of form.value.loginExtractRules) {
      const k = String(r.key || '').trim()
      const p = String(r.path || '').trim()
      if (k && p) loginExtractRulesObj[k] = p
    }
  }

  const variables = form.value.variables
    .filter((v) => String(v?.key || '').trim())
    .map((v) => ({
      key: String(v.key).trim(),
      value: String(v?.value ?? ''),
      type: (v?.type || 'string') as 'string' | 'number' | 'boolean' | 'secret',
      description: v?.description ? String(v.description) : undefined
    }))

  // 显式传 null 以清除全局环境配置，传 undefined 时后端不会更新
  const loginId = form.value.loginTestCaseId || null
  const loginRules =
    loginId && Object.keys(loginExtractRulesObj).length
      ? loginExtractRulesObj
      : null

  const payload = {
    projectId,
    name: form.value.name,
    baseUrl: form.value.baseUrl,
    description: form.value.description || undefined,
    isActive: form.value.isActive,
    variables: variables.length ? variables : [],
    loginTestCaseId: loginId,
    loginExtractRules: loginRules
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

