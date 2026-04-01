import type { OpenApiSchema } from '../types.js';

function formatPropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function refToTypeName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1] || 'unknown';
}

export function schemaToTs(schema?: OpenApiSchema): string {
  if (!schema) {
    return 'unknown';
  }

  if (schema.$ref) {
    return refToTypeName(schema.$ref);
  }

  if (schema.enum?.length) {
    return schema.enum.map((item) => JSON.stringify(item)).join(' | ');
  }

  if (schema.anyOf?.length) {
    return schema.anyOf.map((item) => schemaToTs(item)).join(' | ');
  }

  if (schema.oneOf?.length) {
    return schema.oneOf.map((item) => schemaToTs(item)).join(' | ');
  }

  if (schema.allOf?.length) {
    return schema.allOf.map((item) => schemaToTs(item)).join(' & ');
  }

  if (schema.type === 'array') {
    return `${schemaToTs(schema.items)}[]`;
  }

  if (schema.type === 'object' || schema.properties) {
    const requiredSet = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).map(([key, value]) => {
      const optional = requiredSet.has(key) ? '' : '?';
      return `${formatPropertyName(key)}${optional}: ${schemaToTs(value)};`;
    });

    if (!properties.length && schema.additionalProperties) {
      const valueType = schema.additionalProperties === true ? 'unknown' : schemaToTs(schema.additionalProperties);
      return `{ [key: string]: ${valueType} }`;
    }

    return `{ ${properties.join(' ')} }`;
  }

  switch (schema.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

export function toTypePropertyName(name: string): string {
  return formatPropertyName(name);
}
