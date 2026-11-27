/**
 * 挑战题开关（家长设置）
 *
 * 背景：挑战题是「当前档位 + 1 档」的题。有些档位的前置知识孩子还没学到，
 * 上位档的题不是「努力一下就能做出来」的 —— dr 定调：挑战题必须由家长手动决定，
 * 默认**关闭**，本轮只出当前档位及以下的题。
 *
 * 语义（与 services/adaptiveEngine.js 配合）：
 *   - 关闭：整组题目的档位上限 = 当前档位（强项池也不再取 +1 档）
 *   - 打开：挑战槽位出「当前档位 + 1」，强项池上限 +1（原行为）
 *
 * 为什么放 localStorage：与档位配比 / 起点档位一致，都是「本机设置」。
 *
 * @see services/adaptiveEngine.js — pickStrongLevel 的 MAX_ADVANCE
 * @see utils/algorithm/adaptiveBatch.js — pickLevelForSlot 的 challenge 分支
 * @see ../../components/Practice.vue — 设置入口（准备开始页「本次练习设置」）
 */

import { writeSetting } from './settingsRegistry'

const STORAGE_KEY = 'psm_challenge_enabled'
/**
 * 读取挑战题开关
 * @returns {boolean} 默认 false（关闭）
 */
export function loadChallengeEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // 隐私模式 / node 环境无 localStorage → 当作关闭
    return false
  }
}

/**
 * 保存挑战题开关
 *
 * 关也写 '0'（而不是删键）：删键的「关闭」在快照同步里传不出去，
 * 另一台设备会一直保持开启。显式 '0' 才能被 lww 合并。
 * @param {boolean} enabled
 * @returns {boolean} 实际生效值
 */
export function saveChallengeEnabled(enabled) {
  const value = !!enabled
  writeSetting(STORAGE_KEY, value ? '1' : '0')
  return value
}

/** 清除设置（回到默认关闭） */
export function clearChallengeSetting() {
  writeSetting(STORAGE_KEY, null)
}
