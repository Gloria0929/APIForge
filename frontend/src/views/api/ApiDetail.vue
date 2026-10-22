<template>
  <PageContainerLayout
    title="API 详情"
    description="查看接口定义、运行 AI 语义分析、生成测试建议并直接调试请求。"
    :breadcrumbs="breadcrumbs"
  >
    <template #toolbar>
      <el-button :loading="analyzingSemantic" :disabled="!canUseSemanticAI" @click="runSemanticAnalysis">AI 分析接口</el-button>
      <el-button type="success" :loading="generatingTests" @click="runGenerateTests">AI 生成测试建议</el-button>
      <el-button v-if="api" type="primary" @click="openDebugDialog">调试接口</el-button>
    </template>

    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">{{ api?.summary || '接口详情' }}</div>
            <div class="app-panel-subtitle">{{ api?.path || '加载中...' }}</div>
          </div>
        </div>
      </template>

      <template v-if="api">
        <div class="space-y-6">
          <div class="app-data-card">
            <el-descriptions :column="2">
              <el-descriptions-item label="路径">{{ api.path }}</el-descriptions-item>
              <el-descriptions-item label="方法">{{ api.method }}</el-descriptions-item>
              <el-descriptions-item label="摘要">{{ api.summary }}</el-descriptions-item>
              <el-descriptions-item label="描述">
                <span class="description-text">{{ api.description?.trim() || '暂无描述' }}</span>
              </el-descriptions-item>
            </el-descriptions>
            <div v-if="api.tags?.length" class="mt-4 flex flex-wrap gap-2">
              <el-tag v-for="tag in api.tags" :key="`${api.id}-${tag}`" effect="plain">{{ tag }}</el-tag>
            </div>
          </div>
          <el-alert v-if="!canUseSemanticAI || !canUseTestGeneration" type="info" :closable="false"
            title="当前项目未开启完整 AI 接口增强能力，可前往「模型配置」开启接口语义分析与测试生成。" />
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="app-data-card request-parameters-panel">
              <div class="mb-4 text-xl font-semibold text-content">请求参数</div>
              <div class="request-parameters" aria-label="请求参数">
                <el-table v-if="allParameters.length > 0" :data="allParameters" height="100%" row-key="key" default-expand-all size="small" style="width: 100%">
                  <el-table-column prop="name" label="参数名" min-width="140" />
                  <el-table-column prop="in" label="位置" width="90" />
                  <el-table-column label="是否必填" width="100">
                    <template #default="scope">
                      <el-tag v-if="scope.row.required" type="danger" size="small">必填</el-tag>
                      <span v-else class="text-muted">可选</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="type" label="类型" width="100" />
                  <el-table-column prop="description" label="描述" min-width="100" show-overflow-tooltip />
                </el-table>
                <template v-else-if="hasRawRequestBody">
                  <div class="mb-2 text-sm text-muted">请求体结构（含未解析的 $ref 引用）</div>
                  <pre class="app-code">{{ JSON.stringify(api.requestBody, null, 2) }}</pre>
                </template>
                <el-empty v-else description="无请求参数" />
              </div>
            </div>

            <div class="app-data-card response-definition-panel">
              <div class="mb-4 text-xl font-semibold text-content">响应定义</div>
              <pre v-if="responseDefinitionJson" class="app-code response-definition" tabindex="0" aria-label="响应定义">{{ responseDefinitionJson }}</pre>
              <el-empty v-else class="response-definition" description="无响应定义" />
            </div>
          </div>
          <div v-if="semanticInsights" class="app-data-card space-y-4 semantic-insights">
            <div class="semantic-insights__header">
              <h3 class="text-xl font-semibold text-content semantic-insights__title">AI 接口语义分析</h3>
              <el-tag :type="riskTagType(semanticInsights.riskLevel)">风险：{{ riskLevelLabel(semanticInsights.riskLevel) }}</el-tag>
            </div>
            <p class="text-sm leading-7 text-regular">{{ semanticInsights.summary }}</p>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="业务上下文">{{ semanticInsights.businessContext }}</el-descriptions-item>
              <el-descriptions-item label="接口分类">
                <div class="flex flex-wrap gap-2">
                  <el-tag v-for="item in semanticInsights.categories" :key="item" size="small" effect="light">{{ item }}</el-tag>
                </div>
              </el-descriptions-item>
              <el-descriptions-item label="敏感字段">{{ semanticInsights.sensitiveFields?.join('、') || '无' }}</el-descriptions-item>
              <el-descriptions-item label="推荐测试方向">{{ semanticInsights.suggestedTests?.join('、') || '暂无' }}</el-descriptions-item>
            </el-descriptions>
            <div>
              <div class="mb-3 text-sm font-medium text-content">字段语义</div>
              <el-table v-if="pagedFieldMeanings.length" :data="pagedFieldMeanings" size="small" style="width: 100%">
                <el-table-column prop="name" label="字段" width="180" />
                <el-table-column prop="meaning" label="AI 解释" />
              </el-table>
              <el-empty v-else description="暂无字段语义" />
              <div v-if="fieldMeaningRows.length > 0" class="app-pagination">
                <div class="app-pagination-copy">字段语义 {{ fieldMeaningTotal }}</div>
                <el-pagination background layout="total, prev, pager, next" :total="fieldMeaningTotal"
                  :current-page="fieldMeaningPage" :page-size="fieldMeaningSize" @current-change="handleFieldMeaningPage" />
              </div>
            </div>
          </div>

          <div v-if="testSuggestions.length" class="app-data-card space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-xl font-semibold text-content">AI 测试建议</div>
              </div>
              <el-button size="small" type="primary" :loading="savingSuggestions" @click="saveSelectedSuggestions">保存选中建议</el-button>
            </div>
            <el-table :data="pagedSuggestions" size="small" style="width: 100%" @selection-change="onSuggestionSelectionChange">
              <el-table-column type="selection" width="55" />
              <el-table-column prop="name" label="建议名称" min-width="220" />
              <el-table-column prop="type" label="类型" width="180" />
              <el-table-column prop="priority" label="优先级" width="90" />
              <el-table-column prop="rationale" label="推荐原因" min-width="240" />
            </el-table>
            <div class="app-pagination">
              <div class="app-pagination-copy">建议 {{ suggestionTotal }}</div>
              <el-pagination background layout="total, prev, pager, next" :total="suggestionTotal"
                :current-page="suggestionPage" :page-size="suggestionSize" @current-change="handleSuggestionPage" />
            </div>
          </div>
        </div>
      </template>
      <el-empty v-else class="app-empty" description="加载中..." />
    </el-card>

    <el-dialog title="接口调试" v-model="debugDialogVisible" width="860px" append-to-body>
      <el-form label-width="130px" label-position="left">
        <el-form-item label="环境" required>
          <el-select v-model="selectedEnvId" placeholder="请选择环境" style="width: 100%">
            <el-option v-for="env in environments" :key="env.id" :label="`${env.name}${env.isActive ? ' (激活)' : ''}`" :value="env.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="方法"><el-tag>{{ api?.method }}</el-tag></el-form-item>
        <el-form-item label="URL" required><el-input v-model="debugForm.url" /></el-form-item>
        <el-form-item label="Headers (JSON)"><el-input v-model="debugForm.headersJson" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="Query (JSON)"><el-input v-model="debugForm.queryJson" type="textarea" :rows="3" /></el-form-item>
        <BodyTypeEditor
          v-model:body-type="debugForm.bodyType"
          v-model:body-json="debugForm.bodyJson"
          v-model:body-form-rows-urlencoded="debugForm.bodyFormRowsUrlencoded"
          v-model:body-form-rows-form-data="debugForm.bodyFormRowsFormData"
        />
      </el-form>

      <div v-if="debugResult" class="mt-4 space-y-4">
        <div class="debug-summary">
          <div class="debug-metric" :class="debugStatusTone">
            <span class="debug-metric__label">状态码</span>
            <span class="debug-metric__value">{{ debugResult.response?.status ?? '-' }}</span>
            <span class="debug-metric__note">{{ debugResult.response?.statusText || '—' }}</span>
          </div>
          <div class="debug-metric" :class="debugTimeTone">
            <span class="debug-metric__label">响应时间</span>
            <span class="debug-metric__value">{{ debugResult.responseTime }}<span class="debug-metric__unit">ms</span></span>
            <span class="debug-metric__note">{{ debugTimeHint }}</span>
          </div>
          <div class="debug-metric debug-metric--muted">
            <span class="debug-metric__label">Content-Type</span>
            <span class="debug-metric__content">{{ debugResult.response?.headers?.['content-type'] || '-' }}</span>
          </div>
        </div>
        <div>
          <div class="mb-2 text-sm font-medium text-regular">响应内容</div>
          <pre class="app-code">{{ JSON.stringify(debugResult.response?.data ?? debugResult.response?.body ?? debugResult.response, null, 2) }}</pre>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="debugDialogVisible = false">关闭</el-button>
          <el-button :loading="debugging" @click="runDebug">发送</el-button>
          <el-button type="primary" :disabled="!debugResult" :loading="savingAsTest" @click="saveAsTestCase">保存为测试用例</el-button>
        </span>
      </template>
    </el-dialog>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { requestParameters } from '../../utils/api-schema'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useAIStore } from '../../store/ai'
