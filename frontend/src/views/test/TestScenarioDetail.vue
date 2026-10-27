<template>
  <PageContainerLayout
    title="场景详情"
    description="查看场景链路、步骤提取规则、请求覆盖内容，并一键发起完整业务流程执行。"
    :breadcrumbs="breadcrumbs"
  >
    <template #toolbar>
      <el-button type="primary" @click="openExecuteDialog">执行场景</el-button>
      <el-button type="warning" @click="openStressTestDialog">压力测试</el-button>
      <el-button @click="editScenario">编辑</el-button>
    </template>
    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">{{ scenario.name || '场景详情' }}</div>
            <div class="app-panel-subtitle">{{ scenario.description || '暂无描述' }}</div>
          </div>
        </div>
      </template>

      <div class="space-y-6">
        <div class="app-data-card">
          <div class="mb-4 text-xl font-semibold text-content">基础信息</div>
          <el-descriptions :column="2">
            <el-descriptions-item label="场景名称">{{ scenario.name }}</el-descriptions-item>
            <el-descriptions-item label="描述">{{ scenario.description || '暂无描述' }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div v-if="scenario.variables && Object.keys(scenario.variables).length" class="app-data-card">
          <div class="mb-4 text-xl font-semibold text-content">场景变量</div>
          <el-table :data="Object.entries(scenario.variables).map(([key, value]) => ({ key, value }))" size="small" style="width: 100%">
            <el-table-column prop="key" label="变量名" />
            <el-table-column prop="value" label="值" />
          </el-table>
        </div>

        <div class="app-data-card">
          <div class="mb-4 text-xl font-semibold text-content">测试步骤</div>
          <el-timeline>
            <el-timeline-item v-for="(step, index) in pagedSteps" :key="`${step.testCaseId || 'step'}-${index}`"
              :timestamp="stepLabel(index)" type="primary" placement="top">
              <div class="app-data-card !rounded-2xl !bg-panel2 !p-4">
                <h4 class="mb-2 text-base font-semibold text-content">{{ step.name || stepLabel(index) }}</h4>
                <div v-if="step.testCaseId" class="mb-3 text-sm text-regular">
                  <span class="font-medium text-content">关联测试用例：</span>
                  <router-link
                    v-if="getTestCaseDetail(step.testCaseId)"
                    :to="`/projects/${projectId}/tests/${step.testCaseId}`"
                    class="text-[var(--el-color-primary)] hover:underline"
                  >
                    {{ getTestCaseName(step.testCaseId) }}
                  </router-link>
                  <span v-else>{{ getTestCaseName(step.testCaseId) }}</span>
                </div>

                <div v-if="getTestCaseDetail(step.testCaseId)?.request" class="mt-3 space-y-2">
                  <div class="text-sm font-medium text-content">请求配置</div>
                  <pre class="app-code text-xs">{{ JSON.stringify(getTestCaseDetail(step.testCaseId)?.request, null, 2) }}</pre>
                </div>

                <div v-if="getTestCaseDetail(step.testCaseId)?.assertions?.length" class="mt-3 space-y-2">
                  <div class="text-sm font-medium text-content">断言配置</div>
                  <el-table :data="getTestCaseDetail(step.testCaseId)?.assertions || []" size="small" style="width: 100%">
                    <el-table-column prop="type" label="类型" width="120" />
                    <el-table-column prop="target" label="目标" />
                    <el-table-column prop="condition" label="条件" width="100" />
                    <el-table-column prop="expected" label="预期值" />
                  </el-table>
                </div>

                <div
                  v-if="step.extractRules && typeof step.extractRules === 'object' && !Array.isArray(step.extractRules) && Object.keys(step.extractRules).length"
                  class="space-y-2">
                  <div class="text-sm font-medium text-content">变量提取规则</div>
                  <el-table :data="Object.entries(step.extractRules).map(([key, path]) => ({ key, path }))"
                    size="small" style="width: 100%">
                    <el-table-column prop="key" label="变量名" />
                    <el-table-column prop="path" label="JSON 路径" />
                  </el-table>
                </div>

                <div v-if="step.requestOverrides && hasRequestOverrides(step.requestOverrides)"
                  class="mt-4 space-y-2">
                  <div class="text-sm font-medium text-content">请求覆盖</div>
                  <el-descriptions :column="1" border size="small">
                    <el-descriptions-item
                      v-if="step.requestOverrides.headers && Object.keys(step.requestOverrides.headers).length"
                      label="请求头">
                      <pre class="app-code">{{ JSON.stringify(step.requestOverrides.headers, null, 2) }}</pre>
                    </el-descriptions-item>
                    <el-descriptions-item
                      v-if="step.requestOverrides.query && Object.keys(step.requestOverrides.query).length"
                      label="查询参数">
                      <pre class="app-code">{{ JSON.stringify(step.requestOverrides.query, null, 2) }}</pre>
                    </el-descriptions-item>
                    <el-descriptions-item
                      v-if="step.requestOverrides.body && Object.keys(step.requestOverrides.body).length"
                      label="请求体">
                      <pre class="app-code">{{ JSON.stringify(step.requestOverrides.body, null, 2) }}</pre>
                    </el-descriptions-item>
                  </el-descriptions>
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>

          <div v-if="scenario.steps.length > 0" class="app-pagination">
            <div class="app-pagination-copy">步骤页 {{ currentPage }}</div>
            <el-pagination background layout="total, sizes, prev, pager, next" :total="total"
              :current-page="currentPage" :page-size="pageSize" :page-sizes="[3, 5, 10, 20]"
              @current-change="handleCurrentChange" @size-change="handleSizeChange" />
          </div>

          <div v-if="lastExecutionResults.length > 0" class="mt-6 app-data-card">
            <div class="mb-4 flex items-center justify-between gap-4">
              <div class="text-xl font-semibold text-content">测试详情</div>
              <div v-if="lastExecutionSummary" class="flex gap-3 text-sm text-muted">
                <span>通过 {{ lastExecutionSummary.passed ?? 0 }}</span>
                <span>失败 {{ lastExecutionSummary.failed ?? 0 }}</span>
                <span>通过率 {{ lastExecutionSummary.passRate ?? 0 }}%</span>
              </div>
            </div>
            <div class="exec-details space-y-4">
              <div
                v-for="(test, index) in lastExecutionResults"
                :key="index"
                class="exec-test-case"
                :class="(test.status || '').toLowerCase()"
              >
                <div class="exec-test-header">
                  <h4 class="text-base font-semibold text-content">{{ test.stepName || test.name }}</h4>
                  <el-tag :type="test.status === 'PASSED' ? 'success' : test.status === 'FAILED' ? 'danger' : 'warning'" size="small">
                    {{ test.status }}
                  </el-tag>
                </div>
                <el-descriptions :column="2" size="small" class="mb-3">
                  <el-descriptions-item label="响应时间">{{ test.responseTime ?? '-' }} ms</el-descriptions-item>
                  <el-descriptions-item label="状态码">{{ test.response?.status ?? '-' }}</el-descriptions-item>
                </el-descriptions>
                <div v-if="test.error" class="exec-test-error">
                  <div class="text-sm font-medium text-content mb-1">错误信息</div>
                  <pre class="app-code">{{ errorText(test.error) }}</pre>
                </div>
                <div v-if="test.request" class="exec-test-block">
                  <div class="text-sm font-medium text-content mb-1">请求配置（实际参数）</div>
                  <pre class="app-code">{{ JSON.stringify(test.request, null, 2) }}</pre>
                  <p v-if="test.resolvedUrl" class="request-note">
                    实际请求地址：<code>{{ test.resolvedUrl }}</code>
                  </p>
                </div>
                <div v-if="test.assertions && test.assertions.length" class="exec-test-block">
                  <div class="text-sm font-medium text-content mb-1">断言结果</div>
                  <el-table :data="test.assertions" size="small" style="width: 100%">
                    <el-table-column prop="type" label="类型" width="140" />
                    <el-table-column prop="target" label="目标" />
                    <el-table-column prop="condition" label="条件" width="120" />
                    <el-table-column prop="expected" label="预期" show-overflow-tooltip>
                      <template #default="scope">{{ formatAssertionValue(scope.row.expected) }}</template>
                    </el-table-column>
                    <el-table-column prop="actual" label="实际" show-overflow-tooltip>
                      <template #default="scope">{{ formatAssertionValue(scope.row.actual) }}</template>
                    </el-table-column>
                    <el-table-column prop="passed" label="结果" width="90">
                      <template #default="scope">
                        <el-tag :type="scope.row.passed ? 'success' : 'danger'" size="small">{{ scope.row.passed ? '通过' : '失败' }}</el-tag>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
                <div v-if="test.responseBody !== undefined || (test.response && test.response.data !== undefined)" class="exec-test-block">
                  <div class="text-sm font-medium text-content mb-1">响应数据</div>
                  <pre class="app-code">{{ JSON.stringify(test.responseBody ?? test.response?.data ?? test.response ?? {}, null, 2) }}</pre>
                </div>
                <div v-if="test.extractedVariables && Object.keys(test.extractedVariables).length" class="exec-test-block">
                  <div class="text-sm font-medium text-content mb-1">提取变量</div>
                  <pre class="app-code">{{ JSON.stringify(test.extractedVariables, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-dialog title="执行场景" v-model="executeDialogVisible" width="560px" append-to-body>
      <el-form label-width="110px">
        <el-form-item label="选择环境" required>
          <el-select v-model="selectedEnvId" placeholder="请选择环境" style="width: 100%">
            <el-option v-for="env in environments" :key="env.id" :label="`${env.name}${env.isActive ? ' (激活)' : ''}`"
              :value="env.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="生成报告">
          <el-switch v-model="generateReport" />
          <span class="ml-2 text-sm text-muted">执行后生成测试报告</span>
        </el-form-item>
        <el-form-item v-if="generateReport" label="报告名称">
          <el-input v-model="reportName" placeholder="可选，默认自动生成" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="executeDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="executing" @click="executeScenario">执行</el-button>
        </span>
      </template>
    </el-dialog>

    <ScenarioStressDialog v-model="stressDialogVisible" :project-id="projectId" :scenario="scenario" />
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { usePagination } from '../../composables/usePagination'
import { message, errorText } from '../../utils/message'
import { formatAssertionValue } from '../../utils/json'
import ScenarioStressDialog from '../../components/test/ScenarioStressDialog.vue'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
let scenarioId = route.params.scenarioId as string
const breadcrumbs = computed(() => [
  { label: '测试场景', to: `/projects/${projectId}/scenarios` },
  { label: scenario.value?.name || '场景详情' },
])

interface TestScenario {
  id: string;
  name: string;
  description?: string;
  steps: any[];
  variables?: any;
}

interface TestCase {
  id: string;
  name: string;
  request?: any;
  assertions?: any[];
}

const scenario = ref<TestScenario>({
  id: '',
  name: '',
  description: '',
  steps: [],
  variables: {}
})

const testCases = ref<TestCase[]>([])
const loading = ref(false)
const executeDialogVisible = ref(false)
const environments = ref<any[]>([])
const selectedEnvId = ref<string>('')
const reportName = ref<string>('')
const generateReport = ref(true)
const executing = ref(false)

const stressDialogVisible = ref(false)
const lastExecutionResults = ref<any[]>([])
const lastExecutionSummary = ref<any>(null)
watch(() => route.query.stress, value => { if (value) stressDialogVisible.value = true }, { immediate: true })

const steps = computed(() => Array.isArray(scenario.value.steps) ? scenario.value.steps : [])
const { currentPage, pageSize, total, pagedItems: pagedSteps, handleCurrentChange, handleSizeChange, resetPage } = usePagination(steps, 5)
watch(steps, () => resetPage())

onMounted(async () => {
  await fetchScenario()
  await fetchTestCases()
})
watch(() => route.params.scenarioId, async id => {
  if (!id || id === scenarioId) return
  scenarioId = String(id)
  stressDialogVisible.value = Boolean(route.query.stress)
  await fetchScenario()
  await fetchTestCases()
})

const stepLabel = (index: number) => `步骤 ${(currentPage.value - 1) * pageSize.value + index + 1}`

const fetchScenario = async () => {
  loading.value = true
  try {
    const response = await axios.get(`/api/tests/scenarios/${scenarioId}`)
    scenario.value = response.data
  } catch (error) {
    console.error('Failed to fetch scenario:', error)
    message.error(error, '加载场景失败')
  } finally {
    loading.value = false
  }
}

const fetchTestCases = async () => {
  try {
    const response = await axios.get(`/api/tests?projectId=${projectId}`)
    const list = Array.isArray(response.data) ? response.data : []
    testCases.value = list
    const ids = (scenario.value?.steps || [])
      .map((s: any) => s.testCaseId)
      .filter(Boolean)
    const uniqueIds = [...new Set(ids)]
    const details = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const res = await axios.get(`/api/tests/${id}`)
          return res.data
        } catch {
          return null
        }
      })
    )
    const detailMap = Object.fromEntries(
      details.filter(Boolean).map((d: any) => [d.id, d])
    )
    testCases.value = list.map((tc: TestCase) => ({
      ...tc,
      ...detailMap[tc.id]
    }))
  } catch (error) {
    console.error('Failed to fetch test cases:', error)
    testCases.value = []
  }
}

