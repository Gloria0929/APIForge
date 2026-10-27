export interface ScenarioApiSummary {
  id?: string;
  method?: string;
  path?: string;
  summary?: string;
}

/**
 * 根据项目真实接口生成可点击的场景描述。
 * 推荐标签可以视觉截断，但填入输入框的文案必须保留完整接口名称。
 */
export function buildRecommendedScenarios(apis: ScenarioApiSummary[]): string[] {
  if (!Array.isArray(apis) || apis.length === 0) return [];

  const hasPathParam = (path?: string) => /\{[^}]+\}/.test(String(path || ""));
  const methodOf = (api: ScenarioApiSummary) => String(api.method || "").toUpperCase();
  const label = (api?: ScenarioApiSummary) =>
    api ? String(api.summary || api.path || "接口").trim() : "";

  const login = apis.find((api) =>
    /login|signin|sign-in|auth|token/i.test(String(api.path || "")),
  );
  const creates = apis.filter(
    (api) => methodOf(api) === "POST" && !hasPathParam(api.path),
  );
  const lists = apis.filter(
    (api) => methodOf(api) === "GET" && !hasPathParam(api.path),
  );
  const details = apis.filter(
    (api) => methodOf(api) === "GET" && hasPathParam(api.path),
  );
  const updates = apis.filter((api) =>
    ["PUT", "PATCH"].includes(methodOf(api)),
  );
  const deletes = apis.filter((api) => methodOf(api) === "DELETE");

  const out: string[] = [];
  if (login) {
    const next = lists[0] || details[0] || creates[0];
    out.push(next ? `登录后调用 ${label(next)}` : "登录并校验返回的 token");
  }
  if (creates.length > 0 && lists.length > 0) {
    out.push(`${label(creates[0])}后${label(lists[0])}确认写入`);
  } else if (creates.length > 0) {
    out.push(`${label(creates[0])}并校验创建结果`);
  }
  if (details.length > 0 && updates.length > 0) {
    out.push(`${label(details[0])}后${label(updates[0])}并回查`);
  }
  if (deletes.length > 0) {
    out.push(
      creates.length > 0
        ? `${label(creates[0])}后${label(deletes[0])}确认删除`
        : `${label(deletes[0])}并校验删除结果`,
    );
  }
  if (out.length < 3 && lists.length > 0 && details.length > 0) {
    out.push(`${label(lists[0])}后${label(details[0])}查看详情`);
  }
  if (out.length < 3 && apis.length >= 2) {
    out.push(`依次调用 ${label(apis[0])} 和 ${label(apis[1])} 串成链路`);
  }
  return [...new Set(out)].slice(0, 3);
}
