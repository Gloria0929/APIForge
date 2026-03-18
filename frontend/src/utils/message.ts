import { ElMessageBox, ElNotification } from "element-plus";

const getErrorMessage = (error: any, fallback = "操作失败") => {
  const backend = error?.response?.data?.message;
  if (Array.isArray(backend) && backend.length) return backend.join("；");
  if (typeof backend === "string" && backend.trim()) return backend;
  if (typeof error?.message === "string" && error.message.trim())
    return error.message;
  return fallback;
};

const open = (
  type: "success" | "warning" | "info" | "error",
  message: string,
  title?: string,
) =>
  ElNotification({
    title:
      title ||
      (type === "success"
        ? "操作成功"
        : type === "error"
          ? "操作失败"
          : "提示"),
    message,
    type,
    duration: type === "error" ? 4200 : 2600,
    position: "top-right",
    customClass: "apiforge-notification",
    offset: 24,
  });

export const message = {
  success(text: string, title = "操作成功") {
    return open("success", text, title);
  },
  warning(text: string, title = "请注意") {
    return open("warning", text, title);
  },
  info(text: string, title = "提示") {
    return open("info", text, title);
  },
  error(error: any, fallback = "操作失败", title = "操作失败") {
    return open(
      "error",
      typeof error === "string" ? error : getErrorMessage(error, fallback),
      title,
    );
  },
};

export const confirmAction = (
  message: string,
  title = "确认操作",
  options: Record<string, any> = {},
) =>
  ElMessageBox.confirm(message, title, {
    type: "warning",
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    confirmButtonClass: "apiforge-confirm-button",
    customClass: "apiforge-message-box",
    ...options,
  });

export { getErrorMessage };
