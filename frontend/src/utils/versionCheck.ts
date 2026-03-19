import axios from "axios";
import { message } from "./message";
import { useVersionStore } from "../store/version";

export function runVersionCheck() {
  const versionStore = useVersionStore();
  if (versionStore.hasUpdate) return;
  axios
    .get("/api/version/check")
    .then((res) => {
      const { hasUpdate, latest, current } = res.data || {};
      if (hasUpdate && latest) {
        versionStore.setUpdate(latest, current || "");
      }
    })
    .catch(() => {});
}

export async function triggerUpdate() {
  const versionStore = useVersionStore();
  const keepUpdateState = () => {
    if (versionStore.latest) {
      versionStore.setUpdate(versionStore.latest, versionStore.current);
    }
  };
  versionStore.updating = true;
  versionStore.setUpdateStatus("running", "正在拉取镜像并重启容器，请稍候…");
  try {
    const r = await axios.post("/api/version/update", null, {
      timeout: 120000,
    });
    const { ok, message: msg, manualCommands } = r.data || {};
    if (ok) {
      versionStore.setUpdateStatus("success", msg || "更新完成，即将刷新页面…");
      versionStore.clear();
      setTimeout(() => window.location.reload(), 2500);
    } else {
      keepUpdateState();
      const fullMsg = manualCommands
        ? `${msg}\n\n手动更新命令：\n${manualCommands}`
        : msg;
      versionStore.setUpdateStatus("error", fullMsg);
      message.error(fullMsg, "操作失败", "更新失败");
      setTimeout(() => versionStore.setUpdateStatus("idle"), 4000);
    }
  } catch (e: any) {
    keepUpdateState();
    const errMsg = e?.response?.data?.message || e?.message || "更新失败";
    const manual = e?.response?.data?.manualCommands || "";
    const fullMsg = manual ? `${errMsg}\n\n手动更新命令：\n${manual}` : errMsg;
    versionStore.setUpdateStatus("error", fullMsg);
    message.error(fullMsg, "操作失败", "更新失败");
    setTimeout(() => versionStore.setUpdateStatus("idle"), 4000);
  } finally {
    versionStore.updating = false;
  }
}
