<template>
  <PageContainerLayout
    title="接口文档"
    description="导入、标注、分析并维护接口清单。批量 AI 分析会自动补全业务标签、风险线索与语义信息。"
  >
    <template #toolbar>
      <el-button type="primary" @click="openImportDialog">导入 API</el-button>
      <el-button
        :loading="isAnalyzingBulk"
        :disabled="apis.length === 0"
        @click="analyzeSelectedApis"
      >
        AI 批量分析{{ selectedApiIds.length > 0 ? ` (${selectedApiIds.length})` : '' }}
      </el-button>
      <el-button
        type="success"
        :loading="generatingTestsBulk"
        :disabled="apis.length === 0"
        @click="openBulkGenerateTestsDialog"
      >
        批量生成测试用例
      </el-button>
      <el-button @click="openCreateDialog">创建 API</el-button>
      <el-button
        v-if="selectedApiIds.length > 0"
        type="danger"
        plain
        :loading="deletingBulk"
        @click="deleteSelectedApis"
      >
        批量删除 ({{ selectedApiIds.length }})
      </el-button>
    </template>

      <section class="app-metric-grid">
        <article class="app-metric-card">
          <div class="app-metric-label">接口总数</div>
          <div class="app-metric-value">{{ apis.length }}</div>
          <div class="app-metric-note">当前项目内的全部接口清单</div>
        </article>
        <article class="app-metric-card">
          <div class="app-metric-label">筛选结果</div>
          <div class="app-metric-value">{{ filteredApis.length }}</div>
          <div class="app-metric-note">根据当前搜索条件命中的接口</div>
        </article>
        <article class="app-metric-card">
          <div class="app-metric-label">已标签接口</div>
          <div class="app-metric-value">{{ taggedApisCount }}</div>
          <div class="app-metric-note">已补全标签的接口数量</div>
        </article>
        <article class="app-metric-card">
          <div class="app-metric-label">AI 状态</div>
          <div class="app-metric-value text-[1.45rem]">{{ aiStatusText }}</div>
          <div class="app-metric-note">{{ dominantMethodText }}</div>
        </article>
      </section>

      <el-card class="app-panel overflow-hidden">
        <template #header>
          <div class="app-panel-header">
            <div>
              <div class="app-panel-title">接口目录</div>
              <div class="app-panel-subtitle">支持搜索、分页浏览、导入 Swagger/OpenAPI/Postman 与批量 AI 分析。</div>
            </div>
            <el-input 
              v-model="searchQuery" 
              placeholder="搜索 ID / 路径 / 业务摘要" 
              class="input-with-select api-search-input w-full md:max-w-md" 
              clearable>
              <template #append>
                <el-select v-model="methodFilter" placeholder="请求方式" clearable style="width: 115px" @click.stop>
                  <el-option label="全部" value="" />
                  <el-option label="GET" value="GET" />
                  <el-option label="POST" value="POST" />
                  <el-option label="PUT" value="PUT" />
                  <el-option label="DELETE" value="DELETE" />
                  <el-option label="PATCH" value="PATCH" />
                  <el-option label="HEAD" value="HEAD" />
                  <el-option label="OPTIONS" value="OPTIONS" />
                </el-select>
              </template>
            </el-input>
          </div>
        </template>

        <el-table
          :data="pagedApis"
          v-loading="loading"
          row-key="id"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="48" :reserve-selection="false" />
          <el-table-column label="路径" min-width="300">
            <template #default="scope">
              <div>
                <el-tooltip :content="scope.row.path" placement="top" :show-after="300">
                  <div class="app-table-primary font-mono text-[13px]">{{ scope.row.path }}</div>
                </el-tooltip>
                <el-tooltip :content="`ID · ${scope.row.id}`" placement="top" :show-after="300">
                  <div class="app-table-secondary">ID · {{ scope.row.id }}</div>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="方法" width="120" align="center">
            <template #default="scope">
              <div class="api-method-cell">
                <ApiMethodTag :method="scope.row.method" />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="摘要" min-width="300">
            <template #default="scope">
              <div>
                <el-tooltip :content="scope.row.summary || '-'" placement="top" :show-after="300">
                  <div class="app-table-primary">{{ scope.row.summary || '-' }}</div>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="标签" min-width="220" align="center">
            <template #default="scope">
              <div class="api-tags-cell">
                <el-tag v-for="tag in scope.row.tags || []" :key="`${scope.row.id}-${tag}`" size="small"
                  effect="plain">{{ tag }}</el-tag>
                <span v-if="!scope.row.tags || scope.row.tags.length === 0" class="text-slate-500">-</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="scope">
              <div class="table-actions">
                <span class="table-action table-action--primary" @click="navigateToApi(scope.row.id)"><el-icon><View /></el-icon>详情</span>
                <span class="table-action" @click="openEditDialog(scope.row)"><el-icon><EditPen /></el-icon>编辑</span>
                <span class="table-action table-action--danger" @click="deleteApi(scope.row.id)"><el-icon><Delete /></el-icon>删除</span>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!loading && filteredApis.length === 0" class="app-empty" description="导入 OpenAPI 或手动添加接口后开始管理，支持 AI 语义分析" />

        <div v-else class="app-pagination">
          <div class="app-pagination-copy">当前页显示 {{ pagedApis.length }} 条</div>
          <el-pagination background layout="total, sizes, prev, pager, next" :total="total" :current-page="currentPage"
            :page-size="pageSize" :page-sizes="[5, 10, 20, 50]" @current-change="handleCurrentChange"
            @size-change="handleSizeChange" />
        </div>
      </el-card>

      <el-dialog title="导入 API" v-model="importDialogVisible" width="720px" append-to-body>
        <div class="import-dialog">
          <div class="import-section">
            <div class="import-section__title">导入方式</div>
            <div class="import-type-cards">
              <div class="import-type-card" :class="{ active: importForm.type === 'swagger' }" @click="importForm.type = 'swagger'">
                <div class="import-type-card__icon">📄</div>
                <div class="import-type-card__label">Swagger / OpenAPI</div>
                <div class="import-type-card__desc">支持 2.0 和 3.x 规范</div>
              </div>
              <div class="import-type-card" :class="{ active: importForm.type === 'postman' }" @click="importForm.type = 'postman'">
                <div class="import-type-card__icon">📮</div>
                <div class="import-type-card__label">Postman Collection</div>
                <div class="import-type-card__desc">支持 v2.1 集合格式</div>
              </div>
            </div>
          </div>

          <div class="import-section">
            <div class="import-section__title">数据来源</div>
            <el-radio-group v-model="importForm.source" class="import-source-group">
              <el-radio-button value="file">上传文件</el-radio-button>
              <el-radio-button value="paste">粘贴内容</el-radio-button>
              <el-radio-button value="url">URL 地址</el-radio-button>
            </el-radio-group>
          </div>

          <div v-if="importForm.source === 'url'" class="import-section">
            <div class="import-section__title">Swagger/OpenAPI URL</div>
            <el-input v-model="importForm.url" placeholder="https://api.example.com/swagger.json 或 /openapi/v3.json" clearable />
            <div class="import-section__hint">仅支持 Swagger/OpenAPI 格式，Postman 请使用粘贴或文件</div>
          </div>

          <div v-if="importForm.source === 'file'" class="import-section">
            <div class="import-section__title">上传文件</div>
            <el-upload class="import-upload" drag :auto-upload="false" :limit="1" :file-list="importFileList"
              accept=".json,.yaml,.yml" @change="handleImportFileChange" @remove="handleImportFileRemove">
              <div class="import-upload__content">
                <el-icon class="import-upload__icon"><UploadFilled /></el-icon>
                <div class="import-upload__text">拖拽文件到此处，或 <em>点击上传</em></div>
                <div class="import-upload__hint">支持 JSON / JSON5 / YAML 格式</div>
              </div>
            </el-upload>
          </div>

          <div v-if="importForm.source === 'paste'" class="import-section">
            <div class="import-section__title">粘贴规范内容</div>
            <el-input v-model="importForm.spec" type="textarea" :rows="8"
              placeholder="粘贴 Swagger JSON 或 Postman Collection JSON..." />
          </div>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="importDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="importApi">导入</el-button>
          </span>
        </template>
      </el-dialog>

      <el-dialog
        title="批量生成测试用例"
        v-model="bulkGenerateTestsDialogVisible"
        width="560px"
        append-to-body
        :close-on-click-modal="false"
      >
        <div v-if="bulkGenerateLoading" class="py-8 text-center text-slate-500">
          <el-icon class="is-loading text-2xl"><Loading /></el-icon>
          <p class="mt-2">正在加载...</p>
        </div>
        <div v-else-if="bulkGenerateTargets.length === 0">
          <el-empty description="当前无待生成接口" />
          <p class="text-sm text-slate-500 mt-2">
            已选接口均有测试用例，或未选择接口时，所有接口均已覆盖。可勾选需要补充用例的接口后重试。
          </p>
        </div>
        <div v-else>
          <p class="text-sm text-slate-300 mb-3">
            以下 {{ bulkGenerateTargets.length }} 个接口尚未创建测试用例，将为每个接口按规则生成并保存 2 条用例
          </p>
          <ul class="list-disc list-inside text-sm text-slate-400 space-y-1 max-h-48 overflow-y-auto">
            <li v-for="api in bulkGenerateTargets" :key="api.id">{{ api.method }} {{ api.path }} · {{ api.summary }}</li>
          </ul>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="bulkGenerateTestsDialogVisible = false">取消</el-button>
            <el-button
              type="primary"
              :loading="generatingTestsBulk"
              :disabled="bulkGenerateTargets.length === 0"
              @click="runBulkGenerateTests"
            >
              开始生成
            </el-button>
          </span>
        </template>
      </el-dialog>

      <el-dialog :title="editingId ? '编辑 API' : '创建 API'" v-model="editDialogVisible" width="860px" append-to-body>
        <el-form :model="editForm" label-width="120px">
          <el-form-item label="方法" required>
            <el-select v-model="editForm.method" style="width: 160px">
              <el-option label="GET" value="GET" />
              <el-option label="POST" value="POST" />
              <el-option label="PUT" value="PUT" />
              <el-option label="DELETE" value="DELETE" />
              <el-option label="PATCH" value="PATCH" />
              <el-option label="HEAD" value="HEAD" />
              <el-option label="OPTIONS" value="OPTIONS" />
            </el-select>
          </el-form-item>
          <el-form-item label="路径" required>
            <el-input v-model="editForm.path" placeholder="/users/{id}" />
          </el-form-item>
          <el-form-item label="摘要" required>
            <el-input v-model="editForm.summary" placeholder="例如：获取用户详情" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="editForm.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="标签 (逗号)">
            <el-input v-model="editForm.tagsText" placeholder="user,auth" />
          </el-form-item>

          <el-divider />
          <el-form-item label="Parameters (JSON)">
            <el-input v-model="editForm.parametersJson" type="textarea" :rows="5" />
          </el-form-item>
          <el-form-item label="RequestBody (JSON)">
            <el-input v-model="editForm.requestBodyJson" type="textarea" :rows="6" />
          </el-form-item>
          <el-form-item label="Responses (JSON)">
            <el-input v-model="editForm.responsesJson" type="textarea" :rows="7" />
          </el-form-item>
        </el-form>

        <template #footer>
          <span class="dialog-footer">
            <el-button @click="editDialogVisible = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="saveApi">保存</el-button>
          </span>
        </template>
      </el-dialog>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import JSON5 from 'json5'
