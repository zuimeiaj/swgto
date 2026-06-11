export type OutputType = 'ts' | 'js';
export type RequestConfig = Record<string, unknown>;

export interface ApiDocsConfig {
  enable?: boolean;
  output?: string;
  title?: string;
  companyName?: string;
  template?: string;
  theme?: string;
}

export interface SwaggerTsConfig {
  docUrls: string | string[];
  httpClientPath: string;
  renameMethod?: (path: string, method: string) => string;
  resolveRequestPath?: (path: string, method: string, docUrl: string) => string;
  ignoreUrl?: (path: string, method: string, docUrl: string) => boolean;
  outputDir?: string;
  moduleName?: (docUrl: string) => string;
  outputType?: OutputType;
  typeName?: string;
  cleanOutput?: boolean;
  fileNaming?: 'module' | 'path';
  flattenQueryParam?: boolean;
  mergeParams?: boolean;
  apiDocs?: ApiDocsConfig;
}

export interface OpenApiDocument {
  openapi: string;
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
}

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: OpenApiSchema;
  description?: string;
  example?: unknown;
}

export interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: OpenApiSchema }>;
}

export interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: OpenApiSchema }>;
}

export interface OpenApiSchema {
  $ref?: string;
  type?: string;
  format?: string;
  description?: string;
  example?: unknown;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  enum?: Array<string | number>;
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  additionalProperties?: boolean | OpenApiSchema;
  nullable?: boolean;
}

export interface ResolvedConfig extends SwaggerTsConfig {
  docUrls: string[];
  outputDir: string;
  outputType: OutputType;
  typeName: string;
  fileNaming: 'module' | 'path';
  flattenQueryParam: boolean;
  mergeParams: boolean;
  apiDocs: {
    enable: boolean;
    output: string;
    title?: string;
    companyName?: string;
    template?: string;
    theme?: string;
  };
}

export interface ParsedOperation {
  docUrl: string;
  moduleName: string;
  path: string;
  requestPath: string;
  method: string;
  functionName: string;
  operationId?: string;
  summary?: string;
  description?: string;
  queryParams: OpenApiParameter[];
  pathParams: OpenApiParameter[];
  requestBodySchema?: OpenApiSchema;
  responseSchema?: OpenApiSchema;
  requestTypeExpression?: string;
  requestImportTypes: string[];
  responseTypeName?: string;
  fileBaseName: string;
}
