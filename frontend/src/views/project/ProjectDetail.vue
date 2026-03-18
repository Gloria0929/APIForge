<template>
  <div class="common-layout project-detail">
    <el-container class="project-workbench">
      <!-- Aside 左侧全高 -->
      <el-aside :width="sidebarCollapsed ? '64px' : '264px'" class="project-sidebar" :class="{ 'is-collapsed': sidebarCollapsed }">
        <div class="sidebar-scrollable">
        <div class="sidebar-expand-content">
          <router-link to="/" class="sidebar-logo">
            <img src="/favicon.svg" alt="APIForge" class="sidebar-logo__img" />
            <span class="sidebar-logo__text">APIForge</span>
          </router-link>
          <div class="sidebar-header">
            <div class="sidebar-header__workspace">
            </div>
            <div class="sidebar-header__project">
              <span class="sidebar-header__label">项目</span>
              <el-select
                v-model="selectedProjectId"
                placeholder="选择项目"
                class="sidebar-header__select"
                :loading="projectStore.loading"
                :key="projectsSelectKey"
                @change="onProjectChange"
              >
                <el-option
                  v-for="p in projectStore.projects"
                  :key="p.id"
                  :label="p.name"
                  :value="p.id"
                />
              </el-select>
            </div>
          </div>
        </div>

        <div class="sidebar-collapse-content">
          <router-link to="/" class="sidebar-logo-mini">
            <img src="/favicon.svg" alt="APIForge" class="sidebar-logo-mini__img" />
          </router-link>
        </div>

        <nav class="project-sidebar__nav">
          <el-menu
            :default-active="activeMenu"
            :collapse="sidebarCollapsed"
            :collapse-transition="false"
            class="project-menu"
            router
          >
            <el-menu-item index="/projects">
              <el-icon><Folder /></el-icon>
              <template #title>项目管理</template>
            </el-menu-item>
            <el-menu-item :index="`${base}/apis`" :disabled="!hasProject">
              <el-icon><Document /></el-icon>
              <template #title>接口文档</template>
            </el-menu-item>
            <el-menu-item :index="`${base}/tests`" :disabled="!hasProject">
              <el-icon><Check /></el-icon>
              <template #title>测试用例</template>
            </el-menu-item>
            <el-menu-item :index="`${base}/tests/reports`" :disabled="!hasProject">
              <el-icon><DataAnalysis /></el-icon>
              <template #title>测试报告</template>
            </el-menu-item>
            <el-menu-item :index="`${base}/scenarios`" :disabled="!hasProject">
              <el-icon><Collection /></el-icon>
              <template #title>场景测试</template>
            </el-menu-item>
            <el-menu-item :index="`${base}/environments`" :disabled="!hasProject">
              <el-icon><Setting /></el-icon>
              <template #title>环境管理</template>
            </el-menu-item>
            <el-menu-item :index="`${base}/ai`" :disabled="!hasProject">
              <el-icon><Cpu /></el-icon>
              <template #title>模型配置</template>
            </el-menu-item>
            <el-menu-item :index="`${base}/schedules`" :disabled="!hasProject">
              <el-icon><Clock /></el-icon>
              <template #title>定时任务</template>
            </el-menu-item>
          </el-menu>
        </nav>
        </div>

        <div class="collapse-trigger" @click="toggleSidebar">
          <el-icon :size="16">
            <DArrowLeft v-if="!sidebarCollapsed" />
            <DArrowRight v-else />
          </el-icon>
        </div>
      </el-aside>

      <!-- 右侧：Main -->
      <el-container class="project-right" direction="vertical">
        <header class="project-header">
          <div class="project-header__spacer" />
          <el-dropdown trigger="click" @command="onUserCommand">
            <div class="project-header__user">
              <el-icon><User /></el-icon>
              <span>{{ authStore.username || 'admin' }}</span>
              <el-icon class="project-header__chevron"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="changePassword">
                  <el-icon><Lock /></el-icon>
                  修改密码
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </header>
        <el-main class="project-right__main">
          <router-view :key="(route.params.id as string) || route.path" />
        </el-main>
      </el-container>
    </el-container>

    <el-dialog
      v-model="showPasswordGuide"
      title="安全提示"
      width="420px"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <div class="password-guide">
        <el-icon class="password-guide__icon" :size="48"><Lock /></el-icon>
        <p class="password-guide__text">为了您的账户安全，请先修改初始密码。</p>
      </div>
      <template #footer>
        <el-button @click="dismissPasswordGuide">稍后</el-button>
        <el-button type="primary" @click="openChangePasswordFromGuide">修改密码</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="changePasswordVisible"
      title="修改密码"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px">
        <el-form-item label="原密码">
          <el-input
            v-model="changePasswordForm.oldPassword"
            type="password"
            placeholder="请输入原密码"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="changePasswordForm.newPassword"
            type="password"
            placeholder="至少 6 位"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input
            v-model="changePasswordForm.confirmPassword"
            type="password"
            placeholder="再次输入新密码"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="changePasswordVisible = false">取消</el-button>
        <el-button type="primary" :loading="changePasswordLoading" @click="submitChangePassword">
          修改
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useProjectStore } from "../../store/project";
import {
  Document,
  Check,
  DataAnalysis,
  Collection,
  Setting,
  Cpu,
  Clock,
  Folder,
  DArrowLeft,
  DArrowRight,
  User,
  ArrowDown,
  Lock,
  SwitchButton,
} from "@element-plus/icons-vue";
import { useAuthStore } from "../../store/auth";
import { message, confirmAction } from "../../utils/message";
import axios from "axios";

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const authStore = useAuthStore();

