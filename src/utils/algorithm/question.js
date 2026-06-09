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
import { matchLevel, groupAnswersByLevel } from './matchLevel'
import { DB, Question as DBQuestion } from '@/services/databaseInit'

export class Question extends DBQuestion {
  static _getDB() { return DB }
  /** @param {Object} [raw] — db.questions 行或 useSubmitHandler 构造的 currentQuestion */
  constructor(raw) {
    super()  // DB schema 默认值（equation='', solution=0, …）
    if (!raw) return  // 保留 DB 默认值（mapToClass 空行用）
    // 只复制非 getter 字段（避免 Answer 的只读 getter 被 Object.assign 覆盖）
    const { isCorrect, attemptCount, score, ...rest } = raw
    Object.assign(this, rest)
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
    return new this(plain)
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
    const qs = await DB.questions.where('id').anyOf(ids).toArray()
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
    const all = await DB.questions.toArray()
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

  /**
   * 保存/更新一道题（upsert by equation）
   * @param {Object} questionData — 须含 equation 字段
   */
  static async save(questionData) {
    if (!questionData?.equation) return
    const existing = await DB.questions.where('equation').equals(questionData.equation).toArray()
    if (existing.length > 0) {
      await DB.questions.update(existing[0].id, questionData)
    } else {
      await DB.questions.add(questionData)
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 难度映射函数（纯函数，无状态）
// 原定义在 adaptiveEngine.js，迁入 Question 的同级模块
// ═══════════════════════════════════════════════════════════

/** 运算符字符 → DIFFICULTY_LEVELS 数字编码 */
// ── matchLevel + groupAnswersByLevel 已迁至 ./matchLevel ──────
// =========================================================================
