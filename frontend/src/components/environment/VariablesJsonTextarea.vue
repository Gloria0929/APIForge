<template>
  <el-form-item :label="label">
    <el-input
      v-model="model"
      type="textarea"
      :rows="rows"
      placeholder='例如：[{"key":"token","value":"abc","type":"string"}]'
    />
    <div class="hint">支持变量占位：<code>{{ "{{token}}" }}</code></div>
  </el-form-item>
</template>

<script setup lang="ts">
const model = defineModel<string>({ required: true });

withDefaults(
  defineProps<{
    label?: string;
    rows?: number;
  }>(),
  {
    label: "变量 (JSON)",
    rows: 8,
  },
);
</script>

<style scoped>
.hint {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>

