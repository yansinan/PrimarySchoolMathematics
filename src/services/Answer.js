/**
 * Answer 类（U 层）— 单次答题的领域模型
 *
 * 继承链：DBQuestion (databaseInit) → Question → Answer → WrongAnswer
 *          └─ schema 骨架    └─ 题元数据+查询   └─答题数据+getter  └─错题专用
 *
 * extends Question — 继承题目元数据 + 添加答题元数据。
 * 从 Question 继承的静态方法：fromJSON / save / getAll / findByOperator / findByEquation
 *   filterByLevel / findByOperands / findEquivalent / findRelated / loadByIds / matchLevel / ...（见 Question）
 * ⚠ 注意：all static query methods on Question operate on DB.questions; Answer's operate on DB.answers.
 *
 * ▸ 本类职责：答题数据 + 派生 getter + DB.answers 表 CRUD。单条 answer 的读写查删。
 *
 * ▸ 子类 WrongAnswer 继承的静态方法（勿在 WrongAnswer 重复定义）:
 *   save(), isCorrect(), computeMastery(), sumScores(), getLearningCurve(),
 *   getAllByStudent(), findBySession(), findByPracticeSessionId(), findBySessions(),
 *   getAll(), findByQuestionId(), findByQuestionIds(), getOrphans(),
 *   updateOne(), deleteOne(), bulkDelete(), deleteBySession()
 *
 * ▸ 方法分组速览:
 *   ─ 派生 getter: isCorrect / attemptCount / isFixed / isWrong / score / effectiveResponseTime / isTimeout / isMastered
 *   ─ 修正操作: markFixed() / unmarkFixed()
 *   ─ 持久化: save(answerLike) — 写入 DB.answers 表 / toJSON()
 *   ─ 查询（DB.answers）: getAllByStudent / findBySession / findByQuestionId / getAll / getOrphans / ...
 *   ─ 写操作（DB.answers）: updateOne / deleteOne / bulkDelete / deleteBySession
 *   ─ 聚合: computeMastery(answers) → Map / sumScores(answers) → number / getLearningCurve(questionId)
 *   ─ 辅助: isRecent(days) / matchesOperand(min, max) / static isCorrect(answerLike)
 *
 * @see ./Question — 父类
 * @see ./WrongAnswer — 子类（错题）
 */