const getTestCaseName = (testCaseId: string): string => {
  const testCase = testCases.value.find(tc => tc.id === testCaseId)
  return testCase?.name || testCaseId
}

const getTestCaseDetail = (testCaseId: string): TestCase | undefined =>
  testCases.value.find(tc => tc.id === testCaseId)

const hasRequestOverrides = (requestOverrides: any) => {
  return Boolean(
    (requestOverrides?.headers && Object.keys(requestOverrides.headers).length) ||
    (requestOverrides?.query && Object.keys(requestOverrides.query).length) ||
    (requestOverrides?.body && Object.keys(requestOverrides.body).length)
  )
}

const openExecuteDialog = async () => {
  executeDialogVisible.value = true
  reportName.value = `${scenario.value.name} - 执行报告`
  try {
    const res = await axios.get(`/api/environments?projectId=${projectId}`)
    environments.value = Array.isArray(res.data) ? res.data : []
    const active = environments.value.find((e: any) => e.isActive)
    selectedEnvId.value = active?.id || environments.value[0]?.id || ''
    if (!selectedEnvId.value) {
      message.warning('请先创建环境配置')
    }
  } catch (error) {
    console.error('Failed to load environments:', error)
    environments.value = []
    selectedEnvId.value = ''
    message.error(error, '加载环境失败')
  }
}

