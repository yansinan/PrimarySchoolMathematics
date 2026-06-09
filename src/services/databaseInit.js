/**
 * 数据库初始化（S 层）— PracticeDB 类 + db 实例。
 *
 * **纯叶子模块**：只 import Dexie + equationParser（upgrade hooks 用），
 * 不被任何业务模块反过来 import，所以 `q/a/w` 可以**静态 import** 从此模块获取 DB。
 *
 * 调用方：
 *   `import { DB } from '@/services/databaseInit'`
 *
 * @see utils/store/database.js — CRUD 函数驻留在原文件，从此 import DB
 * @see utils/algorithm/question.js — static _getDB() 从此 import DB
 */

import Dexie from 'dexie'
import { parseEquation } from '@/utils/algorithm/equationParser'

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

class AbilitySnapshot {
  constructor() {
    this.studentId = 'default'; this.totalQuestions = 0; this.correctCount = 0
    this.accuracy = 0; this.strong = []; this.weak = []; this.currentLevel = 0
    this.totalLevels = 0; this.currentLevelLabel = ''
    this.computedAt = Date.now(); this.synced = 0
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
      abilitySnapshots: '++id, studentId, computedAt, synced',
    })
    this.version(3).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
      abilitySnapshots: '++id, studentId, computedAt, synced',
      questions: '++id, &equation, operator, difficulty, createdAt, *operands',
    }).upgrade(async (tx) => {
      await tx.table('answers').toCollection().modify((a) => {
        if (a.questionId === undefined) a.questionId = null
        if (!a.inputMode) a.inputMode = a.options ? 'options' : 'keypad'
        if (!a.layout) a.layout = 'horizontal'
        if (a.assistLevel === undefined) a.assistLevel = 0
        if (!a.startedAt) a.startedAt = a.timestamp - (a.responseTime || 0)
        if (!a.endedAt) a.endedAt = a.timestamp
      })
      const seen = new Map()
      await tx.table('answers').each((a) => {
        if (!a.equation || seen.has(a.equation)) return
        seen.set(a.equation, {
          equation: a.equation, solution: a.solution, operator: a.operator,
          operandMin: a.operandMin, operandMax: a.operandMax,
          operands: [a.operandMin, a.operandMax].filter(x => x > 0),
          isCarry: !!a.isCarry, isBorrow: !!a.isBorrow,
          difficulty: a.difficulty ?? 0, inputMode: a.inputMode, layout: a.layout,
          assistLevel: a.assistLevel ?? 0, blankMode: 'result', createdAt: a.timestamp,
        })
      })
      if (seen.size > 0) {
        await tx.table('questions').bulkAdd([...seen.values()])
        const eqToId = new Map()
        await tx.table('questions').each((q) => eqToId.set(q.equation, q.id))
        await tx.table('answers').toCollection().modify((a) => {
          if (!a.questionId && a.equation) a.questionId = eqToId.get(a.equation) ?? null
        })
      }
      try { localStorage.setItem('psm_v2_to_v3_migration', new Date().toISOString()) } catch {}
    })
    this.version(4).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
      abilitySnapshots: '++id, studentId, computedAt, synced',
      questions: '++id, &equation, operator, difficulty, createdAt, *operands',
    }).upgrade(async (tx) => {
      await tx.table('answers').toCollection().modify((a) => {
        if (a.attemptCount == null) a.attemptCount = 1
        if (a.score == null) a.score = a.isCorrect ? Math.max(0, 1 - (a.attemptCount - 1) / 3) : 0
      })
      try { localStorage.setItem('psm_v3_to_v4_migration', new Date().toISOString()) } catch {}
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
