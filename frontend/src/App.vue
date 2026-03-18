<template>
  <el-config-provider :locale="zhCn">
    <div class="dashboard-shell">
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
          ，可切换页面，完成后将通知
        </span>
      </div>
      <router-view />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { Loading } from '@element-plus/icons-vue'
import { useAIStore } from './store/ai'

const aiStore = useAIStore()
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
  padding: 8px 16px;
  font-size: 13px;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.12);
  border-bottom: 1px solid rgba(99, 102, 241, 0.2);
}
</style>