import BodyTypeEditor from '../../components/request/BodyTypeEditor.vue'
import { usePagination } from '../../composables/usePagination'
import { message } from '../../utils/message'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'

const route = useRoute()
const apiStore = useAIStore()
const apiId = computed(() => String(route.params.apiId || ''))
const projectId = computed(() => route.params.id as string)
const breadcrumbs = computed(() => [
  { label: '接口文档', to: `/projects/${projectId.value}/apis` },
  { label: api.value?.summary || api.value?.path || 'API 详情' },
])

interface API {
  id: string
  path: string
  method: string
  summary: string
  description?: string
  parameters?: any[]
  requestBody?: any
  responses?: any
  tags?: string[] | null
  aiInsights?: Record<string, any> | null
}

interface SemanticInsights {
  summary: string
  businessContext: string
  categories: string[]
  sensitiveFields: string[]
  fieldMeanings: Record<string, string>
  suggestedTests: string[]
  riskLevel: '低' | '中' | '高'
}

interface AiSuggestion {
  name: string
  type: string
  priority: string
  rationale: string
  tags?: string[]
  request: {
    method: string
    url: string
    headers?: Record<string, string>
    query?: Record<string, unknown>
    body?: unknown
  }
  assertions: any[]
}

const api = ref<API | null>(null)
const semanticInsights = ref<SemanticInsights | null>(null)
const testSuggestions = ref<AiSuggestion[]>([])
const selectedSuggestions = ref<AiSuggestion[]>([])
const analyzingSemantic = ref(false)
const generatingTests = ref(false)
const savingSuggestions = ref(false)
const debugDialogVisible = ref(false)
const environments = ref<any[]>([])
const selectedEnvId = ref<string>('')
const debugging = ref(false)
const savingAsTest = ref(false)
const debugResult = ref<any | null>(null)
const lastDebugRequest = ref<any | null>(null)

