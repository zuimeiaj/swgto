import path from 'node:path';
import { loadConfig } from './config/loadConfig.js';
import { groupByPrefix } from './core/groupByPrefix.js';
import { parsePaths } from './core/parsePaths.js';
import { loadOpenApiDocument } from './fetch/loadOpenApi.js';
import { generateIndexFile } from './generators/genIndex.js';
import { generateJsRequestFile } from './generators/genRequestJs.js';
import { generateTsRequestFile } from './generators/genRequestTs.js';
import { generateApiDtsContent, generateTypesFile } from './generators/genTypes.js';
import type { OpenApiDocument, ParsedOperation } from './types.js';
import { removeDir, writeTextFile } from './utils/fs.js';

function getRootImportPath(fileKind: 'types' | 'api', typeName: string): string {
  return fileKind === 'types' ? `../${typeName}` : '../api';
}

export interface GenerateResult {
  configPath: string;
  files: string[];
  operationCount: number;
  moduleCount: number;
}

export async function generateFromConfig(cwd: string = process.cwd()): Promise<GenerateResult> {
  const { configPath, config } = await loadConfig(cwd);
  const documentMap = new Map<string, OpenApiDocument>();
  const operations: ParsedOperation[] = [];

  if (config.cleanOutput) {
    await removeDir(path.join(cwd, config.outputDir));
  }

  for (const docUrl of config.docUrls) {
    const document = await loadOpenApiDocument(docUrl);
    documentMap.set(docUrl, document);
    operations.push(...parsePaths(document, docUrl, config));
  }

  const grouped = groupByPrefix(operations);
  const files: string[] = [];

  for (const [moduleName, moduleOperations] of Object.entries(grouped)) {
    for (const operation of moduleOperations) {
      const relativeFile = path.join(config.outputDir, moduleName, `${operation.fileBaseName}.${config.outputType}`);
      const absoluteFile = path.join(cwd, relativeFile);
      const content = config.outputType === 'ts'
        ? generateTsRequestFile(operation, config.httpClientPath, getRootImportPath('types', config.typeName))
        : generateJsRequestFile(operation, config.httpClientPath, getRootImportPath('api', config.typeName));

      await writeTextFile(absoluteFile, content);
      files.push(relativeFile);
    }
  }

  const typesContent = generateTypesFile(documentMap, operations, config);
  const apiDtsContent = generateApiDtsContent(operations, config);
  const indexContent = generateIndexFile(operations, config);
  const typesFile = path.join(cwd, config.outputDir, `${config.typeName}.${config.outputType === 'ts' ? 'ts' : 'js'}`);
  const apiDtsFile = path.join(cwd, config.outputDir, 'api.d.ts');
  const indexFile = path.join(cwd, config.outputDir, `index.${config.outputType}`);

  await writeTextFile(typesFile, typesContent);
  await writeTextFile(apiDtsFile, apiDtsContent);
  await writeTextFile(indexFile, indexContent);

  files.push(
    path.relative(cwd, typesFile),
    path.relative(cwd, apiDtsFile),
    path.relative(cwd, indexFile),
  );

  return {
    configPath,
    files,
    operationCount: operations.length,
    moduleCount: Object.keys(grouped).length,
  };
}
