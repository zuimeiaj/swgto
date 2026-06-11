import type { OpenApiDocument, OpenApiParameter, OpenApiSchema, ParsedOperation, ResolvedConfig } from '../types.js';
import { schemaToTs } from './schemaToTs.js';

/* ───────── helpers ───────── */

function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    get: '#1677ff',
    post: '#52c41a',
    put: '#fa8c16',
    patch: '#722ed1',
    delete: '#ff4d4f',
    head: '#8c8c8c',
    options: '#8c8c8c',
  };
  return colors[method.toLowerCase()] ?? '#8c8c8c';
}

function paramTypeDisplay(schema: OpenApiParameter['schema']): string {
  if (!schema) return 'unknown';
  if (schema.type && !schema.$ref && !schema.enum && !schema.properties) {
    return schema.type;
  }
  return schemaToTs(schema);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/**
 * Recursively render a schema as a fields table.
 * Properties that reference another component schema render as an expandable row
 * with the nested schema inline (collapsible via <details>).
 */
function renderSchemaFieldsTable(
  schema: OpenApiSchema | undefined,
  docUrl: string,
  documentMap: Map<string, OpenApiDocument>,
  visitedRefs: Set<string> = new Set(),
): string {
  const resolved = resolveSchemaRef(schema, docUrl, documentMap);
  if (!resolved) {
    return `<div class="schema-block">${escapeHtml(schemaToTs(schema))}</div>`;
  }

  if (resolved.properties && Object.keys(resolved.properties).length > 0) {
    const requiredSet = new Set(resolved.required ?? []);
    const doc = documentMap.get(docUrl);
    const allSchemas = doc?.components?.schemas as Record<string, OpenApiSchema> | undefined;

    let html = '<table><thead><tr><th class="col-name">名称</th><th class="col-type">类型</th><th class="col-req">必填</th><th class="col-desc">描述</th></tr></thead><tbody>';

    for (const [key, prop] of Object.entries(resolved.properties)) {
      const subRef = refName(prop);
      const subSchema = subRef && !visitedRefs.has(subRef) ? allSchemas?.[subRef] : undefined;

      if (subSchema?.properties) {
        // Expandable row for referenced entity
        visitedRefs.add(subRef!);
        const typeText = schemaToTs(prop);
        html += '<tr class="ref-row"><td colspan="4">';
        html += `<details class="ref-details"><summary class="ref-summary">`;
        html += `<span class="ref-toggle">▶</span>`;
        html += `<span class="code ref-fname">${escapeHtml(key)}</span>`;
        html += `<span class="code ref-ftype">${escapeHtml(typeText)}</span>`;
        html += `<span class="${requiredSet.has(key) ? 'required ref-freq' : 'ref-freq'}">${requiredSet.has(key) ? '是' : '否'}</span>`;
        html += `<span class="ref-fdesc">${prop.description ? escapeHtml(prop.description) : '-'}</span>`;
        html += `</summary><div class="ref-body">`;
        html += renderSchemaFieldsTable(subSchema, docUrl, documentMap, visitedRefs);
        html += `</div></details></td></tr>`;
      } else {
        // Regular row
        const typeText = schemaToTs(prop);
        html += '<tr>';
        html += `<td class="code">${escapeHtml(key)}</td>`;
        html += `<td class="code">${escapeHtml(typeText)}</td>`;
        html += `<td class="${requiredSet.has(key) ? 'required' : ''}">${requiredSet.has(key) ? '是' : '否'}</td>`;
        html += `<td>${prop.description ? escapeHtml(prop.description) : '-'}</td>`;
        html += '</tr>';
      }
    }

    html += '</tbody></table>';
    return html;
  }

  // Fallback: show as type string
  return `<div class="schema-block">${escapeHtml(schemaToTs(schema))}</div>`;
}

/* ───────── placeholder constants ───────── */

export const PLACEHOLDER = {
  TITLE: '{{TITLE}}',
  COVER_COMPANY: '{{COVER_COMPANY}}',
  COVER_TITLE: '{{COVER_TITLE}}',
  COVER_VERSION: '{{COVER_VERSION}}',
  COVER_DATE: '{{COVER_DATE}}',
  STAT_ENDPOINT_COUNT: '{{STAT_ENDPOINT_COUNT}}',
  STAT_MODULE_COUNT: '{{STAT_MODULE_COUNT}}',
  STYLES: '{{STYLES}}',
  TOC: '{{TOC}}',
  ENDPOINT_CARDS: '{{ENDPOINT_CARDS}}',
} as const;

/* ───────── default CSS ───────── */

export const DEFAULT_STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  color: #1f1f1f;
  background: #f5f5f5;
  font-size: 14px;
  line-height: 1.6;
}

