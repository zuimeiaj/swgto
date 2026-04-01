interface GenerateResult {
    configPath: string;
    files: string[];
    operationCount: number;
    moduleCount: number;
}
declare function generateFromConfig(cwd?: string): Promise<GenerateResult>;

type OutputType = 'ts' | 'js';
interface SwaggerTsConfig {
    docUrls: string | string[];
    httpClientPath: string;
    renameMethod?: (path: string, method: string) => string;
    outputDir?: string;
    moduleName?: (docUrl: string) => string;
    outputType?: OutputType;
    typeName?: string;
}

export { type GenerateResult, type SwaggerTsConfig, generateFromConfig };
