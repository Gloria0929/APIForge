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
                <span class="description-text">{{ api.description?.split(':')[0]?.trim() || '暂无描述' }}</span>
              </el-descriptions-item>
            </el-descriptions>
            <div v-if="api.tags?.length" class="mt-4 flex flex-wrap gap-2">
              <el-tag v-for="tag in api.tags" :key="`${api.id}-${tag}`" effect="plain">{{ tag }}</el-tag>
            </div>
          </div>
          <el-alert v-if="!canUseSemanticAI || !canUseTestGeneration" type="info" :closable="false"
            title="当前项目未开启完整 AI 接口增强能力，可前往「模型配置」开启接口语义分析与测试生成。" />
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="app-data-card">
              <div class="mb-4 text-xl font-semibold text-slate-100">请求参数</div>
              <el-table v-if="allParameters.length > 0" :data="allParameters" size="small" style="width: 100%">
                <el-table-column prop="name" label="参数名" min-width="140" />
                <el-table-column prop="in" label="位置" width="90" />
                <el-table-column label="是否必填" width="100">
                  <template #default="scope">
                    <el-tag v-if="scope.row.required" type="danger" size="small">必填</el-tag>
                    <span v-else class="text-slate-500">可选</span>
                  </template>
                </el-table-column>
                <el-table-column prop="type" label="类型" width="100" />
                <el-table-column prop="description" label="描述" min-width="100" show-overflow-tooltip />
              </el-table>
              <template v-else-if="hasRawRequestBody">
                <div class="mb-2 text-sm text-slate-400">请求体结构（含未解析的 $ref 引用）</div>
                <pre class="app-code">{{ JSON.stringify(api.requestBody, null, 2) }}</pre>
              </template>
              <el-empty v-else description="无请求参数" />
            </div>

            <div class="app-data-card">
              <div class="mb-4 text-xl font-semibold text-slate-100">响应定义</div>
              <pre v-if="responseDefinitionJson" class="app-code">{{ responseDefinitionJson }}</pre>
              <el-empty v-else description="无响应定义" />
            </div>
          </div>
          <div v-if="semanticInsights" class="app-data-card space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-xl font-semibold text-slate-100">AI 接口语义分析</div>
              </div>
              <el-tag :type="riskTagType(semanticInsights.riskLevel)">风险：{{ riskLevelLabel(semanticInsights.riskLevel) }}</el-tag>
            </div>
            <p class="text-sm leading-7 text-slate-300">{{ semanticInsights.summary }}</p>
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
              <div class="mb-3 text-sm font-medium text-slate-100">字段语义</div>
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
                <div class="text-xl font-semibold text-slate-100">AI 测试建议</div>
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
        <el-form-item label="Headers (JSON)">
          <div class="w-full">
            <div class="mb-2 flex justify-end">
              <el-button size="small" @click="insertToken">插入 Token</el-button>
            </div>
            <el-input v-model="debugForm.headersJson" type="textarea" :rows="4" />
          </div>
        </el-form-item>
        <el-form-item label="Query (JSON)"><el-input v-model="debugForm.queryJson" type="textarea" :rows="3" /></el-form-item>
        <BodyTypeEditor
          v-model:body-type="debugForm.bodyType"
          v-model:body-json="debugForm.bodyJson"
          v-model:body-form-rows-urlencoded="debugForm.bodyFormRowsUrlencoded"
          v-model:body-form-rows-form-data="debugForm.bodyFormRowsFormData"
        />
      </el-form>

      <div v-if="debugResult" class="mt-4 space-y-4">
        <el-descriptions :column="3">
          <el-descriptions-item label="状态码">{{ debugResult.response?.status }} {{ debugResult.response?.statusText }}</el-descriptions-item>
          <el-descriptions-item label="响应时间">{{ debugResult.responseTime }} ms</el-descriptions-item>
          <el-descriptions-item label="Content-Type">{{ debugResult.response?.headers?.['content-type'] || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div>
          <div class="mb-2 text-sm font-medium text-slate-300">响应内容</div>
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
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useAIStore } from '../../store/ai'
import BodyTypeEditor from '../../components/request/BodyTypeEditor.vue'
import { usePagination } from '../../composables/usePagination'
import { message } from '../../utils/message'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'

const route = useRoute()
const apiStore = useAIStore()
const apiId = route.params.apiId as string
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

const resolveParamType = (prop: any): string => {
  if (!prop) return '-'
  const schema = prop?.schema || prop
  const format = String(schema?.format || '').toLowerCase()
  if (format === 'binary' || format === 'byte') return 'file'
  const type = schema?.type || prop?.type
  if (type) return type
  if (schema?.allOf || prop?.allOf) return 'object'
  if (schema?.anyOf || prop?.anyOf) return 'union'
  return '-'
}

const extractSchemaProps = (schema: any): any[] => {
  if (!schema || typeof schema !== 'object') return []
  if (schema.$ref) return []
  const props = schema.properties || {}
  if (Object.keys(props).length === 0) return []
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  return Object.entries(props).map(([name, prop]: [string, any]) => ({
    name,
    in: 'body',
    required: required.has(name),
    type: resolveParamType(prop),
    description: prop?.title || prop?.description || '-',
  }))
}

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

const requestBodyFields = computed(() => {
  const rb = api.value?.requestBody
  if (!rb) return []
  const content = rb.content
  if (content && typeof content === 'object') {
    for (const mime of Object.values(content) as any[]) {
      if (mime?.schema) {
        const fields = extractSchemaProps(mime.schema)
        if (fields.length > 0) return fields
      }
    }
  }
  if (rb.schema) return extractSchemaProps(rb.schema)
  if (rb.properties) return extractSchemaProps(rb)
  return []
})

const hasRawRequestBody = computed(() => {
  return api.value?.requestBody && requestBodyFields.value.length === 0
})

const allParameters = computed(() => {
  const params = (api.value?.parameters || []).map((p: any) => ({
    ...p,
    type: resolveParamType(p),
    required: p.required === true || (p.in === 'path' && p.required !== false),
  }))
  return [...params, ...requestBodyFields.value]
})

const fieldMeaningRows = computed(() => Object.entries(semanticInsights.value?.fieldMeanings || {}).map(([name, meaning]) => ({ name, meaning })))
const { currentPage: fieldMeaningPage, pageSize: fieldMeaningSize, total: fieldMeaningTotal, pagedItems: pagedFieldMeanings, handleCurrentChange: handleFieldMeaningPage } = usePagination(fieldMeaningRows, 6)
const { currentPage: suggestionPage, pageSize: suggestionSize, total: suggestionTotal, pagedItems: pagedSuggestions, handleCurrentChange: handleSuggestionPage } = usePagination(testSuggestions, 5)

watch(fieldMeaningRows, () => { fieldMeaningPage.value = 1 })
watch(testSuggestions, () => { suggestionPage.value = 1 })

onMounted(async () => {
  await apiStore.getProjectConfig(projectId.value)
  await fetchApi()
})

const fetchApi = async () => {
  try {
    const response = await axios.get(`/api/apis/${apiId}`)
    api.value = response.data
    if (response.data?.aiInsights) {
      semanticInsights.value = response.data.aiInsights
    }
  } catch (error) {
    console.error('Failed to fetch API details:', error)
    message.error(error, '加载 API 详情失败')
  }
}

const runSemanticAnalysis = async () => {
  if (!canUseSemanticAI.value) {
    message.warning('请先启用接口语义分析功能')
    return
  }
  analyzingSemantic.value = true
  try {
    const response = await apiStore.semanticParseApi(projectId.value, apiId, true)
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
    const response = await apiStore.generateTests(projectId.value, apiId)
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
        apiId,
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
      const path = api.value.path?.startsWith('/') ? api.value.path : `/${api.value.path || ''}`
      debugForm.value.url = `{{base_url}}${path}`
      debugForm.value.bodyType = 'none'
      debugForm.value.bodyJson = '{}'
      debugForm.value.bodyFormRowsUrlencoded = [{ key: '', value: '' }]
      debugForm.value.bodyFormRowsFormData = [{ key: '', type: 'text', value: '', filename: undefined }]
      const active = environments.value.find((e: any) => e.isActive)
      selectedEnvId.value = active?.id || environments.value[0]?.id || ''
    }
  } catch (error) {
    console.error('Failed to load environments:', error)
    message.error(error, '加载环境失败')
  }
}

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
      apiId,
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

const insertToken = () => {
  try {
    const headers = JSON.parse(debugForm.value.headersJson || '{}')
    headers['Authorization'] = 'Bearer {{token}}'
    debugForm.value.headersJson = JSON.stringify(headers, null, 2)
    message.success('已插入 Authorization 头，请替换 {{token}} 为实际值')
  } catch {
    debugForm.value.headersJson = JSON.stringify({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer {{token}}'
    }, null, 2)
    message.success('已重置并插入 Authorization 头')
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
.dialog-footer {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

.description-text {
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
</style>
