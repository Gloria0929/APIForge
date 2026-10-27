export function schemaType(schema: any): string {
  if (!schema || typeof schema !== 'object') return '-'
  if (schema.format === 'binary' || schema.format === 'byte') return 'file'
  if (Array.isArray(schema.type)) return schema.type.join(' | ')
  const variants = schema.oneOf || schema.anyOf
  if (Array.isArray(variants)) return [...new Set(variants.map(schemaType))].join(' | ')
  if (schema.type === 'array' || schema.items) return `array<${schemaType(schema.items)}>`
  if (schema.type) return schema.type
  if (schema.properties || schema.allOf || schema.additionalProperties) return 'object'
  if (schema.$ref) return `$ref: ${schema.$ref.split('/').pop()}`
  return '-'
}

function mergeSchema(schema: any): any {
  const parts = Array.isArray(schema?.allOf) ? schema.allOf.map(mergeSchema) : []
  return {
    ...Object.assign({}, ...parts), ...schema,
    properties: Object.assign({}, ...parts.map((p: any) => p?.properties || {}), schema?.properties || {}),
    required: [...new Set([...parts.flatMap((p: any) => Array.isArray(p?.required) ? p.required : []), ...(Array.isArray(schema?.required) ? schema.required : [])])],
  }
}

export function requestParameters(api: any): any[] {
  const row = (name: string, schema: any, location: string, required: boolean, key: string, depth = 0): any => ({
    key, name, in: location, required, type: schemaType(schema),
    description: schema?.description || schema?.title || '-',
    children: depth < 12 ? children(schema, key, depth + 1, location) : [],
  })
  const children = (raw: any, prefix: string, depth: number, location = 'body'): any[] => {
    if (!raw || typeof raw !== 'object' || raw.$ref) return []
    const schema = mergeSchema(raw)
    if (schema.items) return children(schema.items, `${prefix}[]`, depth, location)
    if (schema.oneOf || schema.anyOf) return (schema.oneOf || schema.anyOf).map((s: any, i: number) =>
      row(`方案 ${i + 1}`, s, location, false, `${prefix}:variant:${i}`, depth))
    return Object.entries(schema.properties || {}).filter(([, prop]: any) => !prop?.readOnly).map(([name, prop]) =>
      row(name, prop, location, schema.required.includes(name), `${prefix}.${name}`, depth))
  }
  const params = (Array.isArray(api?.parameters) ? api.parameters : []).flatMap((p: any, i: number) => {
    if (p?.in === 'body') {
      const schema = p.schema || p
      const fields = children(schema, `parameter:${i}`, 0, 'body')
      return fields.length && !schema.items && !schema.oneOf && !schema.anyOf
        ? fields
        : [row(p.name || 'body', schema, 'body', Boolean(p.required), `parameter:${i}`)]
    }
    const content = Object.values(p?.content || {})[0] as any
    return [row(p?.name || '$ref', { ...(p?.schema || content?.schema || p), description: p?.description || p?.schema?.description }, p?.in || '-', p?.in === 'path' || p?.required === true, `parameter:${i}`)]
  })
  const body = api?.requestBody
  if (body) {
    const content = body.content || {}
    const media: any = content['application/json'] || content['multipart/form-data'] || content['application/x-www-form-urlencoded'] || Object.values(content)[0]
    const schema = media?.schema || body.schema || body
    const fields = children(schema, 'body', 0)
    params.push(...(fields.length && !schema.items && !schema.oneOf && !schema.anyOf ? fields : [row('body', schema, 'body', Boolean(body.required), 'body')]))
  }
  return params
}
