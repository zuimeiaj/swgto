import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFromConfig } from '../src/generate.js';
import openapiFixture from './fixtures/openapi.json';

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createProject(configContent: string): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'swgto-'));
  tempDirs.push(cwd);
  await writeFile(path.join(cwd, '.swaggerts.config.ts'), configContent, 'utf8');
  return cwd;
}

describe('generateFromConfig', () => {
  it('generates ts files, index.ts and api.d.ts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => openapiFixture,
    }));

    const cwd = await createProject(`
      export default {
        docUrls: 'https://example.com/openapi.json',
        httpClientPath: '@/utils/request',
        outputDir: 'src/api'
      };
    `);

    const result = await generateFromConfig(cwd);
    const indexContent = await readFile(path.join(cwd, 'src/api/index.ts'), 'utf8');
    const typesContent = await readFile(path.join(cwd, 'src/api/types.ts'), 'utf8');
    const dtsContent = await readFile(path.join(cwd, 'src/api/api.d.ts'), 'utf8');
    const requestContent = await readFile(path.join(cwd, 'src/api/services/get_user_list.ts'), 'utf8');

    expect(result.operationCount).toBe(2);
    expect(indexContent).toContain('export * from "./services/get_user_list";');
    expect(typesContent).toContain('export interface GetUserListRequest');
    expect(dtsContent).toContain('export * from "./types";');
    expect(requestContent).toContain('import request from "@/utils/request"');
  });

  it('uses body schema directly when request only contains body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => openapiFixture,
    }));

    const cwd = await createProject(`
      export default {
        docUrls: 'https://example.com/openapi.json',
        httpClientPath: '@/utils/request',
        outputDir: 'src/api'
      };
    `);

    await generateFromConfig(cwd);

    const requestContent = await readFile(path.join(cwd, 'src/api/services/post_user_create.ts'), 'utf8');
    const dtsContent = await readFile(path.join(cwd, 'src/api/api.d.ts'), 'utf8');
    const typesContent = await readFile(path.join(cwd, 'src/api/types.ts'), 'utf8');

    expect(requestContent).toContain('params: PostUserCreateRequest, config?: RequestConfig');
    expect(requestContent).toContain('data: params?.body');
    expect(dtsContent).toContain('post_user_create<T = PostUserCreateResponse>(params: PostUserCreateRequest, config?: import("./index").RequestConfig)');
    expect(typesContent).toContain('export interface PostUserCreateRequest');
    expect(typesContent).toContain('body: CreateUserBody;');
  });

  it('requires moduleName when multiple documents are configured', async () => {
    const cwd = await createProject(`
      export default {
        docUrls: ['https://example.com/a.json', 'https://example.com/b.json'],
        httpClientPath: '@/utils/request'
      };
    `);

    await expect(generateFromConfig(cwd)).rejects.toThrow('`moduleName(docUrl)` is required');
  });

  it('generates js files and api typings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => openapiFixture,
    }));

    const cwd = await createProject(`
      export default {
        docUrls: 'https://example.com/openapi.json',
        httpClientPath: '@/utils/request',
        outputDir: 'src/api',
        outputType: 'js'
      };
    `);

    await generateFromConfig(cwd);

    const indexContent = await readFile(path.join(cwd, 'src/api/index.js'), 'utf8');
    const typesContent = await readFile(path.join(cwd, 'src/api/types.js'), 'utf8');
    const requestContent = await readFile(path.join(cwd, 'src/api/services/get_user_list.js'), 'utf8');

    expect(indexContent).toContain('export * from "./services/get_user_list";');
    expect(typesContent).toContain('@typedef');
    expect(requestContent).toContain('import("../api")');
  });

  it('sanitizes invalid identifier characters in generated method names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openapi: '3.0.3',
        paths: {
          '/api/auth/change-password': {
            post: {
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    }));

    const cwd = await createProject(`
      export default {
        docUrls: 'https://example.com/openapi.json',
        httpClientPath: '@/utils/request',
        outputDir: 'src/api'
      };
    `);

    await generateFromConfig(cwd);

    const indexContent = await readFile(path.join(cwd, 'src/api/index.ts'), 'utf8');
    expect(indexContent).toContain('post_api_auth_change_password');
  });

  it('uses aggregated path query body params and optional config', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openapi: '3.0.3',
        paths: {
          '/api/file/{id}': {
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'download', in: 'query', schema: { type: 'boolean' } },
              ],
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    }));

    const cwd = await createProject(`
      export default {
        docUrls: 'https://example.com/openapi.json',
        httpClientPath: '@/utils/request',
        outputDir: 'src/api'
      };
    `);

    await generateFromConfig(cwd);

    const requestContent = await readFile(path.join(cwd, 'src/api/services/get_api_file_id.ts'), 'utf8');
    const typesContent = await readFile(path.join(cwd, 'src/api/types.ts'), 'utf8');

    expect(requestContent).toContain('config?: RequestConfig');
    expect(requestContent).toContain('url: buildUrl(params?.path)');
    expect(requestContent).toContain('params: params?.query');
    expect(requestContent).toContain('...config');
    expect(typesContent).toContain('/** Path parameters */');
    expect(typesContent).toContain('id: string;');
    expect(typesContent).toContain('/** Query parameters */');
    expect(typesContent).toContain('download?: boolean;');
  });

  it('cleans output directory before generation when cleanOutput is enabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => openapiFixture,
    }));

    const cwd = await createProject(`
      export default {
        docUrls: 'https://example.com/openapi.json',
        httpClientPath: '@/utils/request',
        outputDir: 'src/api',
        cleanOutput: true
      };
    `);

    await mkdir(path.join(cwd, 'src/api/legacy'), { recursive: true });
    await writeFile(path.join(cwd, 'src/api/legacy/old.ts'), 'export const old = true;', 'utf8');
    await generateFromConfig(cwd);

    await expect(readFile(path.join(cwd, 'src/api/legacy/old.ts'), 'utf8')).rejects.toThrow();
  });

  it('supports custom request path transformation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => openapiFixture,
    }));

    const cwd = await createProject(`
      export default {
        docUrls: 'https://example.com/openapi.json',
        httpClientPath: '@/utils/request',
        outputDir: 'src/api',
        resolveRequestPath: (apiPath) => '/proxy' + apiPath
      };
    `);

    await generateFromConfig(cwd);

    const requestContent = await readFile(path.join(cwd, 'src/api/services/post_user_create.ts'), 'utf8');
    expect(requestContent).toContain('url: "/proxy/user/create"');
  });
});
