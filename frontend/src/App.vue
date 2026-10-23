<template>
  <el-config-provider :locale="zhCn">
    <div class="dashboard-shell" :style="{ '--analysis-banner-height': aiStore.analyzingBulk?.projectId ? '40px' : '0px' }">
      <div
        v-if="aiStore.analyzingBulk?.projectId"
        class="analyzing-banner"
      >
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>
          AI 批量分析进行中
          <template v-if="aiStore.analyzingBulk?.total">
            （{{ aiStore.analyzingBulk.processed ?? 0 }}/{{ aiStore.analyzingBulk.total }}）
          </template>
          <template v-if="aiStore.analyzingBulk?.failed">，失败 {{ aiStore.analyzingBulk.failed }} 个</template>
          <span class="analyzing-banner__hint">，可切换页面或刷新，完成后将通知</span>
        </span>
      </div>
      <router-view />
      <StressRunWidget />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useAuthStore } from './store/auth'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { Loading } from '@element-plus/icons-vue'
import { useAIStore } from './store/ai'
import StressRunWidget from './components/StressRunWidget.vue'
import { useStressStore } from './store/stress'

const aiStore = useAIStore()
const authStore = useAuthStore()
const stressStore = useStressStore()
watch(() => authStore.isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    void aiStore.restoreBulkAnalysis()
    void stressStore.restore()
  } else {
    aiStore.stopBulkPolling()
    stressStore.clear()
  }
}, { immediate: true })
</script>

<style scoped>
.analyzing-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 8px 16px;
  white-space: nowrap;
  font-size: 13px;
  color: var(--accent-soft);
  background: rgba(var(--primary-rgb), 0.12);
  border-bottom: 1px solid rgba(var(--primary-rgb), 0.2);
}
@media (max-width: 640px) {
  .analyzing-banner__hint { display: none; }
}
</style>
