<template>
  <PageContainerLayout
    title="测试用例详情"
    description="查看请求、断言与最近执行结果，支持 AI 自动生成断言和失败根因分析。"
    :breadcrumbs="breadcrumbs"
  >
    <template #toolbar>
      <el-button type="primary" :loading="executing" @click="executeTest">执行测试</el-button>
      <el-button :loading="generatingAssertions" :disabled="!canGenerateAssertions" @click="runGenerateAssertions">AI 生成断言</el-button>
      <el-button :loading="analyzingFailure" :disabled="!canAnalyzeFailure" @click="runAnalyzeFailure">AI 分析失败</el-button>
    </template>
    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">{{ testCase?.name || '测试用例详情' }}</div>
            <div class="app-panel-subtitle">{{ testCase?.description || '查看请求配置与断言策略' }}</div>
          </div>
        </div>
      </template>

      <template v-if="testCase">
        <div class="flex flex-col gap-6">
          <div class="space-y-6">
            <div class="app-data-card">
              <div class="mb-4 text-xl font-semibold text-slate-100">
                {{ lastResult?.request ? '请求配置' : '请求配置' }}
              </div>
              <pre class="app-code">{{ JSON.stringify(lastResult?.request ?? testCase.request, null, 2) }}</pre>
            </div>

            <div class="app-data-card">
              <div class="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div class="text-xl font-semibold text-slate-100">断言配置</div>
                </div>
                <div class="flex gap-2">
                  <el-button size="small" @click="addAssertionDialogVisible = true">添加</el-button>
                  <el-button size="small" type="primary" :loading="savingAssertions" :disabled="selectedSuggestions.length === 0" @click="applySuggestedAssertions">应用选中 ({{ selectedSuggestions.length }})</el-button>
                </div>
              </div>
              <el-table :data="pagedAssertions" size="small" style="width: 100%">
                <el-table-column prop="type" label="类型" />
                <el-table-column prop="target" label="目标" />
                <el-table-column prop="condition" label="条件" />
                <el-table-column prop="expected" label="预期值" />
                <el-table-column label="操作" width="80" align="center">
                  <template #default="scope">
                    <el-button type="danger" link size="small" @click="removeAssertion(scope.$index)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div v-if="(testCase.assertions || []).length > 0" class="app-pagination">
                <div class="app-pagination-copy">断言 {{ assertionTotal }}</div>
                <el-pagination background layout="total, prev, pager, next" :total="assertionTotal" :current-page="assertionPage" :page-size="assertionSize" @current-change="handleAssertionPage" />
              </div>
            </div>

            <div v-if="suggestedAssertions.length" class="app-data-card">
              <el-alert type="success" :closable="false" :title="`AI 已基于最近一次真实响应生成 ${suggestedAssertions.length} 条断言建议，可勾选后应用。`" />
              <el-table
                ref="suggestionTableRef"
                class="mt-4"
                :data="pagedSuggestedAssertions"
                size="small"
                style="width: 100%"
                row-key="_sid"
                @selection-change="onSuggestionSelectionChange"
              >
                <el-table-column type="selection" width="55" reserve-selection />
                <el-table-column prop="type" label="类型" width="150" />
                <el-table-column prop="target" label="目标" />
                <el-table-column prop="condition" label="条件" width="110" />
                <el-table-column prop="expected" label="预期" />
                <el-table-column prop="confidence" label="置信度" width="110">
                  <template #default="scope">{{ typeof scope.row.confidence === 'number' ? `${Math.round(scope.row.confidence * 100)}%` : '-' }}</template>
                </el-table-column>
              </el-table>
              <div class="flex items-center justify-between mt-3">
                <div class="app-pagination-copy">已选 {{ selectedSuggestions.length }} / {{ suggestionTotal }}</div>
                <div class="flex gap-2">
                  <el-button size="small" @click="toggleAllSuggestions(true)">全选</el-button>
                  <el-button size="small" @click="toggleAllSuggestions(false)">取消</el-button>
                </div>
              </div>
              <div class="app-pagination">
                <div class="app-pagination-copy">AI 建议 {{ suggestionTotal }}</div>
                <el-pagination background layout="total, prev, pager, next" :total="suggestionTotal" :current-page="suggestionPage" :page-size="suggestionSize" @current-change="handleSuggestionPage" />
              </div>
            </div>

            <el-dialog v-model="addAssertionDialogVisible" title="添加断言" width="480px" destroy-on-close @close="resetAddAssertionForm">
              <el-form :model="addAssertionForm" label-width="80px" label-position="top">
                <el-form-item label="类型">
                  <el-select v-model="addAssertionForm.type" placeholder="选择类型" style="width: 100%">
                    <el-option label="STATUS (状态码)" value="STATUS" />
                    <el-option label="JSON_PATH (JSON 路径)" value="JSON_PATH" />
                    <el-option label="RESPONSE_TIME (响应时间)" value="RESPONSE_TIME" />
                    <el-option label="HEADER" value="HEADER" />
                    <el-option label="BODY" value="BODY" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="addAssertionForm.type !== 'STATUS'" label="目标 (如 $.code 或 $.data.id)">
                  <el-input v-model="addAssertionForm.target" placeholder="JSON_PATH 填 $.xxx，STATUS 可留空" />
                </el-form-item>
                <el-form-item label="条件">
                  <el-select v-model="addAssertionForm.condition" placeholder="选择条件" style="width: 100%">
                    <el-option label="eq (等于)" value="eq" />
                    <el-option label="neq (不等于)" value="neq" />
                    <el-option label="exists (存在)" value="exists" />
                    <el-option label="contains (包含)" value="contains" />
                    <el-option label="gt (大于)" value="gt" />
                    <el-option label="lt (小于)" value="lt" />
                    <el-option label="matches (正则)" value="matches" />
                  </el-select>
                </el-form-item>
                <el-form-item label="预期值">
                  <el-input v-model="addAssertionForm.expectedStr" placeholder="如 200、0、操作成功，exists 可填 true" />
                </el-form-item>
              </el-form>
              <template #footer>
                <el-button @click="addAssertionDialogVisible = false">取消</el-button>
                <el-button type="primary" :loading="savingAssertions" @click="submitAddAssertion">确定</el-button>
              </template>
            </el-dialog>
          </div>

          <div v-if="lastResult" class="space-y-6">
            <div class="app-data-card">
              <div class="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div class="text-xl font-semibold text-slate-100">最近一次执行结果</div>
                </div>
                <el-tag :type="lastResult.status === 'PASSED' ? 'success' : 'danger'">{{ lastResult.status }}</el-tag>
              </div>

              <el-descriptions :column="2">
                <el-descriptions-item label="响应时间">{{ lastResult.responseTime }} ms</el-descriptions-item>
                <el-descriptions-item label="状态码">{{ lastResult.response?.status }}</el-descriptions-item>
              </el-descriptions>

              <div v-if="lastResult.request" class="mt-4">
                <div class="mb-3 text-sm font-medium text-slate-100">请求参数</div>
                <pre class="app-code">{{ JSON.stringify(lastResult.request, null, 2) }}</pre>
              </div>

              <div class="mt-4">
                <div class="mb-3 text-sm font-medium text-slate-100">断言结果</div>
                <el-table :data="lastResult.assertions || []" size="small">
                  <el-table-column prop="type" label="类型" width="140" />
                  <el-table-column prop="target" label="目标" />
                  <el-table-column prop="condition" label="条件" width="120" />
                  <el-table-column prop="expected" label="预期" />
                  <el-table-column prop="actual" label="实际" />
                  <el-table-column prop="passed" label="结果" width="90">
                    <template #default="scope"><el-tag :type="scope.row.passed ? 'success' : 'danger'">{{ scope.row.passed ? '通过' : '失败' }}</el-tag></template>
                  </el-table-column>
                </el-table>
              </div>

              <div v-if="failureAnalysis" class="mt-5 space-y-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                <div class="flex items-center justify-between gap-4">
                  <div class="text-base font-semibold text-slate-100">AI 失败分析</div>
                  <el-tag type="warning">置信度 {{ Math.round((failureAnalysis.analysis?.confidence || 0) * 100) }}%</el-tag>
                </div>
                <p class="text-sm text-slate-300"><strong>根因：</strong>{{ failureAnalysis.analysis?.rootCause }}</p>
                <p class="text-sm text-slate-300"><strong>说明：</strong>{{ failureAnalysis.analysis?.details }}</p>
                <div>
                  <div class="mb-2 text-sm font-medium text-slate-100">建议动作</div>
                  <ul class="list-disc space-y-2 pl-5 text-sm text-slate-300">
                    <li v-for="(item, index) in failureAnalysis.suggestions || []" :key="index">
                      {{ item.description }}
                      <pre v-if="item.example" class="app-code mt-2">{{ JSON.stringify(item.example, null, 2) }}</pre>
                    </li>
                  </ul>
                </div>
              </div>

              <div class="mt-4">
                <div class="mb-3 text-sm font-medium text-slate-100">响应数据</div>
                <pre class="app-code">{{ JSON.stringify(lastResult.responseBody ?? lastResult.response?.data ?? lastResult.response, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </template>
      <el-empty v-else class="app-empty" description="加载中..." />
    </el-card>

  </PageContainerLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useAIStore } from '../../store/ai'
import { usePagination } from '../../composables/usePagination'
import { message, confirmAction } from '../../utils/message'

const route = useRoute()
const aiStore = useAIStore()
const testId = route.params.testId as string
const projectId = computed(() => route.params.id as string)
const breadcrumbs = computed(() => [
  { label: '测试用例', to: `/projects/${projectId.value}/tests` },
  { label: testCase.value?.name || '用例详情' },
])

interface TestCase {
  id: string
  name: string
  priority: string
  apiId?: string
  description?: string
  request: any
  assertions: any[]
}

const testCase = ref<TestCase | null>(null)
const apiDetail = ref<any | null>(null)
const executing = ref(false)
const lastResult = ref<any | null>(null)
const generatingAssertions = ref(false)
const analyzingFailure = ref(false)
const savingAssertions = ref(false)
const suggestedAssertions = ref<any[]>([])
const selectedSuggestions = ref<any[]>([])
const suggestionTableRef = ref<any>(null)
const failureAnalysis = ref<any | null>(null)
const addAssertionDialogVisible = ref(false)
const addAssertionForm = ref({
  type: 'STATUS' as string,
  target: '',
  condition: 'eq' as string,
  expectedStr: '200'
})

const canGenerateAssertions = computed(() => Boolean(lastResult.value) && aiStore.enabled && aiStore.features.assertionGeneration)
const canAnalyzeFailure = computed(() => Boolean(lastResult.value && lastResult.value.status !== 'PASSED') && aiStore.enabled && aiStore.features.errorAnalysis)
const assertions = computed(() => testCase.value?.assertions || [])
const { currentPage: assertionPage, pageSize: assertionSize, total: assertionTotal, pagedItems: pagedAssertions, handleCurrentChange: handleAssertionPage } = usePagination(assertions, 6)
const { currentPage: suggestionPage, pageSize: suggestionSize, total: suggestionTotal, pagedItems: pagedSuggestedAssertions, handleCurrentChange: handleSuggestionPage } = usePagination(suggestedAssertions, 6)
watch(assertions, () => { assertionPage.value = 1 })
watch(suggestedAssertions, () => { suggestionPage.value = 1 })

onMounted(async () => {
  await aiStore.getProjectConfig(projectId.value)
  await fetchTestCase()
})

const fetchTestCase = async () => {
  try {
    const response = await axios.get(`/api/tests/${testId}`)
    testCase.value = response.data
    if (response.data?.lastRun) {
      lastResult.value = response.data.lastRun
    } else {
      lastResult.value = null
    }
    if (testCase.value?.apiId) {
      const apiResponse = await axios.get(`/api/apis/${testCase.value.apiId}`)
      apiDetail.value = apiResponse.data
    }
  } catch (error) {
    console.error('Failed to fetch test case details:', error)
    message.error(error, '加载测试用例失败')
  }
}

const executeTest = async () => {
  executing.value = true
  lastResult.value = null
  failureAnalysis.value = null
  suggestedAssertions.value = []
  try {
    const activeRes = await axios.get(`/api/environments/active?projectId=${projectId.value}`)
    let envId = activeRes.data?.id as string | undefined
    if (!envId) {
      const listRes = await axios.get(`/api/environments?projectId=${projectId.value}`)
      const envs = Array.isArray(listRes.data) ? listRes.data : []
      const picked = envs.find((e: any) => e.isActive) || envs[0]
      envId = picked?.id
      if (picked && !picked.isActive && picked.name) {
        message.warning(`未找到激活环境，已使用：${picked.name}`)
      }
    }
    if (!envId) {
      message.warning('请先创建环境配置')
      return
    }
    const res = await axios.post('/api/tests/execute', { testCaseId: testId, environmentId: envId })
    lastResult.value = res.data
    message.success('执行完成')
  } catch (error) {
    console.error('Failed to execute test:', error)
    message.error(error, '执行失败')
  } finally {
    executing.value = false
  }
}

const runGenerateAssertions = async () => {
  if (!lastResult.value) {
    message.warning('请先执行一次测试')
    return
  }
  if (!aiStore.enabled || !aiStore.features.assertionGeneration) {
    message.warning('请先在 AI 配置中开启“自动生成断言”')
    return
  }

  generatingAssertions.value = true
  try {
    const response = await aiStore.generateAssertions(projectId.value, lastResult.value)
    const list = Array.isArray(response.suggestions) ? response.suggestions : []
    suggestedAssertions.value = list.map((item: any, i: number) => ({ ...item, _sid: `s${Date.now()}-${i}` }))
    selectedSuggestions.value = []
    nextTick(() => suggestionTableRef.value?.clearSelection?.())
    message.success(`已生成 ${suggestedAssertions.value.length} 条断言建议`)
  } catch (error) {
    console.error('Failed to generate assertions:', error)
    message.error(error, 'AI 生成断言失败')
  } finally {
    generatingAssertions.value = false
  }
}

const onSuggestionSelectionChange = (rows: any[]) => {
  selectedSuggestions.value = rows
}

const toggleAllSuggestions = (checked: boolean) => {
  const table = suggestionTableRef.value
  if (!table) return
  if (checked) {
    suggestedAssertions.value.forEach((row) => table.toggleRowSelection(row, true))
  } else {
    table.clearSelection()
  }
}

const resetAddAssertionForm = () => {
  addAssertionForm.value = { type: 'STATUS', target: '', condition: 'eq', expectedStr: '200' }
}

const parseExpected = (s: string): any => {
  const v = String(s ?? '').trim()
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+$/.test(v)) return parseInt(v, 10)
  if (/^-?\d*\.?\d+$/.test(v)) return parseFloat(v)
  return v
}

const submitAddAssertion = async () => {
  if (!testCase.value) return
  const { type, target, condition, expectedStr } = addAssertionForm.value
  if (!type || !condition) {
    message.warning('请填写类型和条件')
    return
  }
  const expected = parseExpected(expectedStr)
  const list = Array.isArray(testCase.value.assertions) ? [...testCase.value.assertions] : []
  list.push({ type, target: target || undefined, condition, expected })
  savingAssertions.value = true
  try {
    await axios.put(`/api/tests/${testCase.value.id}`, { assertions: list })
    testCase.value.assertions = list
    addAssertionDialogVisible.value = false
    resetAddAssertionForm()
    message.success('已添加断言')
  } catch (error) {
    console.error('Failed to add assertion:', error)
    message.error(error, '添加断言失败')
  } finally {
    savingAssertions.value = false
  }
}

const removeAssertion = async (pageIndex: number) => {
  if (!testCase.value) return
  try {
    await confirmAction('确定删除该断言吗？', '删除确认', { confirmButtonText: '删除' })
  } catch {
    return
  }
  const list = Array.isArray(testCase.value.assertions) ? [...testCase.value.assertions] : []
  const fullIndex = (assertionPage.value - 1) * assertionSize.value + pageIndex
  if (fullIndex < 0 || fullIndex >= list.length) return
  list.splice(fullIndex, 1)
  savingAssertions.value = true
  try {
    await axios.put(`/api/tests/${testCase.value.id}`, { assertions: list })
    testCase.value.assertions = list
    message.success('已删除断言')
  } catch (error) {
    console.error('Failed to remove assertion:', error)
    message.error(error, '删除断言失败')
  } finally {
    savingAssertions.value = false
  }
}

const applySuggestedAssertions = async () => {
  const toApply = selectedSuggestions.value.length > 0 ? selectedSuggestions.value : suggestedAssertions.value
  if (!testCase.value || toApply.length === 0) {
    message.warning('请先勾选要应用的断言')
    return
  }
  savingAssertions.value = true
  try {
    const mergedAssertions = dedupeAssertions([
      ...(Array.isArray(testCase.value.assertions) ? testCase.value.assertions : []),
      ...toApply.map((item) => ({ type: item.type, target: item.target, condition: item.condition, expected: item.expected, message: item.message }))
    ])

    await axios.put(`/api/tests/${testCase.value.id}`, { assertions: mergedAssertions })
    testCase.value.assertions = mergedAssertions
    suggestedAssertions.value = []
    selectedSuggestions.value = []
    message.success('已应用 AI 断言')
  } catch (error) {
    console.error('Failed to apply suggested assertions:', error)
    message.error(error, '保存断言失败')
  } finally {
    savingAssertions.value = false
  }
}

const runAnalyzeFailure = async () => {
  if (!lastResult.value || lastResult.value.status === 'PASSED') {
    message.warning('当前没有失败结果可分析')
    return
  }
  if (!aiStore.enabled || !aiStore.features.errorAnalysis) {
    message.warning('请先在 AI 配置中开启“测试失败分析”')
    return
  }

  analyzingFailure.value = true
  try {
    const response = await aiStore.analyzeError(projectId.value, { ...lastResult.value, request: testCase.value?.request, api: apiDetail.value })
    failureAnalysis.value = response
    message.success('AI 失败分析完成')
  } catch (error) {
    console.error('Failed to analyze failure:', error)
    message.error(error, 'AI 失败分析失败')
  } finally {
    analyzingFailure.value = false
  }
}

const dedupeAssertions = (items: any[]) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = JSON.stringify({ type: item?.type, target: item?.target, condition: item?.condition, expected: item?.expected })
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
</script>