const openStressTestDialog = () => { stressDialogVisible.value = true }

const executeScenario = async () => {
  if (!selectedEnvId.value) {
    message.warning('请选择环境')
    return
  }
  if (executing.value) return
  executing.value = true
  try {
    const response = await axios.post('/api/tests/scenarios/execute', {
      scenarioId,
      environmentId: selectedEnvId.value,
      projectId,
      reportName: generateReport.value ? String(reportName.value || '') : undefined,
      generateReport: generateReport.value
    })
    executeDialogVisible.value = false
    message.success('场景执行完成')
    if (generateReport.value && response.data.reportId) {
      router.push(`/projects/${projectId}/tests/reports/${response.data.reportId}`)
    } else if (!generateReport.value && Array.isArray(response.data?.results)) {
      lastExecutionResults.value = response.data.results
      lastExecutionSummary.value = response.data.summary || null
    }
  } catch (error) {
    console.error('Failed to execute scenario:', error)
    message.error(error, '执行失败', '执行失败')
  } finally {
    executing.value = false
  }
}

const editScenario = () => {
  router.push({
    path: `/projects/${projectId}/scenarios`,
    query: { edit: scenarioId }
  })
}
</script>

<style scoped>
.exec-details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.exec-test-case {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.exec-test-case.passed {
  border-left: 4px solid var(--success-color);
  background-color: rgba(var(--success-rgb), 0.04);
}

.exec-test-case.failed {
  border-left: 4px solid var(--error-color);
  background-color: rgba(var(--error-rgb), 0.06);
}

.exec-test-case.error {
  border-left: 4px solid var(--warning-color);
  background-color: rgba(var(--warning-rgb), 0.06);
}

.exec-test-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.exec-test-error {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm);
  background-color: rgba(var(--error-rgb), 0.08);
  border-radius: var(--radius-lg);
}

.exec-test-block {
  margin-top: var(--spacing-sm);
}
</style>
