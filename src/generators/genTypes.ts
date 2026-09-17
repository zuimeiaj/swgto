import type { OpenApiDocument, ParsedOperation, ResolvedConfig } from '../types.js';
import { sanitizeSchemaTypeName } from '../utils/naming.js';
import { schemaToTs, toTypePropertyName } from './schemaToTs.js';

function formatDocLines(lines: string[]): string {
  if (!lines.length) {
    return '';
  }

  return ['/**', ...lines.map((line) => ` * ${line}`), ' */'].join('\n');
}

function buildSchemaDocLines(schema?: { description?: string; example?: unknown }): string[] {
  const lines: string[] = [];

  if (schema?.description) {
    lines.push(schema.description);
  }

  if (schema && schema.example !== undefined) {
    lines.push(`@example ${JSON.stringify(schema.example)}`);
  }

  return lines;
}

function buildSchemaDoc(schema?: { description?: string; example?: unknown }): string {
  return formatDocLines(buildSchemaDocLines(schema));
}

function buildParameterDoc(
  parameter: { description?: string; example?: unknown; required?: boolean },
  fallback: string,
): string {
  const lines: string[] = [parameter.description ?? fallback];

  if (parameter.required) {
    lines.push('@required');
  }

  if (parameter.example !== undefined) {
    lines.push(`@example ${JSON.stringify(parameter.example)}`);
  }

  return formatDocLines(lines);
}

function jsdocToInline(doc: string, indent: string): string[] {
  return doc
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return t !== '/**' && t !== '*/' && !t.startsWith('/**');
    })
    .map((line) => `${indent}// ${line.replace(/^\s*\* ?/, '')}`);
}

function renderObjectFields(
  fields: Array<{ name: string; type: string; optional?: boolean; doc?: string }>,
  indent: string = '',
): string[] {
  const lines: string[] = [];

  for (const field of fields) {
    if (field.doc) {
      lines.push(...jsdocToInline(field.doc, indent));
    }
    lines.push(`${indent}${field.name}${field.optional ? '?' : ''}: ${field.type};`);
  }

  return lines;
}

function renderComponentSchema(name: string, schema: unknown): string {
  const typedSchema = schema as { type?: string; properties?: Record<string, { description?: string; example?: unknown }>; required?: string[]; description?: string; example?: unknown };
  const doc = buildSchemaDoc(typedSchema);

  if (typedSchema.type === 'object' || typedSchema.properties) {
    const requiredSet = new Set(typedSchema.required ?? []);
    const fields = Object.entries(typedSchema.properties ?? {}).map(([key, value]) => ({
      name: toTypePropertyName(key),
      type: schemaToTs(value as never),
      optional: !requiredSet.has(key),
      doc: buildSchemaDoc(value),
    }));
    const body = renderObjectFields(fields, '  ').join('\n');
    return `${doc ? `${doc}\n` : ''}export interface ${name} {\n${body}\n}`;
  }

  return `${doc ? `${doc}\n` : ''}export type ${name} = ${schemaToTs(schema as never)};`;
}

function renderOperationTypes(operation: ParsedOperation): string[] {
  const blocks: string[] = [];

  if (operation.responseTypeName) {
    const responseDoc = buildSchemaDoc(operation.responseSchema);
    blocks.push(`${responseDoc ? `${responseDoc}\n` : ''}export type ${operation.responseTypeName} = ${schemaToTs(operation.responseSchema)};`);
  }

  return blocks;
}

function renderComponentSchemas(document: OpenApiDocument): string[] {
  return Object.entries(document.components?.schemas ?? {}).map(([name, schema]) => {
    return renderComponentSchema(sanitizeSchemaTypeName(name), schema);
  });
}

function toJSDocType(typeText: string): string {
  // Convert TS object syntax to JSDoc: replace ; with , and clean trailing comma
  return typeText.replace(/;\s*/g, ', ').replace(/,\s*\}/g, ' }');
}

interface TypedSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
  example?: unknown;
}

/**
 * Objects are rendered as `@typedef {Object}` + `@property` tags so every field
 * can carry its own description, mirroring the comments the TS output emits.
 * Everything else stays a plain `@typedef {Type} Name`.
 */
function renderJsTypedef(name: string, schema: unknown): string {
  const typed = schema as TypedSchema | undefined;
  const properties = Object.entries(typed?.properties ?? {});

  if (properties.length && (typed?.type === 'object' || typed?.properties)) {
    const requiredSet = new Set(typed?.required ?? []);
    const lines = [...buildSchemaDocLines(typed), `@typedef {Object} ${name}`];

    for (const [key, value] of properties) {
      const propName = toTypePropertyName(key);
      const fieldDoc = buildSchemaDocLines(value as TypedSchema).join(' ');
      const field = requiredSet.has(key) ? propName : `[${propName}]`;
      lines.push(`@property {${toJSDocType(schemaToTs(value as never))}} ${field}${fieldDoc ? ` - ${fieldDoc}` : ''}`);
    }

    return formatDocLines(lines);
  }

  const doc = buildSchemaDocLines(typed);
  const type = toJSDocType(schemaToTs(schema as never));

  return doc.length
    ? formatDocLines([...doc, `@typedef {${type}} ${name}`])
    : `/** @typedef {${type}} ${name} */`;
}

export function generateTypesFile(
  documentMap: Map<string, OpenApiDocument>,
  operations: ParsedOperation[],
  config: ResolvedConfig,
): string {
  if (config.outputType === 'js') {
    const parts: string[] = [
      '/* eslint-disable */',
      '// Auto-generated by swgto.',
      '/** @typedef {Record<string, unknown>} RequestConfig */',
    ];

    for (const [docUrl, document] of documentMap.entries()) {
      const moduleName = config.moduleName?.(docUrl) ?? 'services';
      parts.push(`// Types from ${moduleName}`);

      for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
        parts.push(renderJsTypedef(sanitizeSchemaTypeName(name), schema));
      }
    }

    for (const operation of operations) {
      if (operation.responseTypeName) {
        parts.push(renderJsTypedef(operation.responseTypeName, operation.responseSchema));
      }
    }

    parts.push('export {};');
    return `${parts.filter(Boolean).join('\n\n')}\n`;
  }

  const parts: string[] = [
    '/* eslint-disable */',
    '// Auto-generated by swgto.',
    'export type RequestConfig = Record<string, unknown>;',
  ];

  for (const [docUrl, document] of documentMap.entries()) {
    const moduleName = config.moduleName?.(docUrl) ?? 'services';
    parts.push(`// Types from ${moduleName}`);
    parts.push(...renderComponentSchemas(document));
  }

  for (const operation of operations) {
    parts.push(...renderOperationTypes(operation));
  }

  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

export function generateApiDtsContent(operations: ParsedOperation[], config: ResolvedConfig): string {
  const lines: string[] = ['// Auto-generated by swgto.', 'export * from "./index";', `export * from "./${config.typeName}";`];

  for (const operation of operations) {
    const paramsType = operation.requestTypeExpression ?? 'void';
    const responseType = operation.responseTypeName ?? 'unknown';
    lines.push(`export declare function ${operation.functionName}<T = ${responseType}>(params${paramsType === 'void' ? '?' : ''}: ${paramsType}, config?: import("./index").RequestConfig): Promise<T>;`);
  }

  return `${lines.join('\n')}\n`;
}
