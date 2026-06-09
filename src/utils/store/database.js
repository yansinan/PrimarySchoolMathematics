import Dexie from 'dexie'
import { parseEquation } from '@/utils/algorithm/equationParser'
// computeScore 内联在 v4 upgrade hook
// mapToClass 保留本地 schema 类（domain 类 import 导致循环依赖）

/**
 * PracticeDB — IndexedDB persistence layer for practice sessions and answers.
 *
 * Tables:
 *   practiceSessions — one row per practice session
 *   answers          — one row per answered question, linked via sessionId
 *
 * Both tables include `synced` / `updatedAt` fields reserved for future
 * cloud-sync integration (Dexie Cloud or custom sync API).
 */
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
      // 1. Backfill answers 缺字段
      await tx.table('answers').toCollection().modify((a) => {
        if (a.questionId === undefined) a.questionId = null
        if (!a.inputMode) a.inputMode = a.options ? 'options' : 'keypad'
        if (!a.layout) a.layout = 'horizontal'
        if (a.assistLevel === undefined) a.assistLevel = 0
        if (!a.startedAt) a.startedAt = a.timestamp - (a.responseTime || 0)
        if (!a.endedAt) a.endedAt = a.timestamp
      })

      // 2. 从 answers 反向建 questions（去重）
      const seen = new Map()
      await tx.table('answers').each((a) => {
        if (!a.equation || seen.has(a.equation)) return
        seen.set(a.equation, {
          equation: a.equation,
          solution: a.solution,
          operator: a.operator,
          operandMin: a.operandMin,
          operandMax: a.operandMax,
          operands: [a.operandMin, a.operandMax].filter(x => x > 0),
          isCarry: !!a.isCarry,
          isBorrow: !!a.isBorrow,
          difficulty: a.difficulty ?? 0,
          inputMode: a.inputMode,
          layout: a.layout,
          assistLevel: a.assistLevel ?? 0,
          blankMode: 'result',
          createdAt: a.timestamp,
        })
      })
      if (seen.size > 0) {
        await tx.table('questions').bulkAdd([...seen.values()])
        // 3. 回填 answers.questionId
        const eqToId = new Map()
        await tx.table('questions').each((q) => eqToId.set(q.equation, q.id))
        await tx.table('answers').toCollection().modify((a) => {
          if (!a.questionId && a.equation) a.questionId = eqToId.get(a.equation) ?? null
        })
      }

      // 4. 记录迁移完成
      try {
        localStorage.setItem('psm_v2_to_v3_migration', new Date().toISOString())
      } catch {}
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
      try {
        localStorage.setItem('psm_v3_to_v4_migration', new Date().toISOString())
      } catch {}
    })

    this.practiceSessions.mapToClass(PracticeSession)
    this.answers.mapToClass(Answer)
    this.questions.mapToClass(Question)
  }
}

// ─── AbilitySnapshot helper ─────────────────────────────────────────────

class AbilitySnapshot {
  constructor() {
    this.studentId = 'default'
    this.totalQuestions = 0
    this.correctCount = 0
    this.accuracy = 0           // 0‑1
    this.strong = []            // string[] 如 ['L1 个位数基础']
    this.weak = []              // string[]
    this.currentLevel = 0       // 1‑based
    this.totalLevels = 0
    this.currentLevelLabel = ''
    this.computedAt = Date.now()
    this.synced = 0
  }
}

// ─── Schema helpers (used for serialization) ────────────────────────────

class PracticeSession {
  constructor() {
    this.studentId = 'default'
    this.config = null
    this.totalQuestions = 0
    this.correctCount = 0
    this.accuracy = 0
    this.totalDuration = 0
    this.evaluations = null   // JSON string: {"groupEvals":[{"group":1,"score":4},...],"finalComment":""}
    this.createdAt = new Date().toISOString()
    this.synced = 0
    this.updatedAt = new Date().toISOString()
  }
}

class Answer {
  constructor() {
    this.sessionId = 0
    this.equation = ''
    this.solution = 0
    this.userAnswer = 0
    this.isCorrect = false
    this.attemptCount = 1
    this.score = 0
    this.responseTime = 0
    this.operator = ''
    this.isCarry = false
    this.isBorrow = false
    this.stepCount = 1
    this.operandMin = 0
    this.operandMax = 0
    this.timestamp = Date.now()
    this.synced = 0
  }
}

