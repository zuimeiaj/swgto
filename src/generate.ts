import path from 'node:path';
import { loadConfig } from './config/loadConfig.js';
import { groupByPrefix } from './core/groupByPrefix.js';
import { groupByController } from './core/groupByController.js';
import { parsePaths } from './core/parsePaths.js';
import { loadOpenApiDocument } from './fetch/loadOpenApi.js';
import { generateIndexFile } from './generators/genIndex.js';
import { generateJsModuleFile, generateJsRequestFile } from './generators/genRequestJs.js';
import { generateTsModuleFile, generateTsRequestFile } from './generators/genRequestTs.js';
import { generateTypesFile } from './generators/genTypes.js';
import type { OpenApiDocument, ParsedOperation } from './types.js';
import { removeDir, writeTextFile } from './utils/fs.js';

function getRootImportPath(typeName: string): string {
  return `../${typeName}`;
}

export interface GenerateResult {
  configPath: string;
  files: string[];
  operationCount: number;
  moduleCount: number;
  apiFileCount: number;
}

export async function generateFromConfig(cwd: string = process.cwd()): Promise<GenerateResult> {
  const { configPath, config } = await loadConfig(cwd);
  const documentMap = new Map<string, OpenApiDocument>();
  const operations: ParsedOperation[] = [];

  if (config.cleanOutput) {
    await removeDir(path.join(cwd, config.outputDir));
    console.log(`Cleaned output directory: ${config.outputDir}`);
  }

  for (const docUrl of config.docUrls) {
    const document = await loadOpenApiDocument(docUrl);
    documentMap.set(docUrl, document);
    operations.push(...parsePaths(document, docUrl, config));
  }

  const grouped = groupByPrefix(operations);
  const files: string[] = [];

  for (const [moduleName, moduleOperations] of Object.entries(grouped)) {
    if (config.fileNaming === 'module') {
      const controllerMap = groupByController(moduleOperations);

      for (const [controllerName, controllerOperations] of Object.entries(controllerMap)) {
        const relativeFile = path.join(config.outputDir, moduleName, `${controllerName}.${config.outputType}`);
        const absoluteFile = path.join(cwd, relativeFile);
        const content = config.outputType === 'ts'
          ? generateTsModuleFile(controllerOperations, config.httpClientPath, getRootImportPath(config.typeName), config.mergeParams)
          : generateJsModuleFile(controllerOperations, config.httpClientPath, getRootImportPath(config.typeName), config.mergeParams);

        for (const op of controllerOperations) {
          op.fileBaseName = controllerName;
        }

        await writeTextFile(absoluteFile, content);
        files.push(relativeFile);
      }
    } else {
      for (const operation of moduleOperations) {
        const relativeFile = path.join(config.outputDir, moduleName, `${operation.fileBaseName}.${config.outputType}`);
        const absoluteFile = path.join(cwd, relativeFile);
        const content = config.outputType === 'ts'
          ? generateTsRequestFile(operation, config.httpClientPath, getRootImportPath(config.typeName), config.mergeParams)
          : generateJsRequestFile(operation, config.httpClientPath, getRootImportPath(config.typeName), config.mergeParams);

        await writeTextFile(absoluteFile, content);
        files.push(relativeFile);
      }
    }
  }

  const typesContent = generateTypesFile(documentMap, operations, config);
  const indexContent = generateIndexFile(operations, config);
  const typesFile = path.join(cwd, config.outputDir, `${config.typeName}.${config.outputType === 'ts' ? 'ts' : 'js'}`);
  const indexFile = path.join(cwd, config.outputDir, `index.${config.outputType}`);

  await writeTextFile(typesFile, typesContent);
  await writeTextFile(indexFile, indexContent);

  files.push(
    path.relative(cwd, typesFile),
    path.relative(cwd, indexFile),
  );

  return {
    configPath,
    files,
    operationCount: operations.length,
    moduleCount: Object.keys(grouped).length,
    apiFileCount: files.length - 2, // exclude types + index
  };
}
