<template>
  <el-dialog :model-value="modelValue" title="场景压力测试" width="min(1120px, calc(100vw - 32px))" top="5vh"
    append-to-body destroy-on-close :close-on-click-modal="false" class="stress-workbench-dialog"
    @update:model-value="emit('update:modelValue', $event)">
    <div class="stress-workbench">
      <div class="workbench-heading">
        <div><span class="eyebrow">LOAD TEST</span><h2>{{ scenario.name || '场景压力测试' }}</h2><p>{{ scenario.steps?.length || 0 }} 个业务步骤 · 配置负载、观察指标、保留每次结果</p></div>
        <el-tag :type="statusType" effect="plain">{{ currentRun ? store.statusText : '准备就绪' }}</el-tag>
      </div>
      <el-alert v-if="otherRunning" title="另一个场景正在压测，请等待完成或先停止该任务。" type="warning" :closable="false" />
      <el-tabs v-model="tab" class="workbench-tabs">
        <el-tab-pane label="测试配置" name="config">
          <el-alert v-if="reusedFrom" class="reuse-banner" type="info" :closable="false" show-icon>
            <div class="reuse-banner-body">
              <span>已复用 <strong>{{ reusedFrom.time }}</strong> 的报告《{{ reusedFrom.name }}》配置：{{ reusedFrom.detail }}</span>
              <el-button link type="primary" :disabled="store.running" @click="undoReuse">撤销复用</el-button>
            </div>
          </el-alert>
          <div class="config-layout">
            <section class="configuration">
              <div class="section-heading"><h3>选择负载预设</h3><span>点击后可继续调整</span></div>
              <div class="preset-grid">
                <button v-for="preset in presets" :key="preset.name" type="button" :disabled="store.running"
                  :class="['preset', { 'is-selected': selectedPreset === preset.name }]" @click="applyPreset(preset)">
                  <strong>{{ preset.name }}</strong><span>{{ preset.users }} 用户 · {{ preset.duration }} 秒</span>
                </button>
              </div>
              <el-form :model="config" label-position="top" :disabled="store.running || store.starting" class="config-fields">
                <el-form-item label="测试环境" required class="span-two">
                  <el-select v-model="config.environmentId" :loading="environmentsLoading" placeholder="选择测试环境" aria-label="压测环境">
                    <el-option v-for="env in environments" :key="env.id" :label="env.name + (env.isActive ? ' · 当前激活' : '')" :value="env.id" />
                  </el-select>
                  <span v-if="environmentError" class="field-error">{{ environmentError }}</span>
                </el-form-item>
                <el-form-item label="执行模式" class="span-two">
                  <el-radio-group v-model="config.executionMode" aria-label="压测执行模式">
                    <el-radio-button value="duration">固定时长</el-radio-button><el-radio-button value="requests">固定场景轮次</el-radio-button>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="虚拟用户数"><el-input-number v-model="config.virtualUsers" :min="1" :max="1000" :precision="0" aria-label="虚拟用户数" /></el-form-item>
                <el-form-item v-if="config.executionMode === 'duration'" label="持续时间（秒）"><el-input-number v-model="config.durationSeconds" :min="5" :max="3600" :precision="0" aria-label="持续时间" /></el-form-item>
                <el-form-item v-else label="场景执行轮次"><el-input-number v-model="config.totalRequests" :min="1" :max="100000" :precision="0" aria-label="场景执行轮次" /></el-form-item>
                <el-form-item label="爬升时长（秒）"><el-input-number v-model="config.rampUpSeconds" :min="0" :max="120" :precision="0" aria-label="爬升时长" /></el-form-item>
                <el-form-item label="步间延迟（毫秒）"><el-input-number v-model="config.stepDelayMs" :min="0" :max="10000" :step="100" :precision="0" aria-label="步间延迟" /></el-form-item>
                <el-form-item label="失败率停止阈值（%）"><el-input-number v-model="config.stopOnFailRate" :min="0" :max="100" :precision="0" aria-label="失败率停止阈值" /></el-form-item>
                <el-form-item label="请求超时（毫秒）"><el-input-number v-model="config.timeoutMs" :min="1000" :max="120000" :step="1000" :precision="0" aria-label="请求超时" /></el-form-item>
                <el-form-item label="报告名称" class="span-two"><el-input v-model="config.reportName" placeholder="留空自动生成" clearable /></el-form-item>
              </el-form>
            </section>
            <aside class="load-preview">
              <div class="section-heading"><h3>负载预览</h3><span>计划值</span></div>
              <div class="preview-number">{{ config.virtualUsers || 0 }}<span>虚拟用户</span></div>
              <svg class="load-shape" viewBox="0 0 360 150" role="img" aria-label="用户数随爬升时间到达目标并保持的负载计划">
                <path d="M20 18V125H342" class="axis" />
                <path d="M20 72H342" class="guide" />
                <path :d="loadPath" class="load-area" /><path :d="loadLine" class="load-line" />
                <text x="20" y="144">0s</text><text x="290" y="144">{{ config.executionMode === 'duration' ? `${config.durationSeconds}s` : '完成轮次' }}</text>
              </svg>
              <dl class="plan-facts">
                <div><dt>执行目标</dt><dd>{{ config.executionMode === 'duration' ? `${config.durationSeconds} 秒` : `${config.totalRequests} 轮场景` }}</dd></div>
                <div><dt>达到目标负载</dt><dd>{{ config.rampUpSeconds ? `${config.rampUpSeconds} 秒` : '立即' }}</dd></div>
                <div><dt>业务步骤</dt><dd>{{ scenario.steps?.length || 0 }} 步 / 轮</dd></div>
                <div v-if="config.executionMode === 'requests'"><dt>基础请求量</dt><dd>{{ baseRequests.toLocaleString() }} 次</dd></div>
                <div><dt>失败保护</dt><dd>{{ config.stopOnFailRate ? `失败率 ≥ ${config.stopOnFailRate}%` : '不提前停止' }}</dd></div>
              </dl>
              <p class="preview-note">爬升计入总时长。失败率保护在至少 10 个请求后生效；循环步骤会增加实际请求量。<span v-if="config.executionMode === 'requests'">固定轮次模式最长运行 30 分钟。</span></p>
              <el-alert v-if="validationError" :title="validationError" type="warning" :closable="false" />
              <p class="draft-note">配置自动保存在当前浏览器，下次可继续使用。</p>
              <el-button text :disabled="store.running" @click="resetConfig">恢复默认配置</el-button>
            </aside>
          </div>
        </el-tab-pane>
        <el-tab-pane label="实时监控" name="monitor">
          <el-empty v-if="!currentRun" description="配置负载后开始压测，实时指标会显示在这里。" :image-size="84" />
          <template v-else>
            <div class="run-heading"><span>{{ store.statusText }} · 已运行 {{ progress.elapsedSeconds || 0 }}s</span><span>{{ progress.users ?? 0 }} / {{ runConfig.virtualUsers }} 活跃用户</span></div>
            <el-progress :percentage="store.percent" :status="currentRun.status === 'failed' ? 'exception' : currentRun.status === 'completed' ? 'success' : undefined" :stroke-width="6" />
            <el-alert v-if="store.connectionError" :title="store.connectionError" type="warning" :closable="false" class="connection-alert" />
            <div class="metric-grid">
              <article><span>累计请求</span><strong>{{ (progress.total || 0).toLocaleString() }}</strong><small>{{ progress.runs || 0 }} 轮场景已完成</small></article>
              <article><span>{{ store.running ? '当前吞吐' : '平均吞吐' }}</span><strong>{{ currentRun.performance?.throughput ?? progress.rps ?? 0 }}<small>req/s</small></strong><small>{{ store.running ? '最近采样区间' : '整次测试平均值' }}</small></article>
              <article :class="{ 'has-errors': progress.failed > 0 }"><span>失败率</span><strong>{{ failRate }}<small>%</small></strong><small>{{ progress.failed || 0 }} 次失败或错误</small></article>
              <article><span>平均响应</span><strong>{{ Math.round(currentRun.performance?.avgResponseTime ?? progress.avgResponseTime ?? 0) }}<small>ms</small></strong><small>累计请求平均值</small></article>
              <article><span>P95 响应</span><strong>{{ Math.round(currentRun.performance?.p95ResponseTime ?? progress.p95ResponseTime ?? 0) }}<small>ms</small></strong><small>95% 的请求低于此值</small></article>
            </div>
            <section class="trend-section">
              <div class="section-heading"><h3>运行趋势</h3><el-radio-group v-model="metric" size="small"><el-radio-button value="throughput">吞吐</el-radio-button><el-radio-button value="latency">响应时间</el-radio-button><el-radio-button value="users">用户数</el-radio-button></el-radio-group></div>
              <StressTrendChart v-if="tab === 'monitor' && currentRun.timeline?.length" :points="currentRun.timeline" :metric="metric" :target-users="runConfig.virtualUsers" />
              <div v-else class="chart-empty">正在等待首个采样点…</div>
            </section>
            <el-alert v-if="currentRun.error" :title="currentRun.error" type="error" :closable="false" />
            <section class="log-section">
              <div class="section-heading"><h3>运行日志 <span class="count">{{ filteredLogs.length }}</span></h3><div class="log-tools"><el-input v-model="logQuery" placeholder="搜索日志" clearable aria-label="搜索压测日志" /><el-checkbox v-model="errorsOnly">仅看错误</el-checkbox><el-button text @click="copyLogs">复制</el-button></div></div>
              <div class="log-output" role="log"><div v-for="(line, index) in filteredLogs" :key="index" :class="{ 'error-line': /error|failed|失败|错误|exception/i.test(line) }">{{ line }}</div><p v-if="!filteredLogs.length">{{ currentRun.logs?.length ? '没有匹配的日志' : '等待压测引擎输出…' }}</p></div>
            </section>
            <section v-if="currentRun.endpoints?.length" class="endpoint-section">
              <div class="section-heading"><h3>接口表现</h3></div>
              <el-table :data="currentRun.endpoints" size="small" max-height="240"><el-table-column prop="name" label="步骤" min-width="180" /><el-table-column prop="requests" label="请求数" width="90" /><el-table-column prop="failures" label="失败数" width="90" /><el-table-column prop="responseTime" label="平均 ms" width="95" /><el-table-column prop="p95ResponseTime" label="P95 ms" width="95" /></el-table>
            </section>
          </template>
        </el-tab-pane>
        <el-tab-pane label="历史记录" name="history">
          <div class="section-heading"><div><h3>当前场景的压测报告</h3><p class="history-description">复用配置会把该报告的负载参数填回测试配置（不修改报告本身），或选两份报告对比结果。</p></div><div class="history-tools"><el-button :disabled="selectedReports.length !== 2" @click="compareReports">对比所选（{{ selectedReports.length }}/2）</el-button><el-button :loading="historyLoading" @click="loadHistory">刷新</el-button></div></div>
          <el-alert v-if="historyError" :title="historyError" type="error" :closable="false" />
          <el-table v-else v-loading="historyLoading" :data="history" @selection-change="selectedReports = $event" max-height="440" row-key="id">
            <el-table-column type="selection" width="42" :selectable="reportSelectable" />
            <el-table-column label="报告" min-width="240"><template #default="{ row }"><strong class="report-name">{{ row.name }}</strong><span class="report-time">{{ formatTime(row.createdAt) }} · {{ row.environment }}<template v-if="reportLoad(row)"> · {{ reportLoad(row) }}</template></span></template></el-table-column>
            <el-table-column label="用户" width="70"><template #default="{ row }">{{ row.summary.virtualUsers }}</template></el-table-column>
            <el-table-column label="吞吐 req/s" width="110"><template #default="{ row }">{{ row.performance.throughput ?? '—' }}</template></el-table-column>
            <el-table-column label="P95 ms" width="90"><template #default="{ row }">{{ row.performance.p95ResponseTime ?? '—' }}</template></el-table-column>
            <el-table-column label="操作" width="204"><template #default="{ row }"><div class="row-actions"><el-tooltip :content="reuseHint" placement="top" :show-after="200"><span class="action-slot"><button type="button" class="reuse-btn" :disabled="store.running || Boolean(reusingId)" :aria-busy="reusingId === row.id" @click="reuseReport(row)"><span v-if="reusingId === row.id" class="reuse-spinner" aria-hidden="true"></span><svg v-else class="reuse-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>复用配置</button></span></el-tooltip><el-button link type="primary" @click="openReport(row.id)">查看报告</el-button></div></template></el-table-column>
            <template #empty><el-empty description="尚无压测报告，完成测试后会保存在这里" :image-size="72" /></template>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer>
      <div class="workbench-footer"><span class="footer-note">{{ store.running ? '收起后压测继续，刷新页面可恢复进度。' : currentRun?.reportId ? '结果已保存，可查看报告或调整配置再次压测。' : '确认目标环境和负载配置后开始测试。' }}</span><div class="footer-actions">
        <el-button @click="emit('update:modelValue', false)">{{ store.running ? '收起工作台' : '关闭' }}</el-button>
        <el-button v-if="currentRun?.reportId" @click="exportMetrics">导出指标</el-button>
        <el-button v-if="currentRun?.reportId" type="primary" plain @click="openReport(currentRun.reportId)">查看报告</el-button>
        <el-button v-if="currentRun && store.running" type="danger" :loading="currentRun.status === 'stopping'" :disabled="!currentRun.id" @click="store.stop()">停止压测</el-button>
        <el-button v-else-if="currentRun && tab !== 'config'" type="primary" @click="prepareAgain">调整配置</el-button>
        <el-button v-else type="primary" :loading="store.starting || store.restoring" :disabled="Boolean(validationError) || otherRunning || store.running" @click="start">开始压力测试</el-button>
      </div></div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { defaultStressConfig, useStressStore, type StressConfig } from '../../store/stress'
