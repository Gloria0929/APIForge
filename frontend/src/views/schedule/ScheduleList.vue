<template>
  <PageContainerLayout
    title="定时任务"
    description="按 Cron 表达式定时执行测试套件或场景测试，支持启用/禁用。"
  >
    <template #toolbar>
      <el-button type="primary" @click="openCreateDialog">创建定时任务</el-button>
      <el-button
        v-if="selectedScheduleIds.length > 0"
        type="danger"
        plain
        :loading="deletingBulk"
        @click="deleteSelectedSchedules"
      >
        批量删除 ({{ selectedScheduleIds.length }})
      </el-button>
    </template>
    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">任务列表</div>
            <div class="app-panel-subtitle">Cron 表达式示例：0 0 * * *（每天 0 点）、*/5 * * * *（每 5 分钟）</div>
          </div>
        </div>
      </template>

      <el-table :data="pagedSchedules" v-loading="loading" row-key="id" style="width: 100%" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" :reserve-selection="false" />
        <el-table-column prop="name" label="任务名称" min-width="160" />
        <el-table-column prop="cron" label="Cron" width="140" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="scope">
            <el-tag size="small">{{ scope.row.type === 'suite' ? '测试套件' : '场景' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="enabled" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.enabled ? 'success' : 'info'" size="small">
              {{ scope.row.enabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上次执行" width="180">
          <template #default="scope">
            {{ scope.row.lastExecutedAt ? formatDate(scope.row.lastExecutedAt) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="下次执行" width="180">
          <template #default="scope">
            {{ scope.row.nextExecutedAt ? formatDate(scope.row.nextExecutedAt) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <div class="table-actions">
              <span class="table-action" @click="toggleEnabled(scope.row)">
                <el-icon><Switch /></el-icon>{{ scope.row.enabled ? '禁用' : '启用' }}
              </span>
              <span class="table-action" @click="openEditDialog(scope.row)"><el-icon><EditPen /></el-icon>编辑</span>
              <span class="table-action table-action--danger" @click="deleteSchedule(scope.row.id)"><el-icon><Delete /></el-icon>删除</span>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && schedules.length === 0" class="app-empty" description="创建定时任务后，系统将按 Cron 计划自动执行测试" />

      <div v-else class="app-pagination">
        <div class="app-pagination-copy">共 {{ total }} 条</div>
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[5, 10, 20, 50]"
          @current-change="handleCurrentChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <el-dialog :title="editingId ? '编辑定时任务' : '创建定时任务'" v-model="dialogVisible" width="560px" append-to-body>
      <el-form :model="form" label-width="110px">
        <el-form-item label="任务名称" required>
          <el-input v-model="form.name" placeholder="例如：每日回归测试" />
        </el-form-item>
        <el-form-item label="Cron 表达式" required>
          <el-input v-model="form.cron" placeholder="0 0 * * *（每天 0 点）" />
        </el-form-item>
        <el-form-item label="执行类型" required>
          <el-radio-group v-model="form.type">
            <el-radio-button value="suite">测试套件</el-radio-button>
            <el-radio-button value="scenario">场景测试</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.type === 'suite'" label="测试用例 ID" required>
          <el-select
            v-model="form.targetIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择要执行的用例"
            style="width: 100%"
            popper-class="ai-config-dropdown"
          >
            <el-option v-for="tc in testCases" :key="tc.id" :label="tc.name" :value="tc.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="场景" required>
          <el-select v-model="form.targetId" placeholder="选择场景" style="width: 100%">
            <el-option v-for="s in scenarios" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="执行环境" required>
          <el-select v-model="form.environmentId" placeholder="选择环境" style="width: 100%">
            <el-option v-for="e in environments" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSchedule">保存</el-button>
      </template>
    </el-dialog>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { EditPen, Delete, Switch } from '@element-plus/icons-vue'
import { usePagination } from '../../composables/usePagination'
import { message, confirmAction } from '../../utils/message'
import { formatDateTime } from '../../utils/date'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'

const route = useRoute()
const projectId = computed(() => route.params.id as string)

const schedules = ref<any[]>([])
const loading = ref(false)
const deletingBulk = ref(false)
const selectedSchedules = ref<any[]>([])
const selectedScheduleIds = computed(() => selectedSchedules.value.map((s) => s.id))
const testCases = ref<any[]>([])
const scenarios = ref<any[]>([])
const environments = ref<any[]>([])
const { currentPage, pageSize, total, pagedItems: pagedSchedules, handleCurrentChange, handleSizeChange, resetPage } = usePagination(schedules, 10)

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const form = ref({
  name: '',
  cron: '0 0 * * *',
  type: 'suite' as 'suite' | 'scenario',
  targetId: '',
  targetIds: [] as string[],
  environmentId: '',
  enabled: true
})

watch(schedules, () => resetPage())

const handleSelectionChange = (rows: any[]) => {
  selectedSchedules.value = rows
}

onMounted(async () => {
  await Promise.all([fetchSchedules(), fetchOptions()])
})

const formatDate = (d: string | Date) => formatDateTime(d)

const fetchSchedules = async () => {
  loading.value = true
  try {
    const res = await axios.get(`/api/schedules?projectId=${projectId.value}`)
    schedules.value = Array.isArray(res.data) ? res.data : []
  } catch (e) {
    console.error('Failed to fetch schedules:', e)
    schedules.value = []
  } finally {
    loading.value = false
  }
}

const fetchOptions = async () => {
  try {
    const [tcRes, scRes, envRes] = await Promise.all([
      axios.get(`/api/tests?projectId=${projectId.value}`),
      axios.get(`/api/tests/scenarios?projectId=${projectId.value}`),
      axios.get(`/api/environments?projectId=${projectId.value}`)
    ])
    testCases.value = Array.isArray(tcRes.data) ? tcRes.data : []
    scenarios.value = Array.isArray(scRes.data) ? scRes.data : []
    environments.value = Array.isArray(envRes.data) ? envRes.data : []
  } catch (e) {
    console.error('Failed to fetch options:', e)
  }
}

const openCreateDialog = () => {
  editingId.value = null
  form.value = {
    name: '',
    cron: '0 0 * * *',
    type: 'suite',
    targetId: '',
    targetIds: [],
    environmentId: environments.value[0]?.id || '',
    enabled: true
  }
  dialogVisible.value = true
}

const openEditDialog = (s: any) => {
  editingId.value = s.id
  const targetIds = s.type === 'suite' ? (s.targetId?.startsWith('[') ? JSON.parse(s.targetId || '[]') : (s.targetId || '').split(',').filter(Boolean)) : []
  form.value = {
    name: s.name,
    cron: s.cron,
    type: s.type,
    targetId: s.type === 'scenario' ? s.targetId : '',
    targetIds,
    environmentId: s.environmentId,
    enabled: s.enabled !== false
  }
  dialogVisible.value = true
}

const saveSchedule = async () => {
  const name = String(form.value.name || '').trim()
  if (!name) {
    message.warning('请输入任务名称')
    return
  }
  if (!form.value.cron?.trim()) {
    message.warning('请输入 Cron 表达式')
    return
  }
  const targetId = form.value.type === 'suite'
    ? JSON.stringify(form.value.targetIds || [])
    : form.value.targetId
  if (!targetId || (form.value.type === 'suite' && (form.value.targetIds || []).length === 0)) {
    message.warning(form.value.type === 'suite' ? '请选择测试用例' : '请选择场景')
    return
  }
  if (!form.value.environmentId) {
    message.warning('请选择执行环境')
    return
  }

  saving.value = true
  try {
    const payload = {
      projectId: projectId.value,
      name,
      cron: form.value.cron.trim(),
      type: form.value.type,
      targetId,
      environmentId: form.value.environmentId,
      enabled: form.value.enabled
    }
    if (editingId.value != null) {
      await axios.put(`/api/schedules/${editingId.value}`, payload)
      message.success('定时任务已更新')
    } else {
      await axios.post('/api/schedules', payload)
      message.success('定时任务已创建')
    }
    dialogVisible.value = false
    await fetchSchedules()
  } catch (e) {
    console.error('Save schedule failed:', e)
    message.error(e, '保存失败')
  } finally {
    saving.value = false
  }
}

const toggleEnabled = async (s: any) => {
  try {
    await axios.put(`/api/schedules/${s.id}`, { ...s, enabled: !s.enabled })
    message.success(s.enabled ? '已禁用' : '已启用')
    await fetchSchedules()
  } catch (e) {
    console.error('Toggle failed:', e)
    message.error(e, '操作失败')
  }
}

const deleteSchedule = async (id: number) => {
  try {
    await confirmAction('确定删除该定时任务吗？', '删除确认', { confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch {
    return
  }
  try {
    await axios.delete(`/api/schedules/${id}`)
    selectedSchedules.value = selectedSchedules.value.filter((s) => s.id !== id)
    await fetchSchedules()
    message.success('定时任务已删除')
  } catch (e) {
    console.error('Delete failed:', e)
    message.error(e, '删除失败')
  }
}

const deleteSelectedSchedules = async () => {
  const ids = selectedScheduleIds.value
  if (ids.length === 0) return
  try {
    await confirmAction(`确定删除选中的 ${ids.length} 个定时任务吗？此操作不可恢复。`, '批量删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  deletingBulk.value = true
  try {
    const res = await axios.post('/api/schedules/bulk-delete', { ids })
    await fetchSchedules()
    selectedSchedules.value = []
    message.success(`已删除 ${(res.data as { deleted?: number })?.deleted ?? ids.length} 个定时任务`)
  } catch (e) {
    console.error('Bulk delete failed:', e)
    message.error(e, '批量删除失败')
  } finally {
    deletingBulk.value = false
  }
}
</script>
