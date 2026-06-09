/**
 * Question 类（U 层）— 单道题的领域模型
 *
 * 包装 db.questions 表的元数据 + 派生属性。
 * Answer extends Question，继承所有题目元数据 + 答题元数据。
 *
 * @see utils/algorithm/answer.js
 * @see ARCHITECTURE.md § 1.1 U 层 = 无状态算法 / IO 适配
 */

import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
// DB 使用动态 import（@/services/database → score.js → answer 循环依赖）

export class Question {
  /**
   * @param {Object} raw — db.questions 表的 plain object
   *   或 useSubmitHandler 构造的 currentQuestion
   */
  constructor(raw) {
    if (!raw) throw new Error('Question: raw is required')

    // 必填：题目主体
    this.equation = raw.equation
    this.solution = raw.solution ?? 0

    // 题目元数据
    this.operator = raw.operator ?? ''
    this.difficulty = raw.difficulty ?? 0
    this.operandMin = raw.operandMin ?? 0
    this.operandMax = raw.operandMax ?? 0
    this.operands = raw.operands ?? []
    this.isCarry = raw.isCarry ?? false
    this.isBorrow = raw.isBorrow ?? false
    this.stepCount = raw.stepCount ?? 1

    // 显示相关
    this.inputMode = raw.inputMode ?? ''
    this.layout = raw.layout ?? ''
    this.assistLevel = raw.assistLevel ?? 0
    this.blankMode = raw.blankMode ?? 'result'

    // 系统字段（来自 db.questions）
    this.id = raw.id
    this.createdAt = raw.createdAt
    this.synced = raw.synced ?? 0
  }

  // ── 派生属性 ──

  /** 数值范围元组 [min, max] */
  get operandRange() {
    return [this.operandMin, this.operandMax]
  }

  /** 这道题是否需要进位 */
  get needsCarry() {
    return this.isCarry || (this.difficulty ?? 0) >= 7
  }

  /** 这道题是否需要借位 */
  get needsBorrow() {
    return this.isBorrow || (this.difficulty ?? 0) >= 8
  }

  // ── 持久化 ──

  /** 转为 plain object 存 db */
  toJSON() {
    return {
      id: this.id,
      equation: this.equation,
      solution: this.solution,
      operator: this.operator,
      operandMin: this.operandMin,
      operandMax: this.operandMax,
      operands: this.operands,
      isCarry: this.isCarry,
      isBorrow: this.isBorrow,
      stepCount: this.stepCount,
      difficulty: this.difficulty,
      inputMode: this.inputMode,
      layout: this.layout,
      assistLevel: this.assistLevel,
      blankMode: this.blankMode,
      createdAt: this.createdAt,
      synced: this.synced,
    }
  }

  static fromJSON(plain) {
    return new Question(plain)
  }

  // ── 难度映射 ──

  /**
   * 映射到 DIFFICULTY_LEVELS 档位
   * 复用 adaptiveEngine.matchLevel 按方程操作数/运算符/进位退位匹配
   * @returns {{ levelIdx: number, label: string } | null}
   */
  get levelMatch() {
    return matchLevel(this)
  }

  /**
   * 对应 DIFFICULTY_LEVELS 的完整配置对象
   * @returns {object|null} { formulaList, carry, abdication, resultMax, ... }
   */
  get difficultyLevel() {
    const m = this.levelMatch
    if (!m) return null
    return DIFFICULTY_LEVELS[m.levelIdx]
  }

  /**
   * 按难度档位过滤题列表
   * @param {Array<Question|Answer>} questions — 题或答题列表
   * @param {number} levelIdx — DIFFICULTY_LEVELS 索引
   * @returns {Array} 匹配的题
   */
  static filterByLevel(questions, levelIdx) {
    return (questions || []).filter(q => {
      const m = matchLevel(q)
      return m && m.levelIdx === levelIdx
    })
  }

  // ── 算式查找 ──

