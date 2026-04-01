# swgto

`swgto` 是一个把 `OpenAPI 3.x` 文档转换成项目内请求函数的 Node.js 库和 CLI。

安装后会注册一个 `swgto` 命令。执行时它会在当前目录查找 `.swaggerts.config.ts` 或 `.swaggerts.config.js`，然后生成：

- 按路径前缀分组的请求文件
- 按文档模块输出请求文件。单文档默认输出到 `services/`，多文档时多个模块目录平级
- `outputDir/index.ts` 或 `outputDir/index.js`
- 聚合声明文件 `outputDir/api.d.ts`
- 类型文件 `outputDir/types.ts` 或带 JSDoc 的 `outputDir/types.js`

## 安装

```bash
npm install swgto
```

## 配置

在项目根目录创建 `.swaggerts.config.ts`：

```ts
import type { SwaggerTsConfig } from 'swgto';

const config: SwaggerTsConfig = {
  docUrls: 'https://example.com/openapi.json',
  httpClientPath: '@/utils/request',
  outputDir: 'src/api',
  outputType: 'ts',
  typeName: 'types',
  cleanOutput: true,
  renameMethod: (apiPath, method) => `${method}_${apiPath.replace(/[\\/{}]/g, '_')}`,
  resolveRequestPath: (apiPath, method) => `/proxy${apiPath}`,
};

export default config;
```

多文档模式下需要提供 `moduleName`：

```ts
export default {
  docUrls: [
    'https://example.com/user-openapi.json',
    'https://example.com/order-openapi.json',
  ],
  httpClientPath: '@/utils/request',
  outputDir: 'src/api',
  moduleName: (docUrl) => docUrl.includes('user') ? 'user' : 'order',
};
```

## 使用

```bash
swgto
```

## 输出示例

```text
src/api/
  api.d.ts
  index.ts
  types.ts
  services/
    get_user_list.ts
    post_user_create.ts
```

## 配置项

```ts
export interface SwaggerTsConfig {
  docUrls: string | string[];
  httpClientPath: string;
  renameMethod?: (path: string, method: string) => string;
  resolveRequestPath?: (path: string, method: string, docUrl: string) => string;
  outputDir?: string;
  moduleName?: (docUrl: string) => string;
  outputType?: 'ts' | 'js';
  typeName?: string;
  cleanOutput?: boolean;
}
```
