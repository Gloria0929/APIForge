import { defineStore } from "pinia";

const VERSION_CHECK_KEY = "apiforge:versionCheckShown";

export const useVersionStore = defineStore("version", {
  state: () => ({
    hasUpdate: false,
    latest: "",
    current: "",
    /** 用户点击「稍后」后为 true，显示紧凑横幅而非完整提示 */
    promptDismissed: false,
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
  },
});
