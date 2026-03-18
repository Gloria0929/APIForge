<template>
  <el-container class="app-page app-page-shell">
    <div class="app-page-shell__header">
    <div class="app-page-header">
      <div class="app-page-copy">
        <h2 class="section-title !mb-1">项目列表</h2>
        <p class="app-page-desc">备用项目页也统一切换为 Element Plus 表格与 Tailwind 工作台风格。</p>
      </div>
      <div class="app-toolbar">
        <el-button type="primary" @click="openCreateDialog">创建项目</el-button>
      </div>
    </div>
    </div>

    <el-main class="app-page-shell__main">
    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">项目目录</div>
            <div class="app-panel-subtitle">支持进入、编辑、删除和分页浏览。</div>
          </div>
        </div>
      </template>

      <div v-if="loading" class="app-loading-block">
        <div class="app-loading-ring"></div>
        <p class="text-sm text-slate-400">加载项目中...</p>
      </div>

      <el-empty v-else-if="projects.length === 0" class="app-empty" description="创建或导入项目后开始使用 APIForge" />

      <template v-else>
        <el-table :data="pagedProjects" style="width: 100%">
          <el-table-column prop="name" label="项目名称" min-width="200" />
          <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip>
            <template #default="scope">{{ scope.row.description || '-' }}</template>
          </el-table-column>
          <el-table-column label="创建时间" width="210">
            <template #default="scope">{{ formatDate(scope.row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="scope">
              <div class="table-actions">
                <span class="table-action table-action--primary" @click="navigateToProject(scope.row.id)"><el-icon><Right /></el-icon>进入</span>
                <span class="table-action" @click="openEditDialog(scope.row)"><el-icon><EditPen /></el-icon>编辑</span>
                <span class="table-action table-action--danger" @click="deleteProject(scope.row.id)"><el-icon><Delete /></el-icon>删除</span>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="app-pagination">
          <div class="app-pagination-copy">项目 {{ total }}</div>
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
      </template>
    </el-card>

    <el-dialog :title="editingProject ? '编辑项目' : '创建项目'" v-model="dialogVisible" width="560px" append-to-body>
      <el-form @submit.prevent="createProject">
        <el-form-item label="项目名称" required>
          <el-input v-model="form.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入项目描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createProject">{{ editingProject ? '更新' : '创建' }}</el-button>
      </template>
    </el-dialog>
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Right, EditPen, Delete } from "@element-plus/icons-vue";
import { useProjectStore } from "../../store/project";
import { usePagination } from "../../composables/usePagination";
import { message, confirmAction } from "../../utils/message";
import { formatDateTime } from "../../utils/date";

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

const projects = ref<Project[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editingProject = ref<string | null>(null);
const { currentPage, pageSize, total, pagedItems: pagedProjects, handleCurrentChange, handleSizeChange, resetPage } = usePagination(projects, 10)

interface FormData {
  name: string;
  description: string;
  createdBy: string;
}

const form = ref<FormData>({ name: "", description: "", createdBy: "admin" });
watch(projects, () => resetPage())

onMounted(async () => {
  await projectStore.fetchProjects();
  projects.value = projectStore.projects;
  loading.value = projectStore.loading;
});

const formatDate = (dateString: string) => formatDateTime(dateString);

const openCreateDialog = () => {
  editingProject.value = null;
  form.value = { name: "", description: "", createdBy: "admin" };
  dialogVisible.value = true;
};

const openEditDialog = (project: Project) => {
  editingProject.value = project.id;
  form.value = { name: project.name, description: project.description || "", createdBy: project.createdBy };
  dialogVisible.value = true;
};

const createProject = async () => {
  try {
    if (editingProject.value) {
      await projectStore.updateProject(editingProject.value, form.value);
    } else {
      await projectStore.createProject(form.value);
    }
    dialogVisible.value = false;
    await projectStore.fetchProjects();
    projects.value = projectStore.projects;
    message.success(editingProject.value ? '项目已更新' : '项目已创建');
  } catch (error) {
    console.error("操作项目失败:", error);
    message.error(error, '操作项目失败');
  }
};

const deleteProject = async (id: string) => {
  try {
    await confirmAction("确定删除该项目吗？此操作不可恢复。", "删除确认", { confirmButtonText: '删除' });
  } catch {
    return;
  }

  try {
    await projectStore.deleteProject(id);
    await projectStore.fetchProjects();
    projects.value = projectStore.projects;
    message.success("项目已删除");
  } catch (error) {
    console.error("删除项目失败:", error);
    message.error(error, '删除失败');
  }
};

const navigateToProject = (id: string) => {
  if (!id || id === "undefined" || id === "null") return;
  router.push(`/projects/${id}/apis`);
};
</script>
