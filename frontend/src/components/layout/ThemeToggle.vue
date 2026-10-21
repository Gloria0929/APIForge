<template>
  <button
    type="button"
    class="theme-toggle"
    :aria-label="label"
    :title="label"
    :aria-pressed="theme.mode === 'dark'"
    @click="theme.toggle()"
  >
    <el-icon :size="17" aria-hidden="true">
      <Sunny v-if="theme.mode === 'dark'" />
      <Moon v-else />
    </el-icon>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sunny } from '@element-plus/icons-vue'
import { useThemeStore } from '../../store/theme'

const theme = useThemeStore()
const label = computed(() => `切换到${theme.mode === 'dark' ? '亮色' : '暗色'}模式`)
</script>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--card-background);
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 150ms, background-color 150ms, border-color 150ms;
}
.theme-toggle:hover {
  background: var(--surface-hover);
  border-color: var(--border-color-hover);
  color: var(--text-primary);
}
.theme-toggle:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 3px;
}
</style>
