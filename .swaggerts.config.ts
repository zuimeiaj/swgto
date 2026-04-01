import type { SwaggerTsConfig } from './src/types.js'

const config: SwaggerTsConfig = {
  docUrls: 'https://admin-base.qyltec.com/v3/api-docs',
  httpClientPath: '@/utils/request',
  outputDir: 'test/generated',
  outputType: 'js',
  typeName: 'types',
  renameMethod: (apiPath, method) => {
    const parts = apiPath.replace(/^\/+/, '').replace(/[{}]/g, '').split('/').filter(Boolean)

    return [method.toLowerCase(), ...parts].join('_').replace(/-/g, '_')
  },
}

export default config
