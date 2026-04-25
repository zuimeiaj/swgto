# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (esm + dts via tsup)
npm run build

# Build + watch
npm run dev

# Run CLI (reads .swaggerts.config.ts from cwd)
npm test  # same as: tsx ./src/cli.ts

# Generate test output (uses existing .swaggerts.config.ts)
npx tsx ./src/cli.ts
```

## Project Overview

`swgto` is a CLI/library that generates typed API request functions from OpenAPI 3.x documents. It fetches one or more OpenAPI JSON documents, parses paths/operations, and outputs request files, a types file, a barrel index, and a `.d.ts` declaration file.

## Configuration

The tool reads `.swaggerts.config.ts` or `.swaggerts.config.js` from the current directory. Key config options:

- `docUrls` — URL(s) of OpenAPI 3.x JSON documents
- `httpClientPath` — import path for the HTTP client (e.g. `@/utils/request`)
- `outputDir` — output directory (default `src/api`)
- `outputType` — `'ts'` or `'js'` (default `'ts'`)
- `fileNaming` — `'path'` (one file per endpoint) or `'module'` (group by controller)
- `renameMethod` — custom function name generator
- `resolveRequestPath` — custom request path transformer
- `ignoreUrl` — skip certain paths during generation
- `cleanOutput` — delete output directory before generation
- `flattenQueryParam` — when single query param has a `$ref`, use it directly instead of wrapping

## Architecture

```
src/cli.ts                     — CLI entry point
src/generate.ts                — Orchestration: load config → fetch docs → parse → group → generate files
src/config/loadConfig.ts       — Load and validate .swaggerts.config.ts via jiti
src/core/parsePaths.ts         — Convert OpenAPI paths → ParsedOperation[]
src/core/groupByPrefix.ts      — Group operations by module name
src/core/groupByController.ts  — Group operations by derived controller name (REST-aware heuristics)
src/fetch/loadOpenApi.ts       — Fetch OpenAPI JSON documents
src/generators/genRequestTs.ts — Generate .ts request files (per-endpoint + module-level)
src/generators/genRequestJs.ts — Generate .js request files
src/generators/genTypes.ts     — Generate types.ts, types.js, and api.d.ts
src/generators/genIndex.ts     — Generate index.ts / index.js barrel
src/generators/schemaToTs.ts   — OpenAPI schema → TypeScript type string
src/utils/fs.ts                — mkdir, writeFile, rm utilities
src/utils/naming.ts            — PascalCase, camelCase, sanitize identifiers
```

## Key Data Flow

1. `loadConfig()` reads `.swaggerts.config.ts` and returns a `ResolvedConfig`
2. For each `docUrl`, `loadOpenApiDocument()` fetches and validates the OpenAPI JSON
3. `parsePaths()` iterates paths/methods, producing `ParsedOperation[]` (each with function name, params, types, etc.)
4. `groupByPrefix()` groups by `moduleName` → `groupByController()` further sub-groups when `fileNaming: 'module'`
5. Generators produce file contents for each group
6. Types + index + api.d.ts are generated from the full operation list

## fileNaming: 'module' Controller Grouping

When `fileNaming: 'module'`, `groupByController()` derives controller names from URL paths using RESTful heuristics:
- Strips trailing path params (`/a/b/{id}` → `/a/b`)
- Checks parent paths for multiple HTTP methods (REST resource signal)
- Walks up segment levels to find the best grouping, preferring non-param segments

## Generated Output Structure

Example for a single module:
```
outputDir/
  api.d.ts           — Declarations for all exported functions
  index.ts           — Barrel re-exports
  types.ts           — All component schemas + response types
  services/          — Module directory (or named via moduleName())
    get_user_list.ts — Per-endpoint files (fileNaming: 'path')
    post_user_create.ts
```

Or with `fileNaming: 'module'`:
```
outputDir/
  api.d.ts
  index.ts
  types.ts
  hsxl-document-service/   — Module directory
    order.ts               — Controller file containing multiple related endpoints
    user.ts
```

## Testing

No test suite is configured yet. Vitest is available as a devDependency. The `test/` directory contains generated output from the existing config, not test source files.

## Changelog

每次完成更改后，在项目根目录的 `CHANGELOG.md` 末尾追加一行：

```
【2026-04-25】【feat】添加了xxx功能
```

格式：`【日期】【feat|fix|delete】描述`
