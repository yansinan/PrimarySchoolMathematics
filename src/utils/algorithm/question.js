/**
 * Question 类（U 层）— 单道题的领域模型
 *
 * 包装 db.questions 表的元数据 + 派生属性。
 * Answer extends Question，继承所有题目元数据 + 答题元数据。
 *
 * @see utils/algorithm/answer.js
 * @see ARCHITECTURE.md § 1.1 U 层 = 无状态算法 / IO 适配
 */

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
}
