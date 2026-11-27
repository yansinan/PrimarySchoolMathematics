/**
 * 升档方式（家长设置）
 *
 * 背景：自适应练习原本「练够量 + 掌握」就自动进入下一档。但家长希望孩子在同一个
 * 难度阶段多练一些，什么时候升由自己决定 —— dr 定调：**默认手动升档**，
 * 由家长在设置里点「升一档」，不在练习过程中自动抬难度。
 *
 * 语义：
 *   - 手动（默认，false）：档位固定不动；练得再好也停在本档，
 *     由家长在「其他设置 → 练习档位 → 升一档」手动推进（内部就是改起点档位）
 *   - 自动（true）：恢复原行为（练够量 + 掌握 → 下一档；组内连续多组好评也会 +1）
 *
 * 写入走 settingsRegistry：与档位配比 / 起点档位 / 挑战题开关一样参与快照同步。
 *
 * @see services/abilityProfile.js — computeDifficultyIdx 的 promote 参数
 * @see services/adaptiveEngine.js — evaluateGroup / adjustNextQuestion 的升降档
 * @see ../../components/Practice.vue — 设置入口（准备开始页「本次练习设置」）
 */

import { readSetting, writeSetting } from './settingsRegistry'

const STORAGE_KEY = 'psm_auto_advance'

/**
 * 读取「自动升档」开关
 * @returns {boolean} 默认 false（手动升档）
 */
export function loadAutoAdvance() {
  try {
    return readSetting(STORAGE_KEY) === '1'
  } catch {
    // node 环境无 localStorage → 当作手动
    return false
  }
}

/**
 * 保存「自动升档」开关
 * @param {boolean} enabled
 * @returns {boolean} 实际生效值
 */
export function saveAutoAdvance(enabled) {
  const value = !!enabled
  try {
    writeSetting(STORAGE_KEY, value ? '1' : '0')
  } catch { /* 隐私模式 / 配额满：静默降级 */ }
  return value
}

/** 清除设置（回到默认：手动升档） */
export function clearAutoAdvanceSetting() {
  try { writeSetting(STORAGE_KEY, null) } catch { /* ignore */ }
}
