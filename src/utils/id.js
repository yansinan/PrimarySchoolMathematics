/**
 * 全局稳定行标识（U 层，无状态）
 *
 * 为什么需要：快照同步按「记录级 key」合并（见 designDocs/15-PLAN-snapshot-sync.md §5）。
 * Dexie 的自增 `id` 是设备本地的，两台设备的 `id=5` 是两条不同记录；必须给每行一个
 * 客户端生成的全局 id，合并才可能正确。
 *
 * 为什么不用 crypto.randomUUID 就完事：它只在安全上下文（https / localhost）可用，
 * 而家庭局域网走的是 `http://<host>:4003`，属于非安全上下文 —— 直接调用会 undefined。
 * 所以降级链：randomUUID → getRandomValues（非安全上下文可用）→ 时间戳 + 随机。
 *
 * @returns {string}
 */
export function newUid() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16))
    let out = ''
    for (const b of bytes) out += b.toString(16).padStart(2, '0')
    return out
  }
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
