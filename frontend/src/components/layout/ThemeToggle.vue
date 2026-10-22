<template>
  <button
    type="button"
    class="theme-toggle"
    :class="{ 'is-dark': theme.mode === 'dark' }"
    :aria-label="label"
    :title="label"
    :aria-pressed="theme.mode === 'dark'"
    @click="theme.toggle()"
  >
    <el-icon class="theme-toggle__icon theme-toggle__icon--sun" :size="17" aria-hidden="true"><Sunny /></el-icon>
    <el-icon class="theme-toggle__icon theme-toggle__icon--moon" :size="17" aria-hidden="true"><Moon /></el-icon>
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
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--card-background);
  color: var(--text-secondary);
  cursor: pointer;
  overflow: hidden;
  transition: color 180ms ease, background-color 180ms ease, border-color 180ms ease, transform 120ms ease;
}
.theme-toggle:hover {
  background: var(--surface-hover);
  border-color: var(--border-color-hover);
  color: var(--text-primary);
}
.theme-toggle:active {
  transform: scale(0.92);
}
.theme-toggle:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 3px;
}

.theme-toggle__icon {
  position: absolute;
  inset: 0;
  margin: auto;
  transition: opacity 220ms ease, transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.theme-toggle__icon--sun {
  opacity: 0;
  transform: rotate(-90deg) scale(0.5);
}
.theme-toggle__icon--moon {
  opacity: 1;
  transform: rotate(0) scale(1);
}
.theme-toggle.is-dark .theme-toggle__icon--sun {
  opacity: 1;
  transform: rotate(0) scale(1);
}
.theme-toggle.is-dark .theme-toggle__icon--moon {
  opacity: 0;
  transform: rotate(90deg) scale(0.5);
}

@media (prefers-reduced-motion: reduce) {
  .theme-toggle,
  .theme-toggle__icon {
    transition: none;
  }
}
</style>