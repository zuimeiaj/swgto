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
 * - 中文 → 拼音每个音节首字母大写（驼峰）
 * - «» → _
 * - 保留英文原始大小写
 * 例如：
 *   "响应«BackCardRes»" → "XiangYing_BackCardRes"
 *   "分页"               → "FenYe"
 *   "ABCResponse"       → "ABCResponse"
 */
export function sanitizeSchemaTypeName(raw: string): string {
  let result = '';

  for (const ch of raw) {
    // «» 和中文括号 → _
    if ('«»（）()'.includes(ch)) {
      result += '_';
    } else if (/[一-鿿]/.test(ch)) {
      // 中文字符 → 拼音首字母大写
      const py = pinyin(ch, { toneType: 'none' });
      result += py[0].toUpperCase() + py.slice(1);
    } else {
      // 英文/数字/其他 → 原样保留
      result += ch;
    }
  }

  // 去掉所有非 ASCII 标识符字符（保留字母、数字、_）
  result = result.replace(/[^A-Za-z0-9_]/g, '');

  // 清理：连续 _ 合并，去掉首尾 _
  result = result.replace(/_+/g, '_').replace(/^_+|_+$/g, '');

  return result || 'GeneratedType';
}
