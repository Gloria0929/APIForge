<template>
  <el-form-item v-if="status === 'supported' && levels.length" label="思考程度" class="provider-reasoning-field">
    <el-select class="reasoning-picker" :model-value="modelValue"
      placeholder="使用模型默认值" popper-class="ai-config-dropdown" @update:model-value="emit('update:modelValue', $event)">
      <el-option label="默认（不设置）" value="" />
      <el-option v-for="level in levels" :key="level" :label="levelLabel(level)" :value="level" />
    </el-select>
  </el-form-item>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
const props = defineProps<{ modelValue: string; model: string; providerType: string; baseUrl: string; apiKey: string; providerId?: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; loading: [value: boolean] }>()
const levels = ref<string[]>([])
const status = ref<'supported' | 'unsupported' | 'unknown'>('unknown')
const canDetect = computed(() => Boolean(props.model.trim() && props.baseUrl.trim() && (props.apiKey.trim() || props.providerId)))
const labels: Record<string, string> = { none: '关闭', minimal: '最少', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高' }
const levelLabel = (level: string) => labels[level] ? `${labels[level]}（${level}）` : level
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
function setLoading(value: boolean) { emit('loading', value) }
async function detect() {
  clearTimeout(timer)
  controller?.abort()
  if (!canDetect.value) { setLoading(false); return }
  const request = new AbortController()
  controller = request
  setLoading(true)
  try {
    const { data } = await axios.post('/api/ai/providers/reasoning', {
      providerId: props.providerId, providerType: props.providerType, baseUrl: props.baseUrl,
      apiKey: props.apiKey, model: props.model,
    }, { signal: request.signal, timeout: 180000 })
    if (request.signal.aborted) return
    levels.value = Array.isArray(data.levels) ? data.levels : []
    status.value = data.status
    if (data.status !== 'unknown' && props.modelValue && !levels.value.includes(props.modelValue)) emit('update:modelValue', '')
  } catch {
    if (request.signal.aborted) return
    status.value = 'unknown'
    levels.value = []
  } finally {
    if (!request.signal.aborted) setLoading(false)
  }
}
watch(() => [props.model, props.providerType, props.baseUrl, props.apiKey, props.providerId], (_value, previous) => {
  clearTimeout(timer)
  controller?.abort()
  levels.value = []
  status.value = 'unknown'
  if (previous && props.modelValue) emit('update:modelValue', '')
  setLoading(canDetect.value)
  timer = setTimeout(detect, 500)
}, { immediate: true })
onBeforeUnmount(() => { clearTimeout(timer); controller?.abort(); emit('loading', false) })
</script>
<style scoped>
.reasoning-picker { width: 100%; }
</style>