const debugStatusTone = computed(() => {
  const status = Number(debugResult.value?.response?.status) || 0
  if (status >= 200 && status < 300) return 'is-success'
  if (status >= 300 && status < 400) return 'is-info'
  if (status >= 400 && status < 500) return 'is-warning'
  if (status >= 500) return 'is-error'
  return 'is-muted'
})

const debugTimeTone = computed(() => {
  const time = Number(debugResult.value?.responseTime) || 0
  if (time < 300) return 'is-success'
  if (time < 1000) return 'is-warning'
  return 'is-error'
})

const debugTimeHint = computed(() => {
  const time = Number(debugResult.value?.responseTime) || 0
  if (time < 300) return '很快'
  if (time < 1000) return '正常'
  return '较慢'
})

const debugForm = ref({
  url: '',
  headersJson: '{\n  "Content-Type": "application/json"\n}',
  queryJson: '{}',
  bodyType: 'none' as 'none' | 'json' | 'urlencoded' | 'form-data',
  bodyJson: '{}',
  bodyFormRowsUrlencoded: [{ key: '', value: '' }] as Array<{ key: string; value: string }>,
  bodyFormRowsFormData: [{ key: '', type: 'text' as const, value: '', filename: undefined }] as Array<{ key: string; type?: 'text' | 'file'; value: string; filename?: string }>
})

// 按 apiId 保存调试表单，关闭后重开时恢复
const savedDebugForms = ref<Record<string, { form: typeof debugForm.value; envId: string }>>({})


const canUseSemanticAI = computed(() => apiStore.enabled && apiStore.features.semanticParse)
const canUseTestGeneration = computed(() => apiStore.enabled && apiStore.features.testGeneration)

