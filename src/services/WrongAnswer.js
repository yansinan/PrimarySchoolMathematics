/**
 * WrongAnswer 类（S 层）— 错题领域模型
 *
 * 继承链：DBQuestion (databaseInit) → Question → Answer → WrongAnswer
 *          └─ schema 骨架    └─ 题元数据+查询   └─答题数据+getter  └─错题专用
 *
 * extends Answer — 继承题目元数据 + 答题元数据 + 全部派生 getter + DB.answers CRUD。
 * 从 Answer 继承的关键方法（勿重复定义）:
 *   getAllByStudent() / findBySession() / findBySessions() / getAll()
 *   findByQuestionId() / findByQuestionIds() / getOrphans()
 *   updateOne() / deleteOne() / bulkDelete() / deleteBySession()
 *   computeMastery() / sumScores() / isCorrect() / getLearningCurve()
 *   fromJSON() / save()
 * 从 Question 继承: getAll() / findByEquation(collection, ...) / filterByLevel(collection, ...) / 等
 *
 * ▸ 本类职责：错题过滤、错题聚合、错题查询（DB → filterBy 合并）。
 *   只增加过滤/查询方法，不新增存储字段——Answer 的所有 getter（isWrong / isFixed / level / score）全部继承可用。
 *
 * ▸ 自身方法速览:
 *   filterBy(answers, opts) — 纯函数过滤 + 排序（operator / operand / days / includeFixed / limit）
 *   dedup(answers) — 按 equation_solution 去重聚合，附加 wrongCount / correctedCount
 *   loadPool(profile, opts) — 加载错题池：去重 + mastery 过滤
 *   findByEquation(collection, equation) — 重载父类，自动 !isCorrect 限定
 *   filterByLevel(collection, levelIdx) — 重载父类，自动 !isCorrect 限定
 *   getWrongAnswers(opts) — DB 查询 + question join + filterBy 合并（主要查询入口）
 *
 * ⚠ 命名提醒:
 *   - getWrongAnswers(opts) vs Answer.getAll(): 前者加错题过滤 + question join，后者查全部
 *   - filterBy(answers, opts) vs filterByLevel(collection, levelIdx): 参数不同，勿混淆
 *   - findByEquation(collection, eq) vs Question.findByEquation: 后者不限定 !isCorrect
 *
 * @see ./Answer — 父类（答对/答错通用 CRUD）
 * @see ./Question — 祖类（题目元数据 + 查询）
 */
import { DB } from '@/services/databaseInit'
import { Answer } from './Answer'
import { Question } from './Question'
export class WrongAnswer extends Answer {
  // ── 构造 ──
  constructor(raw) {
    super(raw)
  }

  /**
   * 去重并聚合错题：同名同答案只留一条，附带 wrongCount 和 correctedCount。
   * 库里所有记录都存，查询时聚合。
   * @param {Array} answers — Answer-like 实例或 plain object
   * @returns {Array<WrongAnswer>} — 每项带 wrongCount / correctedCount
   */
  static dedup(answers) {
    const groups = new Map()
    for (const a of answers) {
      const inst = a instanceof WrongAnswer ? a : WrongAnswer.fromJSON(a)
      const key = `${inst.equation || ''}_${inst.solution}`
      if (!groups.has(key)) {
        groups.set(key, { item: inst, wrongCount: 0, correctedCount: 0 })
      }
      const g = groups.get(key)
      g.wrongCount++
      if (inst.isFixed) g.correctedCount++
    }
    return [...groups.values()]
      .map(g => {
        g.item.wrongCount = g.wrongCount
        g.item.correctedCount = g.correctedCount
        return g.item
      })
      .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))  // 最不熟排最前
  }

  /**
   * 加载错题池：去重 + 掌握值过滤
   * 与 Profile.masteryMap 协作（不再自己 getAll）
   * @param {Object} profile    — Profile 实例（含 masteryMap）
   * @param {Object} [opts]     — { days, limit }
   * @returns {Promise<WrongAnswer[]>}
   */
  static async loadPool(profile, { days = 90, limit = 200 } = {}) {
    const raw = await this.getWrongAnswers({ days, limit })
    if (!raw.length) return []
    const deduped = this.dedup(raw)
    if (!profile?.masteryMap) return deduped
    for (const a of deduped) {
      const key = `${a.equation || ''}_${a.solution}`
      a.mastery = profile.masteryMap.get(key) ?? 0
    }
    return deduped.filter(a => (a.mastery ?? 0) < Answer.MASTERY_THRESHOLD)
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
      .filter(a => !a.isCorrect)
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
      const qList = await Question.findByOperator(operator)
      const qIds = qList.map((q) => q.id)
      if (!qIds.length) {
        // 降级：无对应 questions 时按 answer.operator 字段过滤
        candidates = await DB.answers
          .where('timestamp').above(cutoff)
          .filter(a => a.operator === operator)
          .toArray()
      } else {
        candidates = await DB.answers
          .where('questionId').anyOf(qIds)
          .and((a) => a.timestamp > cutoff)
          .toArray()
      }
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
