# swgto

`swgto` 是一个把 `OpenAPI 3.x` 文档转换成项目内请求函数的 Node.js 库和 CLI。

安装后会注册一个 `swgto` 命令。执行时它会在当前目录查找 `.swaggerts.config.ts` 或 `.swaggerts.config.js`，然后生成：

- 按路径前缀分组的请求文件
- 按文档模块输出请求文件。单文档默认输出到 `services/`，多文档时多个模块目录平级
- `outputDir/index.ts` 或 `outputDir/index.js`
- 类型文件 `outputDir/types.ts` 或带 JSDoc 的 `outputDir/types.js`

## 安装

```bash
npm install swgto-ts
```

## 配置

在项目根目录创建 `.swaggerts.config.ts`：

```ts
import type { SwaggerTsConfig } from 'swgto-ts'

const config: SwaggerTsConfig = {
  docUrls: 'https://example.com/openapi.json',
  httpClientPath: '@/utils/request',
  outputDir: 'src/api',
  outputType: 'ts',
  typeName: 'types',
  cleanOutput: true,
  renameMethod: (apiPath, method) => `${method}_${apiPath.replace(/[\\/{}]/g, '_')}`,
  resolveRequestPath: (apiPath, method) => `/proxy${apiPath}`,
}

export default config
```

多文档模式下需要提供 `moduleName`：

```ts
export default {
  docUrls: ['https://example.com/user-openapi.json', 'https://example.com/order-openapi.json'],
  httpClientPath: '@/utils/request',
  outputDir: 'src/api',
  moduleName: (docUrl) => (docUrl.includes('user') ? 'user' : 'order'),
}
```

## 使用

```bash
swgto
```

## 输出示例

```text
src/api/
  index.ts
  types.ts
  services/
    get_user_list.ts
    post_user_create.ts
```

## 配置项

```ts
export interface SwaggerTsConfig {
  docUrls: string | string[]
  httpClientPath: string
  renameMethod?: (path: string, method: string) => string
  resolveRequestPath?: (path: string, method: string, docUrl: string) => string
  ignoreUrl?: (path: string, method: string, docUrl: string) => boolean
  outputDir?: string
  moduleName?: (docUrl: string) => string
  outputType?: 'ts' | 'js'
  typeName?: string
  cleanOutput?: boolean
  fileNaming?: 'module' | 'path'
  flattenQueryParam?: boolean
  mergeParams?: boolean
  flattenOnGet?: boolean
  apiDocs?: ApiDocsConfig
}
```

### 字段说明

