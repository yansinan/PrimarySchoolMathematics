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

// P5 v2.3.0: generatePracticeConfig 不再被 adaptiveEngine 调用
// import { generatePracticeConfig } from './diagnostic'
import { sumResponseTimes } from '../score'
import {
  ACCURACY_THRESHOLDS,
  SPEED_THRESHOLDS,
  ASSIST_LEVELS,
  MAX_NORMAL_ASSIST_LEVEL,
  MASTERY_CHECK_CONFIG,
  CONSECUTIVE_GOOD_TO_ADVANCE,
  MIN_GROUPS_PER_DIMENSION,
  PROFILE_RATIOS,
  RESERVE_POOL_SIZE,
  STRONG_THRESHOLD,
  WEAK_THRESHOLD,
} from '../../constants/practice'
import { DIFFICULTY_LEVELS } from '../../constants/difficulty'
import { matchLevel, groupAnswersByLevel, Answer, Question, WrongAnswer } from './'
// 小组题量阶梯（每个速度级别对应一个基数）
// x 为速度等级(0~4)，公式 y = 2 + (4*x) ± (2*random)
const GROUP_SIZES = [6, 10, 14, 18, 22]

/* ============================================================
   填空位置模式
   ============================================================ */
// ─── 为选择题生成干扰选项 ───
function generateDistractors(correct, count, wrongPool = [], equation = '') {
  const distractors = new Set()

  // P0: 从错题池找等价算式的错误答案（含交换律 + 事实家族）
  if (wrongPool.length && equation) {
    const matches = WrongAnswer.findByEquation(wrongPool, equation, { exact: false })
    for (const w of matches) {
      const v = Number(w.userAnswer)
      if (v !== correct && v > 0 && !distractors.has(v)) distractors.add(v)
      if (distractors.size >= count) return Array.from(distractors).slice(0, count)
    }
  }

  // P2: 算法生成兜底（与旧逻辑一致）
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

/**
 * 从错题记录构建一道复习题
 * 取出 equation body + solution，拼为 =__ 格式，强制竖式 keypad
 * @param {WrongAnswer} wa - 错题实例
 * @returns {{ equation, solution, inputMode, operator, operandMin, operandMax }}
 */
function buildReviewQuestion(wa) {
  const eqBody = (wa.equation || '')
    .replace(/=\d+$/, '').replace(/=__$/, '').replace(/=$/, '').trim()
  return {
    equation: `${eqBody}=__`,
    solution: wa.solution,
    inputMode: 'vertical_keypad',
    operator: wa.operator,
    operandMin: wa.operandMin,
    operandMax: wa.operandMax,
    isCarry: wa.isCarry,
    isBorrow: wa.isBorrow,
  }
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
 *
 * P5 v2.3.0: 新增 strongLevelIndices / weakLevelIndices / reservePool
 * 从 profile.strongLevels/weakLevels (label 数组) 反查 DIFFICULTY_LEVELS 索引
 * baseConfig 使用最小默认值（出题完全由 DIFFICULTY_LEVELS + plan 驱动）
 */
export function createAdaptiveEngine(profile, targetMin = 10, targetMax = 30) {
  // P5 v2.3.0: 从诊断答题用 matchLevel 实时计算 strong/weak 索引
  // 不使用 profile.weakLevels/strongLevels（旧格式 L1-L5 ID）
  const diagGroups = groupAnswersByLevel(profile.diagAnswers || [])
  const strongLevelIndices = diagGroups
    .filter(g => g.accuracy >= STRONG_THRESHOLD)
    .map(g => g.levelIdx)
  const weakLevelIndices = diagGroups
    .filter(g => g.accuracy < WEAK_THRESHOLD)
    .map(g => g.levelIdx)

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
    /** P5: 强项 DIFFICULTY_LEVELS 索引数组 */
    strongLevelIndices,
    /** P5: 弱项 DIFFICULTY_LEVELS 索引数组 */
    weakLevelIndices,
    /** P5: 备用题池 [{equation, solution, type}] */
    reservePool: [],
    masteryCheck: {
      active: false,                // 当前是否处于横式验证中
      horizontalGood: 0,            // 横式答对累计
      consecutiveVerticalGood: 0,   // vertical 连续答对计数器
    },
    lastGroupResult: null,  // 最后生成的组摘要
    lastEvaluation: null,   // 用户自评 1-5
    lastGroupSize: 0,       // 上一组实际生成的题数（getGroupSize 持久化，防切片错位）
    history: [],
    /** 最小基线配置（出课题型配置由 DIFFICULTY_LEVELS + plan 驱动） */
    baseConfig: {
      step: '1', whereIsResult: '0', enableBrackets: false,
      remainder: '3', solution: '0', numberOfPapers: 1,
    },
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
  const size = Math.max(4, base + jitter * 2)  // jitter*2 使波动幅度为 ±4
  engine.lastGroupSize = size  // 持久化到引擎，completeGroup 用此值切片
  return size
}

/**
 * 基于引擎的辅助级别，决定单题的输入模式
 *
 * ASSIST_LEVELS 顺序（从易→难）：
 *   choice2(二选一) < choice4(四选一) < vertical_keypad(竖式标准) < horizontal_keypad(横式掌握验证)
 *
 * 概率表（assistLevel 0=标准/无辅助, 1=轻度辅助, 2=重度辅助）：
 *   assistLevel 2 (重度辅助)：choice2 70% / choice4 20% / vertical 10%
 *   assistLevel 1 (轻度辅助)：choice4 50% / choice2 25% / vertical 25%
 *   assistLevel 0 (标准)：vertical 70% / choice4 15% / choice2 15%
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
  const L = engine.assistLevel // 0=标准(竖式主导), 1=轻度辅助(choice4主导), 2=重度辅助(choice2主导)

  if (L === 2) {
    // 重度辅助 → choice2 主导
    if (r < 0.70) return 'choice2'
    if (r < 0.90) return 'choice4'
    return 'vertical_keypad'
  }
  if (L === 1) {
    // 轻度辅助 → choice4 主导
    if (r < 0.50) return 'choice4'
    if (r < 0.75) return 'choice2'
    return 'vertical_keypad'
  }
  // L === 0：标准 → vertical 主导
  if (r < 0.70) return 'vertical_keypad'
  if (r < 0.85) return 'choice4'
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
      const distractors = generateDistractors(solution, count - 1, engine.wrongAnswerPool, q.equation)
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

  // 内部 wrap → Answer 实例，isCorrect 走计算 getter 而非存字段
  const answers = groupAnswers.map(a => a instanceof Answer ? a : new Answer(a))

  const correct = answers.filter(a => a.isCorrect).length
  const accuracy = correct / total
  const avgTime = sumResponseTimes(answers) / total

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
      // P5 v2.3.0: assistLevel 方向（ASSIST_LEVELS: 0=choice2最易, 2=vertical最难）
      // 好→assistLevel+1: 往更难方向(vertical), 减少辅助 ↓
      // 1) 先减少辅助（有辅助 → 往 harder 方向）
      if (engine.assistLevel < MAX_NORMAL_ASSIST_LEVEL) {
        next.assistLevel = engine.assistLevel + 1
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
      // P5 v2.3.0: 差→assistLevel-1（0=choice2最易+辅助最多, 2=vertical最难）
      // 1) 先增加辅助（往 choice2 方向, 更易）
      if (engine.assistLevel > 0) {
        next.assistLevel = engine.assistLevel - 1
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

  // ── Mastery check 兜底（P5 v2.3.0：改为每答一题触发，此处在 evaluateGroup 保留最小兜底） ──
  // 旧版 mastery check 状态机已迁移至 adjustNextQuestion（per-question 触发）
  // 此处仅保留：如果 masteryCheck.active 仍为 true（异常状态），确保不阻塞升级路径
  if (engine.masteryCheck && engine.masteryCheck.active && engine.masteryCheck.horizontalGood >= MASTERY_CHECK_CONFIG.targetPasses) {
    next.difficultyIdx = Math.min(DIFFICULTY_LEVELS.length - 1, engine.difficultyIdx + 1)
    next.blankMode = 'result'
    next.consecutiveGood = 0
    next.groupsAtThisLevel = 0
    next.masteryCheck.active = false
    next.masteryCheck.horizontalGood = 0
    next.masteryCheck.consecutiveVerticalGood = 0
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

// ═══════════════════════════════════════════════════════════
// P5: 画像驱动的出题排列方案
// ═══════════════════════════════════════════════════════════

/**
 * 带权重的随机选择
 * @param {any[]} items
 * @param {number[]} weights 与 items 等长的权重数组
 * @returns {any} 选中的元素
 */
function weightedRandom(items, weights) {
  if (!items.length) return null
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/**
 * 强项选级：索引越高的 level 选中概率越大（挑战更强）
 * 不设硬窗口，所有强项等级参与，权重偏高处
 * @param {number[]} indices - DIFFICULTY_LEVELS 索引数组
 * @param {number} currentDifficulty - 当前引擎难度索引
 * @returns {number} 选中的 DIFFICULTY_LEVELS 索引
 */
export function pickStrongLevel(indices, currentDifficulty) {
  if (!indices.length) return null
  // 全量参与，权重向高索引偏斜
  const n = indices.length
  const weights = Array.from({ length: n }, (_, i) => Math.pow(1.5, i))
  return weightedRandom(indices, weights)
}

/**
 * 弱项选级：索引越低的 level 选中概率越大（从基础补起）
 * 不设硬窗口，所有弱项等级参与，权重偏低处
 * @param {number[]} indices - DIFFICULTY_LEVELS 索引数组
 * @param {number} currentDifficulty - 当前引擎难度索引
 * @returns {number} 选中的 DIFFICULTY_LEVELS 索引
 */
export function pickWeakLevel(indices, currentDifficulty) {
  if (!indices.length) return null
  // 全量参与，权重向低索引偏斜
  const n = indices.length
  const weights = Array.from({ length: n }, (_, i) => Math.pow(1.5, n - 1 - i))
  return weightedRandom(indices, weights)
}

/**
 * 根据组序号、当前引擎状态和画像，生成出题排列方案
 *
 * @param {number} groupIndex - 当前组序号（从 1 开始）
 * @param {number} groupSize - 本组题数
 * @param {object} engine - 当前引擎实例
 * @param {object} profile - 用户画像
 * @param {boolean} isLastGroup - 是否预测为最后一组
 * @returns {string[]} 排列数组，每项为 'strong' | 'weak' | 'challenge'
 */
export function generateQuestionPlan(groupIndex, groupSize, engine, profile, isLastGroup = false) {
  const totalStrong = engine.strongLevelIndices.length
  const totalWeak = engine.weakLevelIndices.length
  const canDoStrong = totalStrong > 0
  const canDoWeak = totalWeak > 0
  const hasChallenge = engine.difficultyIdx < DIFFICULTY_LEVELS.length - 1

  // 确定组类型
  let groupType
  if (groupIndex === 1) {
    groupType = 'confidence'
  } else if (groupIndex === 2) {
    groupType = 'repair'
  } else if (isLastGroup) {
    groupType = 'confidence'
  } else {
    groupType = 'mixed'
  }

  // 取比例配置
  const cfg = PROFILE_RATIOS[groupType]

  // 计算弱项占比（区间取值）
  let weakPct
  if (cfg.weak != null) {
    weakPct = cfg.weak
  } else if (!canDoWeak) {
    weakPct = 0
  } else {
    // 区间 [weakMin, weakMax]，弱项越严重占比越高
    const weakSeverity = 1 - (profile.avgScore || 0.5)
    const range = cfg.weakMax - cfg.weakMin
    weakPct = cfg.weakMin + weakSeverity * range
  }

  let strongPct
  if (!canDoStrong && canDoWeak) {
    // 无强项有弱项：弱项占满 strong 份额
    strongPct = 0
    weakPct = Math.min(1, (weakPct || 0) + cfg.strong)
  } else if (!canDoStrong && !canDoWeak) {
    // 无强项无弱项：全当前难度
    strongPct = 1
    weakPct = 0
  } else {
    strongPct = cfg.strong
  }

  if (weakPct == null) weakPct = 0
  if (strongPct == null) strongPct = cfg.strong
  const challengePct = hasChallenge ? (cfg.challenge || 0) : 0

  // 按比例计算各类型题数
  const challengeCount = Math.floor(groupSize * challengePct)
  const weakCount = Math.floor((groupSize - challengeCount) * weakPct)
  const strongCount = groupSize - challengeCount - weakCount

  // 生成排列数组后随机打乱
  const plan = []
  for (let i = 0; i < strongCount; i++) plan.push('strong')
  for (let i = 0; i < weakCount; i++) plan.push('weak')
  for (let i = 0; i < challengeCount; i++) plan.push('challenge')

  // Fisher-Yates 洗牌
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]]
  }

  return plan
}

