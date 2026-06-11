/**
 * Question 类（U 层）— 单道题的领域模型
 *
 * 继承链：DBQuestion (databaseInit) → Question → Answer → WrongAnswer
 *          └─ schema 骨架    └─ 题元数据+查询   └─答题数据+getter  └─错题专用
 *
 * 包装 db.questions 表的元数据 + 派生属性。
 * Answer extends Question，继承所有题目元数据 + 答题元数据。
 *
 * 本类职责：题目查询、难度映射、算式查找。
 * 不涉及答题状态（那是 Answer 的范畴）。
 *
 * @see utils/algorithm/answer.js — Answer（子类）
 * @see utils/algorithm/wrongAnswer.js — WrongAnswer（孙类）
 * @see constants/difficulty.js — DIFFICULTY_LEVELS 等级定义
 */

import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import { DB, Question as DBQuestion } from '@/services/databaseInit'

// ═══════════════════════════════════════════════════════════════
// 难度映射（纯函数，内联自 matchLevel.js）
// ═══════════════════════════════════════════════════════════════

const _OP_TO_NUM = { '+': 1, '-': 2, '*': 3, '/': 4, '×': 3, '÷': 4, '＋': 1, '－': 2 }

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

function _isCarry(a, b) { return (a % 10) + (b % 10) >= 10 }
function _isBorrow(a, b, opNum) { return opNum === 2 && (a % 10) < (b % 10) }

/**
 * 将一道题匹配到 DIFFICULTY_LEVELS 档位
 * @param {object} answer
 * @returns {{ levelIdx: number, label: string } | null}
 */