const changePasswordVisible = ref(false);
const changePasswordForm = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});
const changePasswordLoading = ref(false);

const PASSWORD_GUIDE_KEY = "apiforge:passwordGuideDismissed";
const showPasswordGuide = ref(false);

const openChangePasswordFromGuide = () => {
  showPasswordGuide.value = false;
  changePasswordForm.oldPassword = "";
  changePasswordForm.newPassword = "";
  changePasswordForm.confirmPassword = "";
  changePasswordVisible.value = true;
};

const dismissPasswordGuide = () => {
  showPasswordGuide.value = false;
  sessionStorage.setItem(PASSWORD_GUIDE_KEY, "1");
};

const onUserCommand = (cmd: string) => {
  if (cmd === "changePassword") {
    changePasswordForm.oldPassword = "";
    changePasswordForm.newPassword = "";
    changePasswordForm.confirmPassword = "";
    changePasswordVisible.value = true;
  } else if (cmd === "logout") {
    confirmAction("确定要退出登录吗？", "退出登录", {
      confirmButtonText: "退出",
      cancelButtonText: "取消",
    })
      .then(async () => {
        try {
          await axios.post("/api/auth/logout");
        } catch {
          /* 忽略错误，仍清除前端状态 */
        }
        authStore.logout();
        router.push("/login");
      })
      .catch(() => {});
  }
};

const submitChangePassword = async () => {
  if (!changePasswordForm.newPassword || changePasswordForm.newPassword.length < 6) {
    message.warning("新密码至少 6 位");
    return;
  }
  if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
    message.warning("两次输入的新密码不一致");
    return;
  }
  changePasswordLoading.value = true;
  try {
    await axios.post("/api/auth/change-password", {
      username: authStore.username,
      oldPassword: changePasswordForm.oldPassword,
      newPassword: changePasswordForm.newPassword,
    });
    message.success("密码修改成功，请使用新密码登录");
    changePasswordVisible.value = false;
    try {
      await axios.post("/api/auth/logout");
    } catch {
      /* 忽略 */
    }
    authStore.logout();
    router.push("/login");
  } catch (err: any) {
    message.error(err?.response?.data?.message || "修改失败");
  } finally {
    changePasswordLoading.value = false;
  }
};

const sidebarCollapsed = ref(
  localStorage.getItem("apiforge:sidebarCollapsed") === "1" ||
  localStorage.getItem("apiforge:sidebarCollapsed") === "true",
);

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem("apiforge:sidebarCollapsed", sidebarCollapsed.value ? "1" : "0");
};

const selectedProjectId = ref<string>("");
const routeProjectId = computed(() => (route.params.id as string) || "");
const projectsSelectKey = computed(
  () => (projectStore.projects || []).map((p: any) => p.id).join("-"),
);
const hasProject = computed(() => Boolean(selectedProjectId.value));
const base = computed(() =>
  hasProject.value ? `/projects/${selectedProjectId.value}` : "/projects",
);

const currentSection = computed(() => {
  const seg = String(route.path || "").split("/")[3] || "";
  return seg || "apis";
});

onMounted(async () => {
  if (!projectStore.projects || projectStore.projects.length === 0) {
    await projectStore.fetchProjects();
  }
  const last = localStorage.getItem("apiforge:lastProjectId") || "";
  const fromRoute = String(routeProjectId.value || "");
  const existingIds = new Set(
    (projectStore.projects || []).map((p: any) => String(p.id)),
  );

  const pick =
    (fromRoute && existingIds.has(fromRoute) && fromRoute) ||
    (last && existingIds.has(last) && last) ||
    (projectStore.projects[0]?.id ? String(projectStore.projects[0].id) : "");
  selectedProjectId.value = pick;
  if (fromRoute) {
    localStorage.setItem("apiforge:lastProjectId", fromRoute);
  } else if (pick) {
    localStorage.setItem("apiforge:lastProjectId", pick);
  }

  if (
    authStore.mustChangePassword &&
    !sessionStorage.getItem(PASSWORD_GUIDE_KEY)
  ) {
    showPasswordGuide.value = true;
  }
});