/**
 * P5: 每答完一题触发 — 检查 next 题类型 + 动态调辅助力度
 *
 * 步骤 A — 换题：
 *   - 检查下一题 matchLevel 是否落在当前组应出的类型范围
 *   - 不符 → 从 reserve pool 取一道相符的替换
 *
 * 步骤 B — 调辅助力度：
 *   - 收集本轮（已完成所有组）答题 → groupAnswersByLevel
 *   - 历史弱项本轮 ≥95% → assistLevel + 1（减少辅助）
 *   - 历史强项本轮 <50%   → assistLevel - 1（增加辅助）
 *
 * @param {object} engine - 当前引擎实例（会被修改）
 * @param {Array} roundAnswers - 本轮已完成所有组的答题
 * @param {number} nextIdx - 下一题在 listPractices 中的索引
 * @param {Array} listPractices - 当前题库（会被修改）
 * @param {object} profile - 用户历史画像
 */
export function adjustNextQuestion(engine, roundAnswers, nextIdx, listPractices, profile) {
  // 内部 wrap → Answer/Question 实例，走计算 getter
  roundAnswers = roundAnswers.map(a => a instanceof Answer ? a : new Answer(a))

  // ── 步骤 D: 错题复盘 ──
  // 连续答对 3 题，下一题换成历史错题（巩固复习）
  let isReview = false
  if (nextIdx >= 0 && nextIdx < listPractices.length && engine.wrongAnswerPool?.length) {
    // 从尾部算连续答对次数
    let streak = 0
    for (let i = roundAnswers.length - 1; i >= 0; i--) {
      if (roundAnswers[i].isCorrect) streak++
      else break
    }
    if (streak >= 3) {
      // 选同难度或更易的错题（matchLevel ≤ 当前难度）
      const candidates = engine.wrongAnswerPool.filter(w => {
        const m = matchLevel(w)
        return m && m.levelIdx <= engine.difficultyIdx
      })
      if (candidates.length > 0) {
        const wa = candidates[Math.floor(Math.random() * candidates.length)]
        // 从池中移除，避免重复
        const idx = engine.wrongAnswerPool.indexOf(wa)
        if (idx >= 0) engine.wrongAnswerPool.splice(idx, 1)
        listPractices[nextIdx] = buildReviewQuestion(wa)
        isReview = true
      }
    }
  }

  // ── 步骤 A: 换题（复习题不换） ──
  if (!isReview && nextIdx >= 0 && nextIdx < listPractices.length && engine.reservePool && engine.reservePool.length > 0) {
    const nextQ = listPractices[nextIdx]
    // 局部 wrap 仅用于读 levelMatch，不修改 listPractices（caller 期望 plain object）
    const nextQInst = nextQ instanceof Question ? nextQ : new Question(nextQ)
    const nextMatch = nextQInst.levelMatch
    const nextLevelIdx = nextMatch ? nextMatch.levelIdx : -1

    // 检查是否在 strong/weak 范围内（挑战题和当前难度题直接保留）
    const inStrong = engine.strongLevelIndices.includes(nextLevelIdx)
    const inWeak = engine.weakLevelIndices.includes(nextLevelIdx)
    const isChallenge = nextLevelIdx === engine.difficultyIdx + 1
    const isCurrent = nextLevelIdx === engine.difficultyIdx

    if (!inStrong && !inWeak && !isChallenge && !isCurrent) {
      // 不匹配任何已知类型 → 从池中换一道
      const poolQ = engine.reservePool.pop()
      if (poolQ) {
        listPractices[nextIdx] = poolQ
      }
    }
  }

  // ── 步骤 B: per-question Mastery Check（复习题不改横式） ──
  if (!isReview && engine.assistLevel <= 1 && roundAnswers && roundAnswers.length >= 2) {
    const recentTwo = roundAnswers.slice(-2)
    const bothCorrect = recentTwo.every(a => a.isCorrect)
    const notAlreadyHorizontal = listPractices[nextIdx] && 
      listPractices[nextIdx].inputMode !== 'horizontal_keypad' &&
      !recentTwo.some(a => a.inputMode === 'horizontal_keypad')
    if (bothCorrect && notAlreadyHorizontal && nextIdx >= 0 && nextIdx < listPractices.length) {
      // 把下一题强制设为横式
      listPractices[nextIdx] = { ...listPractices[nextIdx], inputMode: 'horizontal_keypad' }
      // 记录到引擎 masteryCheck 计数器（evaluateGroup 兜底可能会用到）
      if (engine.masteryCheck) {
        engine.masteryCheck.horizontalGood = (engine.masteryCheck.horizontalGood || 0) + 1
      }
    }
  }

  // ── 步骤 C: 调辅助力度 ──
  if (!roundAnswers || roundAnswers.length < 3) return  // 数据不足

  const groups = groupAnswersByLevel(roundAnswers)

  // 历史弱项在本轮表现
  const histWeakLabels = profile.weakLevels || []
  for (const g of groups) {
    if (g.total < 2) continue  // 样本不足
    if (histWeakLabels.includes(g.label) && g.accuracy >= 0.95) {
      // 弱项变强 → 减少辅助
      engine.assistLevel = Math.min(MAX_NORMAL_ASSIST_LEVEL, engine.assistLevel + 1)
      continue
    }
    if (!histWeakLabels.includes(g.label) && g.accuracy < 0.50) {
      // 强项变弱 → 增加辅助
      engine.assistLevel = Math.max(0, engine.assistLevel - 1)
    }
  }
}

// ── Re-export（向后兼容：旧代码仍可从 adaptiveEngine import） ──
// 新代码应直接 import 自：
//   constants/difficulty       → DIFFICULTY_LEVELS
//   utils/algorithm/question   → matchLevel, groupAnswersByLevel
export { DIFFICULTY_LEVELS } from '../../constants/difficulty'
export { matchLevel, groupAnswersByLevel } from './question'
