#!/usr/bin/env node
import { generateFromConfig } from './generate.js';

async function main(): Promise<void> {
  const startedAt = Date.now();

  try {
    const result = await generateFromConfig(process.cwd());
    const elapsedMs = Date.now() - startedAt;

    console.log(`swgto loaded config: ${result.configPath}`);
    console.log(`Generated ${result.apiFileCount} api file(s), ${result.operationCount} operation(s) in ${result.moduleCount} module(s).`);
    console.log(`Wrote ${result.files.length} file(s) total (including types, index).`);
    console.log(`Done in ${elapsedMs}ms.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`swgto failed: ${message}`);
    process.exitCode = 1;
  }
}

void main();
