/**
 * 自适应练习引擎
 *
 * 将练习分成小组，根据每组的答题效果自动调整下一组的难度和题量。
 * 目标：保持信心，探索边界。
 *
 * 设计原则：
 * - 难度粒度要细，每步提升微小，让学习曲线平缓
 * - 同等难度多练几组再决定是否升级
 * - 正确率高 + 速度快 → 微升；差或慢 → 微降
 * - 正常 → 多练，维持
 */

import { generatePracticeConfig } from './diagnostic'

// ─── 精细难度分阶（12级，每步变化微小） ───
//
// 进阶维度：数字大小 × 进退位要求
// 数字大小: 小(≤5) → 中(≤9) → 大(≤20) → 两位数无进退位 → 两位数允许进退位 → 大两位数 → 三位数
// 进退位: 禁止 → 混合(允许但不强制) → 鼓励(倾向)
//
const DIFFICULTY_LEVELS = [
  // ─── 第一阶段：建立信心 ───
  { label: '起步',       formulaList: [{ min: 1, max: 5, operators: null }, { min: 1, max: 5, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 10 },
  { label: '个位数巩固',   formulaList: [{ min: 1, max: 6, operators: null }, { min: 1, max: 6, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 12 },
  { label: '个位数进阶',   formulaList: [{ min: 1, max: 9, operators: null }, { min: 1, max: 9, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 18 },

  // ─── 第二阶段：引入进退位 ───
  { label: '混合进退位①',  formulaList: [{ min: 2, max: 9, operators: null }, { min: 2, max: 9, operators: [1, 2] }], carry: '2', abdication: '2', resultMax: 18 },
  { label: '混合进退位②',  formulaList: [{ min: 2, max: 9, operators: null }, { min: 2, max: 9, operators: [1, 2] }], carry: '1', abdication: '1', resultMax: 18 },

  // ─── 第三阶段：过渡到两位数 ───
  { label: '两位数入门',   formulaList: [{ min: 10, max: 30, operators: null }, { min: 10, max: 30, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 60 },
  { label: '两位数巩固',   formulaList: [{ min: 10, max: 50, operators: null }, { min: 10, max: 50, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 100 },

  // ─── 第四阶段：两位数进退位 ───
  { label: '进退位入门',   formulaList: [{ min: 11, max: 50, operators: null }, { min: 11, max: 50, operators: [1, 2] }], carry: '2', abdication: '2', resultMax: 100 },
  { label: '进退位巩固',   formulaList: [{ min: 11, max: 99, operators: null }, { min: 11, max: 99, operators: [1, 2] }], carry: '2', abdication: '2', resultMax: 198 },

  // ─── 第五阶段：大范围 ───
  { label: '大数加法',     formulaList: [{ min: 50, max: 999, operators: null }, { min: 50, max: 999, operators: [1] }], carry: '2', abdication: '3', resultMax: 1998 },
  { label: '大数减法',     formulaList: [{ min: 50, max: 999, operators: null }, { min: 50, max: 999, operators: [2] }], carry: '3', abdication: '2', resultMax: 1998 },
  { label: '综合挑战',     formulaList: [{ min: 10, max: 999, operators: null }, { min: 10, max: 999, operators: [1, 2] }], carry: '1', abdication: '1', resultMax: 1998 },
]

// 小组题量阶梯（从少到多，保持低压力）
const GROUP_SIZES = [4, 5, 6, 7, 8, 10, 12]

/**
 * 根据诊断画像选择初始难度
 */
function initialDifficulty(profile) {
  const { weakLevels, allCorrect } = profile
  if (allCorrect || weakLevels.length === 0) return 4  // 混合进退位①
  if (weakLevels.includes('L5') || weakLevels.includes('L4')) return 5  // 两位数入门
  if (weakLevels.includes('L3')) return 3  // 混合进退位①
  // L1/L2 弱
  return 1  // 个位数巩固
}

/**
 * 获取当前难度标签
 */
export function getDifficultyLabel(engine) {
  const level = DIFFICULTY_LEVELS[engine.difficultyIdx]
  return level ? level.label : '综合'
}

/**
 * 创建自适应引擎实例（纯对象，可序列化）
 */
export function createAdaptiveEngine(profile) {
  const baseConfig = generatePracticeConfig(profile)
  const startIdx = initialDifficulty(profile)
  return {
    difficultyIdx: startIdx,
    groupSizeIdx: 0,        // 索引 GROUP_SIZES
    totalAnswered: 0,       // 累计答题数
    groupIndex: 0,          // 已完成组数
    groupsAtThisLevel: 0,   // 在当前位置已完成的组数（要足够多才升级）
    consecutiveGood: 0,     // 连续几组表现好（达标后升级并重置）
    consecutiveBad: 0,      // 连续几组表现差
    missedUpgradeCount: 0,  // 达到升级条件但留在原地继续巩固的次数
    history: [],            // 各组的记录
    baseConfig,
  }
}

/**
 * 获取当前配置（适用于 createFormulasGenerator）
 */
export function getGroupConfig(engine) {
  const level = DIFFICULTY_LEVELS[engine.difficultyIdx] || DIFFICULTY_LEVELS[2]
  return {
    ...engine.baseConfig,
    formulaList: level.formulaList,
    carry: level.carry,
    abdication: level.abdication,
    resultMinValue: 1,
    resultMaxValue: level.resultMax,
  }
}

/**
 * 获取当前组题数
 */
export function getGroupSize(engine) {
  return GROUP_SIZES[engine.groupSizeIdx] || 5
}

/**
 * 评估上一组表现，返回更新后的引擎及下一组配置
 * @returns {{ engine: object, nextConfig: object|null, nextGroupSize: number, done: boolean }}
 */
export function evaluateGroup(engine, groupAnswers) {
  const total = groupAnswers.length
  if (total === 0) return { engine, nextConfig: null, nextGroupSize: 0, done: true }

  const correct = groupAnswers.filter(a => a.isCorrect).length
  const accuracy = correct / total
  const avgTime = groupAnswers.reduce((s, a) => s + (a.responseTime || 0), 0) / total

  // 克隆引擎（不可变更新）
  const next = {
    ...engine,
    totalAnswered: engine.totalAnswered + total,
    groupIndex: engine.groupIndex + 1,
    groupsAtThisLevel: engine.groupsAtThisLevel + 1,
    history: [...engine.history, {
      groupIdx: engine.groupIndex, accuracy, avgTime,
      difficultyIdx: engine.difficultyIdx, groupSize: total
    }],
  }

  const FAST = 5000     // ≤5秒 = 快
  const SLOW = 12000    // ≥12秒 = 慢（比之前更宽松）
  const GOOD = 0.80     // ≥80% = 好（略提高门槛）
  const BAD = 0.50      // <50% = 差
  const MIN_GROUPS = 3  // 在同一个等级至少练 3 组才考虑升级

  if (accuracy >= GOOD && avgTime < FAST) {
    // 又快又好
    next.consecutiveGood = engine.consecutiveGood + 1
    next.consecutiveBad = 0

    if (next.consecutiveGood >= 3 && next.groupsAtThisLevel >= MIN_GROUPS) {
      // 连续 3 组都好，且在此等级已练够 → 升级！
      const oldDifficulty = next.difficultyIdx
      next.difficultyIdx = Math.min(DIFFICULTY_LEVELS.length - 1, engine.difficultyIdx + 1)
      next.groupSizeIdx = Math.min(GROUP_SIZES.length - 1, engine.groupSizeIdx + 1)
      next.consecutiveGood = 0
      next.groupsAtThisLevel = 0
      next.missedUpgradeCount = 0

      // 重新设置组大小索引（升级后题量回到中等水平）
      next.groupSizeIdx = Math.min(next.groupSizeIdx, 3) // max index 3 = 7题
    } else {
      // 好但还不够升级条件 → 微增题量，但不升级
      next.groupSizeIdx = Math.min(GROUP_SIZES.length - 1, engine.groupSizeIdx + 1)
      next.missedUpgradeCount = engine.missedUpgradeCount + 1
    }
  } else if (accuracy < BAD || avgTime > SLOW) {
    // 差或慢 → 降级
    next.consecutiveBad = engine.consecutiveBad + 1
    next.consecutiveGood = 0

    if (next.consecutiveBad >= 2) {
      // 连续 2 组差 → 降一级
      next.difficultyIdx = Math.max(0, engine.difficultyIdx - 1)
      // 减少题量
      next.groupSizeIdx = Math.max(0, engine.groupSizeIdx - 2)
      next.consecutiveBad = 0
      next.groupsAtThisLevel = 0
      next.missedUpgradeCount = 0
    } else {
      // 一组差 → 减题量但保留难度
      next.groupSizeIdx = Math.max(0, engine.groupSizeIdx - 1)
    }
  } else if (accuracy >= GOOD) {
    // 正确率高但速度一般 → 维持题量，增加练习组数
    // 不调整题量，多练
    next.consecutiveGood = engine.consecutiveGood + 1
    next.consecutiveBad = 0

    if (next.consecutiveGood >= 4 && next.groupsAtThisLevel >= MIN_GROUPS + 1) {
      // 持续好但较慢 → 也升级，但幅度小
      next.difficultyIdx = Math.min(DIFFICULTY_LEVELS.length - 1, engine.difficultyIdx + 1)
      next.groupSizeIdx = Math.max(2, engine.groupSizeIdx)
      next.consecutiveGood = 0
      next.groupsAtThisLevel = 0
      next.missedUpgradeCount = 0
    }
  } else {
    // 一般（及格边缘）→ 维持难度，减少题量，重在巩固
    next.consecutiveGood = 0
    next.consecutiveBad = 0
    next.groupSizeIdx = Math.max(0, engine.groupSizeIdx - 1)
    next.missedUpgradeCount = engine.missedUpgradeCount + 1
  }

  // 结束条件：最多 10 组或累计 60 题
  const MAX_GROUPS = 10
  const MAX_QUESTIONS = 60
  if (next.history.length >= MAX_GROUPS || next.totalAnswered >= MAX_QUESTIONS) {
    return { engine: next, nextConfig: null, nextGroupSize: 0, done: true }
  }

  const level = DIFFICULTY_LEVELS[next.difficultyIdx] || DIFFICULTY_LEVELS[4]
  const nextConfig = {
    ...engine.baseConfig,
    formulaList: level.formulaList,
    carry: level.carry,
    abdication: level.abdication,
    resultMinValue: 1,
    resultMaxValue: level.resultMax,
    numberOfFormulas: GROUP_SIZES[next.groupSizeIdx],
  }

  return { engine: next, nextConfig, nextGroupSize: GROUP_SIZES[next.groupSizeIdx], done: false }
}
