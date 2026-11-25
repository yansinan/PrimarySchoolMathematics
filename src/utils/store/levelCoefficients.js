/**
 * 档位配比系数
 *
 * 用途：在自适应选题时，对某个难度档位的「基准权重」做缩放，
 * 让家长/孩子能在不改选题结构的前提下微调各档位的出题占比。
 *
 * 作用点（services/adaptiveEngine.js#pickStrongLevel 等）：
 *   基准权重 = Math.pow(1.5, i)        ← 原有逻辑，越靠后的档位权重越大
 *   实际权重 = 基准权重 × 本档系数
 *
 * 核心约束 —— **不配置就等于不存在**：
 *   - 表里没有某档 → 该档沿用原基准权重（等价 ×1），候选池也不扩大
 *   - 空表 → 选题行为与加入此功能之前逐位一致
 * 所以这个功能是纯 opt-in：不动代码里的任何基准比例，只提供缩放旋钮。
 *
 * 语义：
 *   - 系数 0   该档位不出题（候选池里有其他档时）
 *   - 系数 1   默认，原本的权重
 *   - 系数 >1  提高该档占比
 *
 * 另外：把某个**本来不在候选池里**的档位配置成非 1 的系数，
 * 会把它拉进候选池（用于「想让低档复习题多一些」这类需求）。
 *
 * @see ../services/adaptiveEngine.js  pickStrongLevel / pickWeakLevel
 */

const STORAGE_KEY = 'psm_level_coefficients'

/** 系数取值范围 */
export const COEF_MIN = 0
export const COEF_MAX = 3
/** 默认系数：未配置时的值 */
export const COEF_DEFAULT = 1

function clampCoef(n) {
  if (!Number.isFinite(n)) return COEF_DEFAULT
  return Math.min(COEF_MAX, Math.max(COEF_MIN, n))
}

/**
 * 读取系数表
 * @returns {Record<number, number>} 形如 { 14: 0.3, 8: 1.5 }，只含已配置项
 */
export function loadLevelCoefficients() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const out = {}
    for (const [k, v] of Object.entries(parsed || {})) {
      const idx = Number(k)
      const coef = Number(v)
      if (Number.isInteger(idx) && idx >= 0 && Number.isFinite(coef)) {
        out[idx] = clampCoef(coef)
      }
    }
    return out
  } catch {
    return {}
  }
}

/**
 * 保存系数表（只落非默认值，表保持精简）
 * @param {Record<number, number>} map
 * @returns {Record<number, number>} 实际落库的内容
 */
export function saveLevelCoefficients(map) {
  const clean = {}
  for (const [k, v] of Object.entries(map || {})) {
    const idx = Number(k)
    const coef = Number(v)
    if (!Number.isInteger(idx) || idx < 0 || !Number.isFinite(coef)) continue
    if (coef === COEF_DEFAULT) continue
    clean[idx] = clampCoef(coef)
  }
  try {
    if (Object.keys(clean).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch { /* 隐私模式 / 配额满：静默降级为不生效 */ }
  return clean
}

/**
 * 取某档系数
 * @param {number} idx 档位索引
 * @param {Record<number, number>} [map] 系数表（不传则实时读 localStorage）
 * @returns {number} 未配置返回 1（原行为）
 */
export function getLevelCoefficient(idx, map) {
  const m = map || loadLevelCoefficients()
  const v = m[idx]
  return typeof v === 'number' ? v : COEF_DEFAULT
}

/** 清空全部配置（恢复原基准权重） */
export function clearLevelCoefficients() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
