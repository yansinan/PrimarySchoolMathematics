import { DB } from '@/services/databaseInit'
import { parseEquation } from '@/utils/algorithm/equationParser'
const db = DB

// ─── Session CRUD ──────────────────────────────────────────────────────

export async function saveSession(sessionData, answersData) {
  const now = new Date().toISOString()
  const session = {
    studentId: sessionData.studentId || 'default', config: sessionData.config || null,
    totalQuestions: sessionData.totalQuestions || 0, correctCount: sessionData.correctCount || 0,
    accuracy: sessionData.accuracy || 0, totalDuration: sessionData.totalDuration || 0,
    evaluations: sessionData.evaluations || null, createdAt: now, synced: 0, updatedAt: now,
  }
  const id = await db.transaction('rw', db.practiceSessions, db.answers, async () => {
    const sessionId = await db.practiceSessions.add(session)
    const answers = answersData.map(a => ({
      sessionId, equation: a.equation || '', solution: a.solution ?? 0, userAnswer: a.userAnswer ?? 0,
      isCorrect: !!a.isCorrect, attemptCount: a.attemptCount ?? 1,
      score: typeof a.score === 'number' ? a.score : (a.isCorrect ? 1 : 0),
      responseTime: a.responseTime || 0, operator: a.operator || '',
      isCarry: !!a.isCarry, isBorrow: !!a.isBorrow, stepCount: a.stepCount || 1,
      operandMin: a.operandMin ?? 0, operandMax: a.operandMax ?? 0,
      timestamp: a.timestamp || Date.now(), synced: 0,
    }))
    const CHUNK = 500
    for (let i = 0; i < answers.length; i += CHUNK) await db.answers.bulkAdd(answers.slice(i, i + CHUNK))
    return sessionId
  })
  return id
}

export async function getSessions(studentId = 'default', limit = 50) {
  return db.practiceSessions.where('studentId').equals(studentId).reverse().limit(limit).toArray()
}

export async function getSessionDetail(sessionId) {
  const session = await db.practiceSessions.get(sessionId)
  const answers = await db.answers.where('sessionId').equals(sessionId).sortBy('timestamp')
  return { session, answers }
}

export async function deleteSession(sessionId) {
  await db.transaction('rw', db.practiceSessions, db.answers, async () => {
    await db.practiceSessions.delete(sessionId)
    await db.answers.where('sessionId').equals(sessionId).delete()
  })
}

// ─── Ability Snapshot CRUD ──────────────────────────────────────────────

export async function saveAbilitySnapshot(snapshot) {
  const record = { ...snapshot, computedAt: Date.now(), synced: 0 }
  return await db.abilitySnapshots.add(record)
}

export async function getLatestAbilitySnapshot(studentId = 'default') {
  const snapshots = await db.abilitySnapshots.where('studentId').equals(studentId).reverse().limit(1).toArray()
  return snapshots[0] || null
}

// ─── Aggregated Statistics ──────────────────────────────────────────────