/** Postman 格式：content.application/json 含 schema + example，结构简单 */
const extractPostmanResponseContent = (responses: Record<string, any> | null | undefined): { schema: any; example: any } | null => {
  if (!responses || typeof responses !== 'object') return null
  for (const code of ['200', '201']) {
    const resp = responses[code]
    if (!resp?.content?.['application/json']) continue
    const json = resp.content['application/json']
    if (json && typeof json === 'object' && json.schema && json.example !== undefined) {
      return { schema: json.schema, example: json.example }
    }
  }
  for (const [, resp] of Object.entries(responses)) {
    if (!resp?.content?.['application/json']) continue
    const json = resp.content['application/json']
    if (json && typeof json === 'object' && json.schema && json.example !== undefined) {
      return { schema: json.schema, example: json.example }
    }
  }
  return null
}

/** OpenAPI 格式：支持 content、schema、examples、$ref 等 */
const extractOpenAPIResponseContent = (responses: Record<string, any> | null | undefined): { schema: any; example: any } | null => {
  if (!responses || typeof responses !== 'object') return null
  const tryResp = (resp: any) => {
    if (!resp || typeof resp !== 'object') return null
    const content = resp.content
    if (content && typeof content === 'object') {
      const json = content['application/json'] || content['*/*'] || content['text/plain'] || Object.values(content)[0]
      if (json && typeof json === 'object') {
        let ex = json.example
        if (ex === undefined && json.examples && typeof json.examples === 'object') {
          const first = Object.values(json.examples)[0] as any
          ex = first?.value ?? first
        }
        if (json.schema || ex !== undefined) return { schema: json.schema, example: ex }
      }
    }
    if (resp.schema) return { schema: resp.schema, example: resp.example }
    return null
  }
  for (const code of ['200', '201', 'default', '2XX']) {
    const r = tryResp(responses[code])
    if (r) return r
  }
  for (const [, resp] of Object.entries(responses)) {
    const r = tryResp(resp)
    if (r) return r
  }
  return null
}

const responseContent = computed(() => {
  const resp = api.value?.responses
  return extractPostmanResponseContent(resp) ?? extractOpenAPIResponseContent(resp)
})
const responseSchema = computed(() => responseContent.value?.schema ?? null)

/** 将 OpenAPI schema 转换为 API 实际返回的 JSON 示例格式 */
const schemaToExampleJson = (schema: any, depth = 0): any => {
  if (!schema || typeof schema !== 'object' || depth > 15) return null
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.enum && schema.enum.length > 0) return schema.enum[0]
  const t = schema.type
  if (t === 'string') return schema.format === 'date-time' ? '2024-01-01T00:00:00Z' : ''
  if (t === 'integer' || t === 'number') return 0
  if (t === 'boolean') return false
  if (t === 'null') return null
  if (t === 'array') {
    const item = schema.items ? schemaToExampleJson(schema.items, depth + 1) : null
    return item != null ? [item] : []
  }
  if (t === 'object' || schema.properties) {
    const props = schema.properties || {}
    const required = new Set(Array.isArray(schema.required) ? schema.required : [])
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(props)) {
      const val = schemaToExampleJson(v as any, depth + 1)
      if (val !== undefined || required.has(k)) out[k] = val ?? null
    }
    return out
  }
  if (schema.anyOf?.[0]) return schemaToExampleJson(schema.anyOf[0], depth + 1)
  if (schema.oneOf?.[0]) return schemaToExampleJson(schema.oneOf[0], depth + 1)
  if (schema.allOf?.length) {
    const merged: any = {}
    for (const s of schema.allOf) {
      const ex = schemaToExampleJson(s, depth + 1)
      if (ex && typeof ex === 'object' && !Array.isArray(ex)) Object.assign(merged, ex)
    }
    return Object.keys(merged).length ? merged : null
  }
  return null
}

const responseDefinitionJson = computed(() => {
  const content = responseContent.value
  const schema = responseSchema.value
  if (content?.example !== undefined && content.example !== null) {
    try {
      const ex = typeof content.example === 'string' ? JSON.parse(content.example) : content.example
      return JSON.stringify(ex, null, 2)
    } catch {
      return String(content.example)
    }
  }
  if (schema) {
    const example = schemaToExampleJson(schema)
    if (example !== null) return JSON.stringify(example, null, 2)
    return JSON.stringify(schema, null, 2)
  }
  const resp = api.value?.responses
  if (resp && Object.keys(resp).length > 0) return JSON.stringify(resp, null, 2)
  return ''
})

const allParameters = computed(() => requestParameters(api.value))
const hasRawRequestBody = computed(() => Boolean(api.value?.requestBody) && allParameters.value.length === 0)

