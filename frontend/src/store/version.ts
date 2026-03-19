import { defineStore } from "pinia";

const VERSION_CHECK_KEY = "apiforge:versionCheckShown";

export const useVersionStore = defineStore("version", {
  state: () => ({
    hasUpdate: false,
    latest: "",
    current: "",
    /** 用户点击「稍后」后为 true，显示紧凑横幅而非完整提示 */
    promptDismissed: false,
    /** 正在执行更新请求 */
    updating: false,
    /** 更新弹窗状态：idle | running | success | error */
    updateStatus: "idle" as "idle" | "running" | "success" | "error",
    /** 更新弹窗描述文字 */
    updateMessage: "",
    /** 更新进度 0-100（模拟进度，非真实） */
    updateProgress: 0,
  }),
  actions: {
    setUpdate(latest: string, current: string) {
      this.hasUpdate = true;
      this.latest = latest;
      this.current = current;
      this.promptDismissed = !!sessionStorage.getItem(VERSION_CHECK_KEY);
    },
    /** 用户点击「稍后」：收起完整提示，改为显示紧凑横幅 */
    dismiss() {
      this.promptDismissed = true;
      sessionStorage.setItem(VERSION_CHECK_KEY, "1");
    },
    clear() {
      this.hasUpdate = false;
      this.latest = "";
      this.current = "";
      this.promptDismissed = false;
      sessionStorage.removeItem(VERSION_CHECK_KEY);
    },
    setUpdateStatus(
      status: "idle" | "running" | "success" | "error",
      message = "",
    ) {
      this.updateStatus = status;
      this.updateMessage = message;
      if (status === "success" || status === "error") {
        this.updateProgress = 100;
      } else if (status === "running") {
        this.updateProgress = 0;
      }
    },
    setUpdateProgress(p: number) {
      this.updateProgress = Math.min(100, Math.max(0, p));
    },
  },
});
