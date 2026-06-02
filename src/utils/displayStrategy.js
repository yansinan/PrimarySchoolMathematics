/**
 * 题目展示策略（layout/input 决策）
 *
 * 原始实现见 Practice.vue 的 tempDisplayStrategy 对象（带 this.stats 模块级 mutable）。
 * 此处抽成纯函数：所有状态由参数传入，决策结果由返回值给出。
 *
 * 决策规则（与原版完全一致）：
 *  1) 连续错 >= CONSECUTIVE_WRONG_THRESHOLD → 横式 + 选项（降低难度）
 *  2) 有进位/退位 → 竖式 + 键盘（引导竖式思考）
 *  3) 默认 → 横式 + 键盘
 *
 * 统计更新规则：
 *  正确：consecutiveWrong=0, accuracyRate *= 0.9 + 0.1
 *  错误：consecutiveWrong++, accuracyRate *= 0.9
 */

import { getCarryType, parseEquation } from './equationParser'

/** 连续错 N 次 → 切到横式+选项 */
export const CONSECUTIVE_WRONG_THRESHOLD = 3

/** 初始统计状态 */
export function createInitialStats() {
  return {
    consecutiveWrong: 0,
    accuracyRate: 1.0,
  }
}

/**
 * 决策：给定题目和当前统计，返回展示模式
 * @param {string} equation - 算式，如 "1+2=" 或 "123+456="
 * @param {{consecutiveWrong:number,accuracyRate:number}} stats - 当前统计
 * @returns {{layout:'horizontal'|'vertical', input:'keypad'|'options'}}
 */
export function decideDisplayMode(equation, stats) {
  // 规则 1：连续错多 → 降难度到选项
  if (stats.consecutiveWrong >= CONSECUTIVE_WRONG_THRESHOLD) {
    return { layout: 'horizontal', input: 'options' }
  }

  // 规则 2：有进位/退位 → 竖式+键盘
  const parsed = parseEquation(equation)
  if (getCarryType(parsed)) {
    return { layout: 'vertical', input: 'keypad' }
  }

  // 规则 3：默认 → 横式+键盘
  return { layout: 'horizontal', input: 'keypad' }
}

/**
 * 更新统计：返回新统计对象（不修改入参）
 * @param {{consecutiveWrong:number,accuracyRate:number}} stats
 * @param {boolean} isCorrect
 * @returns {{consecutiveWrong:number,accuracyRate:number}}
 */
export function updateDisplayStats(stats, isCorrect) {
  if (isCorrect) {
    return {
      consecutiveWrong: 0,
      accuracyRate: stats.accuracyRate * 0.9 + 0.1,
    }
  }
  return {
    consecutiveWrong: stats.consecutiveWrong + 1,
    accuracyRate: stats.accuracyRate * 0.9,
  }
}
