/**
 * WrongAnswer 类（U 层）— 错题领域模型
 *
 * extends Answer — 继承题目元数据 + 答题元数据 + 派生 getter。
 * 增加错题专用的过滤/查询方法，将服务层的过滤逻辑内聚到类中。
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

import { Answer } from './'

export class WrongAnswer extends Answer {

  // ── 构造 ──

  constructor(raw) {
    super(raw)
  }

  static fromJSON(plain) {
    return new WrongAnswer(plain)
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

  // ── 便捷查询（实例方法） ──

  /** 此错题是否在 N 天以内 */
  isRecent(days) {
    const cutoff = Date.now() - days * 864e5
    return (this.timestamp ?? this.startedAt ?? 0) >= cutoff
  }

  /** 此错题的 operand 范围是否与 [min, max] 重叠 */
  matchesOperand(min, max) {
    return (this.operandMax ?? 0) >= min
        && (this.operandMin ?? 0) <= max
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
}
