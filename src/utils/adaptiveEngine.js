/**
 * 自适应练习引擎
 *
 * 将练习分成小组，根据每组的答题效果自动调整下一组的题型、难度和题量。
 *
 * 三维调节：
 * 1. 输入模式: choice2(最简单) → choice4 → vertical_keypad(标准) → horizontal_keypad(掌握验证) — 辅助递减
 * 2. 填空位置: result(标准) → mixed(等式不同位置填空，更难) — 思维挑战递增
 * 3. 难度阶梯: 12级数字/进退位微调
 *
 * 目标：保持信心，探索边界。
 * 差 → 先给选择题辅助，再不行才降难度
 * 好 → 先试填空位置变化，再升级
 */

import { generatePracticeConfig } from './diagnostic'
import {
  ACCURACY_THRESHOLDS,
  SPEED_THRESHOLDS,
  ASSIST_LEVELS,
  MASTERY_CHECK_CONFIG,
  CONSECUTIVE_GOOD_TO_ADVANCE,
  MIN_GROUPS_PER_DIMENSION,
} from '../constants/practice'

// ─── 精细难度分阶（16级，每步变化微小） ───
//
// 进阶维度：数字大小 × 进退位要求
// 数字大小: 小(≤5) → 中(≤9) → 大(≤20) → 两位数小 → 两位数大 → 大数
// 进退位: 禁止 → 混合(允许但不强制) → 鼓励(倾向)
//
export const DIFFICULTY_LEVELS = [
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

// 小组题量阶梯（每个速度级别对应一个基数）
// x 为速度等级(0~4)，公式 y = 2 + (4*x) ± (2*random)
const GROUP_SIZES = [6, 10, 14, 18, 22]

/* ============================================================
   填空位置模式
   ============================================================ */
// ─── 为选择题生成干扰选项 ───
function generateDistractors(correct, count) {
  const distractors = new Set()
  // 尽量生成与正确答案相近但不同的数字
  const candidates = [
    correct + 1, correct - 1,
    correct + 2, correct - 2,
    correct + 5, correct - 5,
    correct + 10, correct - 10,
    Math.abs(correct - 1),  // 防止为0
    correct + (correct > 5 ? -3 : 3),
  ]
  for (const c of candidates) {
    if (c !== correct && c > 0 && !distractors.has(c)) {
      distractors.add(c)
    }
    if (distractors.size >= count) break
  }
  // 若不够，补充随机数
  while (distractors.size < count) {
    const r = Math.max(1, correct + Math.floor(Math.random() * 10) - 5)
    if (r !== correct && !distractors.has(r)) distractors.add(r)
  }
  return Array.from(distractors).slice(0, count)
}

/* ============================================================
   引擎核心
   ============================================================ */

/**
 * 根据诊断画像选择初始难度
 */
function initialDifficulty(profile) {
  const { weakLevels, allCorrect } = profile
  if (allCorrect || weakLevels.length === 0) return 4  // 混合进退位①
  if (weakLevels.includes('L5') || weakLevels.includes('L4')) return 5  // 两位数入门
  if (weakLevels.includes('L3')) return 3  // 混合进退位①
  return 1  // 个位数巩固 — L1/L2 弱
}

/**
 * 获取当前难度标签
 */
export function getDifficultyLabel(engine) {
  const level = DIFFICULTY_LEVELS[engine.difficultyIdx]
  return level ? level.label : '综合'
}

/**
 * 创建自适应引擎实例
 */
export function createAdaptiveEngine(profile, targetMin = 10, targetMax = 30) {
  const baseConfig = generatePracticeConfig(profile)
  const startIdx = initialDifficulty(profile)
  return {
    difficultyIdx: startIdx,
    assistLevel: 0,
    blankMode: 'result',
    groupSizeIdx: 0,
    totalAnswered: 0,
    groupIndex: 0,
    groupsAtThisLevel: 0,
    consecutiveGood: 0,
    consecutiveBad: 0,
    targetMin,
    targetMax,
    masteryCheck: {
      active: false,                // 当前是否处于横式验证中
      horizontalGood: 0,            // 横式答对累计
      consecutiveVerticalGood: 0,   // vertical 连续答对计数器
    },
    lastGroupResult: null,  // 最后生成的组摘要
    lastEvaluation: null,   // 用户自评 1-5
    history: [],
    baseConfig,
  }
}

/**
 * 获取当前组的难度配置（不含 mode 信息）
 */
export function getDifficultyConfig(engine) {
  const level = DIFFICULTY_LEVELS[engine.difficultyIdx] || DIFFICULTY_LEVELS[4]
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
 * 根据速度等级计算组题数
 * 公式: y = 2 + (4*x) ± (2*random)，x 为速度等级(0~4)
 * 结果不少于 4 道
 */
export function getGroupSize(engine) {
  const x = engine.groupSizeIdx || 0
  const base = 2 + 4 * x
  const jitter = Math.floor(Math.random() * 5) - 2  // -2 ~ +2
  return Math.max(4, base + jitter * 2)  // jitter*2 使波动幅度为 ±4
}

/**
 * 基于引擎的辅助级别，决定单题的输入模式
 *
 * 新梯度（从易→难）：
 *   choice2(二选一) < choice4(四选一) < vertical_keypad(竖式标准) < horizontal_keypad(横式掌握验证)
 * 概率表：
 *   assistLevel 0 (标准，无辅助)：vertical_keypad 70% / choice4 20% / choice2 10%
 *   assistLevel 1 (轻度辅助)：     vertical_keypad 50% / choice4 35% / choice2 15%
 *   assistLevel 2 (重度辅助)：     vertical_keypad 30% / choice4 50% / choice2 20%
 * 特殊：masteryCheck.active === true 时强制返回 horizontal_keypad（跳过概率表）
 * @param {object} engine - 引擎实例
 * @returns {string} ASSIST_LEVELS 中的 key
 */
function pickInputMode(engine) {
  // 横式掌握验证激活 → 强制横式
  if (engine.masteryCheck && engine.masteryCheck.active) {
    return 'horizontal_keypad'
  }

  const r = Math.random()
  const L = engine.assistLevel // 0=standard, 1=light, 2=heavy

  if (L === 0) {
    // vertical_keypad 主导：70% vertical, 20% choice4, 10% choice2
    if (r < 0.70) return 'vertical_keypad'
    if (r < 0.90) return 'choice4'
    return 'choice2'
  }
  if (L === 1) {
    // 轻度辅助：50% vertical, 35% choice4, 15% choice2
    if (r < 0.50) return 'vertical_keypad'
    if (r < 0.85) return 'choice4'
    return 'choice2'
  }
  // 重度辅助：30% vertical, 50% choice4, 20% choice2
  if (r < 0.30) return 'vertical_keypad'
  if (r < 0.80) return 'choice4'
  return 'choice2'
}

/**
 * 为一组题生成多样的题目形式（仅支持 result 填空）
 *
 * 用 ASSIST_LEVELS 表统一决定 layout/input/options，输出中附加 inputMode 字段，
 * 供 Practice.vue 直接消费（替代原 initPractice 的独立 decideDisplayMode 逻辑）。
 *
 * @param {Array<{equation:string,solution:number}>} baseEquations 基础算式
 * @param {object} engine 当前引擎
 * @returns {Array<{equation:string,solution:number,options?:number[],inputMode:string}>}
 */
export function diversifyBatch(baseEquations, engine) {
  return baseEquations.map(q => {
    const modeKey = pickInputMode(engine)
    // 从 ASSIST_LEVELS 表查 layout/input
    const modeConfig = ASSIST_LEVELS.find(m => m.key === modeKey) || ASSIST_LEVELS[0]
    let equation = q.equation
    let solution = q.solution
    let options = undefined

    // 统一使用 result 填空
    const eqPart = equation.replace(/\=$/, '').split('=')[0]
    equation = `${eqPart}=__`

    // 选择题 → 生成干扰选项
    if (modeConfig.input === 'options' && modeConfig.optionCount > 0) {
      const count = modeConfig.optionCount
      const distractors = generateDistractors(solution, count - 1)
      options = [solution, ...distractors].sort(() => Math.random() - 0.5)
    }

    return { ...q, equation, solution, options, inputMode: modeKey }
  })
}

/**
 * 评估上一组表现，返回更新后的引擎及下一组配置
 */
export function evaluateGroup(engine, groupAnswers) {
  const total = groupAnswers.length
  if (total === 0) return { engine, nextGroupSize: 0, done: true }

  const correct = groupAnswers.filter(a => a.isCorrect).length
  const accuracy = correct / total
  const avgTime = groupAnswers.reduce((s, a) => s + (a.responseTime || 0), 0) / total

  const next = {
    ...engine,
    totalAnswered: engine.totalAnswered + total,
    groupIndex: engine.groupIndex + 1,
    groupsAtThisLevel: engine.groupsAtThisLevel + 1,
    history: [...engine.history, {
      groupIdx: engine.groupIndex, accuracy, avgTime,
      difficultyIdx: engine.difficultyIdx,
      assistLevel: engine.assistLevel,
      blankMode: engine.blankMode,
      groupSize: total,
      evaluation: engine.lastEvaluation,
    }],
  }

  // 阈值改用 constants/practice.js 中的常量（2026-06-04 整体上调 +2s）
  const FAST = SPEED_THRESHOLDS[0].maxTime   // 5000（极快阈值）
  const SLOW = SPEED_THRESHOLDS[2].maxTime   // 10000（正常阈值，作为"反应慢"分界）
  const VERY_SLOW = SPEED_THRESHOLDS[3].maxTime  // 14000（慢阈值）
  const GOOD = ACCURACY_THRESHOLDS.good       // 0.80
  const BAD = ACCURACY_THRESHOLDS.bad         // 0.50
  // MIN_GROUPS_PER_DIMENSION 从 constants 读（已与实际 6 组对齐，2026-06-04）

  // ─── 根据每道题平均用时计算速度等级 x ───
  // 阈值来自 SPEED_THRESHOLDS（已上调 +2s）
  let speedAdjust = 0
  for (const t of SPEED_THRESHOLDS) {
    if (avgTime < t.maxTime) {
      speedAdjust = t.adjust
      break
    }
  }

  // ─── 根据表现决定如何调整 ───
  // 互斥守卫：mastery check 期间冻结 3D 链的"进阶"分支（避免双触发覆盖 blankMode）
  const masteryActive = engine.masteryCheck && engine.masteryCheck.active

  if (accuracy >= GOOD) {
    // 正确率好
    next.consecutiveGood = engine.consecutiveGood + 1
    next.consecutiveBad = 0

    if (!masteryActive && next.consecutiveGood >= CONSECUTIVE_GOOD_TO_ADVANCE && next.groupsAtThisLevel >= MIN_GROUPS_PER_DIMENSION) {
      // 1) 先解除辅助（有辅助 → 减少辅助）
      if (engine.assistLevel > 0) {
        next.assistLevel = engine.assistLevel - 1
        next.consecutiveGood = 0
        next.groupsAtThisLevel = 0
      }
      // 2) 辅助已解除 → 尝试混合填空
      else if (engine.blankMode === 'result') {
        next.blankMode = 'mixed'
        next.consecutiveGood = 0
        next.groupsAtThisLevel = 0
      }
      // 3) 混合填空也过了 → 升级难度
      else {
        next.difficultyIdx = Math.min(DIFFICULTY_LEVELS.length - 1, engine.difficultyIdx + 1)
        next.blankMode = 'result'
        next.consecutiveGood = 0
        next.groupsAtThisLevel = 0
      }
    }

    // 题量：速度越快题量越大
    next.groupSizeIdx = Math.min(GROUP_SIZES.length - 1, Math.max(0, engine.groupSizeIdx + speedAdjust))

  } else if (accuracy < BAD) {
    // 正确率差
    next.consecutiveBad = engine.consecutiveBad + 1
    next.consecutiveGood = 0
    // 差组清除 mastery 触发累计，避免"好→差→好"误触发
    if (next.masteryCheck) {
      next.masteryCheck.consecutiveVerticalGood = 0
    }

    if (next.consecutiveBad >= 2) {
      // 1) 先增加辅助
      if (engine.assistLevel < ASSIST_LEVELS.length - 1) {
        next.assistLevel = engine.assistLevel + 1
        next.blankMode = 'result'
        next.consecutiveBad = 0
        next.groupsAtThisLevel = 0
      }
      // 2) 辅助已最大 → 降难度
      else {
        next.difficultyIdx = Math.max(0, engine.difficultyIdx - 1)
        next.assistLevel = Math.min(ASSIST_LEVELS.length - 1, engine.assistLevel)
        next.blankMode = 'result'
        next.consecutiveBad = 0
        next.groupsAtThisLevel = 0
      }
    }

    // 差或慢 → 减少题量
    next.groupSizeIdx = Math.max(0, engine.groupSizeIdx + Math.min(-1, speedAdjust))

  } else {
    // 及格边缘 → 巩固
    next.consecutiveGood = 0
    next.consecutiveBad = 0
    next.groupSizeIdx = Math.max(0, engine.groupSizeIdx + speedAdjust - 1)
  }

  // ── Mastery check 状态机（横式掌握验证） ──
  // 独立于上面的 3D 链（assistLevel / blankMode / difficulty），走额外路径。
  // 只在 standard 模式（assistLevel=0）下触发，横式答对 N 道 = 直接升难度。
  if (engine.masteryCheck) {
    if (engine.masteryCheck.active) {
      // ── 正在横式验证中 ──
      // 遍历本组中横式答题，通过则累计，失败则取消
      const hAnswers = groupAnswers.filter(a => a.inputMode === 'horizontal_keypad')
      for (const a of hAnswers) {
        if (a.isCorrect) {
          next.masteryCheck.horizontalGood++
        } else {
          // 横式答错 → 验证失败，回 vertical
          next.masteryCheck.active = false
          next.masteryCheck.horizontalGood = 0
          next.masteryCheck.consecutiveVerticalGood = 0
          break
        }
      }
      // 横式全部答对且达到通过数 → 直接升难度（跳过 blankMode 中间态）
      if (next.masteryCheck.active && next.masteryCheck.horizontalGood >= MASTERY_CHECK_CONFIG.targetPasses) {
        next.difficultyIdx = Math.min(DIFFICULTY_LEVELS.length - 1, engine.difficultyIdx + 1)
        next.blankMode = 'result'
        next.consecutiveGood = 0
        next.groupsAtThisLevel = 0
        next.masteryCheck.active = false
        next.masteryCheck.horizontalGood = 0
        next.masteryCheck.consecutiveVerticalGood = 0
      }
    } else if (accuracy >= GOOD && engine.assistLevel === MASTERY_CHECK_CONFIG.requiredAssistLevel) {
      // ── 不在验证中，好的组表现 + 标准模式 → 尝试触发验证 ──
      next.masteryCheck.consecutiveVerticalGood = (engine.masteryCheck.consecutiveVerticalGood || 0) + 1
      if (next.masteryCheck.consecutiveVerticalGood >= MASTERY_CHECK_CONFIG.triggerThreshold) {
        if (Math.random() < MASTERY_CHECK_CONFIG.triggerProbability) {
          next.masteryCheck.active = true
          next.masteryCheck.horizontalGood = 0
        }
        next.masteryCheck.consecutiveVerticalGood = 0
      }
    }
  }

  // ── 结束条件：基于 targetMin ~ targetMax ══
  const { targetMin, targetMax } = engine
  next.lastGroupResult = { groupIdx: next.groupIndex, accuracy, avgTime, total: next.totalAnswered }

  // 1. 未达到最小目标 → 必须继续
  if (next.totalAnswered < targetMin) {
    return { engine: next, nextGroupSize: GROUP_SIZES[next.groupSizeIdx], done: false }
  }

  // 2. 超过最大目标 → 必须结束
  if (next.totalAnswered >= targetMax) {
    return { engine: next, nextGroupSize: 0, done: true }
  }

  // 3. 在 min ~ max 之间 → 根据表现智能判断
  // 原则：准确率高+速度快 → 提前结束（已掌握，够用了）
  //      准确率高但慢 → 继续练提速
  //      准确率低 → 需要更多练习巩固
  // 注意：recentAllGood / recentAllFast 需要历史 ≥ 2 组，避免在第 1 组就误判
  // 之前 history.length >= 2 在第 1 组就 false 没问题
  const recentGroups = next.history.slice(-2)
  const recentAllGood = recentGroups.length >= 2 && recentGroups.every(g => g.accuracy >= GOOD)
  const recentAllFast = recentGroups.length >= 2 && recentGroups.every(g => g.avgTime < FAST)

  if (accuracy >= GOOD && avgTime < FAST && recentAllGood && recentAllFast) {
    // 连续多组又快又好 → 已经掌握了，提前结束
    return { engine: next, nextGroupSize: 0, done: true }
  }

  if (accuracy < BAD) {
    // 差 → 适当减少题量、降低难度继续巩固。
    // 但如果已经超过 min 太多且连续差 → 避免厌烦，提前软结束
    if (next.totalAnswered >= targetMin + 5 && next.consecutiveBad >= 2) {
      return { engine: next, nextGroupSize: 0, done: true }
    }
  }

  // 最多 6 组封顶（从 5 放宽），避免大组未答完就被强制结束
  // 之前 5 组封顶太严：做完 4 组 + 第 5 组（22 道大组）只答 11 道时
  // next.history.length=5 → done=true，导致用户被强制结束未答完的大组
  // 6 组是合理上限，既给大组留空间又不让用户练太久
  if (next.history.length >= 6) {
    return { engine: next, nextGroupSize: 0, done: true }
  }

  return { engine: next, nextGroupSize: GROUP_SIZES[next.groupSizeIdx], done: false }
}
