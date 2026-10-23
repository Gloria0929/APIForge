<template>
  <div class="model-picker">
    <div class="model-picker__row">
      <el-select
        class="model-picker__input"
        :model-value="modelValue"
        :loading="loading"
        popper-class="ai-config-dropdown"
        placeholder="选择或直接输入模型名"
        aria-label="默认模型"
        filterable
        allow-create
        default-first-option
        :reserve-keyword="false"
        clearable
        @update:model-value="emit('update:modelValue', $event || '')"
      >
        <el-option v-for="model in modelOptions" :key="model" :label="model" :value="model" />
      </el-select>
      <el-button :loading="loading" :disabled="!canLoad" @click="loadModels">刷新</el-button>
    </div>
    <p v-if="error" class="model-picker__hint" role="status">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
// 不需要 API Key 的本地服务（Ollama 等）
const KEYLESS_PROVIDER_TYPES = new Set(['ollama'])
const needsApiKey = (providerType: string) => !KEYLESS_PROVIDER_TYPES.has(providerType)
const props = defineProps<{ modelValue: string; providerType: string; baseUrl: string; apiKey: string; providerId?: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const models = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const canLoad = computed(() => Boolean(
  props.baseUrl.trim() && (props.apiKey.trim() || props.providerId || !needsApiKey(props.providerType)),
))
const modelOptions = computed(() => [...new Set([...(props.modelValue ? [props.modelValue] : []), ...models.value])])
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
async function loadModels() {
  controller?.abort()
  if (!canLoad.value) { loading.value = false; return }
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = ''
  try {
    const { data } = await axios.post('/api/ai/providers/models', {
      providerId: props.providerId, providerType: props.providerType, baseUrl: props.baseUrl, apiKey: props.apiKey,
    }, { signal: request.signal })
    if (request.signal.aborted) return
    models.value = data.models || []
    if (!props.modelValue && models.value[0]) emit('update:modelValue', models.value[0])
    if (!models.value.length) error.value = '该提供商没有返回模型列表'
  } catch (e: any) {
    if (!request.signal.aborted) error.value = typeof e?.response?.data?.message === 'string' ? e.response.data.message : '获取模型列表失败'
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}
watch(() => [props.providerType, props.baseUrl, props.apiKey, props.providerId], () => {
  clearTimeout(timer)
  controller?.abort()
  models.value = []
  loading.value = false
  error.value = ''
  timer = setTimeout(loadModels, 500)
}, { immediate: true })
onBeforeUnmount(() => { clearTimeout(timer); controller?.abort() })
</script>
<style scoped>
.model-picker { width: 100%; }
.model-picker__row { display: flex; align-items: stretch; gap: 8px; }
.model-picker__row > .el-button { height: auto; }
.model-picker__input { flex: 1; min-width: 0; }
.model-picker__hint { margin-top: 6px; font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
</style>
