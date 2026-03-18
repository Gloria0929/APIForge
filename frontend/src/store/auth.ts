import { defineStore } from "pinia";

const STORAGE_KEY = "apiforge:auth";

export const useAuthStore = defineStore("auth", {
  state: () => {
    const stored = localStorage.getItem(STORAGE_KEY)
      ? JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      : {};
    return {
      username: stored.username as string | null,
      token: stored.token as string | null,
      mustChangePassword: Boolean(stored.mustChangePassword),
    };
  },
  getters: {
    isLoggedIn: (state) => Boolean(state.username && state.token),
  },
  actions: {
    setAuth(username: string, token: string, mustChangePassword = false) {
      this.username = username;
      this.token = token;
      this.mustChangePassword = mustChangePassword;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ username, token, mustChangePassword }),
      );
    },
    setPasswordChanged() {
      this.mustChangePassword = false;
      const stored = localStorage.getItem(STORAGE_KEY)
        ? JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
        : {};
      stored.mustChangePassword = false;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    },
    logout() {
      this.username = null;
      this.token = null;
      this.mustChangePassword = false;
      localStorage.removeItem(STORAGE_KEY);
    },
  },
});
