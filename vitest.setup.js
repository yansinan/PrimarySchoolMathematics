// Vitest 全局 setup：注册 fake-indexeddb 让 Dexie 在 Node 环境运行
// 使用 auto 模式自动注入 indexedDB / IDBKeyRange 到 globalThis
import 'fake-indexeddb/auto'