.cover {
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  min-height: 100vh; min-height: 297mm;
  background: linear-gradient(135deg, #1677ff 0%, #0958d9 100%);
  color: #fff; text-align: center; padding: 60px 40px;
  page-break-after: always;
}
.cover-company { font-size: 14px; letter-spacing: 4px; opacity: 0.6; margin-bottom: 32px; text-transform: uppercase; }
.cover h1 { font-size: 40px; font-weight: 700; margin-bottom: 8px; letter-spacing: 2px; }
.cover .version { font-size: 18px; opacity: 0.85; margin-bottom: 48px; }
.cover .meta { font-size: 13px; opacity: 0.55; }
.cover .stats { margin-top: 16px; display: flex; justify-content: center; gap: 40px; }
.cover .stat-item { text-align: center; }
.cover .stat-num { font-size: 28px; font-weight: 600; }
.cover .stat-label { font-size: 12px; opacity: 0.65; }

.container { max-width: 960px; margin: 0 auto; padding: 0 24px 48px; }

.toc { margin-bottom: 40px; }
.toc h2 {
  font-size: 22px; font-weight: 700; color: #1f1f1f; margin-bottom: 16px;
  padding-bottom: 10px; border-bottom: 2px solid #1f1f1f; letter-spacing: 2px;
}
.toc-group { margin-bottom: 24px; }
.toc-group:last-child { margin-bottom: 0; }
.toc-module {
  font-size: 14px; font-weight: 600; color: #1677ff; margin-bottom: 8px;
  padding-left: 2px;
}
.toc-entry {
  display: flex; align-items: baseline; text-decoration: none;
  padding: 3px 4px; color: #434343; page-break-inside: avoid;
  overflow: hidden;
}
.toc-entry:hover { background: #f5f5f5; border-radius: 3px; }
.toc-badge {
  display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 10px;
  font-weight: 700; color: #fff; font-family: 'SFMono-Regular', Consolas, monospace;
  min-width: 40px; text-align: center; flex-shrink: 0; margin-right: 8px;
}
.toc-path {
  font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 40px;
}
.toc-leader {
  flex: 1; min-width: 12px; margin: 0 6px;
  border-bottom: 1px dotted #d9d9d9; height: 0; align-self: center;
}
.toc-summary {
  font-size: 12px; color: #8c8c8c; white-space: nowrap;
  flex-shrink: 0; text-align: right; max-width: 45%;
  overflow: hidden; text-overflow: ellipsis;
}

.card {
  background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08);
  margin-bottom: 20px; overflow: hidden; page-break-inside: avoid;
}
.card-header {
  display: flex; align-items: center; gap: 12px; padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
}
.method-badge {
  display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 13px;
  font-weight: 700; color: #fff; font-family: 'SFMono-Regular', Consolas, monospace; min-width: 56px; text-align: center;
}
.card-path { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; font-weight: 500; color: #1f1f1f; word-break: break-all; }
.card-summary { flex: 1; text-align: right; font-size: 13px; color: #8c8c8c; }
.card-body { padding: 16px 20px; }
.card-section { margin-bottom: 14px; }
.card-section:last-child { margin-bottom: 0; }
.card-section-title { font-size: 13px; font-weight: 600; color: #434343; margin-bottom: 6px; }
.card-section-desc { font-size: 13px; color: #595959; margin-bottom: 8px; line-height: 1.5; }
.card-desc-empty { font-style: italic; color: #bfbfbf; font-size: 13px; }

table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
thead th {
  background: #fafafa; text-align: left; padding: 6px 10px; font-weight: 600;
  color: #595959; border-bottom: 1px solid #e8e8e8; font-size: 12px;
}
tbody td { padding: 6px 10px; border-bottom: 1px solid #f5f5f5; color: #595959; vertical-align: top; word-break: break-word; }
tbody tr:hover { background: #fafafa; }
td.code { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; }
td.required { color: #ff4d4f; font-weight: 600; }
.col-name { width: 28%; }
.col-type { width: 18%; }
.col-loc  { width: 10%; }
.col-req  { width: 7%; }
.col-desc { width: auto; }

.schema-block {
  background: #f6f8fa; border-radius: 4px; padding: 10px 14px;
  font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; line-height: 1.7;
  color: #1f1f1f; overflow-x: auto; white-space: pre-wrap; word-break: break-word;
}

.ref-row td { padding: 0 !important; border-bottom: none !important; }
.ref-row:hover { background: transparent; }
.ref-summary {
  display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;
  padding: 6px 10px; list-style: none; font-size: 12px;
}
.ref-summary::-webkit-details-marker { display: none; }
.ref-summary::marker { display: none; }
.ref-toggle { font-size: 10px; color: #8c8c8c; width: 14px; flex-shrink: 0; text-align: center; transition: transform .15s; }
details[open] .ref-toggle { transform: rotate(90deg); }
.ref-fname { width: 28%; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; flex-shrink: 0; }
.ref-ftype { width: 18%; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; color: #595959; flex-shrink: 0; }
.ref-freq { width: 7%; font-size: 12px; flex-shrink: 0; }
.ref-fdesc { flex: 1; font-size: 12px; color: #595959; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ref-body { padding: 2px 0 8px 0; }
.ref-body table { font-size: 12px; }
.ref-body th { font-size: 11px; padding: 4px 8px; }
.ref-body td { padding: 4px 8px; }

@media print {
  body { background: #fff; }
  .cover { border-radius: 0; min-height: 297mm; page-break-after: always; }
  .card { box-shadow: none; border: 1px solid #e8e8e8; page-break-inside: avoid; }
  @page { margin: 0; }
}
`;

/* ───────── default template ───────── */

export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${PLACEHOLDER.TITLE}</title>
<style>${PLACEHOLDER.STYLES}</style>
</head>
<body>
<div class="container">
<div class="cover">
  <div class="cover-company">${PLACEHOLDER.COVER_COMPANY}</div>
  <h1>${PLACEHOLDER.COVER_TITLE}</h1>
  <div class="version">${PLACEHOLDER.COVER_VERSION}</div>
  <div class="meta">${PLACEHOLDER.COVER_DATE}</div>
  <div class="stats">
    <div class="stat-item"><div class="stat-num">${PLACEHOLDER.STAT_ENDPOINT_COUNT}</div><div class="stat-label">接口</div></div>
    <div class="stat-item"><div class="stat-num">${PLACEHOLDER.STAT_MODULE_COUNT}</div><div class="stat-label">模块</div></div>
  </div>
</div>
${PLACEHOLDER.TOC}
${PLACEHOLDER.ENDPOINT_CARDS}
</div>
</body>
</html>`;

/* ───────── renderers ───────── */

export function renderTocHtml(operations: ParsedOperation[]): string {
  const grouped = new Map<string, ParsedOperation[]>();
  for (const op of operations) {
    const list = grouped.get(op.moduleName);
    if (list) {
      list.push(op);
    } else {
      grouped.set(op.moduleName, [op]);
    }
  }

  const groups = Array.from(grouped.entries());
  let html = '<div class="toc"><h2>目录</h2>';

  for (const [moduleName, ops] of groups) {
    html += `<div class="toc-group"><div class="toc-module">${escapeHtml(moduleName)}</div>`;
    for (const op of ops) {
      const anchor = `#${op.functionName}`;
      const color = getMethodColor(op.method);
      html += `<a class="toc-entry" href="${anchor}">`;
      html += `<span class="toc-badge" style="background:${color}">${op.method.toUpperCase()}</span>`;
      html += `<span class="toc-path">${escapeHtml(op.path)}</span>`;
      html += '<span class="toc-leader"></span>';
      if (op.summary) {
        html += `<span class="toc-summary">${escapeHtml(op.summary)}</span>`;
      }
      html += '</a>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

export function renderParamsTableHtml(params: OpenApiParameter[]): string {
  if (!params.length) {
    return '<span class="card-desc-empty">无</span>';
  }

  let html = '<table><thead><tr><th class="col-name">名称</th><th class="col-type">类型</th><th class="col-req">必填</th><th class="col-desc">描述</th></tr></thead><tbody>';
  for (const p of params) {
    const typeText = paramTypeDisplay(p.schema);
    html += '<tr>';
    html += `<td class="code">${escapeHtml(p.name)}</td>`;
    html += `<td class="code">${escapeHtml(typeText)}</td>`;
    html += `<td class="${p.required ? 'required' : ''}">${p.required ? '是' : '否'}</td>`;
    html += `<td>${p.description ? escapeHtml(p.description) : '-'}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

export function renderEndpointCardHtml(op: ParsedOperation, documentMap: Map<string, OpenApiDocument>): string {
  const color = getMethodColor(op.method);
  const anchor = op.functionName;

  let html = `<div class="card" id="${anchor}">`;
  html += '<div class="card-header">';
  html += `<span class="method-badge" style="background:${color}">${op.method.toUpperCase()}</span>`;
  html += `<span class="card-path">${escapeHtml(op.path)}</span>`;
  if (op.summary) {
    html += `<span class="card-summary">${escapeHtml(op.summary)}</span>`;
  }
  html += '</div>';

  html += '<div class="card-body">';

  // Description
  if (op.description) {
    html += '<div class="card-section">';
    html += `<div class="card-section-desc">${escapeHtml(op.description)}</div>`;
    html += '</div>';
  }

  // Path parameters
  if (op.pathParams.length) {
    html += '<div class="card-section">';
    html += '<div class="card-section-title">路径参数</div>';
    html += renderParamsTableHtml(op.pathParams);
    html += '</div>';
  }

  // Query parameters
  if (op.queryParams.length) {
    html += '<div class="card-section">';
    html += '<div class="card-section-title">查询参数</div>';
    html += renderParamsTableHtml(op.queryParams);
    html += '</div>';
  }

  // Request body — render as fields table when possible
  if (op.requestBodySchema) {
    html += '<div class="card-section">';
    html += '<div class="card-section-title">请求体</div>';
    html += renderSchemaFieldsTable(op.requestBodySchema, op.docUrl, documentMap);
    html += '</div>';
  }

  // Response — render as fields table when possible
  if (op.responseSchema) {
    html += '<div class="card-section">';
    html += '<div class="card-section-title">响应</div>';
    html += renderSchemaFieldsTable(op.responseSchema, op.docUrl, documentMap);
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

/* ───────── template engine ───────── */

export interface TemplateContext {
  title: string;
  coverCompany: string;
  coverTitle: string;
  coverVersion: string;
  coverDate: string;
  statEndpointCount: string;
  statModuleCount: string;
  styles: string;
  toc: string;
  endpointCards: string;
}

export function buildTemplateContext(
  documentMap: Map<string, OpenApiDocument>,
  operations: ParsedOperation[],
  config: ResolvedConfig,
  themeCss?: string,
): TemplateContext {
  const firstDoc = documentMap.values().next().value as OpenApiDocument | undefined;
  const title = config.apiDocs.title || firstDoc?.info?.title || 'API Documentation';
  const version = firstDoc?.info?.version ? `v${firstDoc.info.version}` : '';

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const modules = new Set(operations.map((op) => op.moduleName));
  const moduleCount = modules.size;
  const fullStyles = themeCss ? DEFAULT_STYLES + '\n' + themeCss : DEFAULT_STYLES;

  return {
    title: escapeHtml(title),
    coverCompany: config.apiDocs.companyName ? escapeHtml(config.apiDocs.companyName) : '',
    coverTitle: escapeHtml(title),
    coverVersion: escapeHtml(version),
    coverDate: dateStr,
    statEndpointCount: String(operations.length),
    statModuleCount: String(moduleCount),
    styles: fullStyles,
    toc: renderTocHtml(operations),
    endpointCards: operations.map((op) => renderEndpointCardHtml(op, documentMap)).join('\n'),
  };
}

export function applyTemplate(templateHtml: string, ctx: TemplateContext): string {
  return templateHtml
    .replace(PLACEHOLDER.TITLE, ctx.title)
    .replace(PLACEHOLDER.COVER_COMPANY, ctx.coverCompany)
    .replace(PLACEHOLDER.COVER_TITLE, ctx.coverTitle)
    .replace(PLACEHOLDER.COVER_VERSION, ctx.coverVersion)
    .replace(PLACEHOLDER.COVER_DATE, ctx.coverDate)
    .replace(PLACEHOLDER.STAT_ENDPOINT_COUNT, ctx.statEndpointCount)
    .replace(PLACEHOLDER.STAT_MODULE_COUNT, ctx.statModuleCount)
    .replace(PLACEHOLDER.STYLES, ctx.styles)
    .replace(PLACEHOLDER.TOC, ctx.toc)
    .replace(PLACEHOLDER.ENDPOINT_CARDS, ctx.endpointCards);
}

/* ───────── main export ───────── */

/**
 * Generate API docs HTML.
 * @param templateHtml - Optional custom template. If omitted, the built-in default is used.
 *                       Use `{{PLACEHOLDER}}` tokens (exported as PLACEHOLDER) for data injection.
 */
export function generateApiDocsHtml(
  documentMap: Map<string, OpenApiDocument>,
  operations: ParsedOperation[],
  config: ResolvedConfig,
  templateHtml?: string,
  themeCss?: string,
): string {
  const ctx = buildTemplateContext(documentMap, operations, config, themeCss);
  const template = templateHtml ?? DEFAULT_TEMPLATE;
  return applyTemplate(template, ctx);
}