// ─── Question helper (v3) ──────────────────────────────────────────────

class Question {
  constructor() {
    this.equation = ''         // unique key, "23+47="
    this.solution = 0
    this.operator = ''         // '+' '-' '×' '÷'
    this.operandMin = 0
    this.operandMax = 0
    this.operands = []         // 涉及所有数字
    this.isCarry = false
    this.isBorrow = false
    this.difficulty = 0        // 0-12
    this.inputMode = ''        // 'keypad' / 'options'
    this.layout = ''           // 'horizontal' / 'vertical'
    this.assistLevel = 0       // 0-3
    this.blankMode = 'result'  // 'result' / 'mixed'
    this.createdAt = Date.now()
    this.synced = 0
  }
}

// ─── Singleton instance ─────────────────────────────────────────────────

const db = new PracticeDB()

// ─── Public API — Session CRUD ──────────────────────────────────────────

/**
 * Save a practice session and all its answers in one transaction.
 * @param {object} sessionData - Session fields (studentId, config, …)
 * @param {Array<object>} answersData - Array of answer objects
 * @returns {Promise<number>} The auto-generated session id
 */
export async function saveSession(sessionData, answersData) {
  const now = new Date().toISOString()

  const session = {
    studentId: sessionData.studentId || 'default',
    config: sessionData.config || null,
    totalQuestions: sessionData.totalQuestions || 0,
    correctCount: sessionData.correctCount || 0,
    accuracy: sessionData.accuracy || 0,
    totalDuration: sessionData.totalDuration || 0,
    evaluations: sessionData.evaluations || null,
    createdAt: now,
    synced: 0,
    updatedAt: now
  }

  const id = await db.transaction('rw', db.practiceSessions, db.answers, async () => {
    const sessionId = await db.practiceSessions.add(session)

    const answers = answersData.map(a => ({
      sessionId,
      equation: a.equation || '',
      solution: a.solution ?? 0,
      userAnswer: a.userAnswer ?? 0,
      isCorrect: !!a.isCorrect,
      attemptCount: a.attemptCount ?? 1,
      score: typeof a.score === 'number' ? a.score : (a.isCorrect ? 1 : 0),
      responseTime: a.responseTime || 0,
      operator: a.operator || '',
      isCarry: !!a.isCarry,
      isBorrow: !!a.isBorrow,
      stepCount: a.stepCount || 1,
      operandMin: a.operandMin ?? 0,
      operandMax: a.operandMax ?? 0,
      timestamp: a.timestamp || Date.now(),
      synced: 0
    }))

    // Bulk insert in chunks to avoid performance issues with large sets
    const CHUNK = 500
    for (let i = 0; i < answers.length; i += CHUNK) {
      await db.answers.bulkAdd(answers.slice(i, i + CHUNK))
    }

    return sessionId
  })

  return id
}

/**
 * List sessions for a student, most recent first.
 * @param {string} studentId
 * @param {number} [limit=50]
 * @returns {Promise<Array<object>>}
 */
