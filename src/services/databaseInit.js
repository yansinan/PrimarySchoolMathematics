/**
 * 数据库初始化（S 层）— PracticeDB 实例定义。
 *
 * **纯 DB 层**：只负责 Dexie 实例、表结构、骨架类。不含业务逻辑。
 *
 * 跟它有关的：
 * - Schema 类（骨架构造器，继承用）— 纯 DB 范畴
 * - version/store 定义 — 表结构
 * - upgrade hooks — 数据迁移，含少量业务默认值，但是一次性兼容代码
 * - 导出/导入/清空 — 纯 DB CRUD
 */

import Dexie from 'dexie'

// ─── Schema helpers (Dexie mapToClass) ───────────────────────────────────

class PracticeSession {
  constructor() {
    this.studentId = 'default'; this.config = null
    this.totalQuestions = 0; this.correctCount = 0; this.accuracy = 0
    this.totalDuration = 0; this.evaluations = null
    this.createdAt = new Date().toISOString(); this.synced = 0; this.updatedAt = new Date().toISOString()
  }
}

class Answer {
  constructor() {
    this.sessionId = 0; this.equation = ''; this.solution = 0; this.userAnswer = 0
    this.isCorrect = false; this.attemptCount = 1; this.score = 0
    this.responseTime = 0; this.operator = ''; this.isCarry = false
    this.isBorrow = false; this.stepCount = 1; this.operandMin = 0
    this.operandMax = 0; this.timestamp = Date.now(); this.synced = 0
  }
}

class Question {
  constructor() {
    this.equation = ''; this.solution = 0; this.operator = ''
    this.operandMin = 0; this.operandMax = 0; this.operands = []
    this.isCarry = false; this.isBorrow = false; this.difficulty = 0
    this.inputMode = ''; this.layout = ''; this.assistLevel = 0
    this.blankMode = 'result'; this.createdAt = Date.now(); this.synced = 0
  }
}

// ─── PracticeDB — IndexedDB persistence layer ────────────────────────────

class PracticeDB extends Dexie {
  constructor() {
    super('PracticeDB')

    this.version(1).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, synced, timestamp',
    })
    this.version(2).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, synced, timestamp',
    })
    this.version(3).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
      questions: '++id, &equation, operator, difficulty, createdAt, *operands',
    })
    this.version(4).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
      questions: '++id, &equation, operator, difficulty, createdAt, *operands',
    })

    this.practiceSessions.mapToClass(PracticeSession)
    this.answers.mapToClass(Answer)
    this.questions.mapToClass(Question)
  }
}

const db = new PracticeDB()
export { db as DB }
export default db
// ─── Schema classes（供 domain 类继承对齐） ──────────────────────────
export { PracticeSession, Answer, Question }

// ─── DB 级操作（数据导出 / 导入 / 清空） ─────────────────────────────────

/**
 * 导出全部数据
 * @returns {Object} JSON-serializable 导出对象
 */
export async function exportAllData(studentId = 'default') {
  const sessions = await db.practiceSessions
    .where('studentId').equals(studentId).toArray()
  const sessionIds = sessions.map(s => s.id)
  const answers = sessionIds.length
    ? await db.answers.where('sessionId').anyOf(sessionIds).toArray()
    : []
  const questions = await db.questions.toArray()
  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    studentId,
    sessions,
    answers,
    questions,
  }
}

/**
 * 导入数据（按 session.id 判重，跳过已存在的）
 * @returns {{importedSessions: number, skippedSessions: number}}
 */
export async function importAllData(data) {
  if (!data?.sessions) return { importedSessions: 0, skippedSessions: 0 }
  let importedSessions = 0
  for (const session of data.sessions) {
    if (await db.practiceSessions.where('id').equals(session.id).first()) continue
    const { answers: _answers, ...sessionData } = session
    await db.practiceSessions.add(sessionData)
    importedSessions++
    const sessAnswers = (data.answers || []).filter(a => a.sessionId === session.id)
    if (sessAnswers.length) {
      await db.answers.bulkAdd(
        sessAnswers.map(a => { const { _answers: _a, ...rest } = a; return rest })
      )
    }
  }
  return { importedSessions, skippedSessions: 0 }
}

/**
 * 清空所有本地数据（sessions + answers + profile）
 */
export async function clearAllData() {
  await db.transaction('rw', db.practiceSessions, db.answers, async () => {
    await db.practiceSessions.clear()
    await db.answers.clear()
  })
  try { localStorage.removeItem('psm_profile') } catch { /* ignore */ }
}
