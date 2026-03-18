<template>
  <PageContainerLayout
    title="测试报告详情"
    description="把回归结果、性能分布、失败断言与请求响应日志放在一个可读的深色分析面板里，方便快速定位问题。"
    container-class="test-report-detail"
    :breadcrumbs="breadcrumbs"
  >
    <template #toolbar>
      <el-button @click="goBack">返回列表</el-button>
      <el-dropdown v-if="report" trigger="click" @command="(cmd: string) => exportReport(cmd as 'json' | 'html')">
        <el-button>导出 <el-icon><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="json">JSON</el-dropdown-item>
            <el-dropdown-item command="html">HTML</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </template>
    <div v-if="loading" class="app-loading-block">
      <div class="app-loading-ring"></div>
      <p class="text-sm text-slate-400">加载报告中...</p>
    </div>
    
    <el-empty v-else-if="!report" class="app-empty" description="报告不存在，请检查报告 ID 是否正确" />
    
    <div v-else class="report-content">
      <!-- 报告概览 -->
      <div class="card">
        <div class="card-header">
          <h2>{{ report.name }}</h2>
          <div class="report-meta">
            <span class="meta-item">环境: {{ report.environment }}</span>
            <span class="meta-item">创建时间: {{ formatDate(report.createdAt) }}</span>
            <el-button
              type="primary"
              :disabled="!canSummarize"
              :loading="summarizingReport"
              @click="runSummarizeReport"
            >
              AI 总结报告
            </el-button>
          </div>
        </div>
        
        <!-- 统计卡片 -->
        <div class="stats-grid">
          <div class="stat-card stat-card--info">
            <div class="stat-value">{{ report.summary.total }}</div>
            <div class="stat-label">总用例</div>
          </div>
          <div class="stat-card success">
            <div class="stat-value">{{ report.summary.passed }}</div>
            <div class="stat-label">通过</div>
          </div>
          <div
            class="stat-card error stat-card--clickable"
            :class="{ 'opacity-50': !report.summary.failed }"
            @click="scrollToFirstByStatus('FAILED')"
          >
            <div class="stat-value">{{ report.summary.failed }}</div>
            <div class="stat-label">失败</div>
          </div>
          <div
            class="stat-card warning stat-card--clickable"
            :class="{ 'opacity-50': !report.summary.error }"
            @click="scrollToFirstByStatus('ERROR')"
          >
            <div class="stat-value">{{ report.summary.error }}</div>
            <div class="stat-label">错误</div>
          </div>
          <div class="stat-card primary">
            <div class="stat-value">{{ report.summary.passRate }}%</div>
            <div class="stat-label">通过率</div>
          </div>
          <div class="stat-card stat-card--info">
            <div class="stat-value">{{ report.summary.duration }}ms</div>
            <div class="stat-label">总耗时</div>
          </div>
        </div>

        <div
          v-if="report.summary?.scenarioVariables && Object.keys(report.summary.scenarioVariables).length"
          class="scenario-vars"
        >
          <h3>场景变量</h3>
          <pre>{{ JSON.stringify(report.summary.scenarioVariables, null, 2) }}</pre>
        </div>
      </div>

      <div v-if="aiSummary" class="card">
        <div class="card-header">
          <h2>AI 报告总结</h2>
          <div class="report-meta">
            <span class="meta-item">风险等级: {{ riskLevelLabel(aiSummary.risk_assessment?.level) }}</span>
          </div>
        </div>

        <div class="ai-summary">
          <p><strong>摘要：</strong>{{ aiSummary.summary?.short }}</p>
          <p><strong>详情：</strong>{{ aiSummary.summary?.detailed }}</p>

          <div v-if="aiSummary.highlights?.length">
            <h3>关键发现</h3>
            <ul>
              <li v-for="(item, index) in aiSummary.highlights" :key="index">{{ item }}</li>
            </ul>
          </div>

          <div v-if="aiSummary.risk_assessment">
            <h3>风险评估</h3>
            <p>{{ aiSummary.risk_assessment.description }}</p>
          </div>

          <div v-if="aiSummary.risk_assessment?.recommendations?.length">
            <h3>建议动作</h3>
            <ul>
              <li
                v-for="(item, index) in aiSummary.risk_assessment.recommendations"
                :key="index"
              >
                {{ item }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      
      <!-- 性能指标 -->
      <div class="card">
        <div class="card-header">
          <h2>性能指标</h2>
        </div>
        <div class="performance-grid">
          <div class="performance-item">
            <div class="performance-label">平均响应时间</div>
            <div class="performance-value">{{ report.performance.avgResponseTime }}ms</div>
          </div>
          <div class="performance-item">
            <div class="performance-label">最小响应时间</div>
            <div class="performance-value">{{ report.performance.minResponseTime }}ms</div>
          </div>
          <div class="performance-item">
            <div class="performance-label">最大响应时间</div>
            <div class="performance-value">{{ report.performance.maxResponseTime }}ms</div>
          </div>
          <div class="performance-item">
            <div class="performance-label">P95响应时间</div>
            <div class="performance-value">{{ report.performance.p95ResponseTime }}ms</div>
          </div>
          <div class="performance-item">
            <div class="performance-label">P99响应时间</div>
            <div class="performance-value">{{ report.performance.p99ResponseTime }}ms</div>
          </div>
          <div class="performance-item">
            <div class="performance-label">吞吐量</div>
            <div class="performance-value">{{ report.performance.throughput }} req/s</div>
          </div>
        </div>
      </div>
      
      <!-- 响应时间分布 -->
      <div class="card">
        <div class="card-header">
          <h2>响应时间分布</h2>
        </div>
        <div class="distribution-chart">
          <div v-for="(bucket, index) in report.charts.distribution" :key="index" class="distribution-bar">
            <div class="distribution-label">{{ bucket.range }}</div>
            <div class="distribution-bar-container">
              <div class="distribution-bar-fill" :style="{ width: `${(bucket.count / report.summary.total) * 100}%` }"></div>
            </div>
            <div class="distribution-count">{{ bucket.count }}</div>
          </div>
        </div>
      </div>
      
      <!-- 测试详情 -->
      <div class="card">
        <div class="card-header">
          <h2>测试详情</h2>
        </div>
        <div class="test-details">
          <div
            v-for="(test, index) in pagedDetails"
            :key="index"
            class="test-case"
            :class="test.status.toLowerCase()"
            :data-test-index="(detailPage - 1) * detailSize + index"
            :data-status="test.status"
          >
            <div class="test-header">
              <h3>{{ test.stepName || test.name }}</h3>
              <span class="test-status" :class="test.status">{{ test.status }}</span>
            </div>
            <el-descriptions :column="2" class="test-meta">
              <el-descriptions-item label="响应时间">{{ test.responseTime ?? '-' }} ms</el-descriptions-item>
              <el-descriptions-item label="状态码">{{ test.response?.status ?? '-' }}</el-descriptions-item>
            </el-descriptions>
            <div v-if="test.error" class="test-error">
              <h4>错误信息</h4>
              <pre>{{ test.error }}</pre>
            </div>
            <div v-if="test.request" class="test-request">
              <h4>请求配置（实际参数）</h4>
              <pre class="app-code">{{ JSON.stringify(test.request, null, 2) }}</pre>
            </div>
            <div v-if="test.assertions && test.assertions.length" class="test-assertions">
              <h4>断言结果</h4>
              <el-table :data="test.assertions" size="small" style="width: 100%" class="assertions-table">
                <el-table-column prop="type" label="类型" width="100" min-width="100" />
                <el-table-column prop="target" label="目标" min-width="140" show-overflow-tooltip>
                  <template #default="scope">
                    {{ formatAssertionTarget(scope.row) }}
                  </template>
                </el-table-column>
                <el-table-column prop="condition" label="条件" width="80" min-width="80" />
                <el-table-column prop="expected" label="预期" min-width="120" show-overflow-tooltip>
                  <template #default="scope">
                    {{ formatAssertionValue(scope.row.expected) }}
                  </template>
                </el-table-column>
                <el-table-column prop="actual" label="实际" min-width="120" show-overflow-tooltip>
                  <template #default="scope">
                    {{ formatAssertionValue(scope.row.actual) }}
                  </template>
                </el-table-column>
                <el-table-column prop="passed" label="结果" width="80" min-width="80" fixed="right">
                  <template #default="scope">
                    <el-tag :type="scope.row.passed ? 'success' : 'danger'">{{ scope.row.passed ? '通过' : '失败' }}</el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <div v-if="test.responseBody !== undefined || (test.response && test.response.data !== undefined)" class="test-response">
              <el-collapse>
                <el-collapse-item title="响应数据" name="response">
                  <pre class="app-code">{{ JSON.stringify(test.responseBody ?? test.response?.data ?? test.response ?? {}, null, 2) }}</pre>
                </el-collapse-item>
              </el-collapse>
            </div>
            <div v-if="test.extractedVariables && Object.keys(test.extractedVariables).length" class="test-extracted">
              <h4>提取变量</h4>
              <pre class="app-code">{{ JSON.stringify(test.extractedVariables, null, 2) }}</pre>
            </div>
            <div
              v-if="(test.status === 'FAILED' || test.status === 'ERROR') && (test.failedAssertions?.length || test.response)"
              class="test-failure-log"
            >
              <el-collapse>
                <el-collapse-item title="失败详情日志" name="failure-log">
                  <div v-if="test.failedAssertions && test.failedAssertions.length">
                    <h5>失败断言</h5>
                    <pre class="app-code">{{ JSON.stringify(test.failedAssertions, null, 2) }}</pre>
                  </div>
                  <div v-if="test.response">
                    <h5>完整响应</h5>
                    <pre class="app-code">{{ JSON.stringify(test.response, null, 2) }}</pre>
                  </div>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
        </div>
        <div v-if="detailTotal > 0" class="app-pagination">
          <div class="app-pagination-copy">详情 {{ detailTotal }}</div>
          <el-pagination
            background
            layout="total, sizes, prev, pager, next"
            :total="detailTotal"
            :current-page="detailPage"
            :page-size="detailSize"
            :page-sizes="[5, 10, 20, 50]"
            @current-change="handleDetailPage"
            @size-change="handleDetailSize"
          />
        </div>
      </div>
    </div>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { message, confirmAction } from '../../utils/message'
import { useAIStore } from '../../store/ai'
import { usePagination } from '../../composables/usePagination'

const route = useRoute()
const router = useRouter()
const aiStore = useAIStore()
const projectId = computed(() => route.params.id as string)
const reportId = computed(() => route.params.reportId as string)
const breadcrumbs = computed(() => [
  { label: '测试报告', to: `/projects/${projectId.value}/tests/reports` },
  { label: report.value?.name || '报告详情' },
])

const report = ref<any>(null)
const loading = ref(false)
const summarizingReport = ref(false)
const aiSummary = ref<any | null>(null)
const canSummarize = computed(() => aiStore.enabled && aiStore.features.reportSummary && !summarizingReport.value)
const reportDetails = computed<any[]>(() => Array.isArray(report.value?.details) ? report.value.details : [])
const {
  currentPage: detailPage,
  pageSize: detailSize,
  total: detailTotal,
  pagedItems: pagedDetails,
  handleCurrentChange: handleDetailPage,
  handleSizeChange: handleDetailSize,
  resetPage: resetDetailPage,
} = usePagination<any>(reportDetails, 10)

watch(reportDetails, () => resetDetailPage())

onMounted(async () => {
  await aiStore.getProjectConfig(projectId.value)
  await fetchReport()
})

const fetchReport = async () => {
  loading.value = true
  try {
    const response = await axios.get(`/api/tests/reports/${reportId.value}`)
    report.value = response.data
    if (response.data?.aiSummary) {
      aiSummary.value = response.data.aiSummary
    }
  } catch (error) {
    console.error('Failed to fetch report:', error)
  } finally {
    loading.value = false
  }
}

const runSummarizeReport = async () => {
  if (!report.value) {
    message.warning('报告尚未加载完成')
    return
  }
  if (!aiStore.enabled || !aiStore.features.reportSummary) {
    message.warning('请先在 AI 配置中开启“报告智能总结”')
    return
  }

  summarizingReport.value = true
  try {
    aiSummary.value = await aiStore.summarizeReport(projectId.value, report.value, reportId.value)
    message.success('AI 报告总结完成')
  } catch (error) {
    console.error('Failed to summarize report:', error)
    message.error('AI 报告总结失败')
  } finally {
    summarizingReport.value = false
  }
}

const riskLevelLabel = (level: string) => {
  if (level === 'HIGH') return '高'
  if (level === 'MEDIUM') return '中'
  if (level === 'LOW') return '低'
  return level || '-'
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}:${s}`
}

const formatAssertionValue = (val: unknown): string => {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

const formatAssertionTarget = (row: { target?: string; expected?: unknown; type?: string }): string => {
  if (row.target) return row.target
  if (row.type === 'JSON_PATH' && typeof row.expected === 'string' && row.expected.startsWith('$.')) {
    return row.expected
  }
  return '-'
}

const goBack = () => {
  router.push(`/projects/${projectId.value}/tests/reports`)
}

const scrollToFirstByStatus = async (status: 'FAILED' | 'ERROR') => {
  const details = reportDetails.value
  const idx = details.findIndex((t: any) => t.status === status)
  if (idx < 0) return
  const targetPage = Math.floor(idx / detailSize.value) + 1
  if (targetPage !== detailPage.value) {
    handleDetailPage(targetPage)
  }
  await nextTick()
  const el = document.querySelector(`[data-test-index="${idx}"][data-status="${status}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const exportReport = async (format: 'json' | 'html') => {
  try {
    await confirmAction(`确定导出该报告为 ${format.toUpperCase()} 格式吗？`, '导出确认')
  } catch {
    return
  }
  try {
    const response = await axios.get(`/api/tests/reports/${reportId.value}/export?format=${format}`, {
      responseType: 'blob'
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `report-${reportId.value}.${format}`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    message.success(`报告已导出为 ${format.toUpperCase()}`)
  } catch (error) {
    console.error('Failed to export report:', error)
    message.error(error, '导出失败')
  }
}
</script>

<style scoped>
.report-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.card {
  border-radius: 20px;
  border: 1px solid rgba(63, 63, 70, 0.9);
  background: rgba(24, 24, 27, 0.96);
  box-shadow: var(--shadow-md);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  border-bottom: 1px solid rgba(63, 63, 70, 0.9);
}

.report-meta {
  display: flex;
  gap: var(--spacing-md);
  font-size: 14px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.ai-summary {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.stat-card {
  background-color: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
  text-align: center;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-card--clickable {
  cursor: pointer;
}

.stat-card--clickable:not(.opacity-50):hover {
  box-shadow: var(--shadow-md);
}

.stat-card--clickable.opacity-50 {
  cursor: not-allowed;
  opacity: 0.6;
}

.stat-card.success {
  border-color: var(--success-color);
  background-color: rgba(34, 197, 94, 0.06);
}

.stat-card.error {
  border-color: var(--error-color);
  background-color: rgba(239, 68, 68, 0.08);
}

.stat-card.warning {
  border-color: var(--warning-color);
  background-color: rgba(245, 158, 11, 0.08);
}

.stat-card.primary {
  border-color: var(--primary-color);
  background-color: rgba(99, 102, 241, 0.06);
}

.stat-card--info {
  border-color: rgba(99, 102, 241, 0.25);
  background-color: rgba(99, 102, 241, 0.04);
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--spacing-xs);
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.performance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.performance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
}

.performance-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.performance-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.distribution-chart {
  margin-top: var(--spacing-md);
}

.distribution-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.distribution-label {
  width: 100px;
  font-size: 14px;
  color: var(--text-secondary);
}

.distribution-bar-container {
  flex: 1;
  height: 20px;
  background-color: var(--border-color);
  border-radius: var(--border-radius-sm);
  overflow: hidden;
}

.distribution-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color), #818cf8);
  border-radius: var(--border-radius-sm);
  transition: width var(--transition-normal);
}

.distribution-count {
  width: 40px;
  text-align: right;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.scenario-vars {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color);
}

.scenario-vars h3 {
  margin: 0 0 var(--spacing-sm);
  font-size: 16px;
}

.scenario-vars pre {
  margin: 0;
  font-size: 12px;
  padding: var(--spacing-sm);
  background-color: #09090b;
  border-radius: 10px;
  border: 1px solid rgba(63, 63, 70, 0.9);
  overflow-x: auto;
}

.test-details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.test-case {
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
  transition: all var(--transition-fast);
}

.test-case:hover {
  box-shadow: var(--shadow-md);
}

.test-case.passed {
  border-left: 4px solid var(--success-color);
  background-color: rgba(34, 197, 94, 0.04);
}

.test-case.failed {
  border-left: 4px solid var(--error-color);
  background-color: rgba(239, 68, 68, 0.06);
}

.test-case.error {
  border-left: 4px solid var(--warning-color);
  background-color: rgba(245, 158, 11, 0.06);
}

.test-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.test-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.test-status {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.test-status.PASSED {
  background-color: var(--success-color);
  color: white;
}

.test-status.FAILED {
  background-color: var(--error-color);
  color: white;
}

.test-status.ERROR {
  background-color: var(--warning-color);
  color: white;
}

.test-meta {
  display: flex;
  gap: var(--spacing-md);
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-sm);
}

.test-error {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm);
  background-color: rgba(239, 68, 68, 0.08);
  border-radius: 10px;
}

.test-error h4 {
  margin: 0 0 var(--spacing-xs);
  font-size: 14px;
  color: var(--error-color);
}

.test-error pre {
  margin: 0;
  font-size: 12px;
  padding: var(--spacing-sm);
  background-color: #09090b;
  border-radius: 10px;
  border: 1px solid rgba(63, 63, 70, 0.9);
  overflow-x: auto;
}

.test-request {
  margin-top: var(--spacing-sm);
}

.test-request h4 {
  margin: 0 0 var(--spacing-xs);
  font-size: 14px;
  color: var(--text-primary);
}

.test-response {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm);
  background-color: rgba(245, 158, 11, 0.08);
  border-radius: 10px;
}

.test-response pre {
  margin: 0;
  font-size: 12px;
  padding: var(--spacing-sm);
  background-color: #09090b;
  border-radius: 10px;
  border: 1px solid rgba(63, 63, 70, 0.9);
  overflow-x: auto;
}

.test-assertions {
  margin-top: var(--spacing-sm);
}

.test-assertions h4 {
  margin: 0 0 var(--spacing-xs);
  font-size: 14px;
  color: var(--text-primary);
}

.test-assertions .assertions-table {
  table-layout: fixed;
}

.test-assertions ul {
  margin: 0;
  padding-left: var(--spacing-md);
  font-size: 14px;
}

.test-assertions li {
  margin-bottom: var(--spacing-xs);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.test-assertions li.passed {
  color: var(--success-color);
}

.test-assertions li.failed {
  color: var(--error-color);
}

.test-extracted {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm);
  background-color: rgba(34, 197, 94, 0.06);
  border-radius: var(--radius-md);
}

.test-extracted h4 {
  margin: 0 0 var(--spacing-xs);
  font-size: 14px;
  color: var(--text-primary);
}

.test-extracted pre {
  margin: 0;
  font-size: 12px;
  padding: var(--spacing-sm);
  background-color: #09090b;
  border-radius: 10px;
  border: 1px solid rgba(63, 63, 70, 0.9);
  overflow-x: auto;
}

.test-failure-log {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm);
  background-color: rgba(245, 158, 11, 0.08);
  border-radius: 10px;
}

.test-failure-log h4,
.test-failure-log h5 {
  margin: 0 0 var(--spacing-xs);
  color: var(--text-primary);
}

.test-failure-log > div + div {
  margin-top: var(--spacing-sm);
}

.test-failure-log pre {
  margin: 0;
  font-size: 12px;
  padding: var(--spacing-sm);
  background-color: #09090b;
  border-radius: 10px;
  border: 1px solid rgba(63, 63, 70, 0.9);
  overflow-x: auto;
}

.assertion-status {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.assertion-status.通过 {
  background-color: var(--success-color);
  color: white;
}

.assertion-status.失败 {
  background-color: var(--error-color);
  color: white;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .performance-grid {
    grid-template-columns: 1fr;
  }
  
  .distribution-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
  }
  
  .distribution-label {
    width: 100%;
  }
}
</style>