export async function getSessions(studentId = 'default', limit = 50) {
  return db.practiceSessions
    .where('studentId').equals(studentId)
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * Get a single session with all its answers.
 * @param {number} sessionId
 * @returns {Promise<{session: object|null, answers: Array<object>}>}
 */
export async function getSessionDetail(sessionId) {
  const session = await db.practiceSessions.get(sessionId)
  const answers = await db.answers
    .where('sessionId').equals(sessionId)
    .sortBy('timestamp')

  return { session, answers }
}

/**
 * Delete a session and all its answers.
 * @param {number} sessionId
 */
export async function deleteSession(sessionId) {
  await db.transaction('rw', db.practiceSessions, db.answers, async () => {
    await db.practiceSessions.delete(sessionId)
    await db.answers.where('sessionId').equals(sessionId).delete()
  })
}

// ─── Ability Snapshot CRUD ──────────────────────────────────────────────

/**
 * Save a user ability profile snapshot to DB for future retrieval.
 * Called after each question answer or group checkpoint.
 * @param {object} snapshot - Ability snapshot data
 * @returns {Promise<number>} snapshot id
 */
export async function saveAbilitySnapshot(snapshot) {
  const now = Date.now()
  const record = {
    ...snapshot,
    computedAt: now,
    synced: 0,
  }
  return await db.abilitySnapshots.add(record)
}

/**
 * Get the most recent ability snapshot for a student.
 * @param {string} studentId
 * @returns {Promise<object|null>}
 */
export async function getLatestAbilitySnapshot(studentId = 'default') {
  const snapshots = await db.abilitySnapshots
    .where('studentId').equals(studentId)
    .reverse()
    .limit(1)
    .toArray()
  return snapshots[0] || null
}

// ─── Aggregated Statistics ──────────────────────────────────────────────

/**
 * Compute aggregate statistics across all sessions for a student.
 * @param {string} studentId
 * @returns {Promise<object>}
 */
export async function getAggregatedStats(studentId = 'default') {
  const { Answer } = await import('@/utils/algorithm/answer')
  const sessions = await db.practiceSessions
    .where('studentId').equals(studentId)
    .reverse()
    .toArray()

  if (!sessions.length) {
    return {
      totalSessions: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      overallAccuracy: 0,
      operatorStats: {},
      carryStats: { withCarry: { count: 0, correct: 0 }, withoutCarry: { count: 0, correct: 0 } },
      borrowStats: { withBorrow: { count: 0, correct: 0 }, withoutBorrow: { count: 0, correct: 0 } },
      stepStats: {},
      numberStats: [],
      weakNumbers: [],
      dailyStreak: 0
    }
  }

  // Fetch all answers for these sessions
  const sessionIds = sessions.map(s => s.id)
  const allAnswers = await db.answers
    .where('sessionId').anyOf(sessionIds)
    .toArray()

  const totalQuestions = allAnswers.length
  const totalCorrect = Answer.sumScores(allAnswers)
  const overallAccuracy = totalQuestions > 0 ? totalCorrect / totalQuestions : 0

  // Operator stats
  const operatorStats = {}
  for (const op of ['+', '-', '*', '/']) {
    const byOp = allAnswers.filter(a => a.operator === op)
    if (byOp.length > 0) {
      operatorStats[op] = {
        count: byOp.length,
        correct: Answer.sumScores(byOp),
        accuracy: Answer.sumScores(byOp) / byOp.length
      }
    }
  }

  // Carry stats
  const withCarry = allAnswers.filter(a => a.isCarry)
  const withoutCarry = allAnswers.filter(a => !a.isCarry && (a.operator === '+' || a.operator === '-'))
  const carryStats = {
    withCarry: {
      count: withCarry.length,
      correct: Answer.sumScores(withCarry),
      accuracy: withCarry.length > 0 ? Answer.sumScores(withCarry) / withCarry.length : 0
    },
    withoutCarry: {
      count: withoutCarry.length,
      correct: Answer.sumScores(withoutCarry),
      accuracy: withoutCarry.length > 0 ? Answer.sumScores(withoutCarry) / withoutCarry.length : 0
    }
  }

  // Borrow stats
  const withBorrow = allAnswers.filter(a => a.isBorrow)
  const withoutBorrow = allAnswers.filter(a => !a.isBorrow && (a.operator === '+' || a.operator === '-'))
  const borrowStats = {
    withBorrow: {
      count: withBorrow.length,
      correct: Answer.sumScores(withBorrow),
      accuracy: withBorrow.length > 0 ? Answer.sumScores(withBorrow) / withBorrow.length : 0
    },
    withoutBorrow: {
      count: withoutBorrow.length,
      correct: Answer.sumScores(withoutBorrow),
      accuracy: withoutBorrow.length > 0 ? Answer.sumScores(withoutBorrow) / withoutBorrow.length : 0
    }
  }

  // Step stats
  const stepStats = {}
  const stepCounts = [...new Set(allAnswers.map(a => a.stepCount))].sort()
  for (const step of stepCounts) {
    const byStep = allAnswers.filter(a => a.stepCount === step)
    stepStats[step] = {
      count: byStep.length,
      correct: Answer.sumScores(byStep),
      accuracy: Answer.sumScores(byStep) / byStep.length
    }
  }

  // Daily streak: count consecutive days (from most recent) with at least 1 session
  const uniqueDays = [...new Set(
    sessions.map(s => s.createdAt.slice(0, 10))
  )].sort().reverse()

  let dailyStreak = 0
  const today = new Date()
  for (let i = 0; i < uniqueDays.length; i++) {
    const expected = new Date(today)
    expected.setDate(expected.getDate() - i)
    const expectedStr = expected.toISOString().slice(0, 10)
    if (uniqueDays[i] === expectedStr) {
      dailyStreak++
    } else {
      break
    }
  }

  // ── Number-level analysis ────────────────────────────────────────
  // For each specific number + operator combination, compute stats.
  // E.g. "8 + (加法)" groups all equations where 8 appears as an
  // operand in addition, so we can detect "8的加减法练习不足".
  const numberStats = {} // key: `${num}_${op}`
  const numberWrongEquations = {} // key: `${num}_${op}` → [{equation, userAnswer, solution}]

  for (const answer of allAnswers) {
    // Extract individual operand numbers from the equation string
    // e.g. "7+8=" → [7, 8], "15-8=" → [15, 8]
    const eq = answer.equation || ''
    const op = answer.operator || ''
    if (!op) continue

    // Parse operands from equation like "3+5=" or "13-9=" via parseEquation
    const parsed = parseEquation(eq)
    const numbers = []
    const left = parseInt(parsed.leftOperand)
    const right = parseInt(parsed.rightOperand)
    if (!isNaN(left)) numbers.push(left)
    if (!isNaN(right)) numbers.push(right)
    if (!numbers.length) continue

    for (const num of numbers) {
      // Only analyze single-digit and two-digit operands (0-99)
      if (num < 0 || num > 99) continue
      const key = `${num}_${op}`

      if (!numberStats[key]) {
        numberStats[key] = {
          number: num,
          operator: op,
          count: 0,
          correct: 0,
          wrongEquations: []
        }
      }
      numberStats[key].count++
      const answerScore = Answer.sumScores([answer])
      if (answerScore > 0) {
        numberStats[key].correct += answerScore
      } else {
        numberStats[key].wrongEquations.push({
          equation: eq,
          userAnswer: answer.userAnswer,
          solution: answer.solution
        })
      }
    }
  }

  // Compute accuracy for each number+op and sort by accuracy ascending
  const numberStatsArray = Object.values(numberStats).map(s => ({
    ...s,
    accuracy: s.count > 0 ? s.correct / s.count : 0,
    // Only keep last 5 wrong equations for display
    wrongEquations: s.wrongEquations.slice(0, 5)
  })).sort((a, b) => a.accuracy - b.accuracy)

  // Filter to "weak numbers" — accuracy < 70% and at least 3 attempts
  const weakNumbers = numberStatsArray.filter(s =>
    s.accuracy < 0.7 && s.count >= 3
  )

  return {
    totalSessions: sessions.length,
    totalQuestions,
    totalCorrect,
    overallAccuracy,
    operatorStats,
    carryStats,
    borrowStats,
    stepStats,
    numberStats: numberStatsArray,
    weakNumbers,
    dailyStreak
  }
}

// ─── Export / Import (backup & migration) ───────────────────────────────

/**
 * Export all data for a student as a plain JSON-serialisable object.
 * @param {string} studentId
 * @returns {Promise<object>}
 */
export async function exportAllData(studentId = 'default') {
  const sessions = await db.practiceSessions
    .where('studentId').equals(studentId)
    .toArray()

  const sessionIds = sessions.map(s => s.id)
  const answers = sessionIds.length
    ? await db.answers.where('sessionId').anyOf(sessionIds).toArray()
    : []

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    studentId,
    sessions,
    answers
  }
}