export async function getAggregatedStats(studentId = 'default') {
  const { Answer } = await import('@/utils/algorithm/answer')
  const sessions = await db.practiceSessions.where('studentId').equals(studentId).reverse().toArray()
  if (!sessions.length) return emptyStats()
  const sessionIds = sessions.map(s => s.id)
  const allAnswers = await db.answers.where('sessionId').anyOf(sessionIds).toArray()
  const tq = allAnswers.length
  const tc = Answer.sumScores(allAnswers)
  const opStats = {}
  for (const op of ['+', '-', '*', '/']) {
    const byOp = allAnswers.filter(a => a.operator === op)
    if (byOp.length) opStats[op] = { count: byOp.length, correct: Answer.sumScores(byOp), accuracy: Answer.sumScores(byOp) / byOp.length }
  }
  const c = a => allAnswers.filter(a); const wc = allAnswers.filter(a => a.isCarry); const woc = allAnswers.filter(a => !a.isCarry && (a.operator === '+' || a.operator === '-'))
  const wb = allAnswers.filter(a => a.isBorrow); const wob = allAnswers.filter(a => !a.isBorrow && (a.operator === '+' || a.operator === '-'))
  const carrySt = { withCarry: { count: wc.length, correct: Answer.sumScores(wc), accuracy: wc.length ? Answer.sumScores(wc) / wc.length : 0 }, withoutCarry: { count: woc.length, correct: Answer.sumScores(woc), accuracy: woc.length ? Answer.sumScores(woc) / woc.length : 0 } }
  const borrowSt = { withBorrow: { count: wb.length, correct: Answer.sumScores(wb), accuracy: wb.length ? Answer.sumScores(wb) / wb.length : 0 }, withoutBorrow: { count: wob.length, correct: Answer.sumScores(wob), accuracy: wob.length ? Answer.sumScores(wob) / wob.length : 0 } }
  const stepSt = {}
  for (const step of [...new Set(allAnswers.map(a => a.stepCount))].sort()) {
    const byStep = allAnswers.filter(a => a.stepCount === step)
    stepSt[step] = { count: byStep.length, correct: Answer.sumScores(byStep), accuracy: Answer.sumScores(byStep) / byStep.length }
  }
  const uniqueDays = [...new Set(sessions.map(s => s.createdAt.slice(0, 10)))].sort().reverse()
  let streak = 0; const today = new Date()
  for (let i = 0; i < uniqueDays.length; i++) {
    const e = new Date(today); e.setDate(e.getDate() - i)
    if (uniqueDays[i] === e.toISOString().slice(0, 10)) streak++; else break
  }
  const numSt = {}
  for (const a of allAnswers) {
    const { equation: eq, operator: op } = a; if (!op) continue
    const parsed = parseEquation(eq); const nums = []
    const l = parseInt(parsed.leftOperand); const r = parseInt(parsed.rightOperand)
    if (!isNaN(l)) nums.push(l); if (!isNaN(r)) nums.push(r); if (!nums.length) continue
    for (const n of nums) {
      if (n < 0 || n > 99) continue; const key = `${n}_${op}`
      if (!numSt[key]) numSt[key] = { number: n, operator: op, count: 0, correct: 0, wrongEquations: [] }
      numSt[key].count++; const sc = Answer.sumScores([a])
      if (sc > 0) numSt[key].correct += sc; else numSt[key].wrongEquations.push({ equation: eq, userAnswer: a.userAnswer, solution: a.solution })
    }
  }
  const numArr = Object.values(numSt).map(s => ({ ...s, accuracy: s.count ? s.correct / s.count : 0, wrongEquations: s.wrongEquations.slice(0, 5) })).sort((a, b) => a.accuracy - b.accuracy)
  return { totalSessions: sessions.length, totalQuestions: tq, totalCorrect: tc, overallAccuracy: tq ? tc / tq : 0, operatorStats: opStats, carryStats: carrySt, borrowStats: borrowSt, stepStats: stepSt, numberStats: numArr, weakNumbers: numArr.filter(s => s.accuracy < 0.7 && s.count >= 3), dailyStreak: streak }
}

function emptyStats() {
  return { totalSessions: 0, totalQuestions: 0, totalCorrect: 0, overallAccuracy: 0, operatorStats: {}, carryStats: { withCarry: { count: 0, correct: 0 }, withoutCarry: { count: 0, correct: 0 } }, borrowStats: { withBorrow: { count: 0, correct: 0 }, withoutBorrow: { count: 0, correct: 0 } }, stepStats: {}, numberStats: [], weakNumbers: [], dailyStreak: 0 }
}

// ─── 3 函数已迁至 @/services/database（exportAllData/importAllData/clearAllData）──
// ─── Session CRUD ──────────────────────────────────────────────────────

export { default, DB } from '@/services/databaseInit'
