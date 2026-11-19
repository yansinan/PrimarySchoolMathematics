/**
 * 练习档位「起点」手动指定（家长设置）
 *
 * 用途：自适应升档会把孩子的进度往上推（旧版还有每轮跳档的 bug），家长需要能把
 * 「当前练哪一档」拉回来。这个设置把自适应练习的**起点**钉在指定档位，之后仍按
 * 教材顺序逐档推进；不改答题史、不影响统计/错题本。
 *
 * 语义（与 services/abilityProfile.js#computeDifficultyIdx 配合）：
 *   - 有覆盖：练习从 levelIdx 起；**生效时间点之前的旧轮次不再参与升档阶梯**
 *     （since 过滤，避免旧数据把孩子再拉回高档位）
 *   - 清除覆盖：回到「按练习记录计算」
 *
 * 为什么放 localStorage：与档位配比（levelCoefficients）、出题设置（formPersistence）
 * 一致，都是「本机设置」，不写进练习题数据表。
 *
 * @see ../services/abilityProfile.js — loadSessionLevels / computeDifficultyIdx
 * @see ../../components/generate/OptionsDrawer.vue — 设置入口
 */

import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

const STORAGE_KEY = 'psm_level_override'

/** 是否为合法档位索引 */
function isValidIdx(idx) {
  return Number.isInteger(idx) && idx >= 0 && idx < DIFFICULTY_LEVELS.length
}

/**
 * 读取手动指定的起点档位
 * @returns {{ levelIdx: number, since: number } | null} 未设置 / 数据非法 → null
 */
export function loadLevelOverride() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const levelIdx = Number(parsed?.levelIdx)
    if (!isValidIdx(levelIdx)) return null
    return { levelIdx, since: Number(parsed?.since) || 0 }
  } catch {
    // 隐私模式 / 数据损坏 / node 环境无 localStorage → 当作未设置
    return null
  }
}

/**
 * 保存手动指定的起点档位（同时记录生效时间，用于过滤旧轮次）
 * @param {number} levelIdx - DIFFICULTY_LEVELS 索引
 * @returns {{ levelIdx: number, since: number } | null} 非法索引 → null
 */
export function saveLevelOverride(levelIdx) {
  const idx = Number(levelIdx)
  if (!isValidIdx(idx)) return null
  const value = { levelIdx: idx, since: Date.now() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch { /* 隐私模式 / 配额满：静默降级为不生效 */ }
  return value
}

/** 清除手动指定的起点档位（恢复按练习记录计算） */
export function clearLevelOverride() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

/**
 * 是否设置了手动档位（UI 显示「已自定义」标记）
 * @returns {boolean}
 */
export function hasLevelOverride() {
  return loadLevelOverride() != null
}