  /**
   * 按算式查找题目
   * @param {Array} collection — Question/Answer/WrongAnswer 实例或 plain object
   * @param {string} equation — 如 '5+3=8' 或 '5+3=__'
   * @param {Object} [opts]
   * @param {boolean} [opts.exact=true] — true=精确字符串匹配，false=等价匹配
   * @returns {Array}
   *
   * 等价规则：
   *   - 同一运算符族（+↔- 为 additive，×↔÷ 为 multiplicative）
   *   - 全部已知数字（操作数+结果）排序后集合相同 → 如 '5+3=8' ≡ '8-5=3' ≡ '3+5=8'
   *   - 若有未知结果（=__）→ 仅比较操作数排序集 → 如 '5+3=__' ≡ '3+5=__' ≡ 与 '5+3=8' 等价
   */
  static findByEquation(collection, equation, { exact = true } = {}) {
    if (!collection || !equation) return []

    if (exact) {
      return collection.filter(q => q.equation === equation)
    }

    // 等价模式
    const target = this._parseEquationTriple(equation)
    if (!target) return []

    return collection.filter(q => {
      const qTriple = this._parseEquationTriple(q.equation || '')
      if (!qTriple) return false
      return this._isEquivalentTriple(target, qTriple)
    })
  }

  /**
   * 解析算式为 { bodyA, bodyB, result, op, opFamily }
   * @private
   */
  static _parseEquationTriple(equation) {
    if (!equation) return null
    const resultMatch = equation.match(/=(\d+)/)
    const result = resultMatch ? parseInt(resultMatch[1], 10) : null
    const body = equation.replace(/=.*$/, '').trim()

    const match = body.match(/[+\-*/×÷＋－]/)
    if (!match) return null
    const op = match[0]
    const parts = body.split(op)
    if (parts.length !== 2) return null
    const bodyA = parseInt(parts[0].trim(), 10)
    const bodyB = parseInt(parts[1].trim(), 10)
    if (isNaN(bodyA) || isNaN(bodyB)) return null

    const opFamily = ['+', '-', '＋', '－'].includes(op) ? 'additive' : 'multiplicative'
    return { bodyA, bodyB, result, op, opFamily }
  }

  /**
   * 判断两个算式三要素是否等价
   * @private
   */
  static _isEquivalentTriple(t1, t2) {
    if (t1.opFamily !== t2.opFamily) return false

    const sorted = (...nums) => nums.filter(v => v != null).sort((a, b) => a - b).join(',')

    // 双方 result 都已知 → 比较三数集
    if (t1.result != null && t2.result != null) {
      return sorted(t1.bodyA, t1.bodyB, t1.result) === sorted(t2.bodyA, t2.bodyB, t2.result)
    }
    // 至少一方 result 未知 → 仅比较操作数
    return sorted(t1.bodyA, t1.bodyB) === sorted(t2.bodyA, t2.bodyB)
  }
  // ── 静态助手（从 analysis.js 迁入） ──

  /**
   * 批量加载 questions，返回 Map<id, Question>
   * @param {number[]} ids
   * @returns {Promise<Map<number, Question>>}
   */
  static async loadByIds(ids) {
    if (!ids?.length) return new Map()
    const { DB: DB_ } = await import('@/services/database')
    const qs = await DB_.questions.where('id').anyOf(ids).toArray()
    return new Map(qs.map(q => [q.id, Question.fromJSON(q)]))
  }

  /**
   * 从 operandMin/Max 反推涉及的数字（0-9）
   * @param {{operandMin?:number, operandMax?:number}} q
   * @returns {number[]}
   */
  static extractOperandDigits(q) {
    if (!q) return []
    const min = q.operandMin
    const max = q.operandMax
    if (min == null && max == null) return []
    const digits = new Set()
    for (const n of [min, max]) {
      if (n == null) continue
      for (const ch of String(n)) {
        const d = Number(ch)
        if (!isNaN(d) && d >= 0) digits.add(d)
      }
    }
    return [...digits]
  }

  // ── DB 查询（直接读 services/database，U 层领域查询） ──

  /**
   * 查找等价题（交换律 + 事实家族 + =__ 兼容）
   * @param {string} equation
   * @returns {Promise<Question[]>}
   */
  static async findEquivalent(equation) {
    if (!equation) return []
    const { DB: DB_ } = await import('@/services/database')
    const all = await DB_.questions.toArray()
    return Question.findByEquation(all, equation, { exact: false })
  }

