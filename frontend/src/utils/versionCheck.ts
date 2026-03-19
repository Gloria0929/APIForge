import axios from "axios";
import { ElMessageBox } from "element-plus";
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
  try {
    const r = await axios.post("/api/version/update");
    const { ok, message: msg, manualCommands } = r.data || {};
    if (ok) {
      message.success(msg);
      versionStore.clear();
      setTimeout(() => window.location.reload(), 3000);
    } else {
      ElMessageBox.alert(
        `${msg}\n\n${manualCommands ? "手动更新命令：\n" + manualCommands : ""}`,
        "更新失败",
        { type: "warning", confirmButtonText: "确定" },
      );
    }
  } catch (e: any) {
    const errMsg = e?.response?.data?.message || e?.message || "更新失败";
    const manual = e?.response?.data?.manualCommands || "";
    ElMessageBox.alert(
      `${errMsg}${manual ? "\n\n手动更新命令：\n" + manual : ""}`,
      "更新失败",
      { type: "warning", confirmButtonText: "确定" },
    );
  }
}
