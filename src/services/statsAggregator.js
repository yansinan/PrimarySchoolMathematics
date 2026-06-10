/**
 * 聚合统计服务（S 层）
 *
 * 从 databaseInit 读原始数据，用 Answer.sumScores 计算正确率（getter 即真理）。
 * 不依赖 stored isCorrect/score 字段。
 *
 * @see services/databaseInit.js — DB 实例
 * @see utils/algorithm/answer.js — Answer.sumScores
 */

import { DB } from './databaseInit'
import { Answer } from '@/utils/algorithm/answer'
import { parseEquation } from '@/utils/algorithm/equationParser'

/**
 * 聚合全量统计数据
 * @param {string} [studentId='default']
 * @returns {Promise<Object>}
 */
export async function getAggregatedStats(studentId = 'default') {
  const sessions = await DB.practiceSessions
    .where('studentId').equals(studentId).reverse().toArray()
  if (!sessions.length) return emptyStats()

  const sessionIds = sessions.map(s => s.id)
  const allAnswers = await DB.answers
    .where('sessionId').anyOf(sessionIds).toArray()

  const tq = allAnswers.length
  const tc = Answer.sumScores(allAnswers)

  // ── 运算符统计 ──
  const opStats = {}
  for (const op of ['+', '-', '*', '/']) {
    const byOp = allAnswers.filter(a => a.operator === op)
    if (byOp.length) {
      opStats[op] = {
        count: byOp.length,
        correct: Answer.sumScores(byOp),
        accuracy: Answer.sumScores(byOp) / byOp.length,
      }
    }
  }

  // ── 进位 / 退位统计 ──
  const wc = allAnswers.filter(a => a.isCarry)
  const woc = allAnswers.filter(a => !a.isCarry && (a.operator === '+' || a.operator === '-'))
  const wb = allAnswers.filter(a => a.isBorrow)
  const wob = allAnswers.filter(a => !a.isBorrow && (a.operator === '+' || a.operator === '-'))

  const carrySt = {
    withCarry: {
      count: wc.length,
      correct: Answer.sumScores(wc),
      accuracy: wc.length ? Answer.sumScores(wc) / wc.length : 0,
    },
    withoutCarry: {
      count: woc.length,
      correct: Answer.sumScores(woc),
      accuracy: woc.length ? Answer.sumScores(woc) / woc.length : 0,
    },
  }
  const borrowSt = {
    withBorrow: {
      count: wb.length,
      correct: Answer.sumScores(wb),
      accuracy: wb.length ? Answer.sumScores(wb) / wb.length : 0,
    },
    withoutBorrow: {
      count: wob.length,
      correct: Answer.sumScores(wob),
      accuracy: wob.length ? Answer.sumScores(wob) / wob.length : 0,
    },
  }

  // ── 步数统计 ──
  const stepSt = {}
  const stepCounts = [...new Set(allAnswers.map(a => a.stepCount))].sort()
  for (const step of stepCounts) {
    const byStep = allAnswers.filter(a => a.stepCount === step)
    stepSt[step] = {
      count: byStep.length,
      correct: Answer.sumScores(byStep),
      accuracy: Answer.sumScores(byStep) / byStep.length,
    }
  }

  // ── 连续练习天数 ──
  const uniqueDays = [...new Set(sessions.map(s => s.createdAt.slice(0, 10)))].sort().reverse()
  let streak = 0
  const today = new Date()
  for (let i = 0; i < uniqueDays.length; i++) {
    const e = new Date(today)
    e.setDate(e.getDate() - i)
    if (uniqueDays[i] === e.toISOString().slice(0, 10)) streak++
    else break
  }

  // ── 数字粒度统计 ──
  const numSt = {}
  for (const a of allAnswers) {
    const { equation: eq, operator: op } = a
    if (!op) continue
    const parsed = parseEquation(eq)
    const nums = []
    const l = parseInt(parsed.leftOperand)
    const r = parseInt(parsed.rightOperand)
    if (!isNaN(l)) nums.push(l)
    if (!isNaN(r)) nums.push(r)
    if (!nums.length) continue
    for (const n of nums) {
      if (n < 0 || n > 99) continue
      const key = `${n}_${op}`
      if (!numSt[key]) {
        numSt[key] = { number: n, operator: op, count: 0, correct: 0, wrongEquations: [] }
      }
      numSt[key].count++
      const sc = Answer.sumScores([a])
      if (sc > 0) numSt[key].correct += sc
      else numSt[key].wrongEquations.push({
        equation: eq,
        userAnswer: a.userAnswer,
        solution: a.solution,
      })
    }
  }

  const numArr = Object.values(numSt)
    .map(s => ({
      ...s,
      accuracy: s.count ? s.correct / s.count : 0,
      wrongEquations: s.wrongEquations.slice(0, 5),
    }))
    .sort((a, b) => a.accuracy - b.accuracy)

  const overallAccuracy = tq ? tc / tq : 0

  return {
    totalSessions: sessions.length,
    totalQuestions: tq,
    totalCorrect: tc,
    overallAccuracy,
    operatorStats: opStats,
    carryStats: carrySt,
    borrowStats: borrowSt,
    stepStats: stepSt,
    numberStats: numArr,
    weakNumbers: numArr.filter(s => s.accuracy < 0.7 && s.count >= 3),
    dailyStreak: streak,
  }
}

function emptyStats() {
  return {
    totalSessions: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    overallAccuracy: 0,
    operatorStats: {},
    carryStats: {
      withCarry: { count: 0, correct: 0 },
      withoutCarry: { count: 0, correct: 0 },
    },
    borrowStats: {
      withBorrow: { count: 0, correct: 0 },
      withoutBorrow: { count: 0, correct: 0 },
    },
    stepStats: {},
    numberStats: [],
    weakNumbers: [],
    dailyStreak: 0,
  }
}
