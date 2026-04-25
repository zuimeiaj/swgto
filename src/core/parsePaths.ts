import type {
  OpenApiDocument,
  OpenApiParameter,
  OpenApiResponse,
  OpenApiSchema,
  ParsedOperation,
  ResolvedConfig,
} from '../types.js';
import { schemaToTs } from '../generators/schemaToTs.js';
import { buildDefaultMethodName, buildTypeName, sanitizeIdentifier } from '../utils/naming.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

function collectReferencedTypeNames(schema?: OpenApiSchema, collected: Set<string> = new Set()): string[] {
  if (!schema) {
    return [...collected];
  }

  if (schema.$ref) {
    const typeName = schema.$ref.split('/').pop();
    if (typeName) {
      collected.add(typeName);
    }
  }

  for (const child of schema.anyOf ?? []) {
    collectReferencedTypeNames(child, collected);
  }

  for (const child of schema.oneOf ?? []) {
    collectReferencedTypeNames(child, collected);
  }

  for (const child of schema.allOf ?? []) {
    collectReferencedTypeNames(child, collected);
  }

  if (schema.items) {
    collectReferencedTypeNames(schema.items, collected);
  }

  for (const property of Object.values(schema.properties ?? {})) {
    collectReferencedTypeNames(property, collected);
  }

  if (schema.additionalProperties && schema.additionalProperties !== true) {
    collectReferencedTypeNames(schema.additionalProperties, collected);
  }

  return [...collected];
}

function getPrimarySchema(content?: Record<string, { schema?: OpenApiSchema }>): OpenApiSchema | undefined {
  if (!content) {
    return undefined;
  }

  const jsonLikeKey = Object.keys(content).find((key) => key.includes('json')) ?? Object.keys(content)[0];
  return jsonLikeKey ? content[jsonLikeKey]?.schema : undefined;
}

function getSuccessResponse(responses?: Record<string, OpenApiResponse>): OpenApiSchema | undefined {
  if (!responses) {
    return undefined;
  }

  const successCode = ['200', '201', '202', 'default'].find((code) => responses[code]);
  return successCode ? getPrimarySchema(responses[successCode]?.content) : undefined;
}

export function parsePaths(
  document: OpenApiDocument,
  docUrl: string,
  config: ResolvedConfig,
): ParsedOperation[] {
  const operations: ParsedOperation[] = [];

  for (const [apiPath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number]) || !operation) {
        continue;
      }

      const moduleName = config.moduleName?.(docUrl) ?? 'services';
      if (config.ignoreUrl?.(apiPath, method, docUrl)) {
        continue;
      }

      const functionName = sanitizeIdentifier(
        config.renameMethod?.(apiPath, method) ?? buildDefaultMethodName(apiPath, method),
      );
      const requestPath = config.resolveRequestPath?.(apiPath, method, docUrl) ?? apiPath;
      const queryParams = (operation.parameters ?? []).filter((item): item is OpenApiParameter => item?.in === 'query');
      const pathParams = (operation.parameters ?? []).filter((item): item is OpenApiParameter => item?.in === 'path');
      const requestBodySchema = getPrimarySchema(operation.requestBody?.content);
      const responseSchema = getSuccessResponse(operation.responses);
      const hasRequestParams = queryParams.length > 0 || pathParams.length > 0 || Boolean(requestBodySchema);
      const bodyType = requestBodySchema ? schemaToTs(requestBodySchema) : undefined;
      const requestImportTypes = collectReferencedTypeNames(requestBodySchema);
      for (const param of queryParams) {
        requestImportTypes.push(...collectReferencedTypeNames(param.schema));
      }
      for (const param of pathParams) {
        requestImportTypes.push(...collectReferencedTypeNames(param.schema));
      }
      const pathFields = pathParams.map((param) => `${param.name}: ${schemaToTs(param.schema)};`);
      const queryFields = queryParams.map((param) => `${param.name}${param.required ? '' : '?'}: ${schemaToTs(param.schema)};`);
      const requestTypeParts: string[] = [];

      if (bodyType) {
        requestTypeParts.push(bodyType);
      }

      if (pathFields.length) {
        requestTypeParts.push(`{ path: { ${pathFields.join(' ')} } }`);
      }

      if (queryFields.length) {
        if (config.flattenQueryParam && queryParams.length === 1 && queryParams[0].schema?.$ref) {
          requestTypeParts.push(`{ query: ${schemaToTs(queryParams[0].schema)} }`);
        } else {
          requestTypeParts.push(`{ query: { ${queryFields.join(' ')} } }`);
        }
      }

      const requestTypeExpression = hasRequestParams ? requestTypeParts.join(' & ') || 'unknown' : undefined;

      operations.push({
        docUrl,
        moduleName,
        path: apiPath,
        requestPath,
        method,
        functionName,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        queryParams,
        pathParams,
        requestBodySchema,
        responseSchema,
        requestTypeExpression,
        requestImportTypes,
        responseTypeName: responseSchema ? buildTypeName(functionName, 'Response') : undefined,
        fileBaseName: functionName,
      });
    }
  }

  return operations;
}
