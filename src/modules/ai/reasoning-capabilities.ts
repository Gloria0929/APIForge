export type ReasoningCapabilities = {
  status: "supported" | "unsupported" | "unknown";
  levels: string[];
  source?: "metadata" | "probe";
};

export function normalizeEffort(value: unknown): string | null {
  const effort = String(value ?? "").trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,31}$/.test(effort) ? effort : null;
}

function levelsFrom(value: any): string[] | null {
  const values = Array.isArray(value) ? value : value?.supported_levels ?? value?.enum ?? value?.values;
  if (!Array.isArray(values)) return null;
  // An explicit empty enum is different from metadata that omits the field.
  if (values.some((item) => typeof item !== "string" || !normalizeEffort(item))) return null;
  return [...new Set(values.map(normalizeEffort))].slice(0, 16) as string[];
}

export function reasoningFromMetadata(model: any): ReasoningCapabilities | null {
  if (!model || typeof model !== "object") return null;
  const fields = [
    model.effort,
    model.supported_reasoning_efforts,
    model.reasoning_efforts,
    model.reasoning_effort,
    model.capabilities?.reasoning_effort,
    model.capabilities?.reasoning?.effort,
    model.supported_parameters?.reasoning_effort,
    model.parameters?.properties?.reasoning_effort,
    model.capabilities?.effort,
    model.output_config?.effort,
  ];
  for (const field of fields) {
    const levels = levelsFrom(field);
    if (levels) return { status: levels.length ? "supported" : "unsupported", levels, source: "metadata" };
  }
  if (model.capabilities?.reasoning === false || model.capabilities?.reasoning_effort === false) {
    return { status: "unsupported", levels: [], source: "metadata" };
  }
  return null;
}

/** Only read enum values tied to the effort field, never arbitrary quoted error text. */
export function reasoningFromError(data: any): ReasoningCapabilities | null {
  const detail = data?.error ?? data;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail ?? "");
  if (!/reasoning[_ .-]?effort|output_config[.\s]*effort|["']effort["']/i.test(text)) return null;
  const field = detail?.param ?? detail?.parameter;
  if (/reasoning_effort|effort/.test(String(field ?? ""))) {
    const levels = levelsFrom(detail.allowed_values ?? detail.supported_values);
    if (levels) return { status: levels.length ? "supported" : "unsupported", levels, source: "probe" };
  }
  const messages = Array.isArray(data?.detail) ? data.detail : [detail];
  for (const error of messages) {
    if (error?.loc && !/effort/i.test(JSON.stringify(error.loc))) continue;
    const message = typeof error === "string" ? error : error?.message ?? error?.msg ?? text;
    const match = String(message).match(
      /(?:supported (?:values|levels)(?: are)?|(?:only )?supports?|(?:must|should) be (?:one of|either)|input should be|allowed (?:values|levels)(?: are)?|expected (?:one of|either))\s*[:=]?\s*(\[[^\]]*\]|(?:["'`][a-z][a-z0-9_-]*["'`](?:\s*(?:,\s*(?:(?:or|and)\s*)?|(?:or|and)\s*))?)+)/i,
    );
    if (!match) continue;
    const levels = [...match[1].matchAll(/["'`]([a-z][a-z0-9_-]*)["'`]/gi)].map((item) => item[1]);
    const normalized = levelsFrom(levels);
    if (normalized?.length) return { status: "supported", levels: normalized, source: "probe" };
  }
  if (/(?:unknown|unrecognized|unsupported) (?:parameter|argument|field)|(?:parameter|argument|field|reasoning_effort|output_config[.\s]*effort).*(?:not supported|not permitted)|extra inputs are not permitted/i.test(text)) {
    return { status: "unsupported", levels: [], source: "probe" };
  }
  return null;
}
