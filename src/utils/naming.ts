import { pinyin } from 'pinyin-pro';

export function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join('');
}

export function toCamelCase(value: string): string {
  const pascal = toPascalCase(value);
  return pascal ? pascal[0].toLowerCase() + pascal.slice(1) : '';
}

export function sanitizePathSegment(value: string): string {
  return value
    .replace(/^\//, '')
    .replace(/\{|\}/g, '')
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .replace(/\/+/g, '/');
}

export function sanitizeIdentifier(value: string): string {
  const normalized = value
    .replace(/[^a-zA-Z0-9_$]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return 'generated_api';
  }

  return /^[0-9]/.test(normalized) ? `api_${normalized}` : normalized;
}

export function getPathPrefix(apiPath: string): string {
  const segments = sanitizePathSegment(apiPath).split('/').filter(Boolean);
  return segments[0] || 'root';
}

export function buildDefaultMethodName(apiPath: string, method: string): string {
  const cleaned = sanitizePathSegment(apiPath).replace(/\//g, '_').replace(/_+/g, '_');
  return sanitizeIdentifier([method.toLowerCase(), cleaned || 'root'].join('_'));
}

export function buildTypeName(functionName: string, suffix: 'Request' | 'Response'): string {
  return `${toPascalCase(functionName)}${suffix}`;
}

/**
 * 将 schema name 转为合法的 TypeScript 标识符。
 * - 中文 → 拼音首字母大写
 * - «» → _
 * - 保留英文原始大小写
 * 例如：
 *   "响应«BackCardRes»" → "Xiangying_BackCardRes"
 *   "用户信息"           → "YonghuXinxi"
 *   "ABCResponse"       → "ABCResponse"
 */
export function sanitizeSchemaTypeName(raw: string): string {
  // 先将 «» 替换为 _，去掉中文括号
  let s = raw.replace(/[«»（）()]/g, '_');

  // 用 pinyin-pro 将中文转为拼音（无声调）
  // type: 'array' 返回每个字符的拼音，非中文字符原样返回
  s = pinyin(s, { toneType: 'none', type: 'array' }).join('');

  // 按 _ 分段，只首字母大写（不改动后续字符，保留英文原始大小写）
  s = s
    .split('_')
    .filter(Boolean)
    .map((seg) => (seg ? seg[0].toUpperCase() + seg.slice(1) : ''))
    .join('_');

  // 去掉所有非 ASCII 标识符字符（保留字母、数字、_）
  s = s.replace(/[^A-Za-z0-9_]/g, '');

  // 清理：连续 _ 合并，去掉首尾 _
  s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');

  return s || 'GeneratedType';
}
