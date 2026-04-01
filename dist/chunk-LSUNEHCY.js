// src/generate.ts
import path3 from "path";

// src/config/loadConfig.ts
import { existsSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createJiti } from "jiti";
var CONFIG_FILES = [".swaggerts.config.ts", ".swaggerts.config.js"];
function assertConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("`.swaggerts.config` must export a config object.");
  }
  if (!config.docUrls || typeof config.docUrls !== "string" && !Array.isArray(config.docUrls)) {
    throw new Error("`docUrls` must be a string or string array.");
  }
  if (!config.httpClientPath) {
    throw new Error("`httpClientPath` is required.");
  }
  if (Array.isArray(config.docUrls) && config.docUrls.length > 1 && typeof config.moduleName !== "function") {
    throw new Error("`moduleName(docUrl)` is required when `docUrls` contains multiple documents.");
  }
}
async function loadConfig(cwd) {
  const configPath = CONFIG_FILES.map((fileName) => path.join(cwd, fileName)).find((filePath) => existsSync(filePath));
  if (!configPath) {
    throw new Error("Cannot find `.swaggerts.config.ts` or `.swaggerts.config.js` in current directory.");
  }
  const jiti = createJiti(pathToFileURL(configPath).href, {
    interopDefault: true
  });
  const loaded = await jiti.import(configPath);
  const rawConfig = loaded?.default ?? loaded;
  assertConfig(rawConfig);
  const docUrls = Array.isArray(rawConfig.docUrls) ? rawConfig.docUrls : [rawConfig.docUrls];
  const config = {
    ...rawConfig,
    docUrls,
    outputDir: rawConfig.outputDir ?? "src/api",
    outputType: rawConfig.outputType ?? "ts",
    typeName: rawConfig.typeName ?? "types"
  };
  return { configPath, config };
}

// src/core/groupByPrefix.ts
function groupByPrefix(operations) {
  return operations.reduce((acc, operation) => {
    acc[operation.moduleName] ??= {};
    acc[operation.moduleName][operation.pathPrefix] ??= [];
    acc[operation.moduleName][operation.pathPrefix].push(operation);
    return acc;
  }, {});
}

// src/utils/naming.ts
function toPascalCase(value) {
  return value.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((segment) => segment[0].toUpperCase() + segment.slice(1)).join("");
}
function sanitizePathSegment(value) {
  return value.replace(/^\//, "").replace(/\{|\}/g, "").replace(/[^a-zA-Z0-9/_-]/g, "").replace(/\/+/g, "/");
}
function getPathPrefix(apiPath) {
  const segments = sanitizePathSegment(apiPath).split("/").filter(Boolean);
  return segments[0] || "root";
}
function buildDefaultMethodName(apiPath, method) {
  const cleaned = sanitizePathSegment(apiPath).replace(/\//g, "_").replace(/_+/g, "_");
  return [method.toLowerCase(), cleaned || "root"].join("_");
}
function buildTypeName(functionName, suffix) {
  return `${toPascalCase(functionName)}${suffix}`;
}

// src/core/parsePaths.ts
var HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];
function getPrimarySchema(content) {
  if (!content) {
    return void 0;
  }
  const jsonLikeKey = Object.keys(content).find((key) => key.includes("json")) ?? Object.keys(content)[0];
  return jsonLikeKey ? content[jsonLikeKey]?.schema : void 0;
}
function getSuccessResponse(responses) {
  if (!responses) {
    return void 0;
  }
  const successCode = ["200", "201", "202", "default"].find((code) => responses[code]);
  return successCode ? getPrimarySchema(responses[successCode]?.content) : void 0;
}
function parsePaths(document, docUrl, config) {
  const operations = [];
  for (const [apiPath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!HTTP_METHODS.includes(method) || !operation) {
        continue;
      }
      const pathPrefix = getPathPrefix(apiPath);
      const moduleName = config.moduleName?.(docUrl) ?? "services";
      const functionName = config.renameMethod?.(apiPath, method) ?? buildDefaultMethodName(apiPath, method);
      const queryParams = (operation.parameters ?? []).filter((item) => item?.in === "query");
      const pathParams = (operation.parameters ?? []).filter((item) => item?.in === "path");
      const requestBodySchema = getPrimarySchema(operation.requestBody?.content);
      const responseSchema = getSuccessResponse(operation.responses);
      operations.push({
        docUrl,
        moduleName,
        path: apiPath,
        pathPrefix,
        method,
        functionName,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        queryParams,
        pathParams,
        requestBodySchema,
        responseSchema,
        requestTypeName: queryParams.length || pathParams.length || requestBodySchema ? buildTypeName(functionName, "Request") : void 0,
        responseTypeName: responseSchema ? buildTypeName(functionName, "Response") : void 0,
        fileBaseName: functionName
      });
    }
  }
  return operations;
}

