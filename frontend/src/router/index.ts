import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../store/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/login",
    },
    {
      path: "/login",
      name: "Login",
      component: () => import("../views/login/Login.vue"),
    },
    {
      path: "/landing",
      name: "Landing",
      component: () => import("../views/landing/Landing.vue"),
    },
    {
      path: "/manual",
      name: "Manual",
      component: () => import("../views/manual/ManualPage.vue"),
    },
    {
      path: "/projects",
      component: () => import("../views/project/ProjectDetail.vue"),
      children: [
        {
          path: "",
          name: "ProjectManage",
          component: () => import("../views/project/ProjectManage.vue"),
        },
        {
          path: "manual",
          redirect: () => "/manual",
        },
        {
          path: ":id/apis",
          name: "ApiList",
          component: () => import("../views/api/ApiList.vue"),
        },
        {
          path: ":id/apis/:apiId",
          name: "ApiDetail",
          component: () => import("../views/api/ApiDetail.vue"),
        },
        {
          path: ":id/tests",
          name: "TestList",
          component: () => import("../views/test/TestList.vue"),
        },
        {
          path: ":id/tests/:testId",
          name: "TestDetail",
          component: () => import("../views/test/TestDetail.vue"),
        },
        {
          path: ":id/tests/reports",
          name: "TestReportList",
          component: () => import("../views/test/TestReportList.vue"),
        },
        {
          path: ":id/tests/reports/compare",
          name: "TestReportCompare",
          component: () => import("../views/test/TestReportCompare.vue"),
        },
        {
          path: ":id/tests/reports/:reportId",
          name: "TestReportDetail",
          component: () => import("../views/test/TestReportDetail.vue"),
        },
        {
          path: ":id/scenarios",
          name: "ScenarioList",
          component: () => import("../views/test/TestScenarioList.vue"),
        },
        {
          path: ":id/scenarios/:scenarioId",
          name: "ScenarioDetail",
          component: () => import("../views/test/TestScenarioDetail.vue"),
        },
        {
          path: ":id/environments",
          name: "EnvironmentList",
          component: () => import("../views/environment/EnvironmentList.vue"),
        },
        {
          path: ":id/ai",
          name: "AiConfig",
          component: () => import("../views/ai/AiConfig.vue"),
        },
        {
          path: ":id/schedules",
          name: "ScheduleList",
          component: () => import("../views/schedule/ScheduleList.vue"),
        },
        {
          path: ":id",
          redirect: (to) => `/projects/${to.params.id}/apis`,
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const authStore = useAuthStore();
  const hadToken = Boolean(authStore.token);
  authStore.syncFromStorage();

  if (to.path === "/login" && authStore.isLoggedIn) {
    return "/projects";
  }

  if (to.path.startsWith("/projects") && !authStore.isLoggedIn) {
    const query: Record<string, string> = { redirect: to.fullPath };
    if (hadToken) query.expired = "1";
    return { path: "/login", query };
  }

  const m = /^\/projects\/([^/]+)(?:\/|$)/.exec(to.path);
  if (m) {
    const id = m[1];
    if (!id || id === "undefined" || id === "null") {
      return "/projects";
    }
  }
  return true;
});

export default router;