import { parse as parseYaml } from 'yaml'
import ApiMethodTag from '../../components/api/ApiMethodTag.vue'
import { useAIStore } from '../../store/ai'
import { usePagination } from '../../composables/usePagination'
import { UploadFilled, View, EditPen, Delete, Loading } from '@element-plus/icons-vue'
import { message, confirmAction } from '../../utils/message'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => route.params.id as string)
const aiStore = useAIStore()

interface API {
  id: string;
  path: string;
  method: string;
  summary: string;
  description?: string;
  tags?: string[] | null;
  parameters?: any[] | null;
  requestBody?: any | null;
  responses?: any | null;
}

const apis = ref<API[]>([])
const loading = ref(false)
const deletingBulk = ref(false)
const selectedApis = ref<API[]>([])
const searchQuery = ref('')
const methodFilter = ref('')
const importDialogVisible = ref(false)
const editDialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const importFileList = ref<any[]>([])
const importForm = ref({
  type: 'swagger',
  source: 'file' as 'file' | 'paste' | 'url',
  url: '',
  spec: ''
})

const generatingTestsBulk = ref(false)
const bulkGenerateTestsDialogVisible = ref(false)
const bulkGenerateTargets = ref<API[]>([])
const bulkGenerateLoading = ref(false)

const isAnalyzingBulk = computed(
  () => aiStore.analyzingBulk?.projectId === projectId.value,
)