import { message } from '../../utils/message'
import StressTrendChart from './StressTrendChart.vue'
interface ReuseSnapshot { name: string; time: string; detail: string; config: StressConfig; previous: StressConfig; previousReuse: ReuseSnapshot | null }
const props = defineProps<{ modelValue: boolean; projectId: string; scenario: { id: string; name: string; steps: any[] } }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const router = useRouter()
const store = useStressStore()
const tab = ref('config')
const config = reactive(defaultStressConfig())
const environments = ref<any[]>([])
const environmentsLoading = ref(false)
const environmentError = ref('')
const history = ref<any[]>([])
const historyLoading = ref(false)
const historyError = ref('')
const selectedReports = ref<any[]>([])
const reusingId = ref('')
const reusedFrom = ref<ReuseSnapshot | null>(null)
const logQuery = ref('')
const errorsOnly = ref(false)
const metric = ref<'throughput' | 'latency' | 'users'>('throughput')
const presets = [
  { name: '快速验证', users: 5, duration: 10, ramp: 0, delay: 0 },
  { name: '常规负载', users: 20, duration: 60, ramp: 10, delay: 100 },
  { name: '容量摸底', users: 100, duration: 120, ramp: 30, delay: 0 },
]
const selectedPreset = computed(() => presets.find(preset => config.executionMode === 'duration' && preset.users === config.virtualUsers && preset.duration === config.durationSeconds && preset.ramp === config.rampUpSeconds && preset.delay === config.stepDelayMs)?.name || '')
/** 复用报告时可写入配置的数值字段及其合法区间；zeroOk 表示 0 是有效取值，而非"未设置" */
type NumericConfigKey = 'virtualUsers' | 'durationSeconds' | 'totalRequests' | 'rampUpSeconds' | 'stepDelayMs' | 'stopOnFailRate' | 'timeoutMs'
const REUSE_FIELDS: { key: NumericConfigKey; min: number; max: number; zeroOk?: boolean }[] = [
  { key: 'virtualUsers', min: 1, max: 1000 },
  { key: 'durationSeconds', min: 5, max: 3600 },
  { key: 'totalRequests', min: 1, max: 100000 },
  { key: 'rampUpSeconds', min: 0, max: 120, zeroOk: true },
  { key: 'stepDelayMs', min: 0, max: 10000, zeroOk: true },
  { key: 'stopOnFailRate', min: 0, max: 100, zeroOk: true },
  { key: 'timeoutMs', min: 1000, max: 120000 },
]
/** 从报告 summary 还原一份可直接运行的配置：缺失字段回落默认值，避免与当前草稿混搭 */
function configFromReport(summary: any): StressConfig {
  const next = defaultStressConfig()
  next.reportName = ''
  if (summary?.executionMode === 'requests' || summary?.executionMode === 'duration') next.executionMode = summary.executionMode
  if (typeof summary?.environmentId === 'string' && summary.environmentId) next.environmentId = summary.environmentId
  for (const field of REUSE_FIELDS) {
    const value = Math.round(Number(summary?.[field.key]))
    if (!Number.isFinite(value) || (value === 0 && !field.zeroOk)) continue
    next[field.key] = Math.min(field.max, Math.max(field.min, value))
  }
  // 报告中与当次模式无关的字段会以 0 落库，保留默认值以免切换模式后立刻校验失败
  if (next.executionMode === 'duration') {
    if (next.rampUpSeconds >= next.durationSeconds) next.rampUpSeconds = Math.max(0, Math.min(next.durationSeconds - 1, Math.floor(next.durationSeconds / 3)))
  } else if (next.durationSeconds <= next.rampUpSeconds) {
    // 固定轮次模式不校验时长关系，但切回固定时长后不能立刻报错，故放大回落后的时长
    next.durationSeconds = Math.min(3600, next.rampUpSeconds * 2)
  }
  return next
}
const loadDetail = (value: StressConfig) => {
  const mode = value.executionMode === 'duration' ? `${value.durationSeconds} 秒` : `${value.totalRequests} 轮场景`
  const environment = environments.value.find(env => env.id === value.environmentId)?.name || '未选择环境'
  return `${value.virtualUsers} 用户 · ${mode} · 爬升 ${value.rampUpSeconds}s · ${environment}`
}
const reuseHint = computed(() => store.running ? '压测运行中，结束后可复用配置' : '把该报告的负载参数填回测试配置，可调整后再运行')
function reportLoad(report: any) {
  const summary = report.summary || {}
  if (summary.executionMode === 'requests') return summary.totalRequests ? `${summary.totalRequests} 轮场景` : ''
  return summary.durationSeconds ? `固定时长 ${summary.durationSeconds}s` : ''
}
const currentRun = computed(() => store.scenarioId === props.scenario.id ? store.run : null)
const otherRunning = computed(() => store.running && !currentRun.value)
const runConfig = computed(() => store.config)
const progress = computed(() => currentRun.value?.progress || {})
const failRate = computed(() => progress.value.total ? ((progress.value.failed / progress.value.total) * 100).toFixed(1) : '0.0')
const statusType = computed(() => currentRun.value?.status === 'failed' ? 'danger' : currentRun.value?.status === 'completed' ? 'success' : 'info')
const baseRequests = computed(() => (config.totalRequests || 0) * (props.scenario.steps?.length || 0))
const validationError = computed(() => {
  if (!config.environmentId) return '请选择测试环境'
  if (!props.scenario.steps?.length) return '场景中没有可执行步骤'
  if (config.executionMode === 'duration' && config.rampUpSeconds >= config.durationSeconds) return '爬升时长必须小于持续时间'
  const rules: [keyof StressConfig, number, number, string][] = [['virtualUsers', 1, 1000, '虚拟用户数'], ['rampUpSeconds', 0, 120, '爬升时长'], ['stepDelayMs', 0, 10000, '步间延迟'], ['stopOnFailRate', 0, 100, '失败率阈值'], ['timeoutMs', 1000, 120000, '请求超时']]
  rules.push(config.executionMode === 'duration' ? ['durationSeconds', 5, 3600, '持续时间'] : ['totalRequests', 1, 100000, '场景轮次'])
  for (const [key, min, max, label] of rules) { const n = Number(config[key]); if (!Number.isInteger(n) || n < min || n > max) return `${label}须为 ${min}–${max} 之间的整数` }
  return ''
})
const rampX = computed(() => 20 + Math.min(1, config.rampUpSeconds / Math.max(1, config.executionMode === 'duration' ? config.durationSeconds : config.rampUpSeconds * 3 || 1)) * 322)
const loadLine = computed(() => `M20 125L${rampX.value} 26H342`)
const loadPath = computed(() => `${loadLine.value}V125Z`)
const filteredLogs = computed<string[]>(() => (currentRun.value?.logs || []).filter((line: string) => (!errorsOnly.value || /error|failed|失败|错误|exception/i.test(line)) && line.toLowerCase().includes(logQuery.value.toLowerCase())))
const draftKey = () => `apiforge:stressDraft:${props.projectId}:${props.scenario.id}`
watch(config, () => { if (props.scenario.id) { try { localStorage.setItem(draftKey(), JSON.stringify(config)) } catch {} } }, { deep: true })
let openGeneration = 0
watch(() => [props.modelValue, props.scenario.id] as const, async ([visible, id]) => {
  const generation = ++openGeneration
  store.dialogOpen = visible && (!store.run || store.scenarioId === id)
  if (!visible || !id) return
  await store.restore()
  if (generation !== openGeneration) return
  let draft: any = {}
  try { draft = JSON.parse(localStorage.getItem(draftKey()) || '{}') } catch {}
  const source = currentRun.value?.config || draft
  Object.assign(config, defaultStressConfig(), Object.fromEntries(Object.keys(defaultStressConfig()).filter(key => source[key] != null).map(key => [key, source[key]])))
  tab.value = currentRun.value ? 'monitor' : 'config'
  environmentsLoading.value = true
  environmentError.value = ''
  try {
    const { data } = await axios.get('/api/environments', { params: { projectId: props.projectId } })
    if (generation !== openGeneration) return
    environments.value = Array.isArray(data) ? data : []
    if (!environments.value.some(env => env.id === config.environmentId)) config.environmentId = environments.value.find(env => env.isActive)?.id || environments.value[0]?.id || ''
  } catch { environmentError.value = '环境加载失败，可关闭后重试'; environments.value = [] }
  finally { if (generation === openGeneration) environmentsLoading.value = false }
  void loadHistory()
}, { immediate: true })
watch(() => currentRun.value?.status, status => { if (status && !['running', 'stopping'].includes(status)) void loadHistory() })
onUnmounted(() => { openGeneration++; store.dialogOpen = false })
function applyPreset(preset: typeof presets[number]) {
  Object.assign(config, { executionMode: 'duration', virtualUsers: preset.users, durationSeconds: preset.duration, rampUpSeconds: preset.ramp, stepDelayMs: preset.delay })
}
function resetConfig() { const environmentId = config.environmentId; Object.assign(config, defaultStressConfig(), { environmentId }); reusedFrom.value = null }
async function start() {
  if (validationError.value) return message.warning(validationError.value)
  if (await store.start({ ...config, projectId: props.projectId, scenarioId: props.scenario.id })) tab.value = 'monitor'
}
function prepareAgain() { store.dismiss(); tab.value = 'config' }
async function loadHistory() {
  if (!props.scenario.id) return
  historyLoading.value = true
  historyError.value = ''
  try {
    const { data } = await axios.get('/api/tests/reports', { params: { projectId: props.projectId } })
    const parse = (value: any) => { if (typeof value !== 'string') return value || {}; try { return JSON.parse(value) } catch { return {} } }
    history.value = (Array.isArray(data) ? data : []).map(row => ({ ...row, summary: parse(row.summary), performance: parse(row.performance) })).filter(row => row.summary.stressTest && row.summary.scenarioId === props.scenario.id)
    selectedReports.value = []
  } catch { historyError.value = '历史报告加载失败，请点击刷新重试' }
  finally { historyLoading.value = false }
}
async function reuseReport(report: any) {
  if (store.running || reusingId.value) return
  const next = configFromReport(report.summary)
  const missingEnvironment = !environments.value.some(env => env.id === next.environmentId)
  if (missingEnvironment) next.environmentId = environments.value.find(env => env.isActive)?.id || environments.value[0]?.id || ''
  reusingId.value = report.id
  try {
    const previous = { ...config } as StressConfig
    store.dismiss()
    Object.assign(config, next)
    tab.value = 'config'
    reusedFrom.value = { name: report.name, time: formatTime(report.createdAt), detail: loadDetail(next), config: { ...next }, previous, previousReuse: reusedFrom.value }
    if (missingEnvironment) message.warning(`报告使用的测试环境已不可用，已切换到「${environments.value.find(env => env.id === next.environmentId)?.name || '未选择'}」，请确认后再运行`)
  } finally { reusingId.value = '' }
}
function undoReuse() {
  const snapshot = reusedFrom.value
  if (!snapshot || store.running) return
  Object.assign(config, snapshot.previous)
  reusedFrom.value = snapshot.previousReuse
  message.info('已恢复到复用前的负载配置')
}
function reportSelectable(row: any) { return selectedReports.value.length < 2 || selectedReports.value.some(report => report.id === row.id) }
function compareReports() { if (selectedReports.value.length === 2) { emit('update:modelValue', false); router.push({ path: `/projects/${props.projectId}/tests/reports/compare`, query: { a: selectedReports.value[0].id, b: selectedReports.value[1].id } }) } }
function openReport(id: string) { emit('update:modelValue', false); router.push(`/projects/${props.projectId}/tests/reports/${id}`) }
function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }
async function copyLogs() { try { await navigator.clipboard.writeText(filteredLogs.value.join('\n')); message.success('日志已复制') } catch { message.error('复制失败，请手动选择日志文本') } }
function exportMetrics() {
  const run = currentRun.value
  if (!run) return
  const blob = new Blob([JSON.stringify({ config: runConfig.value, summary: run.summary, performance: run.performance, timeline: run.timeline, endpoints: run.endpoints, stopReason: run.stopReason }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `stress-${run.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<style scoped>
.stress-workbench { --workbench-gap: 24px; color: var(--text-primary); }
:global(.stress-workbench-dialog) { display: flex; flex-direction: column; max-height: 90vh; }
:global(.stress-workbench-dialog .el-dialog__body) { min-height: 0; overflow-y: auto; }
:global(.stress-workbench-dialog .el-dialog__footer) { flex-shrink: 0; }
.workbench-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.eyebrow { font: 10px var(--font-mono); color: var(--primary-color); letter-spacing: .14em; }
.workbench-heading h2 { margin: 7px 0 6px; font-size: 21px; font-weight: 600; letter-spacing: -.025em; }
.workbench-heading p, .history-description { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
.config-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(250px, 1fr); gap: 32px; padding: 12px 0 0; }
.configuration, .load-preview { min-width: 0; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.section-heading h3 { margin: 0; font-size: 13px; font-weight: 600; }
.section-heading > span { font-size: 11px; color: var(--text-muted); }
.preset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 24px; }
.preset { padding: 13px 10px; text-align: left; border: 1px solid var(--border-color); border-radius: 7px; background: var(--card-background); transition: border-color .15s, background .15s; }
.preset:hover, .preset.is-selected { border-color: var(--primary-color); background: rgba(var(--primary-rgb), .06); }
.preset:disabled { opacity: .5; cursor: default; }
.preset strong { display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); }
.preset span { display: block; margin-top: 7px; font: 10px var(--font-mono); color: var(--text-secondary); }
.config-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 20px; }
.config-fields :deep(.el-form-item__label) { height: auto; line-height: 20px; margin-bottom: 7px; font-size: 12px; }
.config-fields :deep(.el-input-number), .config-fields :deep(.el-select) { width: 100%; }
.span-two { grid-column: 1 / -1; }
.field-error { color: var(--error-color); font-size: 12px; }
.load-preview { padding: 20px; border-radius: 9px; background: var(--background-color-soft); align-self: start; position: sticky; top: 0; }
.preview-number { display: flex; align-items: baseline; gap: 10px; margin-top: 30px; font: 48px var(--font-mono); letter-spacing: -.06em; line-height: 1.2; }
.preview-number > span { font: 12px var(--font-sans); color: var(--text-muted); letter-spacing: 0; }
.load-shape { width: 100%; height: auto; margin: 18px 0 24px; }
.load-shape .axis { fill: none; stroke: var(--border-color); }
.load-shape .guide { fill: none; stroke: var(--border-color); stroke-dasharray: 4 5; }
.load-area { fill: rgba(var(--primary-rgb), .07); }
.load-line { fill: none; stroke: var(--primary-color); stroke-width: 2; }
.load-shape text { font: 10px var(--font-mono); fill: var(--text-muted); }
.plan-facts { margin: 0; }
.plan-facts > div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--border-color); font-size: 12px; }
.plan-facts dt { color: var(--text-muted); }.plan-facts dd { margin: 0; font-variant-numeric: tabular-nums; }
.preview-note, .draft-note { color: var(--text-muted); font-size: 11px; line-height: 1.8; margin: 18px 0; }
.run-heading { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0 14px; color: var(--text-secondary); font-size: 12px; }
.metric-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 24px 0; }
.metric-grid article { padding: 0 16px; border-right: 1px solid var(--border-color); font-variant-numeric: tabular-nums; }.metric-grid article:first-child { padding-left: 0; }.metric-grid article:last-child { border: 0; }
.metric-grid article > span { color: var(--text-muted); font-size: 11px; }.metric-grid strong { display: block; font: 27px var(--font-mono); margin: 12px 0 6px; letter-spacing: -.05em; }.metric-grid small { color: var(--text-muted); font: 10px var(--font-sans); letter-spacing: 0; }.metric-grid strong small { margin-left: 4px; }.metric-grid .has-errors strong { color: var(--error-color); }
.trend-section { padding: 20px 0 0; border-top: 1px solid var(--border-color); }.chart-empty { display: grid; place-items: center; height: 230px; color: var(--text-muted); font-size: 12px; }
.connection-alert { margin-top: 16px; }.log-section, .endpoint-section { margin-top: 20px; }.log-tools { display: flex; align-items: center; gap: 12px; }.log-tools .el-input { width: 160px; }.count { font-size: 11px; font-weight: 400; color: var(--text-muted); margin-left: 6px; }
.log-output { height: 135px; overflow: auto; background: var(--background-color-soft); border-radius: 6px; padding: 12px 14px; color: var(--text-secondary); font: 11px/1.8 var(--font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }.log-output .error-line { color: var(--error-color); }.log-output p { margin: 0; color: var(--text-muted); }
.history-tools { display: flex; gap: 8px; }.report-name { display: block; font-size: 12px; font-weight: 500; }.report-time { display: block; font-size: 10px; color: var(--text-muted); margin-top: 5px; }
.row-actions { display: flex; align-items: center; gap: 12px; white-space: nowrap; }.row-actions .action-slot { display: inline-flex; }.row-actions .action-slot .reuse-btn:disabled { pointer-events: none; }.row-actions :deep(.el-button + .el-button) { margin-left: 0; }
/* 复用配置：描边小按钮，hover 收敛到主色，避免与"查看报告"链接抢层级。用原生 button 规避全局 .el-button 的 !important 覆盖 */
.reuse-btn { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-family: var(--font-sans); font-size: 12px; font-weight: 500; line-height: 1; letter-spacing: .01em; cursor: pointer; transition: color var(--transition-fast), border-color var(--transition-fast), background-color var(--transition-fast); }
.reuse-icon { width: 13px; height: 13px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2.1; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--transition-normal); }
.reuse-spinner { width: 12px; height: 12px; flex-shrink: 0; border-radius: 50%; border: 1.5px solid currentColor; border-top-color: transparent; animation: reuse-spin .7s linear infinite; }
.reuse-btn:hover:not(:disabled) { color: var(--primary-color); border-color: rgba(var(--primary-rgb), .45); background: rgba(var(--primary-rgb), .10); }
.reuse-btn:hover:not(:disabled) .reuse-icon { transform: rotate(-30deg); }
.reuse-btn:active:not(:disabled) { background: rgba(var(--primary-rgb), .16); }
.reuse-btn:focus-visible { outline: 2px solid rgba(var(--primary-rgb), .5); outline-offset: 2px; }
.reuse-btn:disabled { opacity: .45; color: var(--text-muted); border-color: var(--border-color); background: transparent; cursor: not-allowed; }
@keyframes reuse-spin { to { transform: rotate(360deg); } }
.reuse-banner { margin-bottom: 16px; }.reuse-banner :deep(.el-alert__description) { margin: 0; }.reuse-banner-body { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 12px; line-height: 1.7; }.reuse-banner-body strong { font-weight: 600; }.reuse-banner-body .el-button { flex-shrink: 0; }
.workbench-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid var(--border-color); padding-top: 16px; text-align: left; }.footer-note { color: var(--text-muted); font-size: 11px; }.footer-actions { display: flex; align-items: center; flex-shrink: 0; gap: 8px; }.footer-actions .el-button + .el-button { margin-left: 0; }
@media (prefers-reduced-motion: reduce) { .reuse-icon { transition: none; }.reuse-btn:hover:not(:disabled) .reuse-icon { transform: none; } }
@media (max-width: 800px) { .config-layout { grid-template-columns: 1fr; gap: 20px; }.load-preview { position: static; }.metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 0; }.metric-grid article:nth-child(4) { padding-left: 0; }.section-heading, .workbench-footer { flex-wrap: wrap; }.footer-actions { flex-wrap: wrap; }.log-tools { flex-wrap: wrap; }.footer-note { width: 100%; }.preset-grid { gap: 6px; }.reuse-banner-body { flex-wrap: wrap; gap: 8px; } }
@media (max-width: 480px) { .config-fields { grid-template-columns: 1fr; }.span-two { grid-column: auto; }.preset-grid { grid-template-columns: 1fr; }.metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.metric-grid article { padding: 0 10px; }.workbench-heading { align-items: flex-start; }.log-tools .el-input { width: 130px; } }
</style>