const fieldMeaningRows = computed(() => Object.entries(semanticInsights.value?.fieldMeanings || {}).map(([name, meaning]) => ({ name, meaning })))
const { currentPage: fieldMeaningPage, pageSize: fieldMeaningSize, total: fieldMeaningTotal, pagedItems: pagedFieldMeanings, handleCurrentChange: handleFieldMeaningPage } = usePagination(fieldMeaningRows, 6)
const { currentPage: suggestionPage, pageSize: suggestionSize, total: suggestionTotal, pagedItems: pagedSuggestions, handleCurrentChange: handleSuggestionPage } = usePagination(testSuggestions, 5)

watch(fieldMeaningRows, () => { fieldMeaningPage.value = 1 })
watch(testSuggestions, () => { suggestionPage.value = 1 })

let apiFetchGeneration = 0
const fetchApi = async () => {
  const generation = ++apiFetchGeneration
  try {
    const response = await axios.get(`/api/apis/${apiId.value}`)
    if (generation !== apiFetchGeneration) return
    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) throw new Error('接口不存在或响应格式无效')
    api.value = response.data
    semanticInsights.value = response.data.aiInsights || null
  } catch (error) {
    if (generation !== apiFetchGeneration) return
    console.error('Failed to fetch API details:', error)
    message.error(error, '加载 API 详情失败')
  }
}

watch([projectId, apiId], () => {
  api.value = null
  semanticInsights.value = null
  testSuggestions.value = []
  selectedSuggestions.value = []
  debugDialogVisible.value = false
  void apiStore.getProjectConfig(projectId.value)
  void fetchApi()
}, { immediate: true })

const runSemanticAnalysis = async () => {
  if (!canUseSemanticAI.value) {
    message.warning('请先启用接口语义分析功能')
    return
  }
  analyzingSemantic.value = true
  try {
    const response = await apiStore.semanticParseApi(projectId.value, apiId.value, true)
    semanticInsights.value = response.insights
    if (api.value) {
      api.value.tags = response.tags || api.value.tags || []
      api.value.aiInsights = response.insights
    }
    message.success('AI 接口分析完成')
  } catch (error) {
    console.error('Failed to semantic analyze api:', error)
    message.error(error, 'AI 接口分析失败')
  } finally {
    analyzingSemantic.value = false
  }
}

const runGenerateTests = async () => {
  generatingTests.value = true
  try {
    const response = await apiStore.generateTests(projectId.value, apiId.value)
    semanticInsights.value = response.insights || semanticInsights.value
    testSuggestions.value = Array.isArray(response.suggestions) ? response.suggestions : []
    selectedSuggestions.value = testSuggestions.value.slice(0, Math.min(2, testSuggestions.value.length))
    if (response.usedFallback) {
      message.warning('AI 生成失败，已使用规则回退生成测试建议')
    } else {
      message.success(`已生成 ${testSuggestions.value.length} 条测试建议`)
    }
  } catch (error) {
    console.error('Failed to generate tests:', error)
    message.error(error, 'AI 生成测试建议失败')
  } finally {
    generatingTests.value = false
  }
}

const onSuggestionSelectionChange = (rows: AiSuggestion[]) => {
  selectedSuggestions.value = rows
}

const saveSelectedSuggestions = async () => {
  if (!api.value) return
  if (selectedSuggestions.value.length === 0) {
    message.warning('请先勾选要保存的 AI 建议')
    return
  }

  savingSuggestions.value = true
  try {
    const results = await Promise.all(selectedSuggestions.value.map((item) =>
      axios.post('/api/tests', {
        projectId: projectId.value,
        apiId: apiId.value,
        name: item.name,
        description: item.rationale,
        priority: item.priority || 'P1',
        tags: item.tags || ['AI推荐'],
        request: item.request,
        assertions: item.assertions || [{ type: 'STATUS', condition: 'eq', expected: 200 }]
      })
    ))
    const ids = results.map((r) => r?.data?.id).filter(Boolean)
    if (ids.length > 0) {
      await axios.post('/api/ai/enrich-assertions', {
        projectId: projectId.value,
        testCaseIds: ids
      })
    }
    message.success(`已保存 ${selectedSuggestions.value.length} 条测试建议`)
  } catch (error) {
    console.error('Failed to save AI suggestions:', error)
    message.error(error, '保存 AI 建议失败')
  } finally {
    savingSuggestions.value = false
  }
}

