// ───────────────────────────────────────────────────────────────────────
// PR 1.1 过渡 stub — 真实实现已迁至 ./store/database.js
//
// 用途：上游有 3 处 default 导入（使用旧路径 utils/database 取 Dexie db 单例）。
// `export *` 不会跨桶传播 default，因此保留本 stub 来桥接 default 导出。
//
// 后续 PR（1.3 路径统一）会将这 3 处 default import 改为新的 store 子目录路径，
// 然后删除本文件。
// ───────────────────────────────────────────────────────────────────────
export * from './store/database'
export { default } from './store/database'