// src/fetch/loadOpenApi.ts
async function loadOpenApiDocument(docUrl) {
  const response = await fetch(docUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI document: ${docUrl} (${response.status})`);
  }
  const document = await response.json();
  if (!document.openapi?.startsWith("3.")) {
    throw new Error(`Only OpenAPI 3.x is supported: ${docUrl}`);
  }
  if (!document.paths || typeof document.paths !== "object") {
    throw new Error(`OpenAPI document does not contain valid paths: ${docUrl}`);
  }
  return document;
}

// src/generators/genIndex.ts
function generateIndexFile(operations, config) {
  const extension = config.outputType === "ts" ? ".ts" : ".js";
  const exports = operations.map((operation) => {
    return `export { ${operation.functionName} } from "./${operation.moduleName}/${operation.pathPrefix}/${operation.fileBaseName}${extension}";`;
  });
  return `/* eslint-disable */
// Auto-generated by swgto.
${exports.join("\n")}
`;
}

// src/generators/genRequestJs.ts
function generateJsRequestFile(operation, httpClientPath, typeImportPath) {
  const requestParamType = operation.requestTypeName ?? "Record<string, unknown>";
  const responseType = operation.responseTypeName ?? "unknown";
  const queryLine = operation.queryParams.length ? "    params,\n" : "";
  const bodyLine = operation.requestBodySchema ? "    data: params.body,\n" : "";
  return `/* eslint-disable */
// Auto-generated by swgto.
import request from ${JSON.stringify(httpClientPath)};

/**
 * @param {import(${JSON.stringify(typeImportPath)}).${requestParamType}} params
 * @returns {Promise<import(${JSON.stringify(typeImportPath)}).${responseType}>}
 */
export async function ${operation.functionName}(params) {
  return request({
    url: ${JSON.stringify(operation.path)},
    method: ${JSON.stringify(operation.method)},
${queryLine}${bodyLine}  });
}
`;
}

// src/generators/genRequestTs.ts
function generateTsRequestFile(operation, httpClientPath, typeImportPath) {
  const requestType = operation.requestTypeName ? `import type { ${operation.requestTypeName}` : "";
  const responseType = operation.responseTypeName ? `${operation.requestTypeName ? ", " : ""}${operation.responseTypeName}` : "";
  const importLine = operation.requestTypeName || operation.responseTypeName ? `${requestType}${responseType} } from ${JSON.stringify(typeImportPath)};
` : "";
  const requestArg = operation.requestTypeName ? `params: ${operation.requestTypeName}` : "";
  const responseGeneric = operation.responseTypeName ? `<${operation.responseTypeName}>` : "";
  const bodyLine = operation.requestBodySchema ? "    data: params.body,\n" : "";
  const queryLine = operation.queryParams.length ? "    params,\n" : "";
  return `/* eslint-disable */
// Auto-generated by swgto.
import request from ${JSON.stringify(httpClientPath)};
${importLine}
export async function ${operation.functionName}(${requestArg}): Promise${responseGeneric || "<unknown>"} {
  return request${responseGeneric}({
    url: ${JSON.stringify(operation.path)},
    method: ${JSON.stringify(operation.method)},
${queryLine}${bodyLine}  });
}
`;
}

// src/generators/schemaToTs.ts
function refToTypeName(ref) {
  const parts = ref.split("/");
  return parts[parts.length - 1] || "unknown";
}
function schemaToTs(schema) {
  if (!schema) {
    return "unknown";
  }
  if (schema.$ref) {
    return refToTypeName(schema.$ref);
  }
  if (schema.enum?.length) {
    return schema.enum.map((item) => JSON.stringify(item)).join(" | ");
  }
  if (schema.anyOf?.length) {
    return schema.anyOf.map((item) => schemaToTs(item)).join(" | ");
  }
  if (schema.oneOf?.length) {
    return schema.oneOf.map((item) => schemaToTs(item)).join(" | ");
  }
  if (schema.allOf?.length) {
    return schema.allOf.map((item) => schemaToTs(item)).join(" & ");
  }
  if (schema.type === "array") {
    return `${schemaToTs(schema.items)}[]`;
  }
  if (schema.type === "object" || schema.properties) {
    const requiredSet = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).map(([key, value]) => {
      const optional = requiredSet.has(key) ? "" : "?";
      return `${JSON.stringify(key)}${optional}: ${schemaToTs(value)};`;
    });
    if (!properties.length && schema.additionalProperties) {
      const valueType = schema.additionalProperties === true ? "unknown" : schemaToTs(schema.additionalProperties);
      return `{ [key: string]: ${valueType} }`;
    }
    return `{ ${properties.join(" ")} }`;
  }
  switch (schema.type) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "null":
      return "null";
    default:
      return "unknown";
  }
}

// src/generators/genTypes.ts
function renderOperationTypes(operation) {
  const blocks = [];
  if (operation.requestTypeName) {
    const fields = [];
    for (const param of operation.pathParams) {
      fields.push(`${param.name}: ${schemaToTs(param.schema)};`);
    }
    for (const param of operation.queryParams) {
      fields.push(`${param.name}${param.required ? "" : "?"}: ${schemaToTs(param.schema)};`);
    }
    if (operation.requestBodySchema) {
      fields.push(`body${operation.requestBodySchema.nullable ? "?" : ""}: ${schemaToTs(operation.requestBodySchema)};`);
    }
    blocks.push(`export interface ${operation.requestTypeName} { ${fields.join(" ")} }`);
  }
  if (operation.responseTypeName) {
    blocks.push(`export type ${operation.responseTypeName} = ${schemaToTs(operation.responseSchema)};`);
  }
  return blocks;
}
function renderComponentSchemas(document) {
  return Object.entries(document.components?.schemas ?? {}).map(([name, schema]) => {
    return `export type ${name} = ${schemaToTs(schema)};`;
  });
}
function toJSDocType(typeText) {
  return typeText.replace(/;/g, "").replace(/\?/g, "=");
}
function generateTypesFile(documentMap, operations, config) {
  if (config.outputType === "js") {
    const parts2 = ["/* eslint-disable */", "// Auto-generated by swgto."];
    for (const [docUrl, document] of documentMap.entries()) {
      const moduleName = config.moduleName?.(docUrl) ?? "services";
      parts2.push(`// Types from ${moduleName}`);
      for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
        parts2.push(`/** @typedef {${toJSDocType(schemaToTs(schema))}} ${name} */`);
      }
    }
    for (const operation of operations) {
      if (operation.requestTypeName) {
        const rendered = renderOperationTypes(operation).find((line) => line.startsWith(`export interface ${operation.requestTypeName}`));
        if (rendered) {
          const body = rendered.replace(`export interface ${operation.requestTypeName} `, "").trim();
          parts2.push(`/** @typedef ${body} ${operation.requestTypeName} */`);
        }
      }
      if (operation.responseTypeName) {
        parts2.push(`/** @typedef {${toJSDocType(schemaToTs(operation.responseSchema))}} ${operation.responseTypeName} */`);
      }
    }
    parts2.push("export {};");
    return `${parts2.filter(Boolean).join("\n\n")}
`;
  }
  const parts = ["/* eslint-disable */", "// Auto-generated by swgto."];
  for (const [docUrl, document] of documentMap.entries()) {
    const moduleName = config.moduleName?.(docUrl) ?? "services";
    parts.push(`// Types from ${moduleName}`);
    parts.push(...renderComponentSchemas(document));
  }
  for (const operation of operations) {
    parts.push(...renderOperationTypes(operation));
  }
  return `${parts.filter(Boolean).join("\n\n")}
`;
}
function generateApiDtsContent(operations, config) {
  const lines = ["// Auto-generated by swgto.", 'export * from "./index";', `export * from "./${config.typeName}";`];
  for (const operation of operations) {
    const paramsType = operation.requestTypeName ?? "void";
    const responseType = operation.responseTypeName ?? "unknown";
    lines.push(`export declare function ${operation.functionName}(params${paramsType === "void" ? "?" : ""}: ${paramsType}): Promise<${responseType}>;`);
  }
  return `${lines.join("\n")}
`;
}