/**
 * Import data previously exported via exportAllData().
 * Duplicate sessions (same id) are skipped.
 * @param {object} data - The exported data object
 * @returns {Promise<{importedSessions: number, skippedSessions: number}>}
 */
export async function importAllData(data) {
  if (!data || !data.sessions || !Array.isArray(data.sessions)) {
    throw new Error('Invalid import data format')
  }

  let importedSessions = 0
  let skippedSessions = 0

  await db.transaction('rw', db.practiceSessions, db.answers, async () => {
    for (const session of data.sessions) {
      const exists = await db.practiceSessions.get(session.id)
      if (exists) {
        skippedSessions++
        continue
      }

      // Reset id to avoid collisions (let Dexie auto-assign)
      const { id, ...sessionData } = session
      const newId = await db.practiceSessions.add({
        ...sessionData,
        synced: 0,
        updatedAt: new Date().toISOString()
      })

      // Find related answers
      const relatedAnswers = (data.answers || []).filter(a => a.sessionId === id)
      const answersToInsert = relatedAnswers.map(({ id: _aid, ...a }) => ({
        ...a,
        sessionId: newId,
        synced: 0
      }))

      if (answersToInsert.length) {
        const CHUNK = 500
        for (let i = 0; i < answersToInsert.length; i += CHUNK) {
          await db.answers.bulkAdd(answersToInsert.slice(i, i + CHUNK))
        }
      }

      importedSessions++
    }
  })

  return { importedSessions, skippedSessions }
}

