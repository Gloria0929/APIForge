<template>
  <div class="reasoning-picker">
    <div class="reasoning-picker__row">
      <el-select :model-value="modelValue" :loading="loading" :disabled="loading || status !== 'supported'"
        placeholder="使用模型默认值" popper-class="ai-config-dropdown" @update:model-value="emit('update:modelValue', $event)">
        <el-option label="默认（不设置）" value="" />
        <el-option v-for="level in levels" :key="level" :label="levelLabel(level)" :value="level" />
      </el-select>
      <el-button :loading="loading" :disabled="!canDetect" @click="detect">重新检测</el-button>
    </div>
    <p class="reasoning-picker__hint" role="status">{{ hint }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
const props = defineProps<{ modelValue: string; model: string; providerType: string; baseUrl: string; apiKey: string; providerId?: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; loading: [value: boolean] }>()
const levels = ref<string[]>([])
const status = ref<'supported' | 'unsupported' | 'unknown'>('unknown')
const loading = ref(false)
const error = ref('')
const source = ref('')
const canDetect = computed(() => Boolean(props.model.trim() && props.baseUrl.trim() && (props.apiKey.trim() || props.providerId)))
const labels: Record<string, string> = { none: '关闭', minimal: '最少', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高' }
const levelLabel = (level: string) => labels[level] ? `${labels[level]}（${level}）` : level
const hint = computed(() => {
  if (loading.value) return '正在检测当前模型实际支持的思考档位…'
  if (error.value) return error.value
  if (!canDetect.value) return '填写 API 地址、API Key 并选择模型后自动检测。'
  if (status.value === 'supported') return `已${source.value === 'metadata' ? '从模型信息读取' : '通过接口验证'}：${levels.value.join(' / ')}。`
  if (status.value === 'unsupported') return '当前模型接口不支持可调思考档位，使用模型默认值。'
  if (props.modelValue) return '暂未确认可用档位，已保留原设置，可点击重新检测。'
  return '服务商未返回可确认的思考档位，使用模型默认值。'
})
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
function setLoading(value: boolean) { loading.value = value; emit('loading', value) }
async function detect() {
  clearTimeout(timer)
  controller?.abort()
  if (!canDetect.value) { setLoading(false); return }
  const request = new AbortController()
  controller = request
  setLoading(true)
  error.value = ''
  try {
    const { data } = await axios.post('/api/ai/providers/reasoning', {
      providerId: props.providerId, providerType: props.providerType, baseUrl: props.baseUrl,
      apiKey: props.apiKey, model: props.model,
    }, { signal: request.signal, timeout: 180000 })
    if (request.signal.aborted) return
    levels.value = Array.isArray(data.levels) ? data.levels : []
    status.value = data.status
    source.value = data.source || ''
    if (data.status !== 'unknown' && props.modelValue && !levels.value.includes(props.modelValue)) emit('update:modelValue', '')
  } catch (e: any) {
    if (request.signal.aborted) return
    status.value = 'unknown'
    levels.value = []
    error.value = typeof e?.response?.data?.message === 'string' ? e.response.data.message : '思考档位检测失败，可点击重新检测。'
  } finally {
    if (!request.signal.aborted) setLoading(false)
  }
}
watch(() => [props.model, props.providerType, props.baseUrl, props.apiKey, props.providerId], (_value, previous) => {
  clearTimeout(timer)
  controller?.abort()
  levels.value = []
  status.value = 'unknown'
  error.value = ''
  if (previous && props.modelValue) emit('update:modelValue', '')
  setLoading(canDetect.value)
  timer = setTimeout(detect, 500)
}, { immediate: true })
onBeforeUnmount(() => { clearTimeout(timer); controller?.abort(); emit('loading', false) })
</script>
<style scoped>
.reasoning-picker { width: 100%; }
.reasoning-picker__row { display: flex; gap: 8px; }
.reasoning-picker__row .el-select { flex: 1; min-width: 0; }
.reasoning-picker__hint { margin: 6px 0 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
</style>
