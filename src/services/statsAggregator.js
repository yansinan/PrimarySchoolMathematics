/**
 * 聚合统计服务（S 层）
 *
 * 从 databaseInit 读原始数据，用 Answer.sumScores 计算正确率（getter 即真理）。
 * 不依赖 stored isCorrect/score 字段。
 *
 * @see services/databaseInit.js — DB 实例
 * @see utils/algorithm/answer.js — Answer.sumScores
 */

import { Answer } from '@/services'
import { PracticeSession } from './PracticeSession'
import { parseEquation } from '@/utils/algorithm/equationParser'

/**
 * 聚合全量统计数据
 * @param {string} [studentId='default']
 * @returns {Promise<Object>}
 */
export async function getAggregatedStats(studentId = 'default') {
  const sessions = await PracticeSession.list(studentId, 9999)
  if (!sessions.length) return emptyStats()

  // 按 practiceSessionId 分组，每组只取最新一条；无 practiceSessionId 的旧数据每条独立
  const groups = new Map()
  const standalone = []
  for (const s of sessions) {
    if (s.practiceSessionId) {
      if (!groups.has(s.practiceSessionId)) {
        groups.set(s.practiceSessionId, s)
      }
    } else {
      standalone.push(s)
    }
  }
  const targetSessions = [...groups.values(), ...standalone]
  if (!targetSessions.length) return emptyStats()

  const sessionIds = targetSessions.filter(s => !s.practiceSessionId).map(s => s.id)
  const practiceSessionIds = [...new Set(targetSessions.filter(s => s.practiceSessionId).map(s => s.practiceSessionId))]
  // 加载答案：practiceSessionId（新数据）或 sessionId（旧数据）+ 游离答案
  const [byPsid, bySid, orphans] = await Promise.all([
    Promise.all(practiceSessionIds.map(psId => Answer.findByPracticeSessionId(psId))).then(r => r.flat()),
    sessionIds.length ? Answer.findBySessions(sessionIds) : [],
    Answer.getOrphans(),
  ])
  const allAnswers = [...byPsid, ...bySid, ...orphans]
  // Answer.findBySessions/getOrphans 已返回 Answer 实例，getter 可用
  // 游离答案用 timestamp 过滤：只取所属 sessions 时间范围内的
  const sessionDateRange = targetSessions.length > 0
    ? { min: Math.min(...targetSessions.map(s => new Date(s.createdAt).getTime())),
        max: Math.max(...targetSessions.map(s => new Date(s.createdAt).getTime())) }
    : null
  const filteredAnswers = sessionDateRange
    ? allAnswers.filter(a => {
        if (a.sessionId) return true
        const t = a.timestamp || 0
        return t >= sessionDateRange.min && t <= sessionDateRange.max + 86400000
      })
    : allAnswers

  // answer 去重兜底：加 sessionId 防跨轮同 equation 误去重
  const seen = new Set()
  const uniqueAnswers = filteredAnswers.filter(a => {
    const key = `${a.sessionId || 0}_${a.equation}_${a.solution}_${a.questionIndex ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const tq = uniqueAnswers.length
  const tc = uniqueAnswers.filter(a => a.isCorrect).length

  // ── 运算符统计 ──
  const opStats = {}
  for (const op of ['+', '-', '*', '/']) {
    const byOp = uniqueAnswers.filter(a => a.operator === op)
    if (byOp.length) {
      const correctCount = byOp.filter(a => a.isCorrect).length
      opStats[op] = {
        count: byOp.length,
        correct: correctCount,
        accuracy: correctCount / byOp.length,
      }
    }
  }

  // ── 进位 / 退位统计 ──
  const wc = uniqueAnswers.filter(a => a.isCarry)
  const woc = uniqueAnswers.filter(a => !a.isCarry && (a.operator === '+' || a.operator === '-'))
  const wb = uniqueAnswers.filter(a => a.isBorrow)
  const wob = uniqueAnswers.filter(a => !a.isBorrow && (a.operator === '+' || a.operator === '-'))

  const carrySt = {
    withCarry: {
      count: wc.length,
      correct: wc.filter(a => a.isCorrect).length,
      accuracy: wc.length ? wc.filter(a => a.isCorrect).length / wc.length : 0,
    },
    withoutCarry: {
      count: woc.length,
      correct: woc.filter(a => a.isCorrect).length,
      accuracy: woc.length ? woc.filter(a => a.isCorrect).length / woc.length : 0,
    },
  }
  const borrowSt = {
    withBorrow: {
      count: wb.length,
      correct: wb.filter(a => a.isCorrect).length,
      accuracy: wb.length ? wb.filter(a => a.isCorrect).length / wb.length : 0,
    },
    withoutBorrow: {
      count: wob.length,
      correct: wob.filter(a => a.isCorrect).length,
      accuracy: wob.length ? wob.filter(a => a.isCorrect).length / wob.length : 0,
    },
  }

  // ── 步数统计 ──
  const stepSt = {}
  const stepCounts = [...new Set(uniqueAnswers.map(a => a.stepCount))].sort()
  for (const step of stepCounts) {
    const byStep = uniqueAnswers.filter(a => a.stepCount === step)
    const stepCorrect = byStep.filter(a => a.isCorrect).length
    stepSt[step] = {
      count: byStep.length,
      correct: stepCorrect,
      accuracy: stepCorrect / byStep.length,
    }
  }

  // ── 连续练习天数 ──
  const uniqueDays = [...new Set(targetSessions.map(s => s.createdAt.slice(0, 10)))].sort().reverse()
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
  for (const a of uniqueAnswers) {
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
      const isC = a.isCorrect
      if (isC) numSt[key].correct++
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
    totalSessions: targetSessions.length,
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