const selectedApiIds = computed(() => selectedApis.value.map((a) => a.id))

const handleSelectionChange = (rows: API[]) => {
  selectedApis.value = rows
}

const editForm = ref({
  method: 'GET',
  path: '/example',
  summary: '',
  description: '',
  tagsText: '',
  parametersJson: '[]',
  requestBodyJson: '{}',
  responsesJson: '{}'
})

const filteredApis = computed(() => {
  let list = apis.value
  if (methodFilter.value) {
    const m = String(methodFilter.value).toUpperCase()
    list = list.filter((api) => String(api.method || '').toUpperCase() === m)
  }
  if (!searchQuery.value) return list
  const q = searchQuery.value.trim().toLowerCase()
  return list.filter((api) =>
    String(api.id || '').toLowerCase().includes(q) ||
    (api.path || '').toLowerCase().includes(q) ||
    (api.summary || '').toLowerCase().includes(q)
  )
})

const taggedApisCount = computed(() => apis.value.filter((api) => Array.isArray(api.tags) && api.tags.length > 0).length)

const dominantMethodText = computed(() => {
  if (!apis.value.length) return '等待导入第一个接口'
  const methodCount = apis.value.reduce<Record<string, number>>((acc, api) => {
    const key = String(api.method || 'UNKNOWN').toUpperCase()
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const [method, count] = Object.entries(methodCount).sort((a, b) => b[1] - a[1])[0] || []
  return method ? `${method} 占比最高 · ${count} 个` : '暂无方法数据'
})

const aiStatusText = computed(() => {
  if (!aiStore.enabled) return '未启用'
  return aiStore.features.semanticParse ? '语义分析中' : '能力待开启'
})

const { currentPage, pageSize, total, pagedItems: pagedApis, handleCurrentChange, handleSizeChange, resetPage } = usePagination(filteredApis, 10)
watch([apis, searchQuery, methodFilter], () => resetPage())

onMounted(async () => {
  await aiStore.getProjectConfig(projectId.value)
  await fetchApis()
})

const fetchApis = async (silent = false) => {
  if (!silent) loading.value = true
  try {
    const response = await axios.get(`/api/apis?projectId=${projectId.value}`)
    apis.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    console.error('Failed to fetch APIs:', error)
    apis.value = []
  } finally {
    if (!silent) loading.value = false
  }
}

const openImportDialog = () => {
  importForm.value = {
    type: 'swagger',
    source: 'file',
    url: '',
    spec: ''
  }
  importFileList.value = []
  importDialogVisible.value = true
}

const openCreateDialog = () => {
  editingId.value = null
  editForm.value = {
    method: 'GET',
    path: '/example',
    summary: '',
    description: '',
    tagsText: '',
    parametersJson: '[]',
    requestBodyJson: '{}',
    responsesJson: '{}'
  }
  editDialogVisible.value = true
}

const openEditDialog = async (api: API) => {
  try {
    const res = await axios.get(`/api/apis/${api.id}`)
    const detail = res.data as API
    editingId.value = detail.id
    editForm.value = {
      method: (detail.method || 'GET').toUpperCase(),
      path: detail.path || '/',
      summary: detail.summary || '',
      description: detail.description ? detail.description.split(':')[0].trim() : '',
      tagsText: Array.isArray(detail.tags) ? detail.tags.join(',') : '',
      parametersJson: JSON.stringify(detail.parameters || [], null, 2),
      requestBodyJson: JSON.stringify(detail.requestBody || {}, null, 2),
      responsesJson: JSON.stringify(detail.responses || {}, null, 2)
    }
    editDialogVisible.value = true
  } catch (error) {
    console.error('Failed to load API detail:', error)
    message.error(error, '加载 API 详情失败')
  }
}

const deleteSelectedApis = async () => {
  const ids = selectedApiIds.value
  if (ids.length === 0) return
  try {
    await confirmAction(`确定删除选中的 ${ids.length} 个接口吗？此操作不可恢复。`, '批量删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  deletingBulk.value = true
  try {
    const res = await axios.post('/api/apis/bulk-delete', {
      projectId: projectId.value,
      apiIds: ids
    })
    await fetchApis()
    selectedApis.value = []
    message.success(`已删除 ${res.data?.deleted ?? ids.length} 个接口`)
  } catch (error) {
    console.error('Failed to bulk delete APIs:', error)
    message.error(error, '批量删除失败')
  } finally {
    deletingBulk.value = false
  }
}

const deleteApi = async (id: string) => {
  try {
    await confirmAction('确定删除该 API 吗？此操作不可恢复。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  try {
    await axios.delete(`/api/apis/${id}`)
    await fetchApis()
    message.success('API 已删除')
  } catch (error) {
    console.error('Failed to delete API:', error)
    message.error(error, '删除失败')
  }
}

const openBulkGenerateTestsDialog = async () => {
  bulkGenerateLoading.value = true
  bulkGenerateTargets.value = []
  bulkGenerateTestsDialogVisible.value = true
  try {
    const [apisRes, testsRes] = await Promise.all([
      axios.get(`/api/apis?projectId=${projectId.value}`),
      axios.get(`/api/tests?projectId=${projectId.value}`)
    ])
    const allApis = Array.isArray(apisRes.data) ? apisRes.data : []
    const allTests = Array.isArray(testsRes.data) ? testsRes.data : []
    const coveredApiIds = new Set(allTests.map((t: any) => t.apiId).filter(Boolean))

    const uncoveredApis = allApis.filter((a) => !coveredApiIds.has(a.id))
    const targets =
      selectedApiIds.value.length > 0
        ? uncoveredApis.filter((a) => selectedApiIds.value.includes(a.id))
        : uncoveredApis

    bulkGenerateTargets.value = targets
  } catch (error) {
    console.error('Failed to load data for bulk generate:', error)
    message.error(error, '加载失败')
    bulkGenerateTestsDialogVisible.value = false
  } finally {
    bulkGenerateLoading.value = false
  }
}

const runBulkGenerateTests = async () => {
  const targets = bulkGenerateTargets.value
  if (targets.length === 0) return

  generatingTestsBulk.value = true
  let created = 0
  const createdIds: string[] = []
  const errors: string[] = []
  let usedFallbackCount = 0
  try {
    for (const api of targets) {
      try {
        const res = await axios.post('/api/ai/generate-tests-rule', {
          projectId: projectId.value,
          apiId: api.id
        })
        if (res?.data?.usedFallback) usedFallbackCount++
        const suggestions = Array.isArray(res?.data?.suggestions) ? res.data.suggestions : []
        const toSave = suggestions.slice(0, 2)
        for (const item of toSave) {
          const saveRes = await axios.post('/api/tests', {
            projectId: projectId.value,
            apiId: api.id,
            name: item.name,
            description: item.rationale,
            priority: item.priority || 'P1',
            tags: item.tags || ['AI推荐'],
            request: item.request,
            assertions: item.assertions || [{ type: 'STATUS', condition: 'eq', expected: 200 }]
          })
          const id = saveRes?.data?.id
          if (id) createdIds.push(id)
          created++
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || '生成失败'
        errors.push(`${api.summary || api.path}: ${msg}`)
      }
    }
    if (createdIds.length > 0) {
      await axios.post('/api/ai/enrich-assertions', {
        projectId: projectId.value,
        testCaseIds: createdIds
      })
    }
    bulkGenerateTestsDialogVisible.value = false
    bulkGenerateTargets.value = []
    if (created > 0) {
      message.success(`已为 ${targets.length} 个接口生成并保存 ${created} 条测试用例`)
      if (usedFallbackCount > 0) {
        message.warning(`其中 ${usedFallbackCount} 个接口因 AI 失败已使用规则回退`)
      }
    }
    if (errors.length > 0) {
      message.warning(`部分失败：${errors.slice(0, 2).join('；')}${errors.length > 2 ? ' 等' : ''}`)
    }
    if (created === 0 && errors.length > 0) {
      message.error('生成失败，请检查接口配置或网络')
    }
  } finally {
    generatingTestsBulk.value = false
  }
}

const importApi = async () => {
  try {
    let text = (importForm.value.spec || '').trim()
    if (importForm.value.source === 'url') {
      const url = (importForm.value.url || '').trim()
      if (!url) {
        message.warning('请输入 Swagger/OpenAPI URL')
        return
      }
      try {
        const res = await axios.get(url, { timeout: 15000 })
        text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      } catch (err: any) {
        message.error(err?.message || '获取 URL 内容失败，请检查地址或 CORS 配置')
        return
      }
    }
    if (!text) {
      message.warning('请粘贴规范内容、选择文件或输入 URL')
      return
    }
    const parsed = parseApiSpecInput(text)
    if (!parsed.ok) {
      message.error(`导入失败：${parsed.message}`)
      return
    }
    const spec = parsed.value
    await axios.post('/api/apis/import', {
      projectId: projectId.value,
      spec
    })
    importDialogVisible.value = false
    await fetchApis()
    message.success('导入成功')
  } catch (error) {
    console.error('Failed to import API:', error)
    message.error(error, '导入失败：请检查 JSON 格式或后端服务')
  }
}

const parseApiSpecInput = (rawText: string): { ok: true; value: any } | { ok: false; message: string } => {
  const normalize = (input: string) => {
    let output = String(input || '').replace(/^\uFEFF/, '').trim()
    const fenceMatch = output.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i)
    if (fenceMatch?.[1]) {
      output = fenceMatch[1].trim()
    }
    output = output.replace(/^export\s+default\s+/i, '').trim()
    output = output.replace(/;\s*$/, '')
    return output
  }

  const tryParse = (candidate: string) => {
    const parsed = JSON.parse(candidate)
    if (typeof parsed === 'string') {
      return JSON.parse(parsed)
    }
    return parsed
  }

  const normalized = normalize(rawText)
  const candidates = [normalized, normalized.replace(/,\s*([}\]])/g, '$1')]

  for (const candidate of candidates) {
    try {
      return { ok: true, value: tryParse(candidate) }
    } catch {
      // continue trying next candidate
    }
  }

  try {
    return { ok: true, value: JSON5.parse(normalized) }
  } catch {
    // ignore
  }

  try {
    const yamlParsed = parseYaml(normalized)
    if (yamlParsed && typeof yamlParsed === 'object') {
      return { ok: true, value: yamlParsed }
    }
  } catch (error: any) {
    const detail = String(error?.message || '')
    return {
      ok: false,
      message: `无法解析为有效 JSON/YAML。请确认粘贴的是原始 Swagger/OpenAPI 内容。${detail ? ` (${detail})` : ''}`
    }
  }

  return {
    ok: false,
    message: '内容不是有效的 JSON/YAML'
  }
}

const handleImportFileChange = async (file: any) => {
  const raw: File | undefined = file?.raw
  if (!raw) return
  try {
    const text = await raw.text()
    importForm.value.spec = text
    importFileList.value = [file]
    message.success(`已读取文件：${raw.name}`)
  } catch (e) {
    console.error('Failed to read import file:', e)
    message.error(e, '读取文件失败')
  }
}

const handleImportFileRemove = () => {
  importFileList.value = []
}

const navigateToApi = (id: string) => {
  router.push(`/projects/${projectId.value}/apis/${id}`)
}

const analyzeSelectedApis = async () => {
  const ids = selectedApiIds.value.length > 0 ? selectedApiIds.value : apis.value.map((item) => item.id)
  if (ids.length === 0) {
    message.warning('暂无可分析的接口')
    return
  }
  if (!aiStore.enabled || !aiStore.features.semanticParse) {
    message.warning('请先在“模型配置”中开启“接口语义分析”')
    return
  }

  const pid = projectId.value
  try {
    const result = await aiStore.analyzeImportedApis(
      pid,
      ids,
      true,
      async () => {
        if (pid !== projectId.value) return
        await fetchApis(true)
      },
    )
    if (pid === projectId.value) {
      await fetchApis()
      selectedApis.value = []
    }
    return result
  } catch {
    return
  }
}

const saveApi = async () => {
  const normalizePath = (p: string) => {
    const t = (p || '').trim()
    if (!t) return ''
    return t.startsWith('/') ? t : `/${t}`
  }

  if (!editForm.value.summary.trim()) {
    message.warning('请填写摘要')
    return
  }
  const path = normalizePath(editForm.value.path)
  if (!path) {
    message.warning('请填写路径')
    return
  }

  const parseJson = (label: string, input: string, fallback: any) => {
    const text = (input || '').trim()
    if (!text) return fallback
    try {
      return JSON.parse(text)
    } catch {
      message.error(`${label} JSON 解析失败`)
      throw new Error(`${label} JSON 解析失败`)
    }
  }

  let parameters: any
  let requestBody: any
  let responses: any
  try {
    parameters = parseJson('Parameters', editForm.value.parametersJson, [])
    requestBody = parseJson('RequestBody', editForm.value.requestBodyJson, null)
    responses = parseJson('Responses', editForm.value.responsesJson, {})
    if (!Array.isArray(parameters)) {
      message.error('Parameters 必须是数组')
      return
    }
    if (responses !== null && typeof responses !== 'object') {
      message.error('Responses 必须是对象')
      return
    }
  } catch {
    return
  }

  const tags = editForm.value.tagsText.split(',').map((s) => s.trim()).filter(Boolean)

  const payload: any = {
    projectId: projectId.value,
    method: editForm.value.method,
    path,
    summary: editForm.value.summary,
    description: editForm.value.description || undefined,
    tags: tags.length ? tags : null,
    parameters: parameters.length ? parameters : null,
    requestBody,
    responses: Object.keys(responses || {}).length ? responses : null
  }

  saving.value = true
  try {
    if (editingId.value) {
      await axios.put(`/api/apis/${editingId.value}`, payload)
    } else {
      await axios.post('/api/apis', payload)
    }
    editDialogVisible.value = false
    await fetchApis()
    message.success('API 已保存')
  } catch (error) {
    console.error('Failed to save API:', error)
    message.error(error, '保存失败：请检查后端服务或字段格式')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
/* Element Plus 复合型输入框：append 与 input 视觉统一，无双层边框 */
.input-with-select.api-search-input :deep(.el-input-group__append) {
  background-color: var(--el-fill-color-blank);
  padding: 0 12px;
  text-align: center;
}
.input-with-select.api-search-input :deep(.el-input-group__append .el-select .el-select__wrapper),
.input-with-select.api-search-input :deep(.el-input-group__append .el-select .el-select__wrapper:hover),
.input-with-select.api-search-input :deep(.el-input-group__append .el-select .el-select__wrapper.is-focused) {
  box-shadow: none !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  justify-content: center !important;
}
.input-with-select.api-search-input :deep(.el-input-group__append .el-select .el-select__selected-item),
.input-with-select.api-search-input :deep(.el-input-group__append .el-select .el-select__placeholder) {
  text-align: center;
}

.api-tags-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 28px;
  transition: none;
}

.api-tags-cell :deep(.el-tag) {
  transition: none;
}

.api-method-cell {
  transition: none;
}

.api-method-cell :deep(.el-tag) {
  transition: none;
}

.dialog-footer {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

.import-dialog {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.import-section__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

.import-section__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
}

.import-source-group {
  margin-bottom: 0;
}

.import-type-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.import-type-card {
  border: 1.5px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 20px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.import-type-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.import-type-card__icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.import-type-card__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.import-type-card__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.import-upload {
  width: 100%;
}

:deep(.import-upload .el-upload) {
  width: 100%;
}

:deep(.import-upload .el-upload-dragger) {
  width: 100%;
  border-radius: 10px;
  border: 1.5px dashed var(--el-border-color-lighter);
  background: var(--el-bg-color);
  padding: 32px 20px;
  transition: border-color 0.2s ease;
}

:deep(.import-upload .el-upload-dragger:hover) {
  border-color: var(--el-color-primary);
}

.import-upload__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.import-upload__icon {
  font-size: 36px;
  color: var(--el-text-color-placeholder);
}

.import-upload__text {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.import-upload__text em {
  color: var(--el-color-primary);
  font-style: normal;
}

.import-upload__hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
