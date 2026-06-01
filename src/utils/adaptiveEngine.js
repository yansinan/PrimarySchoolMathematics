/**
 * 自适应练习引擎
 *
 * 将练习分成小组，根据每组的答题效果自动调整下一组的题型、难度和题量。
 *
 * 三维调节：
 * 1. 输入模式: choice4(最简单) → choice2 → keypad(标准) — 辅助递减
 * 2. 填空位置: result(标准) → mixed(等式不同位置填空，更难) — 思维挑战递增
 * 3. 难度阶梯: 12级数字/进退位微调
 *
 * 目标：保持信心，探索边界。
 * 差 → 先给选择题辅助，再不行才降难度
 * 好 → 先试填空位置变化，再升级
 */

import { generatePracticeConfig } from './diagnostic'
import { EquationSolver } from './EquationSolver'

// ─── 精细难度分阶（16级，每步变化微小） ───
//
// 进阶维度：数字大小 × 进退位要求
// 数字大小: 小(≤5) → 中(≤9) → 大(≤20) → 两位数小 → 两位数大 → 大数
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

/* ============================================================
   输入辅助模式 — 降低认知负荷，帮学生建立信心
   ============================================================ */
const ASSIST_LEVELS = [
  { key: 'keypad',  label: '键盘',   optionCount: 0 },    // 标准：无选项，键盘输入
  { key: 'choice2', label: '二选一',  optionCount: 2 },    // 2选1
  { key: 'choice4', label: '四选一',  optionCount: 4 },    // 4选1
]

/* ============================================================
   填空位置模式
   ============================================================ */
const BLANK_MODES = [
  { key: 'result', label: '结果填空' },   // 标准：3+5=__
  { key: 'mixed',  label: '随意填空' },   // 混合：3+__=8, __+5=8, 3+5=__
]

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
  const base = level ? level.label : '综合'
  const assist = ASSIST_LEVELS[engine.assistLevel]
  const assistLabel = assist && assist.key !== 'keypad' ? ` · ${assist.label}` : ''
  return base + assistLabel
}

/**
 * 创建自适应引擎实例
 */
export function createAdaptiveEngine(profile) {
  const baseConfig = generatePracticeConfig(profile)
  const startIdx = initialDifficulty(profile)
  return {
    difficultyIdx: startIdx,
    assistLevel: 0,         // 索引 ASSIST_LEVELS; 0=keypad(无辅助)
    blankMode: 'result',    // 'result' | 'mixed'
    groupSizeIdx: 0,        // 索引 GROUP_SIZES
    totalAnswered: 0,       // 累计答题数
    groupIndex: 0,          // 已完成组数
    groupsAtThisLevel: 0,   // 当前三维组合已完成的组数
    consecutiveGood: 0,     // 连续几组表现好
    consecutiveBad: 0,      // 连续几组表现差
    history: [],            // 各组的记录
    baseConfig,
  }
}

/**
 * 获取当前组配置（含 mode 信息）
 */
export function getGroupConfig(engine) {
  const level = DIFFICULTY_LEVELS[engine.difficultyIdx] || DIFFICULTY_LEVELS[4]
  const assist = ASSIST_LEVELS[engine.assistLevel] || ASSIST_LEVELS[0]
  return {
    ...engine.baseConfig,
    formulaList: level.formulaList,
    carry: level.carry,
    abdication: level.abdication,
    resultMinValue: 1,
    resultMaxValue: level.resultMax,
    // 扩展信息
    inputMode: assist.key,           // 'keypad' | 'choice2' | 'choice4'
    optionCount: assist.optionCount, // 0 | 2 | 4
    blankMode: engine.blankMode,     // 'result' | 'mixed'
  }
}

/**
 * 获取当前组题数
 */
export function getGroupSize(engine) {
  return GROUP_SIZES[engine.groupSizeIdx] || 5
}

/**
 * 生成选择题选项列表（适用于当前组配置）
 */
export function prepareChoiceOptions(questions, config) {
  if (config.inputMode === 'keypad') return questions
  const count = config.optionCount || 4
  return questions.map(q => {
    const distractors = generateDistractors(q.solution, count - 1)
    // 混洗选项
    const opts = [q.solution, ...distractors].sort(() => Math.random() - 0.5)
    return { ...q, options: opts }
  })
}

/**
 * 应用空白位置模式到题目
 * 使用 EquationSolver 重新求解空白位置的值
 */
export function applyBlankToQuestions(questions, config) {
  return questions.map(q => {
    const eqWithAnswer = q.equation  // "3+5=8"
    const resultPart = eqWithAnswer.split('=')[1]
    const eqPart = eqWithAnswer.split('=')[0]

    // 随机选空白位置
    const parts = eqPart.split(/[+\-×÷]/)
    const ops = eqPart.match(/[+\-×÷]/)
    if (!ops || parts.length < 2) return { ...q, equation: `${eqPart}=__` }

    const choice = Math.floor(Math.random() * 3)
    let newEquation, newSolution

    if (choice === 0) {
      // 结果填空: 3+5=__
      newEquation = `${eqPart}=__`
      // 结果是 resultPart
      newSolution = parseInt(resultPart)
    } else if (choice === 1) {
      // 左数填空: __+5=8
      newEquation = `__${ops[0]}${parts[1]}=${resultPart}`
      newSolution = EquationSolver.solve(newEquation)
    } else {
      // 右数填空: 3+__=8
      newEquation = `${parts[0]}${ops[0]}__=${resultPart}`
      newSolution = EquationSolver.solve(newEquation)
    }

    return {
      ...q,
      equation: newEquation,
      solution: (newSolution !== null && !isNaN(newSolution)) ? newSolution : q.solution,
    }
  })
}