/**
 * Get all answers for a student (used by weak area analysis, phase 2).
 * @param {string} studentId
 * @returns {Promise<Array<object>>}
 */
// ─── getAllAnswers / saveQuestion / getQuestion / getQuestionByEquation ───
// 已迁至 Answer.getAllByStudent / Question.save / Question.loadByIds / Question.findByEquation
// 保留定义但不再导出（无外部调用）
// 未来 v4.0d 删

export async function getAllAnswers(studentId = 'default') {
  const sessions = await db.practiceSessions
    .where('studentId').equals(studentId)
    .toArray()

  const sessionIds = sessions.map(s => s.id)
  if (!sessionIds.length) return []

  const answers = await db.answers
    .where('sessionId').anyOf(sessionIds)
    .toArray()

  // Enrich answers with session-level config info
  const sessionMap = {}
  for (const s of sessions) {
    sessionMap[s.id] = s
  }

  return answers.map(a => ({
    ...a,
    config: sessionMap[a.sessionId]?.config || null
  }))
}

/**
 * 清空所有练习记录（IndexedDB + localStorage）
 * 用于 /reset 页面
 */
export async function clearAllData() {
  await db.transaction('rw', db.practiceSessions, db.answers, async () => {
    await db.practiceSessions.clear()
    await db.answers.clear()
  })
  try { localStorage.removeItem('psm_profile') } catch {}
}

// ─── Question CRUD ──────────────────────────────────────────────────────

/**
 * Upsert a question by equation. Returns { id, isNew }.
 * - 题目已存在 → 返回原 id, isNew=false
 * - 题目不存在 → 创建, isNew=true
 *
 * @param {object} questionData
 * @returns {Promise<{id:number, isNew:boolean}>}
 */
// 已迁至 Question.save，保留历史实现
export async function saveQuestion(questionData) {
  const existing = await db.questions.where('equation').equals(questionData.equation).first()
  if (existing) return { id: existing.id, isNew: false }

  const id = await db.questions.add({
    equation: questionData.equation,
    solution: questionData.solution ?? 0,
    operator: questionData.operator || '',
    operandMin: questionData.operandMin ?? 0,
    operandMax: questionData.operandMax ?? 0,
    operands: questionData.operands || [],
    isCarry: !!questionData.isCarry,
    isBorrow: !!questionData.isBorrow,
    difficulty: questionData.difficulty ?? 0,
    inputMode: questionData.inputMode || '',
    layout: questionData.layout || '',
    assistLevel: questionData.assistLevel ?? 0,
    blankMode: questionData.blankMode || 'result',
    createdAt: Date.now(),
    synced: 0,
  })
  return { id, isNew: true }
}

/**
 * Get a question by id.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
// 已迁至 Question.loadByIds / Answer.getAllByStudent，保留历史实现
export async function getQuestion(id) {
  return db.questions.get(id) ?? null
}

/**
 * Get a question by equation string.
 * @param {string} equation
 * @returns {Promise<object|null>}
 */
// 已迁至 Question.findByEquation（memory 版），保留历史实现
export async function getQuestionByEquation(equation) {
  return db.questions.where('equation').equals(equation).first() ?? null
}

export default db
