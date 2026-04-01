#!/usr/bin/env node
import {
  generateFromConfig
} from "./chunk-LSUNEHCY.js";

// src/cli.ts
async function main() {
  const startedAt = Date.now();
  try {
    const result = await generateFromConfig(process.cwd());
    const elapsedMs = Date.now() - startedAt;
    console.log(`swgto loaded config: ${result.configPath}`);
    console.log(`Generated ${result.operationCount} API files in ${result.moduleCount} module(s).`);
    console.log(`Wrote ${result.files.length} files, including index and api.d.ts.`);
    console.log(`Done in ${elapsedMs}ms.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`swgto failed: ${message}`);
    process.exitCode = 1;
  }
}
void main();
