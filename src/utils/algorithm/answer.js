/**
 * Answer 类（U 层）— 单次答题的领域模型
 *
 * 继承链：DBQuestion (databaseInit) → Question → Answer → WrongAnswer
 *          └─ schema 骨架    └─ 题元数据+查询   └─答题数据+getter  └─错题专用
 *
 * extends Question — 继承题目元数据 + 添加答题元数据。
 * 区分：
 * - 存储字段：question 数据 + 答题数据 + 时间戳
 * - 派生字段（getter）：isCorrect / level / attemptCount / score / isWrong / isFixed
 *
 * 存储：
 *   旧 plain object（isCorrect/attemptCount/score 直接存）→ 新 Answer 实例
 *   调用 toJSON() 转为 plain object 存 db
 *   读取时 Answer.fromJSON(plain) 包成实例
 *
 * @see utils/algorithm/question.js — 父类
 * @see utils/algorithm/wrongAnswer.js — 子类（错题）
 * @see ARCHITECTURE.md § 1.1 U 层
 */

import { Question } from './question'
import { DB } from '@/services/databaseInit'
// 引入 DB Answer 确保 domain Answer 覆盖其全部字段
import { Answer as DBAnswer } from '@/services/databaseInit'

export class Answer extends Question {
  /** @param {Object} [raw] — db.answers 行或 useSubmitHandler 构造的 answerEntry */
  constructor(raw) {
    super(raw)
    if (!raw) return
    // Override DB 默认值（0→null/undefined）用于空值语义
    this.responseTime = raw.responseTime ?? null
    this.previousAttemptCount = raw.previousAttemptCount ?? (raw.attemptCount != null ? Math.max(0, raw.attemptCount - 1) : 0)
    this.correctedAt = raw.correctedAt ?? null
    this.startedAt = raw.startedAt ?? null
    this.endedAt = raw.endedAt ?? null
    this.questionIndex = raw.questionIndex ?? 0
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

  /**
   * 有效 responseTime（兜底计算）
   * - 优先用 this.responseTime（v1/v2 旧字段，可能为 0/undefined）
   * - 兜底用 this.endedAt - this.startedAt（v3 新增字段，迁移时补齐）
   * @returns {number|null}
   */
  get effectiveResponseTime() {
    if (this.responseTime != null) return this.responseTime
    if (this.endedAt != null && this.startedAt != null) {
      return this.endedAt - this.startedAt
    }
    return null
  }

  /**
   * 是否被视为"超时/异常"（太快 < 200ms 或太久 > 5min）
   * @returns {boolean}
   */
  get isTimeout() {
    const rt = this.effectiveResponseTime
    return rt != null && (rt < 200 || rt > 5 * 60 * 1000)
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

  // ── 静态方法（不受实例限制） ──

  /**
   * 静态版 isCorrect 判定（不实例化）
   * 用法：caller 拿到 plain object 时用，无需 new Answer()
   * @param {{userAnswer:any, solution:any}} answerLike
   * @returns {boolean} true 当且仅当 userAnswer === solution
   */
  static isCorrect(answerLike) {
    return Number(answerLike?.userAnswer) === Number(answerLike?.solution)
  }

  /** 此 Answer 是否在 N 天以内 */
  isRecent(days) {
    const cutoff = Date.now() - days * 864e5
    return (this.timestamp ?? this.startedAt ?? 0) >= cutoff
  }

  /** operand 范围是否与 [min, max] 重叠 */
  matchesOperand(min, max) {
    return (this.operandMax ?? 0) >= min
        && (this.operandMin ?? 0) <= max
  }

  /** 单题学习曲线（答题历史时间序列） */
  static async getLearningCurve(questionId, { days = 30 } = {}) {
    if (questionId == null) return []
    const cutoff = Date.now() - days * 86400e3
    const raw = await await DB.answers.where('questionId').equals(questionId).toArray()
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

  /** 聚合多个 Answer 的 score（等效 sumAnswerScores） */
  static sumScores(answers) {
    if (!answers?.length) return 0
    return answers.reduce((s, a) => {
      const inst = a instanceof Answer ? a : new Answer(a)
      return s + inst.score
    }, 0)
  }

  /**
   * 获取某学生的全部答题记录（跨所有 session，含 persistSingleAnswer 的无 session 记录）
   * 获取某学生的全部答题记录（跨所有 session，含 persistSingleAnswer 的无 session 记录）
   * 作为唯一事实源：每道答完的题都在 db.answers 中。
   * 返回 plain object 数组（兼容已有调用方的 .map(Answer.fromJSON) 模式）
   * @param {string} [studentId='default']
   * @returns {Promise<Object[]>} — 每项含 answer 字段 + config（有 session 时）
   */
  static async getAllByStudent(studentId = 'default') {
    const [sessions, allRows] = await Promise.all([
      DB.practiceSessions.where('studentId').equals(studentId).toArray(),
      DB.answers.toArray(),
    ])
    const sessionMap = {}
    for (const s of sessions) sessionMap[s.id] = s
    return allRows.map(a => ({
      ...a,
      config: a.sessionId ? (sessionMap[a.sessionId]?.config || null) : null,
    }))
  }
}
