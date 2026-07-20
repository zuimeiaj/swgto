import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
import { compareSnapshot, loadSnapshot, saveSnapshot, SNAPSHOT_FILE } from './utils/snapshot.js';
import type { SnapshotEntry } from './utils/snapshot.js';

function getRootImportPath(typeName: string): string {
  return `../${typeName}`;
}

export interface GenerateResult {
  configPath: string;
  files: string[];
  operationCount: number;
  moduleCount: number;
  apiFileCount: number;
  newOperations: SnapshotEntry[];
  removedOperations: SnapshotEntry[];
}

export async function generateFromConfig(cwd: string = process.cwd()): Promise<GenerateResult> {
  const { configPath, config } = await loadConfig(cwd);
  const documentMap = new Map<string, OpenApiDocument>();
  const operations: ParsedOperation[] = [];

  const snapshotPath = path.join(cwd, config.outputDir, SNAPSHOT_FILE);
  const previousSnapshot = await loadSnapshot(snapshotPath);

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
  const { newOperations, removedOperations } = compareSnapshot(previousSnapshot, operations);

  const files: string[] = [];

  for (const [moduleName, moduleOperations] of Object.entries(grouped)) {
    if (config.fileNaming === 'module') {
      const controllerMap = groupByController(moduleOperations);

      for (const [controllerName, controllerOperations] of Object.entries(controllerMap)) {
        const relativeFile = path.join(config.outputDir, moduleName, `${controllerName}.${config.outputType}`);
        const absoluteFile = path.join(cwd, relativeFile);
        const content = config.outputType === 'ts'
          ? generateTsModuleFile(controllerOperations, config.httpClientPath, getRootImportPath(config.typeName), config.mergeParams, config.flattenOnGet)
          : generateJsModuleFile(controllerOperations, config.httpClientPath, getRootImportPath(config.typeName), config.mergeParams, config.flattenOnGet);

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
          ? generateTsRequestFile(operation, config.httpClientPath, getRootImportPath(config.typeName), config.mergeParams, config.flattenOnGet)
          : generateJsRequestFile(operation, config.httpClientPath, getRootImportPath(config.typeName), config.mergeParams, config.flattenOnGet);

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

  // Generate API docs (optional)
  if (config.apiDocs.enable) {
    let content: string;
    const docFile = path.join(cwd, config.outputDir, config.apiDocs.output);

    if (config.apiDocs.format === 'markdown') {
      const { generateApiDocsMd } = await import('./generators/genApiDocsMd.js');
      content = generateApiDocsMd(documentMap, operations, config);
    } else {
      const { generateApiDocsHtml, DEFAULT_TEMPLATE } = await import('./generators/genApiDocsHtml.js');

      // Auto-generate template file if it doesn't exist
      const templateFile = path.join(cwd, '.swagger.docs.html');
      if (!existsSync(templateFile)) {
        await writeTextFile(templateFile, DEFAULT_TEMPLATE);
        console.log(`Created template: .swagger.docs.html`);
      }

      // Resolve template: config path > .swagger.docs.html in cwd > built-in
      const templatePaths: string[] = [];
      if (config.apiDocs.template) {
        templatePaths.push(path.resolve(cwd, config.apiDocs.template));
      }
      templatePaths.push(templateFile);

      let templateHtml: string | undefined;
      for (const tp of templatePaths) {
        if (existsSync(tp)) {
          templateHtml = await readFile(tp, 'utf-8');
          break;
        }
      }

      // Load theme CSS if configured
      let themeCss: string | undefined;
      if (config.apiDocs.theme) {
        const themePath = path.resolve(cwd, config.apiDocs.theme);
        if (existsSync(themePath)) {
          themeCss = await readFile(themePath, 'utf-8');
        }
      }

      content = generateApiDocsHtml(documentMap, operations, config, templateHtml, themeCss);
    }

    await writeTextFile(docFile, content);
    files.push(path.relative(cwd, docFile));
  }

  await saveSnapshot(snapshotPath, operations);

  const htmlGenerated = config.apiDocs.enable ? 1 : 0;

  return {
    configPath,
    files,
    operationCount: operations.length,
    moduleCount: Object.keys(grouped).length,
    apiFileCount: files.length - 2 - htmlGenerated, // exclude types + index + optional html
    newOperations,
    removedOperations,
  };
}
