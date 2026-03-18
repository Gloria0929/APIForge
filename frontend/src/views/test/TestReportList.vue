<template>
  <PageContainerLayout
    title="测试报告"
    description="按环境和执行结果回看历史报告，支持分页、导出以及双报告差异对比。"
  >
    <template #toolbar>
      <el-button @click="compareSelected">对比所选</el-button>
      <el-button
        v-if="selectedIds.length > 0"
        type="danger"
        plain
        :loading="deletingBulk"
        @click="deleteSelected"
      >
        批量删除 ({{ selectedIds.length }})
      </el-button>
    </template>
    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">报告列表</div>
            <div class="app-panel-subtitle">快速查看通过率、总耗时与导出文件。</div>
          </div>
        </div>
      </template>

      <el-table
          :data="pagedReports"
          :row-class-name="reportRowClassName"
          v-loading="loading"
          row-key="id"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
        <el-table-column type="selection" width="48" :reserve-selection="false" />
        <el-table-column prop="name" label="报告名称" min-width="220" show-overflow-tooltip />
        <el-table-column prop="environment" label="环境" min-width="140" />
        <el-table-column label="总用例" width="100">
          <template #default="scope">{{ parseSummary(scope.row).total }}</template>
        </el-table-column>
        <el-table-column label="通过率" width="120">
          <template #default="scope">
            <span class="report-pass-rate">
              <el-icon v-if="parseSummary(scope.row).passRate === 100" class="report-pass-rate__icon report-pass-rate__icon--success"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="parseSummary(scope.row).passRate > 0" class="report-pass-rate__icon report-pass-rate__icon--warning"><WarningFilled /></el-icon>
              <el-icon v-else class="report-pass-rate__icon report-pass-rate__icon--danger"><CircleCloseFilled /></el-icon>
              <el-tag :type="tagType(parseSummary(scope.row).passRate)">{{ parseSummary(scope.row).passRate }}%</el-tag>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="总耗时" width="120">
          <template #default="scope">{{ parseSummary(scope.row).duration }}ms</template>
        </el-table-column>
        <el-table-column label="创建时间" width="200">
          <template #default="scope">{{ formatDate(scope.row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="scope">
            <div class="table-actions">
              <span class="table-action table-action--primary" @click="viewReport(scope.row.id)"><el-icon><View /></el-icon>查看</span>
              <el-dropdown trigger="click" @command="(cmd: string) => handleExportCommand(scope.row.id, cmd)">
                <span class="table-action"><el-icon><Download /></el-icon>导出<el-icon class="el-icon--right"><ArrowDown /></el-icon></span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="json">JSON</el-dropdown-item>
                    <el-dropdown-item command="html">HTML</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-dropdown trigger="click" @command="(cmd: string) => handleMoreCommand(scope.row.id, cmd)">
                <span class="table-action">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="delete"><el-icon><Delete /></el-icon>删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && reports.length === 0" class="app-empty" description="执行用例或场景后将在此生成报告，支持导出与对比" />

      <div v-else class="app-pagination">
        <div class="app-pagination-copy">归档 {{ total }} 条</div>
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
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { View, Download, Delete, ArrowDown, CircleCheckFilled, WarningFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { usePagination } from '../../composables/usePagination'
import { message, confirmAction } from '../../utils/message'
import { formatDateTime } from '../../utils/date'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => route.params.id as string)

const reports = ref<any[]>([])
const loading = ref(false)
const deletingBulk = ref(false)
const selectedReports = ref<any[]>([])
const selectedIds = computed(() => selectedReports.value.map((r) => r.id))
const { currentPage, pageSize, total, pagedItems: pagedReports, handleCurrentChange, handleSizeChange, resetPage } = usePagination(reports, 10)

watch(reports, () => resetPage())

onMounted(async () => {
  await fetchReports()
})

