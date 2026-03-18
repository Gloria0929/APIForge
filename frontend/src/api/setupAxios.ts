import axios from "axios";
import { useAuthStore } from "../store/auth";

/**
 * 配置 axios：请求携带 token，401 时清除登录状态并跳转登录页
 */
export function setupAxios() {
  axios.interceptors.request.use((config) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  });

  axios.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err.response?.status;
      const url = err.config?.url ?? "";
      // 非登录接口返回 401 时，清除登录状态并跳转登录页
      if (status === 401 && !url.includes("/api/auth/login")) {
        const authStore = useAuthStore();
        authStore.logout();
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?redirect=${redirect}`;
      }
      return Promise.reject(err);
    },
  );
}