watch(
  routeProjectId,
  async (id) => {
    const pid = String(id || "");
    if (pid) {
      selectedProjectId.value = pid;
      localStorage.setItem("apiforge:lastProjectId", pid);
    }
    if (!projectStore.projects || projectStore.projects.length === 0) {
      await projectStore.fetchProjects();
    }
  },
  { immediate: false },
);

watch(
  () => projectStore.projects,
  (projects) => {
    const list = projects || [];
    const ids = new Set(list.map((p: any) => String(p.id)));
    const current = String(selectedProjectId.value || "");
    if (current && !ids.has(current)) {
      const pick = list[0]?.id ? String(list[0].id) : "";
      selectedProjectId.value = pick;
      if (pick) localStorage.setItem("apiforge:lastProjectId", pick);
    }
  },
  { deep: true },
);

const activeMenu = computed(() => {
  if (route.path === "/projects") return "/projects";
  const pid = String(routeProjectId.value || "");
  if (!pid) return "/projects";
  const path = String(route.path || "");
  if (path.includes("/tests/reports")) return `/projects/${pid}/tests/reports`;
  const seg = path.split("/")[3] || "apis";
  return `/projects/${pid}/${seg}`;
});

const onProjectChange = (id: string) => {
  const nextId = String(id || "").trim();
  if (!nextId) return;
  localStorage.setItem("apiforge:lastProjectId", nextId);
  router.push(`/projects/${nextId}/${currentSection.value}`);
};
</script>

<style scoped>
.project-detail {
  height: 100vh;
  padding: 0;
  overflow: hidden;
}

.project-workbench {
  height: 100vh;
  overflow: hidden;
  background: var(--background-color);
  flex-direction: row !important;
  width: 100%;
}

.project-sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 16px 12px 12px;
  border-right: 1px solid var(--border-color);
  background: var(--card-background);
  overflow: hidden;
  transition:
    width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-scrollable {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.sidebar-scrollable::-webkit-scrollbar {
  display: none;
}

.sidebar-expand-content {
  overflow: hidden;
  opacity: 1;
  max-height: 300px;
  transition: opacity 0.15s ease, max-height 0.2s ease;
}

.is-collapsed .sidebar-expand-content {
  opacity: 0;
  max-height: 0;
  pointer-events: none;
}

.sidebar-collapse-content {
  overflow: hidden;
  opacity: 0;
  max-height: 0;
  transition: opacity 0.15s ease 0.05s, max-height 0.2s ease;
}

.is-collapsed .sidebar-collapse-content {
  opacity: 1;
  max-height: 60px;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 4px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  text-decoration: none;
  transition: opacity 0.2s;
}

.sidebar-logo:hover {
  opacity: 0.9;
}

.sidebar-logo__img {
  width: 28px;
  height: 28px;
}

.sidebar-logo__text {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #fff 0%, rgba(129, 140, 248, 0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.sidebar-logo-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  background: rgba(99, 102, 241, 0.1);
  text-decoration: none;
  transition: opacity 0.2s;
}

.sidebar-logo-mini:hover {
  opacity: 0.9;
}

.sidebar-logo-mini__img {
  width: 20px;
  height: 20px;
}

.sidebar-header {
  padding: 12px 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 8px;
}

.sidebar-header__workspace,
.sidebar-header__project {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-header__workspace {
  margin-bottom: 14px;
}

.sidebar-header__label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(129, 140, 248, 0.7);
}

.sidebar-header__name {
  font-size: 1rem;
  font-weight: 600;
  color: #ffffff;
}

.sidebar-header__select {
  width: 100%;
}

:deep(.sidebar-header__select .el-select__wrapper),
:deep(.sidebar-header__select .el-select__wrapper:hover),
:deep(.sidebar-header__select .el-select__wrapper.is-focused) {
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
  outline: none !important;
  padding: 0 !important;
  min-height: 28px !important;
}

:deep(.sidebar-header__select .el-select__wrapper::before),
:deep(.sidebar-header__select .el-select__wrapper::after) {
  display: none !important;
}

:deep(.sidebar-header__select .el-select__selected-item) {
  font-size: 0.95rem;
  font-weight: 600;
  color: #ffffff !important;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.sidebar-header__select .el-select__placeholder) {
  color: rgba(255, 255, 255, 0.4);
}

:deep(.sidebar-header__select .el-select__suffix .el-icon) {
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
  transition: color 0.15s ease;
}

:deep(.sidebar-header__select:hover .el-select__suffix .el-icon) {
  color: rgba(255, 255, 255, 0.5);
}

.project-sidebar__nav {
  flex: 1;
  min-height: 0;
}

/* 折叠按钮 - 固定在底部，不随内容滚动 */
.collapse-trigger {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.2s;
  flex-shrink: 0;
  margin-top: auto;
}

:deep(.project-menu) {
  border-right: none !important;
  background: transparent !important;
  padding: 0;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.project-menu:not(.el-menu--collapse)) {
  width: 100% !important;
}

:deep(.project-menu .el-menu-item) {
  border-radius: var(--radius-md);
  margin-bottom: 2px;
  min-height: 38px;
  font-size: 13px;
  color: #8b8b96 !important;
  transition: background 0.15s ease, color 0.15s ease;
}

:deep(.project-menu .el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.04) !important;
  color: #d0d0d5 !important;
}