  /**
   * 查找相关题（同 operator + 数字在 ±range 内，按欧氏距离升序）
   * @param {string} equation
   * @param {{range?:number, limit?:number}} [opts]
   * @returns {Promise<Question[]>}
   */
  static async findRelated(equation, { range = 3, limit = 10 } = {}) {
    const triple = Question._parseEquationTriple(equation)
    if (!triple) return []
    const { bodyA, bodyB, op } = triple
    const { DB: DB_ } = await import('@/services/database')
    const all = await DB_.questions.where('operator').equals(op).toArray()
    const leftMin = bodyA - range; const leftMax = bodyA + range
    const rightMin = bodyB - range; const rightMax = bodyB + range
    const candidates = []
    for (const plain of all) {
      if (plain.equation === equation) continue
      const q = plain instanceof Question ? plain : Question.fromJSON(plain)
      const qt = Question._parseEquationTriple(q.equation || '')
      if (!qt) continue
      if (qt.bodyA < leftMin || qt.bodyA > leftMax) continue
      if (qt.bodyB < rightMin || qt.bodyB > rightMax) continue
      candidates.push(q)
    }
    const decorated = candidates.map(q => {
      const qt = Question._parseEquationTriple(q.equation || '')
      return qt && { q, dist: Math.hypot(qt.bodyA - bodyA, qt.bodyB - bodyB) }
    }).filter(Boolean)
    decorated.sort((a, b) => a.dist - b.dist)
    return decorated.map(d => d.q).slice(0, limit)
  }

  /**
   * 单题学习曲线（答题历史时间序列）
   * @param {number} questionId
   * @param {{days?:number}} [opts]
   * @returns {Promise<Answer[]>} — Answer 实例数组（含有效 responseTime）
   */
  /**
   * 单题学习曲线（答题历史时间序列）
   * @param {number} questionId
   * @param {{days?:number}} [opts]
   * @returns {Promise<Answer[]>} — Answer 实例数组（含有效 responseTime）
   */
  static async getLearningCurve(questionId, { days = 30 } = {}) {
    if (questionId == null) return []
    const cutoff = Date.now() - days * 86400e3
    const { DB: DB_ } = await import('@/services/database')
    const raw = await DB_.answers.where('questionId').equals(questionId).toArray()
    const { Answer } = await import('./answer')
    return raw
      .filter(a => a.startedAt > cutoff)
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((a, idx) => {
        const ans = a instanceof Answer ? a : new Answer(a)
        return {
          timestamp: ans.timestamp, startedAt: ans.startedAt, endedAt: ans.endedAt,
          isCorrect: ans.isCorrect,
          responseTime: ans.effectiveResponseTime, isTimeout: ans.isTimeout,
          userAnswer: ans.userAnswer, attemptIndex: idx,
        }
      })
  }

