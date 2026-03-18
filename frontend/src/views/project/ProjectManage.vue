<template>
  <PageContainerLayout
    title="项目管理"
    badge="Workspace Hub"
    description="统一管理工作区、项目说明与最近接入的接口测试空间。"
  >
    <template #toolbar>
      <el-button @click="openImportDialog">导入项目</el-button>
      <el-button type="primary" @click="openCreateDialog">创建项目</el-button>
    </template>

    <section class="app-metric-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))">
      <article class="app-metric-card">
        <div class="app-metric-label">项目总数</div>
        <div class="app-metric-value">{{ projects.length }}</div>
        <div class="app-metric-note">当前已纳管项目数</div>
      </article>
      <article class="app-metric-card">
        <div class="app-metric-label">当前页</div>
        <div class="app-metric-value">{{ currentPage }}</div>
        <div class="app-metric-note">共 {{ Math.max(1, Math.ceil(total / pageSize)) }} 页</div>
      </article>
    </section>

    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">项目列表</div>
            <div class="app-panel-subtitle">支持进入、编辑、删除与分页浏览。</div>
          </div>
        </div>
      </template>

      <el-table :data="pagedProjects" v-loading="loading" style="width: 100%">
        <el-table-column prop="name" label="项目名称" min-width="100" />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column label="创建时间" width="210">
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="scope">
            <div class="table-actions">
              <span class="table-action table-action--primary" @click="enterProject(scope.row.id)"><el-icon><Right /></el-icon>进入</span>
              <span class="table-action" @click="exportProject(scope.row.id)"><el-icon><Download /></el-icon>导出</span>
              <span class="table-action" @click="openEditDialog(scope.row)"><el-icon><EditPen /></el-icon>编辑</span>
              <span class="table-action table-action--danger" @click="deleteProject(scope.row.id)"><el-icon><Delete /></el-icon>删除</span>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && projects.length === 0" class="app-empty" description="创建或导入项目后开始管理接口、用例与测试报告" />

      <div v-else class="app-pagination">
        <div class="app-pagination-copy">第 {{ currentPage }} / {{ Math.max(1, Math.ceil(total / pageSize)) }} 页</div>
        <el-pagination background layout="total, sizes, prev, pager, next" :total="total" :current-page="currentPage"
          :page-size="pageSize" :page-sizes="[5, 10, 20, 50]" @current-change="handleCurrentChange"
          @size-change="handleSizeChange" />
      </div>
    </el-card>

    <el-dialog title="导入项目" v-model="importDialogVisible" width="640px" append-to-body>
      <el-alert title="粘贴导出的项目 JSON，或上传 .json 文件" type="info" show-icon :closable="false" class="mb-4" />
      <el-upload class="import-upload" drag :auto-upload="false" :limit="1" :file-list="importFileList"
        accept=".json" @change="handleImportFileChange" @remove="importFileList = []">
        <div class="import-upload-content">
          <el-icon class="text-3xl text-neutral-400"><UploadFilled /></el-icon>
          <div class="mt-2 text-sm">拖拽文件到此处，或点击上传</div>
        </div>
      </el-upload>
      <el-input v-model="importText" type="textarea" :rows="8" placeholder='粘贴项目 JSON，格式：{"project":{...},"apis":[],"testCases":[],"environments":[],"scenarios":[]}' class="mt-4" />
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">导入</el-button>
      </template>
    </el-dialog>

    <el-dialog :title="editingId ? '编辑项目' : '创建项目'" v-model="dialogVisible" width="560px" append-to-body>
      <el-form :model="form" label-width="110px">
        <el-form-item label="项目名称" required>
          <el-input v-model="form.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveProject">保存</el-button>
      </template>
    </el-dialog>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Right, EditPen, Delete, Download, UploadFilled } from "@element-plus/icons-vue";
import axios from "axios";
import { useProjectStore } from "../../store/project";
import { usePagination } from "../../composables/usePagination";
import { message, confirmAction } from "../../utils/message";
import { formatDateTime } from "../../utils/date";
import PageContainerLayout from "../../components/layout/PageContainerLayout.vue";

const router = useRouter();
const projectStore = useProjectStore();

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

