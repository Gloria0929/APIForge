<template>
  <PageContainerLayout
    title="测试用例"
    description="集中管理请求、断言、导入导出与批量执行，形成可复用的接口回归资产。"
  >
    <template #toolbar>
      <el-button @click="openImportDialog">导入</el-button>
      <el-button :disabled="tests.length === 0" @click="exportTests">导出</el-button>
      <el-button
        type="success"
        :loading="executingAll"
        :disabled="tests.length === 0"
        @click="executeAll"
      >
        一键执行
      </el-button>
      <el-button type="primary" @click="openCreateDialog">创建测试用例</el-button>
      <el-button
        v-if="selectedTestIds.length > 0"
        type="danger"
        plain
        :loading="deletingBulk"
        @click="deleteSelectedTests"
      >
        批量删除 ({{ selectedTestIds.length }})
      </el-button>
    </template>
    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">用例列表</div>
            <div class="app-panel-subtitle">支持搜索、分页查看、快速执行、复制与批量导入。</div>
          </div>
          <el-input
            v-model="searchQuery"
            placeholder="搜索用例名称 / 描述 / ID"
            class="test-search-input w-full md:max-w-xs"
            clearable
          />
        </div>
      </template>

      <el-table :data="pagedTests" v-loading="loading" row-key="id" style="width: 100%" @selection-change="handleSelectionChange">
          <el-table-column type="selection" width="48" :reserve-selection="false" />
          <el-table-column prop="name" label="用例名称" min-width="120" />
          <el-table-column prop="apiId" label="关联 API" min-width="180" />
          <el-table-column prop="priority" label="优先级" width="100" />
          <el-table-column label="操作" width="320" fixed="right">
            <template #default="scope">
              <div class="table-actions">
                <span class="table-action table-action--primary" @click="navigateToTest(scope.row.id)"><el-icon><View /></el-icon>详情</span>
                <span class="table-action table-action--success" @click="executeOne(scope.row)"><el-icon><CaretRight /></el-icon>执行</span>
                <span class="table-action" @click="cloneTest(scope.row.id)"><el-icon><CopyDocument /></el-icon>复制</span>
                <span class="table-action" @click="openEditDialog(scope.row)"><el-icon><EditPen /></el-icon>编辑</span>
                <span class="table-action table-action--danger" @click="deleteTest(scope.row.id)"><el-icon><Delete /></el-icon>删除</span>
              </div>
            </template>
        </el-table-column>
      </el-table>

      <el-empty
        v-if="!loading && (tests.length === 0 || filteredTests.length === 0)"
        class="app-empty"
        :description="tests.length === 0 ? '创建用例或导入 Postman/JSON 后即可一键执行' : '未找到匹配的用例，请调整搜索条件'"
      />

      <div v-else class="app-pagination">
        <div class="app-pagination-copy">第 {{ currentPage }} 页 · 每页 {{ pageSize }} 条</div>
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

    <el-dialog
      title="导入测试用例"
      v-model="importDialogVisible"
      width="560px"
      append-to-body
      class="import-dialog-modal"
    >
      <div class="import-dialog">
        <div class="import-section">
          <div class="import-section__title">导入格式</div>
          <el-radio-group v-model="importForm.format" class="import-format-group">
            <el-radio-button value="json">JSON</el-radio-button>
            <el-radio-button value="csv">CSV</el-radio-button>
            <el-radio-button value="postman">Postman</el-radio-button>
          </el-radio-group>
          <div class="import-section__hint">{{ importFormatHint }}</div>
        </div>
        <div class="import-section">
          <div class="import-section__title">数据来源</div>
          <el-radio-group v-model="importSource" class="import-source-group">
            <el-radio-button value="file">上传文件</el-radio-button>
            <el-radio-button value="paste">粘贴内容</el-radio-button>
          </el-radio-group>
        </div>
        <div v-if="importSource === 'file'" class="import-section">
          <el-upload
            class="import-upload"
            drag
            :auto-upload="false"
            :limit="1"
            :file-list="importFileList"
            :show-file-list="false"
            accept=".json,.csv"
            @change="handleImportFileChange"
            @exceed="() => message.warning('仅支持单个文件，请先移除已选文件')"
          >
            <template v-if="importFileList.length === 0">
              <div class="import-upload__content">
                <el-icon class="import-upload__icon"><UploadFilled /></el-icon>
                <div class="import-upload__text">拖拽文件到此处，或 <em>点击上传</em></div>
                <div class="import-upload__hint">支持 .json、.csv，单个文件 ≤ 5MB</div>
              </div>
            </template>
            <template v-else>
              <div class="import-upload__content import-upload__content--filled">
                <el-icon class="import-upload__icon import-upload__icon--success"><CircleCheckFilled /></el-icon>
                <div class="import-upload__filename">{{ importFileList[0]?.name || '已选择文件' }}</div>
                <div class="import-upload__hint">点击区域更换文件</div>
                <el-button type="primary" link size="small" class="import-upload__remove" @click.stop="handleImportFileRemove">移除文件</el-button>
              </div>
            </template>
          </el-upload>
        </div>
        <div v-else class="import-section">
          <el-input
            v-model="importForm.content"
            type="textarea"
            :rows="12"
            :placeholder="importPastePlaceholder"
            class="import-textarea"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="importing"
          :disabled="!hasImportContent"
          @click="importTests"
        >
          导入
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      title="执行结果"
      v-model="resultDialogVisible"
      width="860px"
      append-to-body
    >
      <div v-if="lastRun">
        <el-descriptions :column="2">
          <el-descriptions-item label="用例">
            {{ lastRun.name || lastRun.testCaseId }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="lastRun.status === 'PASSED' ? 'success' : lastRun.status === 'FAILED' ? 'danger' : 'warning'">
              {{ lastRun.status }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="响应时间">
            {{ lastRun.responseTime }} ms
          </el-descriptions-item>
          <el-descriptions-item label="状态码">
            {{ lastRun.response?.status ?? '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="lastRun.request" class="mt-4">
          <h4>请求参数</h4>
          <pre class="app-code mt-2">{{ JSON.stringify(lastRun.request, null, 2) }}</pre>
        </div>

        <el-divider />
        <h4>断言结果</h4>
        <el-table :data="lastRun.assertions || []" size="small">
          <el-table-column prop="type" label="类型" width="140" />
          <el-table-column prop="target" label="目标" />
          <el-table-column prop="condition" label="条件" width="120" />
          <el-table-column prop="expected" label="预期" />
          <el-table-column prop="actual" label="实际" />
          <el-table-column prop="passed" label="结果" width="90">
            <template #default="scope">
              <el-tag :type="scope.row.passed ? 'success' : 'danger'">
                {{ scope.row.passed ? "通过" : "失败" }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <el-divider />
        <h4>响应数据</h4>
        <pre>{{ JSON.stringify(lastRun.responseBody ?? lastRun.response?.data ?? lastRun.response, null, 2) }}</pre>

        <div v-if="lastRun.error" style="margin-top: 10px">
          <el-divider />
          <h4>错误</h4>
          <pre>{{ JSON.stringify(lastRun.error, null, 2) }}</pre>
        </div>
      </div>
      <el-empty v-else description="执行用例后可在此查看请求、断言与响应结果" />

      <template #footer>
        <el-button @click="resultDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      :title="editingId ? '编辑测试用例' : '创建测试用例'"
      v-model="dialogVisible"
      width="860px"
      append-to-body
    >
      <el-form :model="form" label-width="120px">
        <el-form-item label="用例名称" required>
          <el-input v-model="form.name" placeholder="例如：正常登录测试" />
        </el-form-item>
        <el-form-item label="优先级" required>
          <el-select v-model="form.priority" style="width: 160px">
            <el-option label="P0" value="P0" />
            <el-option label="P1" value="P1" />
            <el-option label="P2" value="P2" />
            <el-option label="P3" value="P3" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联 API">
          <el-input v-model="form.apiId" placeholder="可选：API ID" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>

        <el-divider />

        <el-form-item label="请求方法" required>
          <el-select v-model="form.method" style="width: 160px">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="DELETE" value="DELETE" />
            <el-option label="PATCH" value="PATCH" />
            <el-option label="OPTIONS" value="OPTIONS" />
          </el-select>
        </el-form-item>
        <el-form-item label="请求 URL" required>
          <el-input v-model="form.url" placeholder="例如：{{base_url}}/login 或 /login" />
        </el-form-item>
        <el-form-item label="Headers (JSON)">
          <el-input v-model="form.headersJson" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="Query (JSON)">
          <el-input v-model="form.queryJson" type="textarea" :rows="3" />
        </el-form-item>
        <BodyTypeEditor
          v-model:body-type="form.bodyType"
          v-model:body-json="form.bodyJson"
          v-model:body-form-rows-urlencoded="form.bodyFormRowsUrlencoded"
          v-model:body-form-rows-form-data="form.bodyFormRowsFormData"
        />

        <el-divider />

        <el-form-item label="断言 (JSON)">
          <el-input v-model="form.assertionsJson" type="textarea" :rows="8" />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveTestCase">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { View, CaretRight, CopyDocument, EditPen, Delete, UploadFilled, CircleCheckFilled } from '@element-plus/icons-vue'
import { usePagination } from '../../composables/usePagination'
import { message, confirmAction } from '../../utils/message'
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'
import BodyTypeEditor from '../../components/request/BodyTypeEditor.vue'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string

interface TestCase {
  id: string;
  name: string;
  apiId?: string;
  description?: string;
  priority: string;
}

const tests = ref<TestCase[]>([])
const searchQuery = ref('')
const loading = ref(false)
const deletingBulk = ref(false)
const selectedTests = ref<TestCase[]>([])
const selectedTestIds = computed(() => selectedTests.value.map((t) => t.id))
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)

const filteredTests = computed(() => {
  let list = tests.value
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (t) =>
      String(t.name || '').toLowerCase().includes(q) ||
      String(t.id || '').toLowerCase().includes(q) ||
      String(t.description || '').toLowerCase().includes(q) ||
      String(t.apiId || '').toLowerCase().includes(q),
  )
})

const { currentPage, pageSize, total, pagedItems: pagedTests, handleCurrentChange, handleSizeChange, resetPage } = usePagination(filteredTests, 10)

const executingAll = ref(false)
const executingMap = ref<Record<string, boolean>>({})
const resultDialogVisible = ref(false)
const lastRun = ref<any | null>(null)

const environmentCache = ref<any[]>([])
const defaultEnvId = ref<string>('')

const importDialogVisible = ref(false)
const importSource = ref<'file' | 'paste'>('paste')
const importing = ref(false)
const importFileList = ref<any[]>([])
const importForm = ref({
  format: 'json' as 'json' | 'csv' | 'postman',
  content: ''
})

const form = ref({
  name: '',
  apiId: '',
  description: '',
  priority: 'P1',
  method: 'GET',
  url: '',
  headersJson: '{\n  \"Content-Type\": \"application/json\"\n}',
  queryJson: '{}',
  bodyJson: '{}',
  bodyType: 'none' as 'none' | 'json' | 'urlencoded' | 'form-data',
  bodyFormRowsUrlencoded: [{ key: '', value: '' }] as Array<{ key: string; value: string }>,
  bodyFormRowsFormData: [{ key: '', type: 'text' as const, value: '', filename: undefined }] as Array<{ key: string; type?: 'text' | 'file'; value: string; filename?: string }>,
  assertionsJson: '[\n  {\"type\":\"STATUS\",\"condition\":\"eq\",\"expected\":200}\n]'
})

onMounted(async () => {
  await fetchTests()
})

watch([tests, searchQuery], () => resetPage())

const handleSelectionChange = (rows: TestCase[]) => {
  selectedTests.value = rows
}

const fetchTests = async () => {
  loading.value = true
  try {
    const response = await axios.get(`/api/tests?projectId=${projectId}`)
    tests.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    console.error('Failed to fetch tests:', error)
    tests.value = []
  } finally {
    loading.value = false
  }
}

const importPastePlaceholder = computed(() =>
  importForm.value.format === 'csv'
    ? '粘贴 CSV 内容，表头：name,method,url,headers,query,body,assertions,priority,apiId,description,tags'
    : importForm.value.format === 'postman'
      ? '粘贴 Postman Collection v2.1 的 JSON 内容'
      : '粘贴 JSON 数组或对象（含 testCases 字段）'
)

const importFormatHint = computed(() => {
  const f = importForm.value.format
  if (f === 'json') return '支持数组 [...] 或对象 { "testCases": [...] }'
  if (f === 'csv') return '表头：name, method, url, headers, query, body, assertions, priority, apiId, description, tags'
  return '支持 Postman Collection v2.1 格式'
})

const hasImportContent = computed(() => {
  if (importSource.value === 'file') return importFileList.value.length > 0
  return String(importForm.value.content || '').trim().length > 0
})

const openImportDialog = () => {
  importForm.value = { format: 'json', content: '' }
  importSource.value = 'paste'
  importFileList.value = []
  importDialogVisible.value = true
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const handleImportFileChange = async (file: any) => {
  const raw: File | undefined = file?.raw
  if (!raw) return
  if (raw.size > MAX_FILE_SIZE) {
    message.warning('文件大小不能超过 5MB')
    importFileList.value = []
    return
  }
  try {
    const text = await raw.text()
    importForm.value.content = text
    importFileList.value = [file]
    if (raw.name.toLowerCase().endsWith('.csv')) importForm.value.format = 'csv'
    message.success(`已读取：${raw.name}`)
  } catch (e) {
    console.error('Failed to read import file:', e)
    message.error('读取文件失败')
    importFileList.value = []
  }
}

const handleImportFileRemove = () => {
  importFileList.value = []
  importForm.value.content = ''
}

const importTests = async () => {
  const content = String(importForm.value.content || '').trim()
  if (!content) {
    message.warning('请粘贴内容或选择文件')
    return
  }
  importing.value = true
  try {
    let payload: any = {
      projectId,
      format: importForm.value.format,
      content
    }

    // If user pasted JSON and selected postman, send as content and let backend parse.
    const res = await axios.post('/api/tests/import', payload)
    importDialogVisible.value = false
    await fetchTests()
    const count = Array.isArray(res?.data) ? res.data.length : 0
    message.success(count > 0 ? `已导入 ${count} 条测试用例` : '导入成功')
  } catch (e: any) {
    console.error('Failed to import tests:', e)
    const msg = e?.response?.data?.message || e?.message || '导入失败'
    message.error(String(msg))
  } finally {
    importing.value = false
  }
}

const exportTests = async () => {
  try {
    await confirmAction('确定导出当前项目下的所有测试用例吗？', '导出确认')
  } catch {
    return
  }
  try {
    const res = await axios.get(`/api/tests/export?projectId=${projectId}`, {
      responseType: 'blob'
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `testcases-${projectId}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } catch (e) {
    console.error('Failed to export tests:', e)
    message.error('导出失败')
  }
}

const cloneTest = async (id: string) => {
  try {
    const res = await axios.post(`/api/tests/${id}/clone`)
    await fetchTests()
    message.success('已复制')
    const newId = res.data?.id
    if (newId) {
      router.push(`/projects/${projectId}/tests/${newId}`)
    }
  } catch (e: any) {
    console.error('Failed to clone test:', e)
    const msg = e?.response?.data?.message || e?.message || '复制失败'
    message.error(String(msg))
  }
}

const openCreateDialog = () => {
  editingId.value = null
  form.value = {
    name: '',
    apiId: '',
    description: '',
    priority: 'P1',
    method: 'GET',
    url: '',
    headersJson: '{\n  \"Content-Type\": \"application/json\"\n}',
    queryJson: '{}',
    bodyJson: '{}',
    bodyType: 'none',
    bodyFormRowsUrlencoded: [{ key: '', value: '' }],
    bodyFormRowsFormData: [{ key: '', type: 'text', value: '', filename: undefined }],
    assertionsJson: '[\n  {\"type\":\"STATUS\",\"condition\":\"eq\",\"expected\":200}\n]'
  }
  dialogVisible.value = true
}

const toFormRows = (arr: any[] | object | undefined): Array<{ key: string; value: string }> => {
  if (Array.isArray(arr)) {
    return arr.map((r: any) => ({
      key: String(r?.key || ''),
      value: String(r?.value ?? '')
    }))
  }
  if (arr && typeof arr === 'object' && !Array.isArray(arr)) {
    return Object.entries(arr).map(([k, v]: any) => ({
      key: String(k),
      value: String(v ?? '')
    }))
  }
  return [{ key: '', value: '' }]
}

const toFormRowsFormData = (arr: any[] | undefined): Array<{ key: string; type?: 'text' | 'file'; value: string; filename?: string }> => {
  if (Array.isArray(arr)) {
    return arr.map((r: any) => ({
      key: String(r?.key || ''),
      type: (r?.type === 'file' ? 'file' : 'text') as 'text' | 'file',
      value: String(r?.value ?? ''),
      filename: r?.filename ? String(r.filename) : undefined
    }))
  }
  return [{ key: '', type: 'text', value: '', filename: undefined }]
}

const openEditDialog = async (test: TestCase) => {
  try {
    const res = await axios.get(`/api/tests/${test.id}`)
    const detail = res.data
    editingId.value = test.id
    const bodyType =
      (detail.request?.bodyType as any) ||
      (detail.request?.bodyForm ? 'form-data' : detail.request?.body ? 'json' : 'none')
    const bodyFormRows = toFormRows(detail.request?.bodyForm ?? detail.request?.body)
    form.value = {
      name: detail.name || '',
      apiId: detail.apiId || '',
      description: detail.description || '',
      priority: detail.priority || 'P1',
      method: detail.request?.method || 'GET',
      url: detail.request?.url || '',
      headersJson: JSON.stringify(detail.request?.headers || {}, null, 2),
      queryJson: JSON.stringify(detail.request?.query || {}, null, 2),
      bodyJson: JSON.stringify(detail.request?.body ?? {}, null, 2),
      bodyType,
      bodyFormRowsUrlencoded: bodyType === 'urlencoded' ? bodyFormRows : [{ key: '', value: '' }],
      bodyFormRowsFormData: bodyType === 'form-data' ? toFormRowsFormData(detail.request?.bodyForm) : [{ key: '', type: 'text', value: '', filename: undefined }],
      assertionsJson: JSON.stringify(detail.assertions || [], null, 2)
    }
    dialogVisible.value = true
  } catch (error) {
    console.error('Failed to load test case for edit:', error)
    message.error('加载用例失败')
  }
}

const deleteTest = async (id: string) => {
  try {
    await confirmAction('确定删除该测试用例吗？此操作不可恢复。', '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  try {
    await axios.delete(`/api/tests/${id}`)
    selectedTests.value = selectedTests.value.filter((t) => t.id !== id)
    await fetchTests()
    message.success('已删除')
  } catch (error) {
    console.error('Failed to delete test case:', error)
    message.error('删除失败')
  }
}

const deleteSelectedTests = async () => {
  const ids = selectedTestIds.value
  if (ids.length === 0) return
  try {
    await confirmAction(`确定删除选中的 ${ids.length} 个测试用例吗？此操作不可恢复。`, '批量删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  deletingBulk.value = true
  try {
    const res = await axios.post('/api/tests/bulk-delete', {
      projectId,
      ids
    })
    await fetchTests()
    selectedTests.value = []
    message.success(`已删除 ${(res.data as { deleted?: number })?.deleted ?? ids.length} 个测试用例`)
  } catch (error) {
    console.error('Failed to bulk delete tests:', error)
    message.error(error, '批量删除失败')
  } finally {
    deletingBulk.value = false
  }
}

const navigateToTest = (id: string) => {
  router.push(`/projects/${projectId}/tests/${id}`)
}

const ensureDefaultEnvId = async (): Promise<string | null> => {
  if (defaultEnvId.value) return defaultEnvId.value

  try {
    const activeRes = await axios.get(`/api/environments/active?projectId=${projectId}`)
    if (activeRes.data?.id) {
      defaultEnvId.value = activeRes.data.id
      return defaultEnvId.value
    }
  } catch {
    // ignore
  }

  try {
    const res = await axios.get(`/api/environments?projectId=${projectId}`)
    const envs = Array.isArray(res.data) ? res.data : []
    environmentCache.value = envs
    const picked = envs.find((e: any) => e.isActive) || envs[0]
    if (picked?.id) {
      defaultEnvId.value = picked.id
      if (!picked.isActive && picked.name) {
        message.warning(`未找到激活环境，已使用：${picked.name}`)
      }
      return defaultEnvId.value
    }
    return null
  } catch (e) {
    console.error('Failed to load environments:', e)
    return null
  }
}

const executeOne = async (test: TestCase) => {
  const envId = await ensureDefaultEnvId()
  if (!envId) {
    message.warning('请先创建环境配置')
    router.push(`/projects/${projectId}/environments`)
    return
  }

  executingMap.value = { ...executingMap.value, [test.id]: true }
  try {
    const res = await axios.post('/api/tests/execute', {
      testCaseId: test.id,
      environmentId: envId
    })
    lastRun.value = res.data
    resultDialogVisible.value = true
    message.success('执行完成')
  } catch (e) {
    console.error('Failed to execute test:', e)
    message.error('执行失败')
  } finally {
    executingMap.value = { ...executingMap.value, [test.id]: false }
  }
}

const executeAll = async () => {
  const envId = await ensureDefaultEnvId()
  if (!envId) {
    message.warning('请先创建环境配置')
    router.push(`/projects/${projectId}/environments`)
    return
  }
  if (tests.value.length === 0) return

  try {
    await confirmAction(
      `确定要执行 ${tests.value.length} 个用例吗？将生成测试报告。`,
      '执行确认',
      { type: 'warning', confirmButtonText: '执行', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  executingAll.value = true
  try {
    const res = await axios.post('/api/tests/execute-suite', {
      testCaseIds: tests.value.map(t => t.id),
      environmentId: envId,
      projectId,
    })
    message.success('执行完成，已生成报告')
    const reportId = res.data?.reportId
    if (reportId) {
      router.push(`/projects/${projectId}/tests/reports/${reportId}`)
    } else {
      router.push(`/projects/${projectId}/tests/reports`)
    }
  } catch (e) {
    console.error('Failed to execute suite:', e)
    message.error('执行失败')
  } finally {
    executingAll.value = false
  }
}

const saveTestCase = async () => {
  if (!form.value.name.trim() || !form.value.url.trim()) {
    message.warning('请填写用例名称和请求 URL')
    return
  }

  const parseJson = (label: string, input: string, fallback: any) => {
    const text = (input || '').trim()
    if (!text) return fallback
    try {
      return JSON.parse(text)
    } catch {
      message.error(`${label} JSON 解析失败`)
      throw new Error(`${label} JSON 解析失败`)
    }
  }

  let headers: any
  let query: any
  let body: any
  let bodyForm: any
  let assertions: any
  try {
    headers = parseJson('Headers', form.value.headersJson, {})
    query = parseJson('Query', form.value.queryJson, {})
    if (form.value.bodyType === 'none') {
      body = undefined
      bodyForm = undefined
    } else if (form.value.bodyType === 'json') {
      body = parseJson('Body', form.value.bodyJson, undefined)
      bodyForm = undefined
    } else if (form.value.bodyType === 'urlencoded') {
      body = undefined
      bodyForm = (form.value.bodyFormRowsUrlencoded || [])
        .map((r) => ({ key: String(r.key || '').trim(), value: String(r.value ?? '') }))
        .filter((r) => r.key)
    } else {
      body = undefined
      bodyForm = (form.value.bodyFormRowsFormData || [])
        .filter((r) => String(r.key || '').trim())
        .map((r) => ({
          key: String(r.key || '').trim(),
          value: r.value,
          type: r.type || 'text',
          filename: r.filename
        }))
    }
    assertions = parseJson('断言', form.value.assertionsJson, [])
    if (!Array.isArray(assertions)) {
      message.error('断言 JSON 必须是数组')
      return
    }
  } catch {
    return
  }

  const payload = {
    projectId,
    apiId: form.value.apiId || undefined,
    name: form.value.name,
    description: form.value.description || undefined,
    priority: form.value.priority,
    request: {
      method: form.value.method,
      url: form.value.url,
      headers,
      query,
      bodyType: form.value.bodyType,
      body,
      bodyForm
    },
    assertions
  }

  try {
    if (editingId.value) {
      await axios.put(`/api/tests/${editingId.value}`, payload)
    } else {
      await axios.post('/api/tests', payload)
    }
    dialogVisible.value = false
    await fetchTests()
    message.success('保存成功')
  } catch (error) {
    console.error('Failed to save test case:', error)
    message.error('保存失败')
  }
}

</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.import-dialog {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.import-dialog .import-section {
  margin-bottom: 0;
}

.import-dialog .import-section__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 10px;
}

.import-dialog .import-section__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
  line-height: 1.5;
}

.import-dialog .import-format-group,
.import-dialog .import-source-group {
  margin-bottom: 0;
}

.import-dialog .import-textarea {
  width: 100%;
}

.import-dialog .import-textarea :deep(textarea) {
  font-family: var(--font-mono), monospace;
  font-size: 13px;
}

.import-dialog .import-upload {
  width: 100%;
}

:deep(.import-upload .el-upload) {
  width: 100%;
}

:deep(.import-upload .el-upload-dragger) {
  width: 100%;
  border-radius: 10px;
  border: 1.5px dashed var(--el-border-color-lighter);
  background: var(--el-bg-color);
  padding: 32px 20px;
  transition: border-color 0.2s ease;
}

:deep(.import-upload .el-upload-dragger:hover) {
  border-color: var(--el-color-primary);
}

:deep(.import-upload .el-upload-dragger.is-dragover) {
  border-color: var(--el-color-primary);
  background: rgba(99, 102, 241, 0.06);
}

.import-upload__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.import-upload__icon {
  font-size: 36px;
  color: var(--el-text-color-placeholder);
}

.import-upload__text {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.import-upload__text em {
  color: var(--el-color-primary);
  font-style: normal;
}

.import-upload__hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.import-upload__content--filled {
  padding: 24px 20px;
}

.import-upload__icon--success {
  font-size: 40px;
  color: var(--el-color-success);
}

.import-upload__filename {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  word-break: break-all;
  text-align: center;
  max-width: 100%;
}

.import-upload__remove {
  margin-top: 4px;
}

pre {
  background-color: #18181b;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(63, 63, 70, 0.9);
  overflow-x: auto;
  color: #e4e4e7;
}
</style>
