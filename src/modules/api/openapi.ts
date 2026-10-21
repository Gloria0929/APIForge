/** Resolve local JSON Pointers without expanding recursive schemas forever. */
export function resolveOpenApiRefs(value: any, document: any, seen = new Set<string>(), depth = 0): any {
  if (!value || typeof value !== "object" || depth > 40) return value;
  if (Array.isArray(value)) return value.map((item) => resolveOpenApiRefs(item, document, seen, depth + 1));
  if (typeof value.$ref === "string" && value.$ref.startsWith("#/") && !seen.has(value.$ref)) {
    const target = value.$ref.slice(2).split("/").reduce((node: any, key: string) =>
      node && Object.prototype.hasOwnProperty.call(node, key.replace(/~1/g, "/").replace(/~0/g, "~"))
        ? node[key.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined, document);
    if (target !== undefined) {
      const { $ref, ...siblings } = value;
      return resolveOpenApiRefs({ ...target, ...siblings }, document, new Set([...seen, $ref]), depth + 1);
    }
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveOpenApiRefs(item, document, seen, depth + 1)]));
}

export function mergeAllOf(schema: any): any {
  if (!schema || typeof schema !== "object" || !Array.isArray(schema.allOf)) return schema;
  const parts = schema.allOf.map(mergeAllOf);
  return {
    ...Object.assign({}, ...parts), ...schema,
    properties: Object.assign({}, ...parts.map((part: any) => part?.properties || {}), schema.properties || {}),
    required: [...new Set([...parts.flatMap((part: any) => Array.isArray(part?.required) ? part.required : []), ...(Array.isArray(schema.required) ? schema.required : [])])],
  };
}