const projects = computed(() => projectStore.projects as unknown as Project[]);
const loading = computed(() => projectStore.loading);
const { currentPage, pageSize, total, pagedItems: pagedProjects, handleCurrentChange, handleSizeChange, resetPage } = usePagination(projects, 10);

const dialogVisible = ref(false);
const importDialogVisible = ref(false);
const importText = ref("");
const importFileList = ref<any[]>([]);
const importing = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = ref({
  name: "",
  description: "",
  createdBy: "admin",
});

watch(projects, () => resetPage());

onMounted(async () => {
  await projectStore.fetchProjects();
});

const formatDate = (dateString: string) => formatDateTime(dateString);

const openCreateDialog = () => {
  editingId.value = null;
  form.value = { name: "", description: "", createdBy: "admin" };
  dialogVisible.value = true;
};

const openEditDialog = (p: Project) => {
  editingId.value = p.id;
  form.value = {
    name: p.name,
    description: p.description || "",
    createdBy: p.createdBy || "admin",
  };
  dialogVisible.value = true;
};

const saveProject = async () => {
  const name = String(form.value.name || "").trim();
  if (!name) {
    message.warning("请输入项目名称");
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await projectStore.updateProject(editingId.value, {
        name,
        description: form.value.description,
        createdBy: form.value.createdBy,
      });
    } else {
      const created = await projectStore.createProject({
        name,
        description: form.value.description,
        createdBy: form.value.createdBy,
      });
      if (created?.id) {
        localStorage.setItem("apiforge:lastProjectId", String(created.id));
      }
    }
    dialogVisible.value = false;
    await projectStore.fetchProjects();
    message.success("项目已保存");
  } catch (e) {
    console.error("Failed to save project:", e);
    message.error(e, "保存失败");
  } finally {
    saving.value = false;
  }
};

const deleteProject = async (id: string) => {
  try {
    await confirmAction("确定删除该项目吗？此操作不可恢复。", "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }

  try {
    await projectStore.deleteProject(id);
    await projectStore.fetchProjects();
    const lastId = localStorage.getItem("apiforge:lastProjectId");
    if (lastId === id) {
      localStorage.removeItem("apiforge:lastProjectId");
    }
    message.success("项目已删除");
  } catch (e) {
    console.error("Failed to delete project:", e);
    message.error(e, "删除失败");
  }
};

const enterProject = (id: string) => {
  const pid = String(id || "").trim();
  if (!pid) return;
  localStorage.setItem("apiforge:lastProjectId", pid);
  router.push(`/projects/${pid}/apis`);
};

const exportProject = async (id: string) => {
  try {
    await confirmAction("确定导出该项目吗？", "导出确认");
  } catch {
    return;
  }
  try {
    const res = await axios.get(`/api/projects/${id}/export`);
    const blob = new Blob([JSON.stringify(res.data || {}, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("项目已导出");
  } catch (e) {
    console.error("Export failed:", e);
    message.error(e, "导出失败");
  }
};

const openImportDialog = () => {
  importText.value = "";
  importFileList.value = [];
  importDialogVisible.value = true;
};

const handleImportFileChange = async (uploadFile: { raw?: File }) => {
  const file = uploadFile?.raw;
  if (!file) return;
  try {
    const text = await file.text();
    importText.value = text;
    importFileList.value = [uploadFile as any];
  } catch (e) {
    console.error("Read file failed:", e);
    message.error("读取文件失败");
  }
};

const doImport = async () => {
  let text = importText.value?.trim();
  if (!text) {
    message.warning("请粘贴 JSON 或上传文件");
    return;
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    message.error("JSON 格式无效");
    return;
  }
  if (!data?.project) {
    message.error("JSON 需包含 project 字段");
    return;
  }
  importing.value = true;
  try {
    await axios.post("/api/projects/import", {
      project: data.project,
      apis: data.apis || [],
      testCases: data.testCases || [],
      environments: data.environments || [],
      scenarios: data.scenarios || [],
    });
    importDialogVisible.value = false;
    await projectStore.fetchProjects();
    message.success("项目已导入");
  } catch (e) {
    console.error("Import failed:", e);
    message.error(e, "导入失败");
  } finally {
    importing.value = false;
  }
};
</script>