/** 按 schema 生成一个可发送的示例值 */
const sampleValueForSchema = (schema: any): any => {
  if (!schema || typeof schema !== 'object') return ''
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0]
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'integer' || type === 'number') return 0
  if (type === 'boolean') return false
  if (type === 'array') return []
  if (type === 'object' || schema.properties) return {}
  return ''
}

const paramSample = (param: any): any => {
  if (param?.example !== undefined) return param.example
  const schema = param?.schema || (Object.values(param?.content || {})[0] as any)?.schema || param
  return sampleValueForSchema(schema)
}

/** 只取接口里显式给出的示例值，路径参数没有示例时保留 {name} 占位符 */
const explicitSample = (param: any): any => {
  if (param?.example !== undefined) return param.example
  const schema = param?.schema || (Object.values(param?.content || {})[0] as any)?.schema
  if (schema?.example !== undefined) return schema.example
  if (schema?.default !== undefined) return schema.default
  if (Array.isArray(schema?.enum) && schema.enum.length > 0) return schema.enum[0]
  return undefined
}

const formCell = (value: any): string => {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** 用接口定义预填 URL 路径参数、Query、Headers 与请求体 */
const fillDebugFormFromApi = () => {
  if (!api.value) return
  const params: any[] = Array.isArray(api.value.parameters) ? api.value.parameters : []
  debugForm.value.bodyFormRowsUrlencoded = [{ key: '', value: '' }]
  debugForm.value.bodyFormRowsFormData = [{ key: '', type: 'text', value: '', filename: undefined }]

  let path = api.value.path || ''
  if (!path.startsWith('/')) path = `/${path}`
  for (const param of params.filter((p) => p?.in === 'path' && p.name)) {
    const sample = explicitSample(param)
    if (sample !== undefined && sample !== null) path = path.split(`{${param.name}}`).join(String(sample))
  }
  debugForm.value.url = `{{base_url}}${path}`

  const query: Record<string, any> = {}
  for (const param of params.filter((p) => p?.in === 'query' && p.name)) query[param.name] = paramSample(param)
  debugForm.value.queryJson = JSON.stringify(query, null, 2)

  // 兼容 OpenAPI 3 的 requestBody 与 Swagger 2 / 旧格式的 in:body、in:formData 参数
  const bodyParam = params.find((p) => p?.in === 'body')
  const formDataParams = params.filter((p) => p?.in === 'formData' && p.name)
  const bodyContent = api.value.requestBody?.content || {}
  let mediaType = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']
    .find((type) => bodyContent[type]) || Object.keys(bodyContent)[0]
  let schema = mediaType ? bodyContent[mediaType]?.schema : undefined
  if (!mediaType && bodyParam) {
    mediaType = 'application/json'
    schema = bodyParam.schema || bodyParam
  }
  if (!mediaType && formDataParams.length > 0) {
    const hasFile = formDataParams.some((p) => p.type === 'file' || p.format === 'binary' || p.format === 'byte')
    mediaType = hasFile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
    schema = {
      type: 'object',
      properties: Object.fromEntries(formDataParams.map((p) => [p.name, {
        type: p.type === 'file' ? 'string' : p.type,
        format: p.type === 'file' ? 'binary' : p.format,
        example: p.example,
        default: p.default,
        enum: p.enum
      }]))
    }
  }
  const props: Record<string, any> = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {}

  const headers: Record<string, string> = {}
  if (!mediaType || mediaType.includes('json')) headers['Content-Type'] = 'application/json'
  else if (mediaType === 'application/x-www-form-urlencoded') headers['Content-Type'] = 'application/x-www-form-urlencoded'
  for (const param of params.filter((p) => p?.in === 'header' && p.name)) {
    headers[param.name] = param.name.toLowerCase() === 'authorization'
      ? 'Bearer {{token}}'
      : formCell(paramSample(param))
  }
  debugForm.value.headersJson = JSON.stringify(headers, null, 2)

  if (mediaType?.includes('json')) {
    debugForm.value.bodyType = 'json'
    debugForm.value.bodyJson = JSON.stringify(schemaToExampleJson(schema) ?? {}, null, 2)
  } else if (mediaType === 'multipart/form-data') {
    debugForm.value.bodyType = 'form-data'
    const rows = Object.entries(props).map(([key, prop]: [string, any]) => ({
      key,
      type: (prop?.format === 'binary' || prop?.format === 'byte' ? 'file' : 'text') as 'text' | 'file',
      value: formCell(sampleValueForSchema(prop)),
      filename: undefined
    }))
    debugForm.value.bodyFormRowsFormData = rows.length ? rows : [{ key: '', type: 'text', value: '', filename: undefined }]
  } else if (mediaType === 'application/x-www-form-urlencoded') {
    debugForm.value.bodyType = 'urlencoded'
    const rows = Object.entries(props).map(([key, prop]) => ({ key, value: formCell(sampleValueForSchema(prop)) }))
    debugForm.value.bodyFormRowsUrlencoded = rows.length ? rows : [{ key: '', value: '' }]
  } else {
    debugForm.value.bodyType = 'none'
    debugForm.value.bodyJson = '{}'
  }
}

/** 环境配置了登录提取 token 时，自动补 Authorization 请求头 */
const applyAutoAuthHeader = () => {
  const env = environments.value.find((e: any) => e.id === selectedEnvId.value)
  const key = Object.keys(env?.loginExtractRules || {}).find((k) => /token|jwt|auth/i.test(k))
  if (!key) return
  try {
    const headers = JSON.parse(debugForm.value.headersJson || '{}')
    if (Object.keys(headers).some((h) => h.toLowerCase() === 'authorization')) return
    headers['Authorization'] = `Bearer {{${key}}}`
    debugForm.value.headersJson = JSON.stringify(headers, null, 2)
  } catch {
    // headersJson 不是合法 JSON 时不覆盖用户输入
  }
}

const openDebugDialog = async () => {
  if (!api.value) return
  debugDialogVisible.value = true
  debugResult.value = null

  try {
    const res = await axios.get(`/api/environments?projectId=${projectId.value}`)
    environments.value = res.data || []
    const saved = savedDebugForms.value[api.value.id]
    if (saved) {
      const f = saved.form as any
      debugForm.value = {
        ...f,
        bodyFormRowsUrlencoded: f.bodyFormRowsUrlencoded ?? f.bodyFormRows ?? [{ key: '', value: '' }],
        bodyFormRowsFormData: toFormRowsFormData(f.bodyFormRowsFormData ?? f.bodyFormRows)
      }
      delete (debugForm.value as any).bodyFormRows
      selectedEnvId.value = saved.envId || environments.value[0]?.id || ''
    } else {
      const active = environments.value.find((e: any) => e.isActive)
      selectedEnvId.value = active?.id || environments.value[0]?.id || ''
      fillDebugFormFromApi()
      applyAutoAuthHeader()
    }
  } catch (error) {
    console.error('Failed to load environments:', error)
    message.error(error, '加载环境失败')
  }
}

watch(selectedEnvId, () => {
  if (debugDialogVisible.value) applyAutoAuthHeader()
})

// 关闭弹窗时保存表单
watch(debugDialogVisible, (visible) => {
  if (!visible && api.value) {
    savedDebugForms.value[api.value.id] = {
      form: {
        ...debugForm.value,
        bodyFormRowsUrlencoded: debugForm.value.bodyFormRowsUrlencoded.map((r) => ({ ...r })),
        bodyFormRowsFormData: debugForm.value.bodyFormRowsFormData.map((r) => ({ ...r }))
      },
      envId: selectedEnvId.value
    }
  }
})

const runDebug = async () => {
  if (!api.value) return
  if (!selectedEnvId.value) {
    message.warning('请选择环境')
    return
  }
  if (!debugForm.value.url.trim()) {
    message.warning('请填写 URL')
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

  let headers: any
  let query: any
  let body: any
  let bodyForm: any
  try {
    headers = parseJson('Headers', debugForm.value.headersJson, {})
    query = parseJson('Query', debugForm.value.queryJson, {})
    if (debugForm.value.bodyType === 'none') {
      body = undefined
      bodyForm = undefined
    } else if (debugForm.value.bodyType === 'json') {
      body = parseJson('Body', debugForm.value.bodyJson, undefined)
      bodyForm = undefined
    } else if (debugForm.value.bodyType === 'urlencoded') {
      body = undefined
      bodyForm = (debugForm.value.bodyFormRowsUrlencoded || []).map((r) => ({ key: String(r.key || '').trim(), value: String(r.value ?? '') })).filter((r) => r.key)
    } else {
      body = undefined
      bodyForm = (debugForm.value.bodyFormRowsFormData || [])
        .filter((r) => String(r.key || '').trim())
        .map((r) => ({ key: String(r.key || '').trim(), value: r.value, type: r.type || 'text', filename: r.filename }))
    }
  } catch {
    return
  }

  debugging.value = true
  try {
    lastDebugRequest.value = { method: api.value.method, url: debugForm.value.url, headers, query, bodyType: debugForm.value.bodyType, body, bodyForm }
    const res = await axios.post('/api/tests/debug', {
      environmentId: selectedEnvId.value,
      request: { method: api.value.method, url: debugForm.value.url, headers, query, bodyType: debugForm.value.bodyType, body, bodyForm }
    })
    debugResult.value = res.data
    message.success('请求完成')
  } catch (error) {
    console.error('Failed to debug request:', error)
    message.error(error, '请求失败')
  } finally {
    debugging.value = false
  }
}

const saveAsTestCase = async () => {
  if (!api.value || !debugResult.value) return
  if (!lastDebugRequest.value) {
    message.error('缺少请求信息，无法保存')
    return
  }

  savingAsTest.value = true
  try {
    const expectedStatus = debugResult.value.response?.status ?? 200
    await axios.post('/api/tests', {
      projectId: projectId.value,
      apiId: apiId.value,
      name: `${api.value.summary || api.value.path} 调试用例`,
      priority: 'P1',
      request: lastDebugRequest.value,
      assertions: [{ type: 'STATUS', condition: 'eq', expected: expectedStatus }]
    })
    message.success('已保存为测试用例')
    debugDialogVisible.value = false
  } catch (error) {
    console.error('Failed to save as test case:', error)
    message.error(error, '保存失败')
  } finally {
    savingAsTest.value = false
  }
}

const toFormRowsFormData = (arr: any[] | undefined): Array<{ key: string; type?: 'text' | 'file'; value: string; filename?: string }> => {
  if (Array.isArray(arr)) {
    return arr.map((r: any) => ({
      key: String(r?.key || ''),
      type: (r?.type === 'file' ? 'file' : 'text') as 'text' | 'file',
      value: String(r?.value ?? ''),
      filename: r?.filename ? String(r.filename) : undefined
    }))
  }
  return [{ key: '', type: 'text', value: '', filename: undefined }]
}

const riskLevelLabel = (riskLevel: string) => {
  if (riskLevel === 'HIGH') return '高'
  if (riskLevel === 'MEDIUM') return '中'
  if (riskLevel === 'LOW') return '低'
  return riskLevel || '-'
}

const riskTagType = (riskLevel: string) => {
  if (riskLevel === 'HIGH') return 'danger'
  if (riskLevel === 'MEDIUM') return 'warning'
  return 'success'
}
</script>

<style scoped>
.semantic-insights {
  min-width: 0;
}

.semantic-insights__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
}

.semantic-insights__title {
  flex-shrink: 0;
  white-space: nowrap;
  margin: 0;
}

.semantic-insights :deep(.el-descriptions__label) {
  white-space: nowrap;
}

.semantic-insights :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}

