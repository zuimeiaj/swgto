import type { OpenApiDocument, OpenApiParameter, OpenApiSchema, ParsedOperation, ResolvedConfig } from '../types.js';
import { schemaToTs } from './schemaToTs.js';

/* ───────── helpers ───────── */

function paramTypeDisplay(schema: OpenApiParameter['schema']): string {
  if (!schema) return 'unknown';
  if (schema.type && !schema.$ref && !schema.enum && !schema.properties) {
    return schema.type;
  }
  return schemaToTs(schema);
}

function escapeMd(str: string): string {
  return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/* ───────── schema resolution ───────── */

function resolveSchemaRef(
  schema: OpenApiSchema | undefined,
  docUrl: string,
  documentMap: Map<string, OpenApiDocument>,
): OpenApiSchema | undefined {
  if (!schema?.$ref) return schema;
  const name = schema.$ref.split('/').pop()!;
  const doc = documentMap.get(docUrl);
  const schemas = doc?.components?.schemas as Record<string, OpenApiSchema> | undefined;
  return schemas?.[name];
}

function refName(schema: OpenApiSchema | undefined): string | undefined {
  if (schema?.$ref) return schema.$ref.split('/').pop();
  if (schema?.type === 'array' && schema.items?.$ref) return schema.items.$ref.split('/').pop();
  return undefined;
}

/* ───────── renderers ───────── */

function renderMdTable(rows: Array<string[]>, headers: string[]): string {
  const cols = headers.length;
  const lines: string[] = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

function renderParamsMdTable(params: OpenApiParameter[]): string {
  if (!params.length) return '无';
  const rows = params.map((p) => [
    `\`${escapeMd(p.name)}\``,
    `\`${escapeMd(paramTypeDisplay(p.schema))}\``,
    p.required ? '**是**' : '否',
    escapeMd(p.description ?? '-'),
  ]);
  return renderMdTable(rows, ['名称', '类型', '必填', '描述']);
}

function renderSchemaFieldsMd(
  schema: OpenApiSchema | undefined,
  docUrl: string,
  documentMap: Map<string, OpenApiDocument>,
  visitedRefs: Set<string> = new Set(),
  depth: number = 0,
): string {
  const resolved = resolveSchemaRef(schema, docUrl, documentMap);
  if (!resolved) return `\`${escapeMd(schemaToTs(schema))}\``;

  if (resolved.properties && Object.keys(resolved.properties).length > 0) {
    const requiredSet = new Set(resolved.required ?? []);
    const doc = documentMap.get(docUrl);
    const allSchemas = doc?.components?.schemas as Record<string, OpenApiSchema> | undefined;

    const rows: string[][] = [];
    const subBlocks: string[] = [];

    for (const [key, prop] of Object.entries(resolved.properties)) {
      const typeText = schemaToTs(prop);
      const subRef = refName(prop);
      const subSchema = subRef && !visitedRefs.has(subRef) ? allSchemas?.[subRef] : undefined;

      rows.push([
        `\`${escapeMd(key)}\``,
        `\`${escapeMd(typeText)}\``,
        requiredSet.has(key) ? '**是**' : '否',
        escapeMd(prop.description ?? '-'),
      ]);

      if (subSchema?.properties) {
        visitedRefs.add(subRef!);
        subBlocks.push(`\n<details>\n<summary>${escapeMd(key)}: ${escapeMd(subRef!)}</summary>\n\n${renderSchemaFieldsMd(subSchema, docUrl, documentMap, visitedRefs, depth + 1)}\n</details>\n`);
      }
    }

    let md = renderMdTable(rows, ['名称', '类型', '必填', '描述']);
    if (subBlocks.length > 0) {
      md += '\n' + subBlocks.join('\n');
    }
    return md;
  }

  return `\`${escapeMd(schemaToTs(schema))}\``;
}

/* ───────── main export ───────── */

export function generateApiDocsMd(
  documentMap: Map<string, OpenApiDocument>,
  operations: ParsedOperation[],
  config: ResolvedConfig,
): string {
  const firstDoc = documentMap.values().next().value as OpenApiDocument | undefined;
  const title = config.apiDocs.title || firstDoc?.info?.title || 'API Documentation';
  const version = firstDoc?.info?.version ? `v${firstDoc.info.version}` : '';

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const modules = new Set(operations.map((op) => op.moduleName));
  const moduleCount = modules.size;

  const lines: string[] = [];

  // Cover
  if (config.apiDocs.companyName) {
    lines.push(`> ${config.apiDocs.companyName}`);
    lines.push('');
  }
  lines.push(`# ${title}`);
  if (version) lines.push(`**版本**: ${version}`);
  lines.push(`**生成日期**: ${dateStr}`);
  lines.push(`**接口总数**: ${operations.length} | **模块数**: ${moduleCount}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // TOC
  lines.push('## 目录');
  lines.push('');
  for (const op of operations) {
    const anchor = op.summary ? `${op.method.toUpperCase()} ${op.path} — ${op.summary}` : `${op.method.toUpperCase()} ${op.path}`;
    lines.push(`- [${escapeMd(anchor)}](#${op.functionName})`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Endpoints
  for (const op of operations) {
    lines.push(`## ${op.summary || op.functionName}`);
    lines.push('');
    lines.push(`\`${op.method.toUpperCase()}\` \`${op.path}\``);
    lines.push('');

    if (op.description) {
      lines.push(op.description);
      lines.push('');
    }

    // Path params
    if (op.pathParams.length) {
      lines.push('### 路径参数');
      lines.push('');
      lines.push(renderParamsMdTable(op.pathParams));
      lines.push('');
    }

    // Query params
    if (op.queryParams.length) {
      lines.push('### 查询参数');
      lines.push('');
      lines.push(renderParamsMdTable(op.queryParams));
      lines.push('');
    }

    // Request body
    if (op.requestBodySchema) {
      lines.push('### 请求体');
      lines.push('');
      lines.push(renderSchemaFieldsMd(op.requestBodySchema, op.docUrl, documentMap));
      lines.push('');
    }

    // Response
    if (op.responseSchema) {
      lines.push('### 响应');
      lines.push('');
      lines.push(renderSchemaFieldsMd(op.responseSchema, op.docUrl, documentMap));
      lines.push('');
    }
  }

  return lines.join('\n');
}