const fetchReports = async () => {
  loading.value = true
  try {
    const response = await axios.get(`/api/tests/reports?projectId=${projectId.value}`)
    reports.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    console.error('Failed to fetch reports:', error)
    reports.value = []
    message.error(error, '加载报告失败')
  } finally {
    loading.value = false
  }
}

const parseSummary = (report: any) => {
  try {
    return typeof report?.summary === 'string' ? JSON.parse(report.summary) : (report?.summary || {})
  } catch {
    return {}
  }
}

const tagType = (passRate: number) => {
  if (passRate === 100) return 'success'
  if (passRate > 0) return 'warning'
  return 'danger'
}

const reportRowClassName = ({ row }: { row: any }) => {
  const passRate = parseSummary(row).passRate ?? 0
  if (passRate === 100) return 'report-row--success'
  if (passRate > 0) return 'report-row--partial'
  return 'report-row--failed'
}

const formatDate = (dateString: string) => formatDateTime(dateString)

const viewReport = (reportId: string) => {
  router.push(`/projects/${projectId.value}/tests/reports/${reportId}`)
}

const handleSelectionChange = (rows: any[]) => {
  selectedReports.value = rows
}

const compareSelected = () => {
  if (selectedIds.value.length !== 2) {
    message.warning('请选择两份报告进行对比')
    return
  }
  router.push(`/projects/${projectId.value}/tests/reports/compare?a=${selectedIds.value[0]}&b=${selectedIds.value[1]}`)
}

const deleteReport = async (reportId: string) => {
  try {
    await confirmAction('确定要删除该测试报告吗？删除后不可恢复。', '删除报告', {
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  try {
    await axios.delete(`/api/tests/reports/${reportId}`)
    selectedReports.value = selectedReports.value.filter((r) => r.id !== reportId)
    await fetchReports()
    message.success('报告已删除')
  } catch (error) {
    console.error('Failed to delete report:', error)
    message.error(error, '删除失败')
  }
}

const deleteSelected = async () => {
  const ids = selectedIds.value
  if (ids.length === 0) return
  try {
    await confirmAction(`确定删除选中的 ${ids.length} 份测试报告吗？此操作不可恢复。`, '批量删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  deletingBulk.value = true
  try {
    const res = await axios.post('/api/tests/reports/bulk-delete', { ids })
    await fetchReports()
    selectedReports.value = []
    message.success(`已删除 ${(res.data as { deleted?: number })?.deleted ?? ids.length} 份报告`)
  } catch (error) {
    console.error('Failed to bulk delete reports:', error)
    message.error(error, '批量删除失败')
  } finally {
    deletingBulk.value = false
  }
}

const handleExportCommand = async (reportId: string, cmd: string) => {
  if (cmd !== 'json' && cmd !== 'html') return
  try {
    await confirmAction(`确定导出该报告为 ${cmd.toUpperCase()} 格式吗？`, '导出确认')
  } catch {
    return
  }
  await exportReport(reportId, cmd)
}

const handleMoreCommand = async (reportId: string, cmd: string) => {
  if (cmd === 'delete') {
    await deleteReport(reportId)
  }
}

const exportReport = async (reportId: string, format: 'json' | 'html') => {
  try {
    const response = await axios.get(`/api/tests/reports/${reportId}/export?format=${format}`, {
      responseType: 'blob'
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `report-${reportId}.${format}`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    message.success(`报告已导出为 ${format.toUpperCase()}`)
  } catch (error) {
    console.error('Failed to export report:', error)
    message.error(error, '导出失败')
  }
}
</script>

<style scoped>
.report-pass-rate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.report-pass-rate__icon {
  font-size: 16px;
}

.report-pass-rate__icon--success {
  color: var(--success-color);
}

.report-pass-rate__icon--warning {
  color: var(--warning-color);
}

.report-pass-rate__icon--danger {
  color: var(--error-color);
}

/* 已去除行左侧竖条与背景色，避免与内容重叠；通过率仍由图标与标签展示 */
</style>
