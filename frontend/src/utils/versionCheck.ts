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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 更新助手是异步重建容器，必须等新容器真正提供新版本后再报成功 */
async function waitForVersionSettled(timeoutMs = 90000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2500);
    try {
      const res = await axios.get("/api/version/check", { timeout: 5000 });
      const data = res.data || {};
      if (data.latest && !data.hasUpdate) return true;
    } catch {
      /* 容器重启期间请求会短暂失败，继续等待 */
    }
  }
  return false;
}

export async function triggerUpdate() {
  const versionStore = useVersionStore();
  const previousLatest = versionStore.latest;
  const previousCurrent = versionStore.current;
  const restoreUpdateState = () => {
    if (previousLatest) {
      versionStore.setUpdate(previousLatest, previousCurrent);
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
      // 后端只保证更新流程已启动，这里继续等待新版本真正生效
      versionStore.setUpdateStatus("running", "更新已启动，正在等待新版本就绪…");
      versionStore.setUpdateProgress(90);
      versionStore.clear();
      const settled = await waitForVersionSettled();
      if (settled) {
        versionStore.setUpdateStatus("success", msg || "更新完成，即将刷新页面…");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        restoreUpdateState();
        const failedMsg =
          "更新流程已启动，但新版本未在预期时间内生效。请确认容器名未被修改，或手动执行 docker pull 后重建容器。";
        versionStore.setUpdateStatus("error", failedMsg);
        message.error(failedMsg, "更新未生效", "更新失败");
        setTimeout(() => versionStore.setUpdateStatus("idle"), 6000);
      }
    } else {
      restoreUpdateState();
      const fullMsg = manualCommands
        ? `${msg}\n\n手动更新命令：\n${manualCommands}`
        : msg;
      versionStore.setUpdateStatus("error", fullMsg);
      message.error(fullMsg, "操作失败", "更新失败");
      setTimeout(() => versionStore.setUpdateStatus("idle"), 4000);
    }
  } catch (e: any) {
    restoreUpdateState();
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