.request-parameters-panel,
.response-definition-panel {
  min-width: 0;
}

.request-parameters,
.response-definition {
  height: 400px;
  overflow: auto;
  margin: 0;
}

.request-parameters :deep(.el-empty) {
  height: 100%;
}

.dialog-footer {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

.debug-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.debug-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-left-width: 4px;
  border-radius: var(--radius-lg);
  background: var(--card-background);
}

.debug-metric__label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.debug-metric__value {
  font-family: var(--font-mono);
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text-primary);
}

.debug-metric__unit {
  margin-left: 3px;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.debug-metric__note {
  font-size: 12px;
  color: var(--text-secondary);
}

.debug-metric__content {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-regular);
  overflow-wrap: anywhere;
}

.debug-metric.is-success { border-left-color: var(--success-color); }
.debug-metric.is-success .debug-metric__value { color: var(--success-color); }
.debug-metric.is-info { border-left-color: var(--primary-color); }
.debug-metric.is-info .debug-metric__value { color: var(--primary-color); }
.debug-metric.is-warning { border-left-color: var(--warning-color); }
.debug-metric.is-warning .debug-metric__value { color: var(--warning-color); }
.debug-metric.is-error { border-left-color: var(--error-color); }
.debug-metric.is-error .debug-metric__value { color: var(--error-color); }
.debug-metric.is-muted { border-left-color: var(--border-color); }
.debug-metric--muted { border-left-color: var(--border-color); }

.description-text {
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
</style>
