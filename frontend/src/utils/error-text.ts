/**
 * 执行结果里的 error 可能是字符串（旧数据）、{ message } 或数组，
 * 模板里直接插值对象会渲染成 [object Object]，统一走这里转成可读文本。
 */
export const errorText = (error: any): string => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (Array.isArray(error))
    return error.map((item) => errorText(item)).join("；");
  const text = error.message ?? error.error ?? error.code;
  if (typeof text === "string" && text.trim()) return text;
  if (text !== undefined && text !== null && typeof text === "object")
    return errorText(text);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};