/**
 * 评估上一组表现，返回更新后的引擎及下一组配置
 */
export function evaluateGroup(engine, groupAnswers) {
  const total = groupAnswers.length
  if (total === 0) return { engine, nextConfig: null, nextGroupSize: 0, done: true }

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
    }],
  }

  const FAST = 5000
  const SLOW = 12000
  const GOOD = 0.80
  const BAD = 0.50
  const MIN_GROUPS = 3  // 同一三维组合至少练 3 组才考虑变动

  // ─── 根据表现决定如何调整 ───
  if (accuracy >= GOOD && avgTime < FAST) {
    // 又快又好：尝试解除辅助 → 尝试混合填空 → 升级难度
    next.consecutiveGood = engine.consecutiveGood + 1
    next.consecutiveBad = 0

    if (next.consecutiveGood >= 3 && next.groupsAtThisLevel >= MIN_GROUPS) {
      // 1) 先解除辅助（有辅助 → 减少辅助）
      if (engine.assistLevel > 0) {
        next.assistLevel = engine.assistLevel - 1
        next.consecutiveGood = 0
        next.groupsAtThisLevel = 0
        next.groupSizeIdx = Math.min(GROUP_SIZES.length - 1, engine.groupSizeIdx + 1)
      }
      // 2) 辅助已解除 → 尝试混合填空
      else if (engine.blankMode === 'result') {
        next.blankMode = 'mixed'
        next.consecutiveGood = 0
        next.groupsAtThisLevel = 0
        next.groupSizeIdx = Math.min(GROUP_SIZES.length - 1, engine.groupSizeIdx + 1)
      }
      // 3) 混合填空也过了 → 升级难度
      else {
        next.difficultyIdx = Math.min(DIFFICULTY_LEVELS.length - 1, engine.difficultyIdx + 1)
        next.blankMode = 'result'  // 新难度从标准填空开始
        next.consecutiveGood = 0
        next.groupsAtThisLevel = 0
        next.groupSizeIdx = Math.min(GROUP_SIZES.length - 1, engine.groupSizeIdx + 1)
      }
    } else {
      // 好但还不够 → 微增题量
      next.groupSizeIdx = Math.min(GROUP_SIZES.length - 1, engine.groupSizeIdx + 1)
    }

  } else if (accuracy < BAD || avgTime > SLOW) {
    // 差或慢：先给辅助 → 再降难度
    next.consecutiveBad = engine.consecutiveBad + 1
    next.consecutiveGood = 0

    if (next.consecutiveBad >= 2) {
      // 1) 先增加辅助（没辅助 → 加辅助，有辅助 → 更多辅助）
      if (engine.assistLevel < ASSIST_LEVELS.length - 1) {
        next.assistLevel = engine.assistLevel + 1
        next.blankMode = 'result'  // 有辅助时只填空结果
        next.consecutiveBad = 0
        next.groupsAtThisLevel = 0
        next.groupSizeIdx = Math.max(0, engine.groupSizeIdx - 1)
      }
      // 2) 辅助已最大 → 降难度
      else {
        next.difficultyIdx = Math.max(0, engine.difficultyIdx - 1)
        next.assistLevel = Math.min(ASSIST_LEVELS.length - 1, engine.assistLevel)
        next.blankMode = 'result'
        next.consecutiveBad = 0
        next.groupsAtThisLevel = 0
        next.groupSizeIdx = Math.max(0, engine.groupSizeIdx - 2)
      }
    } else {
      // 一组差 → 减题量
      next.groupSizeIdx = Math.max(0, engine.groupSizeIdx - 1)
    }

  } else if (accuracy >= GOOD) {
    // 正确率高但慢 → 维持，多练
    next.consecutiveGood = engine.consecutiveGood + 1
    next.consecutiveBad = 0

    if (next.consecutiveGood >= 4 && next.groupsAtThisLevel >= MIN_GROUPS + 1) {
      // 持续稳定好 → 温和尝试下一步（不跳级）
      if (engine.assistLevel > 0) {
        next.assistLevel = engine.assistLevel - 1
      } else if (engine.blankMode === 'result') {
        next.blankMode = 'mixed'
      } else {
        next.difficultyIdx = Math.min(DIFFICULTY_LEVELS.length - 1, engine.difficultyIdx + 1)
        next.blankMode = 'result'
      }
      next.consecutiveGood = 0
      next.groupsAtThisLevel = 0
    }

  } else {
    // 及格边缘 → 巩固
    next.consecutiveGood = 0
    next.consecutiveBad = 0
    next.groupSizeIdx = Math.max(0, engine.groupSizeIdx - 1)
  }

  // 结束条件
  const MAX_GROUPS = 12
  const MAX_QUESTIONS = 60
  if (next.history.length >= MAX_GROUPS || next.totalAnswered >= MAX_QUESTIONS) {
    return { engine: next, nextConfig: null, nextGroupSize: 0, done: true }
  }

  const level = DIFFICULTY_LEVELS[next.difficultyIdx] || DIFFICULTY_LEVELS[4]
  const assist = ASSIST_LEVELS[next.assistLevel] || ASSIST_LEVELS[0]
  const nextConfig = {
    ...engine.baseConfig,
    formulaList: level.formulaList,
    carry: level.carry,
    abdication: level.abdication,
    resultMinValue: 1,
    resultMaxValue: level.resultMax,
    inputMode: assist.key,
    optionCount: assist.optionCount,
    blankMode: next.blankMode,
    numberOfFormulas: GROUP_SIZES[next.groupSizeIdx],
  }

  return { engine: next, nextConfig, nextGroupSize: GROUP_SIZES[next.groupSizeIdx], done: false }
}
