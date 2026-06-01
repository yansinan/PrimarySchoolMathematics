/**
 * 数学能力诊断引擎
 *
 * 首次使用时自动生成 5 题快速诊断测试（5 级 × 1 题），
 * 完成后分析弱项并产出针对性练习配置。
 * 错误 1 次即判定该等级薄弱（5级×1题），后续练习中会自然回归真实水平。
 */

import { EquationSolver } from './EquationSolver'

// ─── 难度等级定义 ───
export const DIAG_LEVELS = [
  { id: 'L1', label: '个位数基础',  count: 1 },
  { id: 'L2', label: '个位数进退位', count: 1 },
  { id: 'L3', label: '两位数无进退位', count: 1 },
  { id: 'L4', label: '两位数进退位',   count: 1 },
  { id: 'L5', label: '混合题型',     count: 1 },
]

const DIAG_TOTAL = DIAG_LEVELS.reduce((s, l) => s + l.count, 0) // 5

// ─── 辅助函数 ───
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick(...items) {
  return items[Math.floor(Math.random() * items.length)]
}

// ─── 各等级出题器 ───
// 返回值: equation string like "3+4="，不包含答案。由 solve() 统一求结果。

/** L1: 个位数 +/−，和 ≤ 10，不退位 */
function genL1() {
  if (Math.random() < 0.5) {
    const a = rand(1, 9)
    const b = rand(1, Math.min(9, 10 - a))
    return `${a}+${b}=`
  }
  const a = rand(1, 9)
  const b = rand(1, a)
  return `${a}-${b}=`
}

/** L2: 个位数 +/−，含进位/退位 */
function genL2() {
  if (Math.random() < 0.5) {
    // 进位加法：个位和 ≥ 10，总和 ≤ 20
    const a = rand(2, 9)
    const minB = Math.max(1, 10 - a + 1)
    const maxB = Math.min(9, 20 - a)
    if (minB > maxB) return genL2()
    const b = rand(minB, maxB)
    return `${a}+${b}=`
  }
  // 退位减法：被减数 ≤ 20，减数个位 > 被减数个位
  const a = rand(11, 20)
  const onesA = a % 10
  if (onesA === 0) return genL2()
  const b = rand(onesA + 1, Math.min(9, a - 1))
  return `${a}-${b}=`
}

/** L3: 两位数 +/−，无进退位 */
function genL3() {
  if (Math.random() < 0.5) {
    // 无进位加法：个位和 < 10
    const a = rand(11, 89)
    const onesA = a % 10
    const maxOnesB = 9 - onesA
    if (maxOnesB < 1) return genL3()
    const tensB = rand(1, 8)
    const b = tensB * 10 + rand(0, maxOnesB)
    if (b < 10 || b > 99) return genL3()
    return `${a}+${b}=`
  }
  // 无退位减法
  const a = rand(31, 99)
  const tensA = Math.floor(a / 10)
  const onesA = a % 10
  const maxTensB = tensA - 1
  if (maxTensB < 1) return genL3()
  const b = rand(1, maxTensB) * 10 + rand(0, onesA)
  if (b < 10 || b >= a) return genL3()
  return `${a}-${b}=`
}

/** L4: 两位数 +/−，含进退位 */
function genL4() {
  if (Math.random() < 0.5) {
    // 进位加法
    const a = rand(11, 89)
    const onesA = a % 10
    const minOnesB = Math.max(1, 10 - onesA)
    const maxTensB = Math.min(8, Math.floor((99 - a) / 10))
    if (minOnesB > 9 || maxTensB < 1) return genL4()
    const b = rand(1, maxTensB) * 10 + rand(minOnesB, 9)
    if (b < 10 || b > 99) return genL4()
    return `${a}+${b}=`
  }
  // 退位减法
  const a = rand(21, 99)
  const tensA = Math.floor(a / 10)
  const onesA = a % 10
  if (onesA < 1 || tensA < 2) return genL4()
  const bTens = rand(1, tensA - 1)
  const bOnes = rand(onesA + 1, 9)
  const b = bTens * 10 + bOnes
  if (b >= a) return genL4()
  return `${a}-${b}=`
}

function genL5() {
  return pick(genL1, genL2, genL3, genL4)()
}

const GENERATORS = { L1: genL1, L2: genL2, L3: genL3, L4: genL4, L5: genL5 }

// ─── 公共 API ───

/**
 * 生成完整的诊断题库（10 题，从易到难排序）
 * @returns {Array<{equation: string, solution: number, level: string}>}
 */
