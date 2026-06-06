// ───────────────────────────────────────────────────────────────────────
// 过渡兼容桶（PR 1.1）
//
// 背景：src/utils/ 根目录的 12 个平铺文件已归位到 4 个子目录
//   - algorithm/  (EquationSolver, adaptiveEngine/Batch, diagnostic, equationParser, psm, displayStrategy)
//   - form/       (formDefaults)
//   - store/      (database, configStorage)
//   - time/       (timeFormat)
//
// 所有旧的 `@/utils/<file>` 命名导入仍可通过本桶解析（export * 风格）。
//
// 默认导入的兼容：database.js / configStorage.js 的 default 导出无法通过
// `export *` 跨桶传播，因此保留同名根目录 stub 文件，参见：
//   - src/utils/database.js
//   - src/utils/configStorage.js
//
// 后续 PR（1.3 路径统一）会将上游 default import 改为 named，再删除根 stub。
// ───────────────────────────────────────────────────────────────────────

// 4 个子目录桶
export * from './algorithm'
export * from './form'
export * from './store'
export * from './time'

// 根目录直留：score / enum
export * from './score'
export * from './enum'