| 字段                 | 类型                                | 默认值       | 说明                                                                                                                                   |
| -------------------- | ----------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `docUrls`            | `string \| string[]`                | (必填)       | OpenAPI 3.x 文档的 URL，支持单文档字符串或多文档数组                                                                                   |
| `httpClientPath`     | `string`                            | (必填)       | 项目内 HTTP 请求工具的引入路径，生成的文件会从中 `import request`                                                                      |
| `outputDir`          | `string`                            | `'src/api'`  | 代码输出目录，相对项目根目录                                                                                                           |
| `outputType`         | `'ts' \| 'js'`                      | `'ts'`       | 输出文件类型，`'ts'` 生成 `.ts` 文件，`'js'` 生成 `.js` 文件（带 JSDoc 类型注释）                                                      |
| `typeName`           | `string`                            | `'types'`    | 类型文件名（不含后缀），如 `'types'` 生成 `types.ts` 或 `types.js`                                                                     |
| `fileNaming`         | `'module' \| 'path'`                | `'path'`     | 文件组织方式：`'path'` 按接口路径每个文件一个函数；`'module'` 按控制器合并到同一个文件                                                 |
| `moduleName`         | `(docUrl) => string`                | `'services'` | 多文档时，为每个文档指定模块目录名。多文档模式下**必填**                                                                               |
| `renameMethod`       | `(path, method) => string`          | 见说明       | 自定义函数名生成规则。默认根据路径和方法名自动生成（如 `get_user_list`）                                                               |
| `resolveRequestPath` | `(path, method, docUrl) => string`  | 原路径       | 自定义请求路径转换规则，可用于添加统一前缀等，如 `(path) => \`/proxy\${path}\``                                                        |
| `ignoreUrl`          | `(path, method, docUrl) => boolean` | 不过滤       | 过滤不需要生成代码的接口，返回 `true` 跳过当前接口                                                                                     |
| `cleanOutput`        | `boolean`                           | `false`      | 生成前是否清空输出目录                                                                                                                 |
| `flattenQueryParam`  | `boolean`                           | `false`      | 当 query 参数只有一个且为 `$ref` 引用类型时，直接用引用类型代替 `{ query: RefType }`                                                   |
| `mergeParams`        | `boolean`                           | `false`      | 合并参数层级：`true` 时展平 `path/query/body` 嵌套，直接使用 `params: { field1, field2 }` 代替 `params: { path: {...}, query: {...} }` |
| `flattenOnGet`       | `boolean`                           | `false`      | GET 请求专用展平：将所有 body/query/path 中的 `$ref` 参数展开为顶层交叉类型，彻底消除嵌套。详见 [GET 参数展平](#get-参数展平)            |
| `apiDocs`            | `ApiDocsConfig`                     | 见说明       | 自动生成 API 文档（HTML/Markdown），详细配置见 [API 文档生成](#api-文档生成)                                                         |

### 函数名生成规则

默认函数名格式为 `{method}_{path_segments}`，如：

- `GET /user/list` → `get_user_list`
- `POST /user/create` → `post_user_create`

可通过 `renameMethod` 自定义：

```ts
renameMethod: (path, method) => `${method}_${path.replace(/[\\/{}]/g, '_')}`,
```

### 文件组织方式

**`fileNaming: 'path'`（默认）**— 每个接口生成独立文件：

```
src/api/moduleA/
  get_user_list.ts
  post_user_create.ts
  get_user_detail.ts
```

**`fileNaming: 'module'`**— 按控制器合并文件（自动识别 RESTful 资源路径分组）：

```
src/api/moduleA/
  user.ts         // 包含 get_user_list, post_user_create, get_user_detail
  order.ts        // 包含 get_order_list, post_order_create
```

### 参数合并模式

`mergeParams: true` 时展平参数层级，适用于不想嵌套 `path/query/body` 的场景：

```ts
// mergeParams: false（默认），参数按来源嵌套
getUser({ path: { id: '1' }, query: { name: 'foo' } })

// mergeParams: true，参数展平
getUser({ id: '1', name: 'foo' })
```

### GET 参数展平

`flattenOnGet: true` 专门解决 GET 请求中 body 和 query 参数嵌套的问题。当 GET 请求同时包含 body 参数（如 `userDTO`）和 query 参数（如 `pageQuery`）时，会将所有 `$ref` 类型的参数展开为顶层交叉类型，实现 `{...userDTO, ...pageQuery}` 的效果。

**背景**：部分后端定义 GET 请求时，参数在 body 和 query 中分散定义，但实际入参是合并平铺的。仅靠 `mergeParams` 会保留 body 内部的属性名作为嵌套字段。

**示例**：一个 GET 请求的 body 中有 `adminUserVO: AdminUserVO`，query 中有 `pageRequest: SessionPageRequestDTO`

```ts
// flattenOnGet: false（默认），body 属性名保留为嵌套字段
get_ai_sessions({ adminUserVO: {...}, pageRequest: {...} })
// 类型：{ adminUserVO: AdminUserVO; pageRequest: SessionPageRequestDTO; }

// flattenOnGet: true，$ref 参数全部展开到顶层
get_ai_sessions({ ...adminUserVOFields, ...pageRequestFields })
// 类型：AdminUserVO & SessionPageRequestDTO
```

> **注意**：`flattenOnGet` 仅对 GET 请求生效，且通常与 `mergeParams` 和 `flattenQueryParam` 一起使用效果最佳。该选项会同时影响生成的类型签名和函数体实现。

### API 文档生成

配置 `apiDocs` 可在生成代码的同时，自动输出一份人类可读的 API 文档：

```ts
export default {
  // ... 其他配置
  apiDocs: {
    enable: true,
    format: 'html',           // 'html' 或 'markdown'
    output: 'api-docs.html',  // 输出文件名
    title: '我的 API 文档',    // 文档标题，默认取 OpenAPI info.title
    companyName: 'XX 公司',   // 封面公司名称（仅 HTML）
    template: './my-template.html', // 自定义 HTML 模板路径（仅 HTML）
    theme: './my-theme.css',  // 自定义样式文件路径（仅 HTML）
  },
}
```

| 配置项        | 类型                        | 默认值                  | 说明                                                           |
| ------------- | --------------------------- | ----------------------- | -------------------------------------------------------------- |
| `enable`      | `boolean`                   | `false`                 | 是否开启文档生成                                               |
| `format`      | `'html' \| 'markdown'`      | `'html'`                | 输出格式：HTML 适合浏览器打印为 PDF，Markdown 适合仓库内查看   |
| `output`      | `string`                    | `'api-docs.html'`       | 输出文件名，相对 `outputDir`                                   |
| `title`       | `string`                    | OpenAPI `info.title`    | 文档标题                                                       |
| `companyName` | `string`                    | 无                      | 封面上的公司名称（仅 HTML）                                    |
| `template`    | `string`                    | 内置模板                | 自定义 HTML 模板路径（仅 HTML）。优先级：`template` 配置 > 项目根目录 `.swagger.docs.html` > 内置默认模板 |
| `theme`       | `string`                    | 无                      | 自定义 CSS 文件路径，覆盖文档样式（仅 HTML）                   |

#### HTML 文档

输出为带书本风格的 HTML 页面，包含：
- **封面页**：A4 整页，显示公司名称（如配置）、API 名称和版本号
- **目录**：方法 + 路径 | 点线 | 摘要，点击跳转到对应接口
- **接口卡片**：包含路径参数、查询参数、请求体、响应体的字段表格（名称 / 类型 / 必填 / 描述）

可通过项目根目录的 `.swagger.docs.html` 文件自定义文档样式。如果设置了 `apiDocs.template`，则优先使用该路径的模板文件。

#### Markdown 文档

输出为 `.md` 文件，包含：
- 封面区域：公司名称（如配置）、API 名称和版本号
- 目录（Table of Contents）：所有接口的锚点链接列表
- 每个接口的详细说明：HTTP 方法 + 路径、描述、参数表格和响应表格

适合直接在代码仓库中查看或用于 GitBook、VuePress 等文档工具。```
