/**
 * Answer 类（U 层）— 单次答题的领域模型
 *
 * extends Question — 继承题目元数据 + 添加答题元数据。
 * 区分：
 * - 存储字段：question 数据 + 答题数据 + 时间戳
 * - 派生字段（getter）：isCorrect / isWrong / isFixed / attemptCount / score
 *
 * 存储：
 *   旧 plain object（isCorrect/attemptCount/score 直接存）→ 新 Answer 实例
 *   调用 toJSON() 转为 plain object 存 db
 *   读取时 Answer.fromJSON(plain) 包成实例
 *
 * @see utils/algorithm/question.js
 * @see ARCHITECTURE.md § 1.1 U 层
 */

import { Question } from './question'

export class Answer extends Question {
  /**
   * @param {Object} raw — db.answers 表的 plain object
   *   或 useSubmitHandler 构造的 answerEntry
   */
  constructor(raw) {
    if (!raw) throw new Error('Answer: raw is required')
    super(raw)

    // 答题主体
    this.userAnswer = raw.userAnswer

    // 答题元数据
    this.responseTime = raw.responseTime ?? 0
    this.questionIndex = raw.questionIndex ?? 0

    // 时间戳
    this.timestamp = raw.timestamp ?? Date.now()
    this.startedAt = raw.startedAt ?? this.timestamp
    this.endedAt = raw.endedAt ?? this.timestamp

    // 重试上下文（attemptCount getter 用）
    this.previousAttemptCount = raw.previousAttemptCount ?? 0

    // 错题修正时间戳（user action，isFixed getter 用）
    this.correctedAt = raw.correctedAt ?? null

    // 系统字段（来自 db.answers）
    this.sessionId = raw.sessionId
    this.questionId = raw.questionId
  }

  // ── 派生属性（getter）──

  /** 答对了吗？纯计算：userAnswer === solution */
  get isCorrect() {
    return Number(this.userAnswer) === Number(this.solution)
  }

  /** 总尝试次数 = previous + 1 */
  get attemptCount() {
    return this.previousAttemptCount + 1
  }

  /** 错题已被修正（学生后来答对） */
  get isFixed() {
    return this.correctedAt != null
  }

  /** 错题？(未修正的错答) */
  get isWrong() {
    return !this.isCorrect && !this.isFixed
  }

  /** 本次得分：1 (首次对) / 2/3 / 1/3 / 0 (答错) */
  get score() {
    if (!this.isCorrect) return 0
    return Math.max(0, 1 - (this.attemptCount - 1) / 3)
  }

  /** 答对且非修正（即"真正掌握"） */
  get isMastered() {
    return this.isCorrect && !this.isFixed
  }

  // ── 业务操作 ──

  /** 标记为已修正 */
  markFixed() {
    this.correctedAt = new Date().toISOString()
  }

  /** 取消修正 */
  unmarkFixed() {
    this.correctedAt = null
  }

  // ── 持久化 ──

  toJSON() {
    return {
      ...super.toJSON(),
      // 答题主体
      userAnswer: this.userAnswer,
      // 答题元数据
      responseTime: this.responseTime,
      questionIndex: this.questionIndex,
      // 时间戳
      timestamp: this.timestamp,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      // 重试上下文
      previousAttemptCount: this.previousAttemptCount,
      // 错题修正
      correctedAt: this.correctedAt,
      // 系统字段
      sessionId: this.sessionId,
      questionId: this.questionId,
    }
  }

  static fromJSON(plain) {
    return new Answer(plain)
  }
}
