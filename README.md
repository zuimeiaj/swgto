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
