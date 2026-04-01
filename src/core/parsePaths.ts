import type {
  OpenApiDocument,
  OpenApiParameter,
  OpenApiResponse,
  OpenApiSchema,
  ParsedOperation,
  ResolvedConfig,
} from '../types.js';
import { buildDefaultMethodName, buildTypeName, sanitizeIdentifier } from '../utils/naming.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

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
      const functionName = sanitizeIdentifier(
        config.renameMethod?.(apiPath, method) ?? buildDefaultMethodName(apiPath, method),
      );
      const requestPath = config.resolveRequestPath?.(apiPath, method, docUrl) ?? apiPath;
      const queryParams = (operation.parameters ?? []).filter((item): item is OpenApiParameter => item?.in === 'query');
      const pathParams = (operation.parameters ?? []).filter((item): item is OpenApiParameter => item?.in === 'path');
      const requestBodySchema = getPrimarySchema(operation.requestBody?.content);
      const responseSchema = getSuccessResponse(operation.responses);
      const hasRequestParams = queryParams.length > 0 || pathParams.length > 0 || Boolean(requestBodySchema);
      const requestTypeName = hasRequestParams
        ? buildTypeName(functionName, 'Request')
        : undefined;

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
        requestTypeName,
        responseTypeName: responseSchema ? buildTypeName(functionName, 'Response') : undefined,
        fileBaseName: functionName,
      });
    }
  }

  return operations;
}