  /**
   * 保存/更新一道题（upsert by equation）
   * @param {Object} questionData — 须含 equation 字段
   */
  static async save(questionData) {
    if (!questionData?.equation) return
    const { DB: DB_ } = await import('@/services/database')
    const existing = await DB_.questions.where('equation').equals(questionData.equation).toArray()
    if (existing.length > 0) {
      await DB_.questions.update(existing[0].id, questionData)
    } else {
      await DB_.questions.add(questionData)
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 难度映射函数（纯函数，无状态）
// 原定义在 adaptiveEngine.js，迁入 Question 的同级模块
// ═══════════════════════════════════════════════════════════

/** 运算符字符 → DIFFICULTY_LEVELS 数字编码 */
const _OP_TO_NUM = { '+': 1, '-': 2, '*': 3, '/': 4, '×': 3, '÷': 4, '＋': 1, '－': 2 }

/** 从算式拆出两个操作数（保持原始顺序：a=被加数/被减数） */
function _parseOperands(equation, operator) {
  if (!equation || !operator) return [null, null]
  const eq = equation.replace(/=.*$/, '').trim()
  const idx = eq.indexOf(operator)
  if (idx === -1) return [null, null]
  const left = parseInt(eq.substring(0, idx).trim())
  const right = parseInt(eq.substring(idx + 1).trim())
  if (isNaN(left) || isNaN(right)) return [null, null]
  return [left, right]
}

/** 加法是否进位（个位相加≥10） */
function _isCarry(a, b) {
  return (a % 10) + (b % 10) >= 10
}

/** 减法是否退位（被减数个位 < 减数个位；非减法返回 false） */
function _isBorrow(a, b, opNum) {
  if (opNum !== 2) return false
  return (a % 10) < (b % 10)
}

/**
 * 将一道题匹配到 DIFFICULTY_LEVELS 档位
 * （无状态纯函数，不读任何外部状态 / IO）
 *
 * @param {object} answer - 答题记录
 * @param {string} answer.equation - 算式，"12+5=__" 或 "12+5=17"
 * @param {string} [answer.operator] - 运算符 '+' | '-' | '*' | '/'
 * @param {number} [answer.operandMin] - 最小操作数（有则跳过解析）
 * @param {number} [answer.operandMax] - 最大操作数
 * @param {boolean} [answer.isCarry] - 是否进位（有则跳过计算）
 * @param {boolean} [answer.isBorrow] - 是否退位
 * @returns {{ levelIdx: number, label: string } | null}
 */
export function matchLevel(answer) {
  if (!answer || !answer.equation) return null

  // 运算符：优先用显式字段，否则从算式首字符提取
  const opChar = answer.operator || answer.equation.replace(/=.*$/, '').trim().match(/[+\-*/×÷＋－]/)?.[0] || ''
  const opNum = _OP_TO_NUM[opChar]
  if (opNum == null) return null

  // 提取操作数（优先用已有字段，否则解算式）
  const [a, b] = (answer.operandMin != null && answer.operandMax != null)
    ? [answer.operandMin, answer.operandMax]
    : _parseOperands(answer.equation, opChar)
  if (a == null || b == null) return null

  const operandMin = Math.min(a, b)
  const operandMax = Math.max(a, b)

  // 进位/退位判定
  const hasCarry = answer.isCarry ?? _isCarry(a, b)
  const hasBorrow = answer.isBorrow ?? _isBorrow(a, b, opNum)

  // 逐级匹配 DIFFICULTY_LEVELS
  for (let i = 0; i < DIFFICULTY_LEVELS.length; i++) {
    const level = DIFFICULTY_LEVELS[i]

    // 进退位约束（仅加减法）
    if (opNum === 1) {
      if (level.carry === '2' && !hasCarry) continue
      if (level.carry === '3' && hasCarry) continue
    }
    if (opNum === 2) {
      if (level.abdication === '2' && !hasBorrow) continue
      if (level.abdication === '3' && hasBorrow) continue
    }

    // 数字范围 + 运算符匹配
    const rangeMatch = (() => {
      const specific = level.formulaList.find(f => {
        if (operandMax > f.max) return false
        if (!(operandMin >= f.min || operandMax >= f.min)) return false
        return f.operators != null && f.operators.includes(opNum)
      })
      if (specific) return true
      const hasExplicitOp = level.formulaList.some(f => f.operators != null)
      if (hasExplicitOp) return false
      return level.formulaList.some(f => {
        if (operandMax > f.max) return false
        if (!(operandMin >= f.min || operandMax >= f.min)) return false
        return f.operators == null
      })
    })()
    if (!rangeMatch) continue

    return { levelIdx: i, label: level.label }
  }

  return null
}

/**
 * 将答题记录按 matchLevel 分组，每组合计总数和正确数
 * 供动态微调计算本轮 strongLevels/weakLevels
 *
 * @param {Array} answers - 答题记录数组
 * @returns {Array<{levelIdx:number, label:string, total:number, correct:number, accuracy:number}>}
 */
export function groupAnswersByLevel(answers) {
  const map = {}
  for (const a of (answers || [])) {
    const match = matchLevel(a)
    if (!match) continue
    const key = match.levelIdx
    if (!map[key]) {
      map[key] = { levelIdx: key, label: match.label, total: 0, correct: 0 }
    }
    map[key].total++
    if (a.isCorrect) map[key].correct++
  }
  return Object.values(map).map((g) => ({
    ...g,
    accuracy: g.total > 0 ? g.correct / g.total : 0,
  }))
}
