import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import type { ApiDocsFormat, ResolvedConfig, SwaggerTsConfig } from '../types.js'

const CONFIG_FILES = ['.swaggerts.config.ts', '.swaggerts.config.js']

function assertConfig(config: SwaggerTsConfig): asserts config is SwaggerTsConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('`.swaggerts.config` must export a config object.')
  }

  if (!config.docUrls || (typeof config.docUrls !== 'string' && !Array.isArray(config.docUrls))) {
    throw new Error('`docUrls` must be a string or string array.')
  }

  if (!config.httpClientPath) {
    throw new Error('`httpClientPath` is required.')
  }

  if (Array.isArray(config.docUrls) && config.docUrls.length > 1 && typeof config.moduleName !== 'function') {
    throw new Error('`moduleName(docUrl)` is required when `docUrls` contains multiple documents.')
  }
}

export async function loadConfig(cwd: string): Promise<{ configPath: string; config: ResolvedConfig }> {
  const configPath = CONFIG_FILES.map((fileName) => path.join(cwd, fileName)).find((filePath) => existsSync(filePath))

  if (!configPath) {
    throw new Error('Cannot find `.swaggerts.config.ts` or `.swaggerts.config.js` in current directory.')
  }

  const jiti = createJiti(pathToFileURL(configPath).href, {
    interopDefault: true,
  })
  const loaded = await jiti.import(configPath)
  const rawConfig = (loaded?.default ?? loaded) as SwaggerTsConfig

  assertConfig(rawConfig)

  const docUrls = Array.isArray(rawConfig.docUrls) ? rawConfig.docUrls : [rawConfig.docUrls]
  const apiDocsFormat: ApiDocsFormat = rawConfig.apiDocs?.format ?? 'html';
  const defaultOutput = apiDocsFormat === 'markdown' ? 'api-docs.md' : 'api-docs.html';
  const config: ResolvedConfig = {
    ...rawConfig,
    docUrls,
    outputDir: rawConfig.outputDir ?? 'src/api',
    outputType: rawConfig.outputType ?? 'ts',
    typeName: rawConfig.typeName ?? 'types',
    cleanOutput: rawConfig.cleanOutput ?? false,
    fileNaming: rawConfig.fileNaming ?? 'path',
    flattenQueryParam: rawConfig.flattenQueryParam ?? false,
    mergeParams: rawConfig.mergeParams ?? false,
    apiDocs: {
      enable: rawConfig.apiDocs?.enable ?? false,
      output: rawConfig.apiDocs?.output ?? defaultOutput,
      format: apiDocsFormat,
      title: rawConfig.apiDocs?.title,
      companyName: rawConfig.apiDocs?.companyName,
      template: rawConfig.apiDocs?.template,
      theme: rawConfig.apiDocs?.theme,
    },
  }

  return { configPath, config }
}
