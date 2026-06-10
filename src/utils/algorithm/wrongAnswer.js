/**
 * WrongAnswer 类（U 层）— 错题领域模型
 *
 * 继承链：DBQuestion (databaseInit) → Question → Answer → WrongAnswer
 *          └─ schema 骨架    └─ 题元数据+查询   └─答题数据+getter  └─错题专用
 *
 * extends Answer — 继承题目元数据 + 答题元数据 + 派生 getter。
 * 增加错题专用的过滤/查询方法，将服务层的过滤逻辑内聚到类中。
 *
 * 本类职责：错题过滤、错题查询（DB → 静态 filterBy）。
 * 无需额外存储字段，Answer 的所有 getter（isWrong / isFixed / level / score）全部继承可用。
 *
 * 用法：
 *   WrongAnswer.fromJSON(plain)          // DB 行 → 实例
 *   WrongAnswer.filterBy(answers, opts)  // 纯函数过滤+排序
 *   wrongAnswer.isRecent(7)              // 近 7 天？
 *   wrongAnswer.matchesOperand(10, 30)   // 操作数范围重叠？
 *
 * @see ../services/wrongAnswerService.js — DB CRUD，查询委托本类
 * @see answer.js — 父类
 */
import { DB } from '@/services/databaseInit'
import { Answer, Question } from './'
export class WrongAnswer extends Answer {
  // ── 构造 ──
  constructor(raw) {
    super(raw)
  }
  // ── 查询（静态） ──
  /**
   * 纯函数过滤 + 排序错题数组。
   * 不做 DB 查询，只处理内存中的 Answer-like 对象。
   *
   * @param {Array} answers — Answer-like plain objects 或 Answer/WrongAnswer 实例
   * @param {Object} [opts]
   * @param {string} [opts.operator]         — 运算符 '+' '-' '×' '÷'
   * @param {number} [opts.minOperand]       — operandMin ≥
   * @param {number} [opts.maxOperand]       — operandMax ≤
   * @param {number} [opts.days]             — 近 N 天
   * @param {boolean} [opts.includeFixed]    — 默认排除已修正
   * @param {number} [opts.limit]            — 返回条数上限
   * @returns {Array<WrongAnswer>}
   */
  static filterBy(answers, opts = {}) {
    const { operator, minOperand, maxOperand, days, includeFixed, limit } = opts
    const cutoff = (days && days < Number.MAX_SAFE_INTEGER)
      ? Date.now() - days * 864e5
      : 0
    return (answers || [])
      .map(a => (a instanceof WrongAnswer) ? a : WrongAnswer.fromJSON(a))
      .filter(a => !Answer.isCorrect(a))  // 数学真理：userAnswer === solution
      .filter(a => !operator || a.operator === operator)
      .filter(a => {
        if (minOperand == null || maxOperand == null) return true
        return (a.operandMax ?? 0) >= minOperand
            && (a.operandMin ?? 0) <= maxOperand
      })
      .filter(a => includeFixed || !a.isFixed)        // 默认排除已修正
      .filter(a => !cutoff || (a.timestamp ?? a.startedAt ?? 0) >= cutoff)
      .sort((a, b) => (b.timestamp ?? b.startedAt ?? 0)
                    - (a.timestamp ?? a.startedAt ?? 0))
      .slice(0, limit || Infinity)
  }
  // ── 继承自 Question 的查询方法，重载以限为错题 ──
  /**
   * 按算式查找错题（重载：自动限定为 isCorrect===false）
   * @param {Array} collection — Answer/WrongAnswer plain 或实例
   * @param {string} equation
   * @param {Object} [opts]
   * @param {boolean} [opts.exact=true]
   * @returns {Array<WrongAnswer>}
   */
  static findByEquation(collection, equation, opts = {}) {
    const scoped = (collection || [])
      .map(a => (a instanceof WrongAnswer) ? a : WrongAnswer.fromJSON(a))
      .filter(a => !a.isCorrect)
    return super.findByEquation(scoped, equation, opts)
  }
  /**
   * 按难度档位查找错题（重载：自动限定为 isCorrect===false）
   * @param {Array} collection
   * @param {number} levelIdx
   * @returns {Array<WrongAnswer>}
   */
  static filterByLevel(collection, levelIdx) {
    const scoped = (collection || [])
      .map(a => (a instanceof WrongAnswer) ? a : WrongAnswer.fromJSON(a))
      .filter(a => !a.isCorrect)
    return super.filterByLevel(scoped, levelIdx)
  }
  // ── DB 查询 ──
  /**
   * 错题查询（DB → filterBy 合并）
   * @param {Object} [opts]
   * @param {string} [opts.operator]
   * @param {number} [opts.minOperand]
   * @param {number} [opts.maxOperand]
   * @param {number} [opts.days=30]
   * @param {number} [opts.limit=20]
   * @param {boolean} [opts.includeFixed=false]
   * @returns {Promise<WrongAnswer[]>}
   */
  static async getWrongAnswers(opts = {}) {
    const { operator, minOperand, maxOperand, days = 30, limit = 20, includeFixed = false } = opts
    const cutoff = Date.now() - days * 86400e3
    let candidates
    if (operator) {
      const qList = await DB.questions.where('operator').equals(operator).toArray()
      const qIds = qList.map((q) => q.id)
      if (!qIds.length) return []
      candidates = await DB.answers
        .where('questionId').anyOf(qIds)
        .and((a) => a.timestamp > cutoff)
        .toArray()
    } else {
      candidates = await DB.answers
        .where('timestamp').above(cutoff)
        .and((a) => !Answer.isCorrect(a))
        .toArray()
    }
    if (!candidates.length) return []
    const filtered = WrongAnswer.filterBy(candidates, { minOperand, maxOperand, includeFixed, limit })
    // 批量 join questions（取出权威字段）
    const qIds = [...new Set(filtered.map(a => a.questionId).filter(Boolean))]
    const qMap = await Question.loadByIds(qIds)
    return filtered.map(a => {
      const q = a.questionId != null ? qMap.get(a.questionId) : null
      return WrongAnswer.fromJSON({
        ...a,
        equation: q?.equation ?? a.equation,
        operator: q?.operator ?? a.operator,
        solution: q?.solution ?? a.solution,
        difficulty: q?.difficulty ?? (a.difficulty ?? null),
        isCarry: q?.isCarry ?? !!a.isCarry,
        isBorrow: q?.isBorrow ?? !!a.isBorrow,
      })
    })
  }
}