export function generateDiagnosticQuestions() {
  const questions = []
  for (const level of DIAG_LEVELS) {
    for (let i = 0; i < level.count; i++) {
      let equation, solution
      let attempts = 0
      do {
        equation = GENERATORS[level.id]()
        solution = EquationSolver.solve(equation)
        attempts++
      } while (
        (solution === null || solution === undefined || isNaN(solution) || !Number.isInteger(solution)) &&
        attempts < 30
      )
      if (Number.isInteger(solution)) {
        questions.push({ equation, solution, level: level.id })
      }
    }
  }

  // 按等级 L1 → L5 排序（同等级内保留随机顺序）
  const levelOrder = { L1: 0, L2: 1, L3: 2, L4: 3, L5: 4 }
  questions.sort((a, b) => (levelOrder[a.level] ?? 99) - (levelOrder[b.level] ?? 99))

  return questions
}

/**
 * 分析诊断答题结果
 * @param {Array<{level: string, isCorrect: boolean}>} answers
 * @returns {{ levelScores: Object, weakLevels: string[] }}
 */
export function analyzeAbility(answers) {
  const byLevel = {}
  for (const a of answers) {
    if (!byLevel[a.level]) byLevel[a.level] = { correct: 0, total: 0 }
    byLevel[a.level].total++
    if (a.isCorrect) byLevel[a.level].correct++
  }

  // 每等级仅 2 题，错 2 题（全错）即标记为弱项；错 1 题视为正常波动
  const WEAK_THRESHOLD = 0.5

  const levelScores = {}
  const weakLevels = []
  for (const level of DIAG_LEVELS) {
    const data = byLevel[level.id] || { correct: 0, total: 0 }
    const acc = data.total > 0 ? data.correct / data.total : 0
    levelScores[level.id] = { ...data, accuracy: acc }
    if (acc < WEAK_THRESHOLD) weakLevels.push(level.id)
  }

  // 无一等级低于阈值即为全部达标
  const allCorrect = Object.values(levelScores).every(s => s.total > 0 && s.accuracy >= WEAK_THRESHOLD)

  return { levelScores, weakLevels, allCorrect }
}

/**
 * 根据能力画像生成针对性练习配置（与 formData 兼容）
 * @param {{ weakLevels: string[], allCorrect: boolean }} profile
 * @returns {Object} formData-compatible config object
 */
export function generatePracticeConfig(profile) {
  const { weakLevels, allCorrect } = profile
  const hasAddSub = true

  // 基础配置
  const config = {
    step: '1',
    numberOfFormulas: 30,
    whereIsResult: '0',
    enableBrackets: false,
    carry: '1',
    abdication: '1',
    remainder: '3',
    solution: '0',
    numberOfPapers: 1,
    numberOfPagerColumns: 3,
    paperTitle: '智能练习',
    paperSubTitle: '',
    formulaList: [
      { min: 1, max: 9, operators: null },
      { min: 1, max: 9, operators: [1, 2] },
    ],
    resultMinValue: 1,
    resultMaxValue: 18,
    fileNameGeneratedRule: 'baseOnTitleAndIndex',
  }

  // ── 各弱项对应的配置覆盖 ──
  if (weakLevels.includes('L1')) {
    // 个位数基础薄弱 → 最简单，禁止进退位
    config.carry = '3'
    config.abdication = '3'
    config.formulaList[0] = { min: 1, max: 5, operators: null }
    config.formulaList[1] = { min: 1, max: 5, operators: [1, 2] }
    config.resultMaxValue = 10
  }

  if (weakLevels.includes('L2')) {
    // 个位数进退位 → 1-9 范围，要求进退位
    config.carry = '1'
    config.abdication = '1'
    config.formulaList[0] = { min: 2, max: 9, operators: null }
    config.formulaList[1] = { min: 2, max: 9, operators: [1, 2] }
    config.resultMaxValue = 18
  }

  if (weakLevels.includes('L3') || weakLevels.includes('L4')) {
    // 两位数 → 切换范围
    config.formulaList[0] = { min: 10, max: 99, operators: null }
    config.formulaList[1] = { min: 10, max: 99, operators: [1, 2] }
    config.resultMaxValue = 198

    if (weakLevels.includes('L3')) {
      // 无进退位 → 禁止
      config.carry = '3'
      config.abdication = '3'
    }
    if (weakLevels.includes('L4') && !weakLevels.includes('L3')) {
      // 仅进退位差 → 纯进退位练习
      config.carry = '1'
      config.abdication = '1'
    }
  }

  if (weakLevels.includes('L5')) {
    // 混合弱 → 全范围混合
    config.formulaList[0] = { min: 1, max: 99, operators: null }
    config.formulaList[1] = { min: 1, max: 99, operators: [1, 2] }
    config.carry = '2'
    config.abdication = '2'
    config.resultMaxValue = 198
  }

  // 全部答对 → 自动升级
  if (allCorrect) {
    config.formulaList[0] = { min: 10, max: 99, operators: null }
    config.formulaList[1] = { min: 10, max: 99, operators: [1, 2] }
    config.carry = '2'
    config.abdication = '2'
    config.resultMaxValue = 198
    config.numberOfFormulas = 20
  }

  return config
}

export { DIAG_TOTAL }
