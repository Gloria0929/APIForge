<template>
  <span class="pill" :class="available ? 'ok' : 'bad'">
    {{ available ? "AI 可用" : "AI 不可用" }}
  </span>
</template>

<script setup lang="ts">
defineProps<{ available: boolean }>();
</script>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
}
.ok {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 10%, white);
  border-color: color-mix(in srgb, var(--el-color-success) 25%, white);
}
.bad {
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 10%, white);
  border-color: color-mix(in srgb, var(--el-color-danger) 25%, white);
}
</style>

