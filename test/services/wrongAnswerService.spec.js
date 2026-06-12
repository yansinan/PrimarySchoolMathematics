/**
 * 单测：WrongAnswer 类 — 错题查询 + 过滤
 *
 * @see src/services/WrongAnswer.js
 * @see test/services/analysis.spec.js（同模式：fake-indexeddb + 真实 Dexie）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { DB } from '@/services/databaseInit'
import { WrongAnswer } from '@/services'

// ── Mock 数据生成器 ──────────────────────────────────────────────

let nextId = 1
let nextSessionId = 1

function mkSession(overrides = {}) {
  const id = overrides.id ?? nextSessionId++
  return {
    id,
    studentId: 'default',
    totalQuestions: 1,
    correctCount: 0,
    accuracy: 0,
    totalDuration: 0,
    createdAt: Date.now() - 1000,
    updatedAt: Date.now(),
    synced: 0,
    ...overrides,
  }
}

function mkAnswer(overrides = {}) {
  return {
    id: nextId++,
    sessionId: 1,
    questionId: 1,
    equation: '23+47=__',
    solution: 70,
    userAnswer: 60,
    isCorrect: false,
    responseTime: 1500,
    operator: '+',
    operandMin: 23,
    operandMax: 47,
    timestamp: Date.now(),
    startedAt: Date.now() - 1500,
    endedAt: Date.now(),
    synced: 0,
    ...overrides,
  }
}

async function clearDB() {
  await DB.answers.clear()
  await DB.practiceSessions.clear()
  await DB.questions.clear()
}

// ── getWrongAnswers ───────────────────────────────────────────────

describe('getWrongAnswers', () => {
  beforeEach(async () => {
    await clearDB()
    await DB.practiceSessions.bulkAdd([
      mkSession({ id: 1, studentId: 'default' }),
    ])
    const now = Date.now()
    await DB.answers.bulkAdd([
      // 1 加法错题
      mkAnswer({ sessionId: 1, equation: '23+47=__', solution: 70, userAnswer: 60, isCorrect: false, operator: '+', operandMin: 23, operandMax: 47, questionIndex: 0, timestamp: now - 3000 }),
      // 2 加法对题（不应返回）
      mkAnswer({ sessionId: 1, equation: '15+8=__', solution: 23, userAnswer: 23, isCorrect: true, operator: '+', operandMin: 15, operandMax: 8, questionIndex: 1, timestamp: now - 2500 }),
      // 3 减法错题
      mkAnswer({ sessionId: 1, equation: '15-8=__', solution: 7, userAnswer: 5, isCorrect: false, operator: '-', operandMin: 8, operandMax: 15, questionIndex: 2, timestamp: now - 2000 }),
      // 4 远期错题（超过 30 天，不应返回）
      mkAnswer({ sessionId: 1, equation: '99+1=__', solution: 100, userAnswer: 90, isCorrect: false, operator: '+', operandMin: 99, operandMax: 1, questionIndex: 3, timestamp: now - 40 * 864e5, startedAt: now - 40 * 864e5 }),
    ])
  })

  it('returns only wrong answers', async () => {
    const wrong = await WrongAnswer.getWrongAnswers({ days: 30 })
    expect(wrong).toHaveLength(2)
    expect(wrong.every(a => a.isCorrect === false)).toBe(true)
  })

  it('sorts by timestamp desc (recent first)', async () => {
    const wrong = await WrongAnswer.getWrongAnswers({ days: 30 })
    expect(wrong[0].questionIndex).toBe(2)
    expect(wrong[1].questionIndex).toBe(0)
  })

  it('filters by operator', async () => {
    const wrong = await WrongAnswer.getWrongAnswers({ operator: '-', days: 30 })
    expect(wrong).toHaveLength(1)
    expect(wrong[0].operator).toBe('-')
  })

  it('filters by operandMin/Max range (overlap semantics)', async () => {
    const wrong = await WrongAnswer.getWrongAnswers({ minOperand: 10, maxOperand: 30, days: 30 })
    expect(wrong.length).toBeGreaterThanOrEqual(2)
    expect(wrong.some(a => a.equation === '23+47=__')).toBe(true)
  })

  it('respects limit', async () => {
    const wrong = await WrongAnswer.getWrongAnswers({ days: 30, limit: 1 })
    expect(wrong).toHaveLength(1)
  })

  it('excludes answers older than days cutoff', async () => {
    const wrong = await WrongAnswer.getWrongAnswers({ days: 30 })
    expect(wrong.find(a => a.equation === '99+1=__')).toBeUndefined()
  })

  it('excludes fixed wrong answers by default', async () => {
    // 直接写库模拟"已修正"状态
    const all = await DB.answers.toArray()
    await DB.answers.update(all[0].id, { correctedAt: new Date().toISOString() })
    const wrong = await WrongAnswer.getWrongAnswers({ days: 30 })
    expect(wrong).toHaveLength(1)
  })

  it('includes fixed wrong answers when includeFixed=true', async () => {
    const all = await DB.answers.toArray()
    await DB.answers.update(all[0].id, { correctedAt: new Date().toISOString() })
    const wrong = await WrongAnswer.getWrongAnswers({ days: 30, includeFixed: true })
    expect(wrong).toHaveLength(2)
  })

  it('returns empty when no wrong answers exist', async () => {
    await clearDB()
    await DB.practiceSessions.bulkAdd([mkSession({ id: 1 })])
    const wrong = await WrongAnswer.getWrongAnswers({ days: 30 })
    expect(wrong).toEqual([])
  })
})

// ── countWrongAnswers ─────────────────────────────────────────────

describe('countWrongAnswers', () => {
  beforeEach(async () => {
    await clearDB()
    await DB.practiceSessions.bulkAdd([mkSession({ id: 1, studentId: 'default' })])
    const now = Date.now()
    await DB.answers.bulkAdd([
      mkAnswer({ sessionId: 1, questionIndex: 0, isCorrect: false, userAnswer: 60, operator: '+', timestamp: now - 1000 }),
      mkAnswer({ sessionId: 1, equation: '15-8=__', solution: 7, isCorrect: false, userAnswer: 5, operator: '-', operandMin: 8, operandMax: 15, questionIndex: 1, timestamp: now - 2000 }),
      mkAnswer({ sessionId: 1, questionIndex: 2, isCorrect: true, userAnswer: 70, solution: 70, timestamp: now - 3000 }),
    ])
  })

  it('counts all wrong answers', async () => {
    const wrong = await WrongAnswer.getWrongAnswers({ days: 30, limit: 100 })
    const dbg = wrong.map(a => ({ qIdx: a.questionIndex, isCorrect: a.isCorrect, isWrong: a.isWrong, userAnswer: a.userAnswer, solution: a.solution }))
    expect({ wrong_count: wrong.length, dbg }).toEqual({
      wrong_count: 2,
      dbg: [
        { qIdx: 0, isCorrect: false, isWrong: true, userAnswer: 60, solution: 70 },
        { qIdx: 1, isCorrect: false, isWrong: true, userAnswer: 5, solution: 7 },
      ]
    })
  })

  it('counts with operator filter', async () => {
    const wrong = await WrongAnswer.getWrongAnswers({ operator: '-', days: 30 })
    expect(wrong).toHaveLength(1)
    expect(wrong[0].operator).toBe('-')
  })
})
