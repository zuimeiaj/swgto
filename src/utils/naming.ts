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
