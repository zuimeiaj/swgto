【2026-05-15】【feat】新增统计输出功能，每次执行命令后对比上次快照，显示新增和移除的 API 列表
【2026-06-11】【feat】新增 apiDocs 配置项，支持生成 API 文档 HTML 文件，可通过浏览器打印导出 PDF
【2026-06-11】【feat】apiDocs 支持自定义模板，项目根目录放 .swagger.docs.html 可替换文档样式
【2026-06-11】【feat】apiDocs 目录改为书本风格，方法+路径 | 点线 | 摘要
【2026-06-11】【feat】apiDocs 接口卡片中请求体和响应改为字段表格展示，含名称/类型/必填/描述
【2026-06-11】【feat】apiDocs 封面改为 A4 整页大小，支持 companyName 配置项
【2026-06-11】【feat】apiDocs 支持 format: 'markdown' 输出 Markdown 格式文档
【2026-06-30】【feat】mergeParams=true 时生成的函数体中解构剔除 path 参数 key，避免残留在 body 中（不修改原对象）
【2026-06-30】【fix】JS 输出 JSDoc @param 对内联类型不再用 import() 包裹，VSCode 类型提示正确显示
【2026-07-20】【feat】新增 flattenOnGet 配置项，GET 请求时将所有 body/query/path 参数平铺到顶层，解决 body 和 query 嵌套字段导致后台无法读取的问题