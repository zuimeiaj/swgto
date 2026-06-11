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

    const docFile = result.files.find((f) => f.endsWith('.html') || f.endsWith('.md'));
    if (docFile) {
      console.log(`Generated API docs: ${docFile}`);
    }
    console.log(`Done in ${elapsedMs}ms.`);

    if (result.newOperations.length > 0) {
      console.log(`\n新增 ${result.newOperations.length} 个 API:`);
      const maxWidth = Math.max(...result.newOperations.map((op) => `${op.method.toUpperCase()} ${op.path}`.length));
      for (const op of result.newOperations) {
        const label = `${op.method.toUpperCase()} ${op.path}`.padEnd(maxWidth);
        const desc = op.summary ? `  ${op.summary}` : '';
        console.log(`  ${label}  -> ${op.functionName}${desc}`);
      }
    }

    if (result.removedOperations.length > 0) {
      console.log(`\n移除 ${result.removedOperations.length} 个 API:`);
      for (const op of result.removedOperations) {
        console.log(`  ${op.method.toUpperCase()} ${op.path}  (${op.functionName})`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`swgto failed: ${message}`);
    process.exitCode = 1;
  }
}

void main();