// src/utils/fs.ts
import { mkdir, writeFile } from "fs/promises";
import path2 from "path";
async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}
async function writeTextFile(filePath, content) {
  await ensureDir(path2.dirname(filePath));
  await writeFile(filePath, content, "utf8");
}

// src/generate.ts
function getRootImportPath(fileKind, typeName) {
  return fileKind === "types" ? `../../${typeName}` : "../../api";
}
async function generateFromConfig(cwd = process.cwd()) {
  const { configPath, config } = await loadConfig(cwd);
  const documentMap = /* @__PURE__ */ new Map();
  const operations = [];
  for (const docUrl of config.docUrls) {
    const document = await loadOpenApiDocument(docUrl);
    documentMap.set(docUrl, document);
    operations.push(...parsePaths(document, docUrl, config));
  }
  const grouped = groupByPrefix(operations);
  const files = [];
  for (const [moduleName, prefixes] of Object.entries(grouped)) {
    for (const [prefix, groupOperations] of Object.entries(prefixes)) {
      for (const operation of groupOperations) {
        const relativeFile = path3.join(config.outputDir, moduleName, prefix, `${operation.fileBaseName}.${config.outputType}`);
        const absoluteFile = path3.join(cwd, relativeFile);
        const content = config.outputType === "ts" ? generateTsRequestFile(operation, config.httpClientPath, getRootImportPath("types", config.typeName)) : generateJsRequestFile(operation, config.httpClientPath, getRootImportPath("api", config.typeName));
        await writeTextFile(absoluteFile, content);
        files.push(relativeFile);
      }
    }
  }
  const typesContent = generateTypesFile(documentMap, operations, config);
  const apiDtsContent = generateApiDtsContent(operations, config);
  const indexContent = generateIndexFile(operations, config);
  const typesFile = path3.join(cwd, config.outputDir, `${config.typeName}.${config.outputType === "ts" ? "ts" : "js"}`);
  const apiDtsFile = path3.join(cwd, config.outputDir, "api.d.ts");
  const indexFile = path3.join(cwd, config.outputDir, `index.${config.outputType}`);
  await writeTextFile(typesFile, typesContent);
  await writeTextFile(apiDtsFile, apiDtsContent);
  await writeTextFile(indexFile, indexContent);
  files.push(
    path3.relative(cwd, typesFile),
    path3.relative(cwd, apiDtsFile),
    path3.relative(cwd, indexFile)
  );
  return {
    configPath,
    files,
    operationCount: operations.length,
    moduleCount: Object.keys(grouped).length
  };
}

export {
  generateFromConfig
};