import { Question } from './Question'
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

  // ── 掌握值管理（从 Question 迁入）──

  /** 答错一次扣除的掌握值 */
  static MASTERY_WRONG_PENALTY = -100
  /** 改正一次增加的掌握值 */
  static MASTERY_CORRECT_REWARD = 30
  /** 完全掌握阈值 */
  static MASTERY_THRESHOLD = 100
  /** 不同 inputMode 的额外掌握值加成（在 MASTERY_CORRECT_REWARD 基础上追加） */
  static MASTERY_MODE_BONUS = {
    horizontal_keypad: 20,
    vertical_keypad: 10,
    choice2: 0,
    choice4: 5,
  }

  /** 是否已完全掌握（基于外部预计算的 mastery 字段，非 async getter） */
  get isMastered() {
    return (this.mastery ?? 0) >= Answer.MASTERY_THRESHOLD
  }

  /**
   * 从一组 answer 记录中归算各 equation 的掌握值
   * @param {Array} answers — Answer-like 实例或 plain object
   * @returns {Map<string, number>} key=`equation_solution` → mastery
   */
  static computeMastery(answers) {
    const map = new Map()
    for (const a of answers) {
      const key = `${a.equation || ''}_${a.solution}`
      if (!map.has(key)) map.set(key, 0)
      const correct = Number(a.userAnswer) === Number(a.solution)
      if (correct) {
        if ((a.previousAttemptCount ?? 0) > 0) {
          const bonus = Answer.MASTERY_MODE_BONUS[a.inputMode] || 0
          map.set(key, map.get(key) + Answer.MASTERY_CORRECT_REWARD + bonus)
        }
      } else {
        map.set(key, map.get(key) + Answer.MASTERY_WRONG_PENALTY)
      }
    }
    for (const [k, v] of map) {
      map.set(k, Math.max(-999, Math.min(Answer.MASTERY_THRESHOLD, v)))
    }
    return map
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
      practiceSessionId: this.practiceSessionId,
    }
  }

  /**
   * 持久化单条答题到 DB（覆盖 Question.save 写 questions 表，本方法写 answers 表）
   *
   * 只存元数据（toJSON 输出），不存可计算字段（isCorrect/attemptCount/score）。
   * 对应 reads 路径用 Answer.fromJSON(plain) 包回实例，通过 getter 重算。
   *
   * @param {Object|Answer} answerLike — Answer 实例或 raw plain object
   * @returns {Promise<void>}
   */
  static async save(answerLike) {
    if (!answerLike) return
    // 是 Answer 实例 → 走 toJSON 去掉 getter 字段；否则当 plain object 处理
    const plain = answerLike instanceof Answer
      ? answerLike.toJSON()
      : JSON.parse(JSON.stringify(answerLike))

    // 自动补齐 questionId
    if (!plain.questionId && plain.equation) {
      try {
        const q = await DB.questions.where('equation').equals(plain.equation).first()
        if (q?.id) plain.questionId = q.id
      } catch {
        // question may not exist yet; skip
      }
    }

    return await DB.answers.put(plain)
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
   * 获取某学生的全部答题记录（跨所有 session，含 Answer.save 写入的单条记录）
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

  // ── 通用查询（封装 DB.answers 所有查操作） ──

  /** 按 sessionId 查 → Answer[] */
  static async findBySession(sessionId) {
    if (sessionId == null) return []
    const raw = await DB.answers.where('sessionId').equals(sessionId).toArray()
    return raw.map(r => Answer.fromJSON(r))
  }

  /** 按 practiceSessionId 查 → Answer[] */
  static async findByPracticeSessionId(psId) {
    if (psId == null) return []
    const raw = await DB.answers.where('practiceSessionId').equals(psId).toArray()
    return raw.map(r => Answer.fromJSON(r))
  }

  /** 按多个 sessionId 查 → Answer[] */
  static async findBySessions(sessionIds) {
    if (!sessionIds?.length) return []
    const raw = await DB.answers.where('sessionId').anyOf(sessionIds).toArray()
    return raw.map(r => Answer.fromJSON(r))
  }

  /** 全部答案 → Answer[] */
  static async getAll() {
    const raw = await DB.answers.toArray()
    return raw.map(r => Answer.fromJSON(r))
  }

  /** 按 questionId 查（可选时间窗口）→ Answer[] */
  static async findByQuestionId(questionId, { days } = {}) {
    if (questionId == null) return []
    const raw = await DB.answers.where('questionId').equals(questionId).toArray()
    const cutoff = days != null ? Date.now() - days * 86400e3 : 0
    const filtered = cutoff ? raw.filter(a => a.timestamp > cutoff) : raw
    return filtered.map(r => Answer.fromJSON(r))
  }

  /** 按多个 questionId 查（可选时间窗口）→ Answer[] */
  static async findByQuestionIds(questionIds, { days } = {}) {
    if (!questionIds?.length) return []
    const raw = await DB.answers.where('questionId').anyOf(questionIds).toArray()
    const cutoff = days != null ? Date.now() - days * 86400e3 : 0
    const filtered = cutoff ? raw.filter(a => a.timestamp > cutoff) : raw
    return filtered.map(r => Answer.fromJSON(r))
  }

  /** 游离答案（无 sessionId）→ Answer[] */
  static async getOrphans() {
    const raw = await DB.answers.filter(a => !a.sessionId).toArray()
    return raw.map(r => Answer.fromJSON(r))
  }

  // ── 通用写操作（封装 DB.answers 所有写操作） ──

  /** 更新单条 answer 字段 */
  static async updateOne(id, changes) {
    if (id == null) return false
    await DB.answers.update(id, changes)
    return true
  }

  /** 删除单条 answer */
  static async deleteOne(id) {
    if (id == null) return false
    await DB.answers.delete(id)
    return true
  }

  /** 批量删除 answer */
  static async bulkDelete(ids) {
    if (!ids?.length) return 0
    await DB.answers.bulkDelete(ids)
    return ids.length
  }

  /** 删除某 session 的所有 answer */
  static async deleteBySession(sessionId) {
    if (sessionId == null) return
    await DB.answers.where('sessionId').equals(sessionId).delete()
  }
}
