<template>
  <div
    v-if="visible"
    ref="widgetRef"
    class="stress-widget"
    :class="{ 'is-expanded': expanded, 'is-dragging': dragging }"
    :style="widgetStyle"
  >
    <button
      class="stress-chip"
      type="button"
      @pointerdown="onPointerDown"
      @click="onChipClick"
    >
      <span class="stress-dot" :class="statusClass" />
      <span class="stress-title">{{ statusText }}</span>
      <span class="stress-meta">{{ total }} 请求 · {{ rps }} rps</span>
      <el-icon class="stress-chevron">
        <ArrowUp v-if="expanded" />
        <ArrowDown v-else />
      </el-icon>
    </button>

    <div v-if="expanded" class="stress-panel">
      <el-progress :percentage="percent" :status="progressStatus" :stroke-width="6" />
      <div class="stress-stats">
        <span>失败 <strong>{{ failed }}</strong></span>
        <span>已运行 <strong>{{ elapsed }}s</strong></span>
        <span v-if="run?.summary">P95 <strong>{{ run.performance?.p95ResponseTime ?? 0 }}ms</strong></span>
      </div>
      <div v-if="run?.error" class="stress-error">{{ run.error }}</div>
      <div v-if="store.connectionError" class="stress-error">{{ store.connectionError }}</div>
      <div class="stress-log">
        <div v-for="(line, index) in logs" :key="index">{{ line }}</div>
        <div v-if="!logs.length" class="stress-log-empty">等待 Locust 输出…</div>
      </div>
      <div class="stress-actions">
        <el-button type="primary" size="small" @click="openWorkbench">打开工作台</el-button>
        <el-button v-if="run?.reportId" type="primary" size="small" @click="openReport">查看报告</el-button>
        <el-button v-if="store.running" type="danger" size="small" :disabled="!run?.id || run.status === 'stopping'" @click="store.stop()">停止</el-button>
        <el-button v-if="store.running" size="small" @click="expanded = false">收起</el-button>
        <el-button v-else size="small" @click="store.dismiss()">关闭</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { useStressStore } from '../store/stress'

const store = useStressStore()
const router = useRouter()
const expanded = ref(false)
const widgetRef = ref<HTMLElement | null>(null)
const position = ref<{ x: number; y: number } | null>(null)
const dragging = ref(false)
let dragStart = { x: 0, y: 0, left: 0, top: 0 }
let moved = false

const widgetStyle = computed(() =>
  position.value
    ? { left: `${position.value.x}px`, top: `${position.value.y}px`, bottom: 'auto' }
    : undefined
)

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0 || !widgetRef.value) return
  const rect = widgetRef.value.getBoundingClientRect()
  dragStart = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
  moved = false
  dragging.value = true
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value || !widgetRef.value) return
  const dx = event.clientX - dragStart.x
  const dy = event.clientY - dragStart.y
  if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return
  moved = true
  const element = widgetRef.value
  const maxX = Math.max(8, window.innerWidth - element.offsetWidth - 8)
  const maxY = Math.max(8, window.innerHeight - element.offsetHeight - 8)
  position.value = {
    x: Math.min(Math.max(8, dragStart.left + dx), maxX),
    y: Math.min(Math.max(8, dragStart.top + dy), maxY),
  }
}

const onPointerUp = () => {
  dragging.value = false
  window.removeEventListener('pointermove', onPointerMove)
}

const onChipClick = () => {
  if (moved) {
    moved = false
    return
  }
  expanded.value = !expanded.value
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
})

const visible = computed(() => Boolean(store.run) && !store.dialogOpen)
const run = computed(() => store.run)
const total = computed(() => run.value?.progress?.total ?? 0)
const failed = computed(() => run.value?.progress?.failed ?? 0)
const rps = computed(() => run.value?.progress?.rps ?? 0)
const elapsed = computed(() => run.value?.progress?.elapsedSeconds ?? 0)
const logs = computed(() => (run.value?.logs || []).slice(-6))
const statusText = computed(() => `压测${store.statusText}`)
const statusClass = computed(() => `is-${run.value?.status || 'running'}`)
const progressStatus = computed(() =>
  run.value?.status === 'failed' ? 'exception' : run.value?.status === 'completed' ? 'success' : undefined
)
const percent = computed(() => store.percent)
const openWorkbench = () => {
  router.push({ path: `/projects/${store.projectId}/scenarios/${store.scenarioId}`, query: { stress: `${run.value?.id || 'active'}-${Date.now()}` } })
}
const openReport = () => {
  const reportId = run.value?.reportId
  if (!reportId) return
  router.push(`/projects/${store.projectId}/tests/reports/${reportId}`)
}
</script>

<style scoped>
.stress-widget {
  position: fixed;
  left: 24px;
  bottom: 24px;
  z-index: 3000;
  width: 300px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--card-background);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
.stress-chip {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  text-align: left;
}
.stress-widget.is-dragging .stress-chip {
  cursor: grabbing;
}
.stress-chip:hover {
  background: var(--surface-hover);
}
.stress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--primary-color);
}
.stress-dot.is-running {
  animation: stress-pulse 1.2s ease-in-out infinite;
}
.stress-dot.is-completed {
  background: var(--success-color);
  animation: none;
}
.stress-dot.is-failed {
  background: var(--error-color);
  animation: none;
}
@keyframes stress-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.stress-title {
  font-weight: 600;
  white-space: nowrap;
}
.stress-meta {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.stress-chevron {
  color: var(--text-secondary);
  flex: none;
}
.stress-panel {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
}
.stress-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
.stress-stats strong {
  color: var(--text-primary);
  margin-left: 2px;
}
.stress-error {
  font-size: 12px;
  color: var(--error-color);
  word-break: break-all;
}
.stress-log {
  max-height: 96px;
  overflow: auto;
  padding: 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}
.stress-log-empty {
  opacity: 0.7;
}
.stress-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
