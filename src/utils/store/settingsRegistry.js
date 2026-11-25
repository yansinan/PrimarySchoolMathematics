/**
 * 本地配置（localStorage）的同步注册表（U 层）
 *
 * 为什么需要单独一层：快照同步按 store 合并，而配置不是 IndexedDB 行 ——
 *  1) **白名单**：只同步「练习配置」，不同步同步凭据（`psm.snapshotSync.*`）
 *     和页面临时态（sessionStorage 的打印数据）；
 *  2) **每键时间戳**：localStorage 本身没有时间，lww 合并需要靠这里记；
 *  3) **删除传播**：显式清除的配置留一行 `value: null` 的墓碑，
 *     否则「关掉挑战题 / 清除起点档位」永远传不到另一台设备。
 *
 * 与重置的关系：`/reset` 走 `resetSettings()`，只删值和时间、**不留墓碑** ——
 * 阶段一「只增不删」下，清空本机后云端配置会在下次同步时回来。
 *
 * 快照里的形状：`stores.settings = [{ key, value, updatedAt }]`
 * 合并策略：`{ mode: 'lww', key: 'key', timeField: 'updatedAt' }`
 */

/** 参与同步的配置键（新增配置时记得加到这里） */
export const SYNCED_SETTING_KEYS = Object.freeze([
  'psm_form_state',          // 出题表单 + 题组（含自适应练习量 targetMin/Max）
  'psm_level_coefficients',  // 档位配比
  'psm_level_override',      // 手动指定的起点档位
  'psm_challenge_enabled',   // 挑战题开关
  'psm_auto_advance',       // 自动升档开关（默认手动）
  'psm_sfx_enabled',         // 音效开关
  'customer-config',         // 「保存的配置」列表
])

/** 每个键最后一次写入时间（ms）。属于本机元数据，不参与同步内容。 */
const META_KEY = 'psm_settings_meta'

function storage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

function readMeta() {
  const s = storage()
  if (!s) return {}
  try {
    const parsed = JSON.parse(s.getItem(META_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMeta(meta) {
  const s = storage()
  if (!s) return
  try {
    s.setItem(META_KEY, JSON.stringify(meta))
  } catch { /* 隐私模式 / 配额满：忽略 */ }
}

/**
 * 写配置。白名单外的键照常写入，但不打时间戳、不参与同步。
 * @param {string} key
 * @param {string|null} value — null 表示清除（留墓碑，供同步传播）
 */
export function writeSetting(key, value) {
  const s = storage()
  if (!s || !key) return
  const next = value == null ? null : String(value)
  // 内容没变就不动时间戳：
  // 每次启动表单 watcher 都会把「当前值」再写一遍，若也刷新时间戳，
  // 这台设备看起来永远比另一台新 —— 另一台真正的配置修改会被它覆盖。
  try {
    if (s.getItem(key) === next) return
  } catch { /* ignore */ }
  try {
    if (next == null) s.removeItem(key)
    else s.setItem(key, next)
  } catch {
    return
  }
  if (!SYNCED_SETTING_KEYS.includes(key)) return
  const meta = readMeta()
  meta[key] = Date.now()
  writeMeta(meta)
}

/** 读配置原始字符串 */
export function readSetting(key) {
  const s = storage()
  if (!s) return null
  try {
    return s.getItem(key)
  } catch {
    return null
  }
}

/**
 * 导出配置行，供快照使用。
 *
 * - 有值的键：保证有时间戳（老数据首次导出时补一个），返回 `{key, value, updatedAt}`；
 * - 显式清除过的键：返回 `{key, value: null, updatedAt}` 墓碑；
 * - 从未设置过的键：不导出（避免「空设置」覆盖另一台设备的真实配置）。
 * @returns {Array<{key:string, value:string|null, updatedAt:number}>}
 */
export function exportSettingRows() {
  const s = storage()
  if (!s) return []
  const meta = readMeta()
  let metaDirty = false
  const rows = []
  for (const key of SYNCED_SETTING_KEYS) {
    const raw = s.getItem(key)
    if (raw != null) {
      if (!meta[key]) {
        meta[key] = Date.now()
        metaDirty = true
      }
      rows.push({ key, value: raw, updatedAt: meta[key] })
    } else if (meta[key]) {
      rows.push({ key, value: null, updatedAt: meta[key] })
    }
  }
  if (metaDirty) writeMeta(meta)
  return rows
}

/**
 * 应用合并后的配置行（lww：远端时间不早于本地才应用）。
 * 只认白名单键 —— 快照里出现未知键一律忽略。
 *
 * @param {Array<{key:string, value:string|null, updatedAt:number}>} rows
 * @param {{force?: boolean}} [options] force=true 时忽略本地时间（首次绑定采用云端配置）
 * @returns {string[]} 实际应用的键
 */
export function applySettingRows(rows, { force = false } = {}) {
  const s = storage()
  if (!s || !Array.isArray(rows) || rows.length === 0) return []
  const meta = readMeta()
  const applied = []
  for (const row of rows) {
    if (!row || !SYNCED_SETTING_KEYS.includes(row.key)) continue
    const at = Number(row.updatedAt) || 0
    if (!force && at < (Number(meta[row.key]) || 0)) continue
    try {
      if (row.value == null) s.removeItem(row.key)
      else s.setItem(row.key, String(row.value))
    } catch {
      continue
    }
    meta[row.key] = at
    applied.push(row.key)
  }
  if (applied.length) {
    writeMeta(meta)
    try {
      globalThis.dispatchEvent?.(new CustomEvent('psm:settings-applied', { detail: { keys: applied } }))
    } catch { /* 非浏览器环境 */ }
  }
  return applied
}

/**
 * 清空本机配置（重置数据用）：删值 + 删时间，**不留墓碑**。
 * 这样重置后不会把「清空」同步给其它设备；断开同步前清空也不会影响云端。
 */
export function resetSettings(keys = SYNCED_SETTING_KEYS) {
  const s = storage()
  if (!s) return
  const meta = readMeta()
  for (const key of keys) {
    try { s.removeItem(key) } catch { /* ignore */ }
    delete meta[key]
  }
  writeMeta(meta)
}