function _matchLevel(answer) {
  if (!answer || !answer.equation) return null
  const opChar = answer.operator || answer.equation.replace(/=.*$/, '').trim().match(/[+\-*/×÷＋－]/)?.[0] || ''
  const opNum = _OP_TO_NUM[opChar]
  if (opNum == null) return null
  const [a, b] = (answer.operandMin != null && answer.operandMax != null)
    ? [answer.operandMin, answer.operandMax]
    : _parseOperands(answer.equation, opChar)
  if (a == null || b == null) return null
  const operandMin = Math.min(a, b)
  const operandMax = Math.max(a, b)
  const hasCarry = answer.isCarry ?? _isCarry(a, b)
  const hasBorrow = answer.isBorrow ?? _isBorrow(a, b, opNum)
  for (let i = 0; i < DIFFICULTY_LEVELS.length; i++) {
    const level = DIFFICULTY_LEVELS[i]
    if (opNum === 1) {
      if (level.carry === '2' && !hasCarry) continue
      if (level.carry === '3' && hasCarry) continue
    }
    if (opNum === 2) {
      if (level.abdication === '2' && !hasBorrow) continue
      if (level.abdication === '3' && hasBorrow) continue
    }
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
 * 将答题记录按 matchLevel 分组
 * @param {Array} answers
 * @returns {Array<{levelIdx:number, label:string, total:number, correct:number, accuracy:number}>}
 */
function _groupAnswersByLevel(answers) {
  const map = {}
  for (const a of (answers || [])) {
    const match = _matchLevel(a)
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

// ═══════════════════════════════════════════════════════════════
// Question 类
// ═══════════════════════════════════════════════════════════════

export class Question extends DBQuestion {
  static _getDB() { return DB }

  /**
   * 按方程操作数/运算符/进位退位匹配 DIFFICULTY_LEVELS
   * @param {object} eqLike - 含 equation 和可选 solution 的对象
   * @returns {{ levelIdx: number, label: string } | null}
   */
  static matchLevel(eqLike) {
    return _matchLevel(eqLike)
  }

  /**
   * 将答题记录按 matchLevel 分组
   * @param {Array} answers
   * @returns {Array<{levelIdx:number, label:string, total:number, correct:number, accuracy:number}>}
   */
  static groupAnswersByLevel(answers) {
    return _groupAnswersByLevel(answers)
  }

  /** @param {Object} [raw] — db.questions 行或 useSubmitHandler 构造的 currentQuestion */
  constructor(raw) {
    super()
    if (!raw) return
    const { isCorrect, attemptCount, score, ...rest } = raw
    Object.assign(this, rest)
  }

  // ── 派生属性 ──

  /** 数值范围元组 [min, max] */
  get operandRange() { return [this.operandMin, this.operandMax] }
  get needsCarry() { return this.isCarry || (this.difficulty ?? 0) >= 7 }
  get needsBorrow() { return this.isBorrow || (this.difficulty ?? 0) >= 8 }

  // ── 持久化 ──

  toJSON() {
    return {
      id: this.id, equation: this.equation, solution: this.solution,
      operator: this.operator, operandMin: this.operandMin, operandMax: this.operandMax,
      operands: this.operands, isCarry: this.isCarry, isBorrow: this.isBorrow,
      stepCount: this.stepCount, difficulty: this.difficulty, inputMode: this.inputMode,
      layout: this.layout, assistLevel: this.assistLevel, blankMode: this.blankMode,
      createdAt: this.createdAt, synced: this.synced,
    }
  }

  static fromJSON(plain) { return new this(plain) }

  // ── 难度映射 ──

  get levelMatch() { return Question.matchLevel(this) }

  get difficultyLevel() {
    const m = this.levelMatch
    return m ? DIFFICULTY_LEVELS[m.levelIdx] : null
  }

  /** 所属难度档位索引（getter：通过 matchLevel 实时计算，无需存储） */
  get level() { return this.levelMatch?.levelIdx ?? null }

  static filterByLevel(questions, levelIdx) {
    return (questions || []).filter(q => {
      const m = Question.matchLevel(q)
      return m && m.levelIdx === levelIdx
    })
  }

  // ── 算式查找 ──

  static findByEquation(collection, equation, { exact = true } = {}) {
    if (!collection || !equation) return []
    if (exact) return collection.filter(q => q.equation === equation)
    const target = this._parseEquationTriple(equation)
    if (!target) return []
    return collection.filter(q => {
      const qTriple = this._parseEquationTriple(q.equation || '')
      if (!qTriple) return false
      return this._isEquivalentTriple(target, qTriple)
    })
  }

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

  static _isEquivalentTriple(t1, t2) {
    if (t1.opFamily !== t2.opFamily) return false
    const sorted = (...nums) => nums.filter(v => v != null).sort((a, b) => a - b).join(',')
    if (t1.result != null && t2.result != null)
      return sorted(t1.bodyA, t1.bodyB, t1.result) === sorted(t2.bodyA, t2.bodyB, t2.result)
    return sorted(t1.bodyA, t1.bodyB) === sorted(t2.bodyA, t2.bodyB)
  }

  // ── 静态助手 ──

  static async loadByIds(ids) {
    if (!ids?.length) return new Map()
    const qs = await DB.questions.where('id').anyOf(ids).toArray()
    return new Map(qs.map(q => [q.id, Question.fromJSON(q)]))
  }

  static extractOperandDigits(q) {
    if (!q) return []
    const min = q.operandMin; const max = q.operandMax
    if (min == null && max == null) return []
    const digits = new Set()
    for (const n of [min, max]) {
      if (n == null) continue
      for (const ch of String(n)) { const d = Number(ch); if (!isNaN(d) && d >= 0) digits.add(d) }
    }
    return [...digits]
  }

  // ── DB 查询 ──

  static async findEquivalent(equation) {
    if (!equation) return []
    const all = await DB.questions.toArray()
    return Question.findByEquation(all, equation, { exact: false })
  }

  static async findRelated(equation, { range = 3, limit = 10 } = {}) {
    const triple = Question._parseEquationTriple(equation)
    if (!triple) return []
    const { bodyA, bodyB, op } = triple
    const all = await DB.questions.where('operator').equals(op).toArray()
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

  /** 串行队列：防止快速连续对同一 equation 的 upsert 并发写入冲突 */
  static _saveQueue = Promise.resolve()

  static async save(questionData) {
    if (!questionData?.equation) return
    await Question._saveQueue
    const next = new Promise(async (resolve) => {
      const { id: _ignored, ...clean } = questionData
      try {
        await DB.transaction('rw', DB.questions, async () => {
          const existing = await DB.questions.where('equation').equals(clean.equation).first()
          if (existing) {
            console.debug('[Question.save] upsert existing:', clean.equation, 'id:', existing.id)
            await DB.questions.update(existing.id, clean)
          } else {
            console.debug('[Question.save] add new:', clean.equation)
            await DB.questions.add(clean)
          }
        }).catch((txErr) => {
          console.warn('[Question.save] tx retries exhausted, fallback update:', txErr?.name)
          return DB.questions.where('equation').equals(clean.equation).first().then((existing) => {
            if (existing) return DB.questions.update(existing.id, clean)
          })
        })
      } finally { resolve() }
    })
    Question._saveQueue = next
  }
}
