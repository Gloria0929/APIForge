<template>
  <el-container class="page-container" :class="containerClass">
    <div v-if="$slots.header || kicker || title || description || badge" class="page-container__header">
      <slot name="header">
        <div class="page-container__header-inner">
          <div class="page-container__header-copy">
            <nav v-if="breadcrumbs.length" class="page-breadcrumb">
              <template v-for="(crumb, i) in breadcrumbs" :key="i">
                <router-link v-if="crumb.to" :to="crumb.to" class="page-breadcrumb__link">{{ crumb.label }}</router-link>
                <span v-else class="page-breadcrumb__current">{{ crumb.label }}</span>
                <el-icon v-if="i < breadcrumbs.length - 1" class="page-breadcrumb__sep" :size="14"><CaretRight /></el-icon>
              </template>
            </nav>
            <div class="flex flex-wrap items-center gap-3">
              <h2 class="page-container__title">{{ title }}</h2>
              <span v-if="badge" class="page-container__badge">{{ badge }}</span>
            </div>
            <p v-if="description" class="page-container__desc">{{ description }}</p>
          </div>
          <div v-if="$slots.toolbar" class="page-container__toolbar">
            <slot name="toolbar" />
          </div>
        </div>
      </slot>
    </div>

    <el-main class="page-container__main">
      <div class="page-container__content">
        <slot />
      </div>
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { CaretRight } from '@element-plus/icons-vue'

export interface BreadcrumbItem {
  label: string
  to?: string
}

withDefaults(defineProps<{
  kicker?: string
  title?: string
  description?: string
  badge?: string
  footerText?: string
  containerClass?: string
  breadcrumbs?: BreadcrumbItem[]
}>(), {
  kicker: '',
  title: '',
  description: '',
  badge: '',
  footerText: '',
  containerClass: '',
  breadcrumbs: () => [],
})
</script>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  gap: 0;
  overflow: visible;
}

.page-container__header {
  flex: none;
  padding: 0;
  border-bottom: 1px solid var(--border-color);
  background: rgba(17, 17, 20, 0.9);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
  overflow: hidden;
}

.page-container__header-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
}

@media (min-width: 1024px) {
  .page-container__header-inner {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }
}

.page-container__header-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.page-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  margin-bottom: 4px;
  font-weight: 500;
}

.page-breadcrumb__link {
  color: #a1a1aa;
  text-decoration: none;
  transition: color 0.15s;
}

.page-breadcrumb__link:hover {
  color: #a5b4fc;
}

.page-breadcrumb__sep {
  color: #5c5c67;
  font-size: 14px;
  user-select: none;
}

.page-breadcrumb__current {
  color: #ededf0;
  font-weight: 600;
}

.page-container__title {
  font-family: var(--font-sans);
  font-size: clamp(1.15rem, 1.8vw, 1.5rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #ededf0;
  margin: 0;
  line-height: 1.3;
}

.page-container__badge {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  border: 1px solid rgba(99, 102, 241, 0.15);
  background: rgba(99, 102, 241, 0.06);
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  color: #a5b4fc;
  white-space: nowrap;
}

.page-container__desc {
  max-width: 640px;
  font-size: 13px;
  line-height: 1.6;
  color: #8b8b96;
  margin: 0;
}

.page-container__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.page-container__main {
  flex: 1 1 auto;
  padding: 20px 24px;
  overflow: visible !important;
}

.page-container__content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 100%;
  margin: 0;
  animation: pageContentReveal 0.3s ease-out both;
}

.page-container__footer {
  flex: none;
  padding: 12px 24px;
  border-top: 1px solid var(--border-color);
  background: rgba(17, 17, 20, 0.5);
}

.page-container__footer-copy {
  font-size: 11px;
  color: #5c5c67;
}

@keyframes pageContentReveal {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .page-container__header-inner {
    padding: 18px 16px;
  }

  .page-container__main {
    padding: 18px 16px;
  }

  .page-container__footer {
    padding: 12px 16px;
  }

  .page-container__toolbar {
    width: 100%;
  }
}
</style>
