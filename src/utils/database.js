import Dexie from 'dexie'

// ─── Helper: extract operand numbers from an equation string ────────────
// e.g. "7+8=" → [7, 8], "15-8=" → [15, 8], "9-4=" → [9, 4]
function extractOperandNumbers(equation, operator) {
  if (!equation || !operator) return []
  // Normalize the operator symbol for regex
  const opSymbol = operator === '*' ? '\\*' : operator === '/' ? '\\/' : operator
  // Match pattern: number(s) before and after the operator
  const opIndex = equation.indexOf(operator)
  if (opIndex === -1) return []

  // Extract the part before = sign and before/after operator
  const beforeEq = equation.split('=')[0] || ''
  const leftStr = beforeEq.substring(0, opIndex).trim()
  const afterOp = beforeEq.substring(opIndex + operator.length).trim()
  const rightStr = afterOp.split('=')[0].trim()

  const numbers = []
  const left = parseInt(leftStr)
  const right = parseInt(rightStr)
  if (!isNaN(left)) numbers.push(left)
  if (!isNaN(right)) numbers.push(right)
  return numbers
}

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
      answers: '++id, sessionId, synced, timestamp'
    })

    this.practiceSessions.mapToClass(PracticeSession)
    this.answers.mapToClass(Answer)
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

// ─── Aggregated Statistics ──────────────────────────────────────────────

/**
 * Compute aggregate statistics across all sessions for a student.
 * @param {string} studentId
 * @returns {Promise<object>}
 */
export async function getAggregatedStats(studentId = 'default') {
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
  const totalCorrect = allAnswers.filter(a => a.isCorrect).length
  const overallAccuracy = totalQuestions > 0 ? totalCorrect / totalQuestions : 0

  // Operator stats
  const operatorStats = {}
  for (const op of ['+', '-', '*', '/']) {
    const byOp = allAnswers.filter(a => a.operator === op)
    if (byOp.length > 0) {
      operatorStats[op] = {
        count: byOp.length,
        correct: byOp.filter(a => a.isCorrect).length,
        accuracy: byOp.filter(a => a.isCorrect).length / byOp.length
      }
    }
  }

  // Carry stats
  const withCarry = allAnswers.filter(a => a.isCarry)
  const withoutCarry = allAnswers.filter(a => !a.isCarry && (a.operator === '+' || a.operator === '-'))
  const carryStats = {
    withCarry: {
      count: withCarry.length,
      correct: withCarry.filter(a => a.isCorrect).length,
      accuracy: withCarry.length > 0 ? withCarry.filter(a => a.isCorrect).length / withCarry.length : 0
    },
    withoutCarry: {
      count: withoutCarry.length,
      correct: withoutCarry.filter(a => a.isCorrect).length,
      accuracy: withoutCarry.length > 0 ? withoutCarry.filter(a => a.isCorrect).length / withoutCarry.length : 0
    }
  }

  // Borrow stats
  const withBorrow = allAnswers.filter(a => a.isBorrow)
  const withoutBorrow = allAnswers.filter(a => !a.isBorrow && (a.operator === '+' || a.operator === '-'))
  const borrowStats = {
    withBorrow: {
      count: withBorrow.length,
      correct: withBorrow.filter(a => a.isCorrect).length,
      accuracy: withBorrow.length > 0 ? withBorrow.filter(a => a.isCorrect).length / withBorrow.length : 0
    },
    withoutBorrow: {
      count: withoutBorrow.length,
      correct: withoutBorrow.filter(a => a.isCorrect).length,
      accuracy: withoutBorrow.length > 0 ? withoutBorrow.filter(a => a.isCorrect).length / withoutBorrow.length : 0
    }
  }

  // Step stats
  const stepStats = {}
  const stepCounts = [...new Set(allAnswers.map(a => a.stepCount))].sort()
  for (const step of stepCounts) {
    const byStep = allAnswers.filter(a => a.stepCount === step)
    stepStats[step] = {
      count: byStep.length,
      correct: byStep.filter(a => a.isCorrect).length,
      accuracy: byStep.filter(a => a.isCorrect).length / byStep.length
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

    // Parse operands from equation like "3+5=" or "13-9="
    const numbers = extractOperandNumbers(eq, op)
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
      if (answer.isCorrect) {
        numberStats[key].correct++
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

export default db
