import type { OpenApiDocument, ParsedOperation, ResolvedConfig } from '../types.js';
import { schemaToTs, toTypePropertyName } from './schemaToTs.js';

function formatDocLines(lines: string[]): string {
  if (!lines.length) {
    return '';
  }

  return ['/**', ...lines.map((line) => ` * ${line}`), ' */'].join('\n');
}

function buildSchemaDoc(schema?: { description?: string; example?: unknown }): string {
  const lines: string[] = [];

  if (schema?.description) {
    lines.push(schema.description);
  }

  if (schema && schema.example !== undefined) {
    lines.push(`@example ${JSON.stringify(schema.example)}`);
  }

  return formatDocLines(lines);
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

function renderObjectFields(
  fields: Array<{ name: string; type: string; optional?: boolean; doc?: string }>,
  indent: string = '',
): string[] {
  const lines: string[] = [];

  for (const field of fields) {
    if (field.doc) {
      lines.push(...field.doc.split('\n').map((line) => `${indent}${line}`));
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

  if (operation.requestTypeName) {
    const fields: string[] = [];
    const pathFields: Array<{ name: string; type: string; optional?: boolean; doc?: string }> = [];
    const queryFields: Array<{ name: string; type: string; optional?: boolean; doc?: string }> = [];

    for (const param of operation.pathParams) {
      pathFields.push({
        name: toTypePropertyName(param.name),
        type: schemaToTs(param.schema),
        optional: false,
        doc: buildParameterDoc(param, `Path parameter: ${param.name}`),
      });
    }

    for (const param of operation.queryParams) {
      queryFields.push({
        name: toTypePropertyName(param.name),
        type: schemaToTs(param.schema),
        optional: !param.required,
        doc: buildParameterDoc(param, `Query parameter: ${param.name}`),
      });
    }

    if (operation.requestBodySchema) {
      const doc = buildSchemaDoc(operation.requestBodySchema);
      if (doc) {
        fields.push(...doc.split('\n'));
      }
      fields.push(`body${operation.requestBodySchema.nullable ? '?' : ''}: ${schemaToTs(operation.requestBodySchema)};`);
    }

    if (pathFields.length) {
      fields.push('/** Path parameters */');
      fields.push('path: {');
      fields.push(...renderObjectFields(pathFields, '  '));
      fields.push('};');
    }

    if (queryFields.length) {
      fields.push('/** Query parameters */');
      fields.push('query: {');
      fields.push(...renderObjectFields(queryFields, '  '));
      fields.push('};');
    }

    const requestDoc = formatDocLines(
      [
        operation.summary,
        operation.description,
      ].filter((value): value is string => Boolean(value)),
    );
    blocks.push(`${requestDoc ? `${requestDoc}\n` : ''}export interface ${operation.requestTypeName} {\n${fields.map((line) => `  ${line}`).join('\n')}\n}`);
  }

  if (operation.responseTypeName) {
    const responseDoc = buildSchemaDoc(operation.responseSchema);
    blocks.push(`${responseDoc ? `${responseDoc}\n` : ''}export type ${operation.responseTypeName} = ${schemaToTs(operation.responseSchema)};`);
  }

  return blocks;
}

function renderComponentSchemas(document: OpenApiDocument): string[] {
  return Object.entries(document.components?.schemas ?? {}).map(([name, schema]) => {
    return renderComponentSchema(name, schema);
  });
}

function toJSDocType(typeText: string): string {
  return typeText.replace(/;/g, '').replace(/\?/g, '=');
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
        parts.push(`/** @typedef {${toJSDocType(schemaToTs(schema as never))}} ${name} */`);
      }
    }

    for (const operation of operations) {
      if (operation.requestTypeName) {
        const rendered = renderOperationTypes(operation).find((line) => line.startsWith(`export interface ${operation.requestTypeName}`));
        if (rendered) {
          const body = rendered
            .replace(`export interface ${operation.requestTypeName} `, '')
            .trim();
          parts.push(`/** @typedef ${body} ${operation.requestTypeName} */`);
        }
      }

      if (operation.responseTypeName) {
        parts.push(`/** @typedef {${toJSDocType(schemaToTs(operation.responseSchema))}} ${operation.responseTypeName} */`);
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
    const paramsType = operation.requestTypeName ?? 'void';
    const responseType = operation.responseTypeName ?? 'unknown';
    lines.push(`export declare function ${operation.functionName}<T = ${responseType}>(params${paramsType === 'void' ? '?' : ''}: ${paramsType}, config?: import("./index").RequestConfig): Promise<T>;`);
  }

  return `${lines.join('\n')}\n`;
}