:deep(.project-menu .el-menu-item.is-active) {
  background: rgba(99, 102, 241, 0.1) !important;
  color: #818cf8 !important;
  box-shadow: none;
}

:deep(.project-menu .el-menu-item.is-active:hover) {
  background: rgba(99, 102, 241, 0.15) !important;
  color: #a5b4fc !important;
}

:deep(.el-select__wrapper) {
  min-height: 38px;
  border-radius: var(--radius-md);
}

:deep(.project-menu.el-menu--collapse) {
  width: 100% !important;
}

:deep(.project-menu.el-menu--collapse .el-menu-item) {
  width: 38px;
  height: 38px;
  min-width: 38px;
  padding: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 2px;
  line-height: normal;
}

:deep(.project-menu.el-menu--collapse .el-menu-item .el-icon) {
  margin: 0 !important;
  font-size: 16px;
  width: 16px;
  height: 16px;
}

:deep(.project-menu.el-menu--collapse .el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #ededf0 !important;
}

:deep(.project-menu.el-menu--collapse .el-menu-item.is-active) {
  background: rgba(99, 102, 241, 0.1) !important;
  color: #818cf8 !important;
}

:deep(.project-menu.el-menu--collapse .el-menu-item.is-active:hover) {
  background: rgba(99, 102, 241, 0.15) !important;
  color: #a5b4fc !important;
}

:deep(.project-menu.el-menu--collapse .el-tooltip__trigger) {
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0 !important;
}

.project-sidebar.is-collapsed {
  padding: 12px 4px;
  align-items: center;
}

.project-sidebar.is-collapsed .project-sidebar__nav {
  width: 100%;
  overflow: visible;
}

:deep(.project-sidebar.is-collapsed > .el-scrollbar) {
  overflow: visible;
}

.project-sidebar.is-collapsed .collapse-trigger {
  margin-top: 4px;
}

.project-right {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column !important;
  overflow: hidden;
}

.project-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-background);
  flex-shrink: 0;
}

.project-header__spacer {
  flex: 1;
}

.project-header__user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background 0.2s;
}

.project-header__user:hover {
  background: var(--el-fill-color-light);
}

.project-header__chevron {
  font-size: 12px;
  color: var(--text-muted);
}

.password-guide {
  text-align: center;
  padding: 16px 0;
}

.password-guide__icon {
  color: var(--primary-color);
  margin-bottom: 16px;
}

.password-guide__text {
  margin: 0;
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.6;
}

.project-right__main {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

@media (max-width: 1100px) {
  .project-detail {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }

  .project-workbench {
    height: auto;
    min-height: 100vh;
    flex-direction: column !important;
  }

  .project-sidebar {
    width: 100% !important;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
    overflow: visible;
    max-height: none;
  }

  .sidebar-scrollable {
    overflow: visible;
  }

  .project-sidebar.is-collapsed {
    flex-direction: row;
    padding: 8px 12px;
    gap: 8px;
  }

  .project-sidebar.is-collapsed .project-sidebar__brand-mini {
    margin: 0;
  }

  .project-sidebar.is-collapsed .project-sidebar__nav {
    flex: 1;
  }

  .project-sidebar.is-collapsed .collapse-trigger {
    margin-top: 0;
    border-top: none;
  }

  .collapse-trigger {
    display: none;
  }

  .project-right__main {
    overflow-y: visible;
  }
}
</style>
