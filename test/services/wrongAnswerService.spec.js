/**
 * v4.0b 单测：services/wrongAnswerService.js 6 个公开函数
 *
 * @see v4-PLAN-error-injection.md § v4.0b
 * @see test/services/analysis.spec.js（同模式：fake-indexeddb + 真实 Dexie）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import db from '@/utils/store/database'
import {
  getWrongAnswers,
  countWrongAnswers,
  getWrongAnswerByEquation,
  markWrongAnswerCorrected,
  removeWrongAnswer,
  clearWrongAnswers,
} from '@/services/wrongAnswerService'

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
  await db.answers.clear()
  await db.practiceSessions.clear()
  await db.questions.clear()
}

// ── getWrongAnswers ───────────────────────────────────────────────

describe('getWrongAnswers', () => {
  beforeEach(async () => {
    await clearDB()
    await db.practiceSessions.bulkAdd([
      mkSession({ id: 1, studentId: 'default' }),
    ])
    const now = Date.now()
    await db.answers.bulkAdd([
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
    const wrong = await getWrongAnswers({ days: 30 })
    expect(wrong).toHaveLength(2)
    expect(wrong.every(a => a.isCorrect === false)).toBe(true)
  })

  it('sorts by timestamp desc (recent first)', async () => {
    const wrong = await getWrongAnswers({ days: 30 })
    // questionIndex=2 (减法, timestamp now-2000) 应在前
    expect(wrong[0].questionIndex).toBe(2)
    expect(wrong[1].questionIndex).toBe(0)
  })

  it('filters by operator', async () => {
    const wrong = await getWrongAnswers({ operator: '-', days: 30 })
    expect(wrong).toHaveLength(1)
    expect(wrong[0].operator).toBe('-')
  })

  it('filters by operandMin/Max range (overlap semantics)', async () => {
    // 查询 [10, 30], 错题 operand ranges:
    //   23+47 (range [23, 47]) — overlaps (23 <= 30)
    //   15-8  (range [8, 15])  — overlaps (15 <= 30 && 8 <= 10? 8 <= 10 yes)
    //   99+1  (range [1, 99])  — overlaps (99 >= 10)
    // 实际应返 3（都被范围包含）— 全部 operand ranges 与 [10,30] 有交集
    const wrong = await getWrongAnswers({ minOperand: 10, maxOperand: 30, days: 30 })
    expect(wrong.length).toBeGreaterThanOrEqual(2)  // 至少 2 个
    expect(wrong.some(a => a.equation === '23+47=__')).toBe(true)
  })

  it('respects limit', async () => {
    const wrong = await getWrongAnswers({ days: 30, limit: 1 })
    expect(wrong).toHaveLength(1)
  })

  it('excludes answers older than days cutoff', async () => {
    const wrong = await getWrongAnswers({ days: 30 })
    expect(wrong.find(a => a.equation === '99+1=__')).toBeUndefined()
  })

  it('excludes fixed wrong answers by default', async () => {
    await markWrongAnswerCorrected(1, 0, true)
    const wrong = await getWrongAnswers({ days: 30 })
    expect(wrong).toHaveLength(1)  // 减法还在
  })

  it('includes fixed wrong answers when includeFixed=true', async () => {
    await markWrongAnswerCorrected(1, 0, true)
    const wrong = await getWrongAnswers({ days: 30, includeFixed: true })
    expect(wrong).toHaveLength(2)
  })

  it('returns empty when no wrong answers exist', async () => {
    await clearDB()
    await db.practiceSessions.bulkAdd([mkSession({ id: 1 })])
    const wrong = await getWrongAnswers({ days: 30 })
    expect(wrong).toEqual([])
  })
})

// ── countWrongAnswers ─────────────────────────────────────────────

describe('countWrongAnswers', () => {
  beforeEach(async () => {
    await clearDB()
    await db.practiceSessions.bulkAdd([mkSession({ id: 1, studentId: 'default' })])
    const now = Date.now()
    await db.answers.bulkAdd([
      mkAnswer({ sessionId: 1, questionIndex: 0, isCorrect: false, operator: '+', timestamp: now - 1000 }),
      mkAnswer({ sessionId: 1, questionIndex: 1, isCorrect: false, operator: '+', timestamp: now - 2000 }),
      mkAnswer({ sessionId: 1, questionIndex: 2, isCorrect: false, operator: '-', timestamp: now - 3000 }),
      mkAnswer({ sessionId: 1, questionIndex: 3, isCorrect: true, operator: '+', timestamp: now - 4000 }),
    ])
  })

  it('counts all wrong answers', async () => {
    const count = await countWrongAnswers({ days: 30 })
    expect(count).toBe(3)
  })

  it('counts with operator filter', async () => {
    const count = await countWrongAnswers({ operator: '-', days: 30 })
    expect(count).toBe(1)
  })
})

// ── getWrongAnswerByEquation ─────────────────────────────────────

describe('getWrongAnswerByEquation', () => {
  beforeEach(async () => {
    await clearDB()
    await db.practiceSessions.bulkAdd([mkSession({ id: 1, studentId: 'default' })])
    await db.answers.bulkAdd([
      mkAnswer({ sessionId: 1, equation: '23+47=__', isCorrect: false }),
      mkAnswer({ sessionId: 1, equation: '15+8=__', isCorrect: true }),
    ])
  })

  it('returns the wrong answer with matching equation', async () => {
    const a = await getWrongAnswerByEquation('23+47=__')
    expect(a).toBeTruthy()
    expect(a.isCorrect).toBe(false)
  })

  it('returns null when equation is for a correct answer', async () => {
    const a = await getWrongAnswerByEquation('15+8=__')
    expect(a).toBeNull()
  })

  it('returns null when equation not found', async () => {
    const a = await getWrongAnswerByEquation('99+1=__')
    expect(a).toBeNull()
  })
})

// ── markWrongAnswerCorrected ─────────────────────────────────────

describe('markWrongAnswerCorrected', () => {
  let targetId

  beforeEach(async () => {
    await clearDB()
    await db.practiceSessions.bulkAdd([mkSession({ id: 1, studentId: 'default' })])
    await db.answers.bulkAdd([
      mkAnswer({ sessionId: 1, questionIndex: 0, isCorrect: false }),
    ])
    // 拿到实际 id（++id 自动递增，不一定是 1）
    const all = await db.answers.toArray()
    targetId = all[0].id
  })

  it('sets correctedAt timestamp', async () => {
    const ok = await markWrongAnswerCorrected(1, 0, true)
    expect(ok).toBe(true)
    const a = await db.answers.get(targetId)
    expect(a.correctedAt).toBeTruthy()
    expect(new Date(a.correctedAt).getTime()).toBeGreaterThan(Date.now() - 5000)
  })

  it('removes correctedAt when un-correcting', async () => {
    await markWrongAnswerCorrected(1, 0, true)
    await markWrongAnswerCorrected(1, 0, false)
    const a = await db.answers.get(targetId)
    expect(a.correctedAt).toBeNull()
  })

  it('returns false for non-existent (sessionId, questionIndex)', async () => {
    const ok = await markWrongAnswerCorrected(999, 0, true)
    expect(ok).toBe(false)
  })
})

// ── removeWrongAnswer ────────────────────────────────────────────

describe('removeWrongAnswer', () => {
  beforeEach(async () => {
    await clearDB()
    await db.practiceSessions.bulkAdd([mkSession({ id: 1, studentId: 'default' })])
    await db.answers.bulkAdd([
      mkAnswer({ sessionId: 1, questionIndex: 0, isCorrect: false }),
      mkAnswer({ sessionId: 1, questionIndex: 1, isCorrect: false }),
    ])
  })

  it('deletes the answer record', async () => {
    const ok = await removeWrongAnswer(1, 0)
    expect(ok).toBe(true)
    const remaining = await db.answers.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].questionIndex).toBe(1)
  })

  it('returns false for non-existent', async () => {
    const ok = await removeWrongAnswer(1, 999)
    expect(ok).toBe(false)
  })

  it('only deletes the specified (sessionId, questionIndex), not others', async () => {
    await removeWrongAnswer(1, 0)
    const remaining = await db.answers.toArray()
    expect(remaining.map(a => a.questionIndex)).toEqual([1])
  })
})

// ── clearWrongAnswers ────────────────────────────────────────────

describe('clearWrongAnswers', () => {
  beforeEach(async () => {
    await clearDB()
    // 2 sessions for 'default' user
    await db.practiceSessions.bulkAdd([
      mkSession({ id: 1, studentId: 'default' }),
      mkSession({ id: 2, studentId: 'default' }),
      mkSession({ id: 3, studentId: 'other-user' }),
    ])
    await db.answers.bulkAdd([
      // session 1
      mkAnswer({ sessionId: 1, questionIndex: 0, isCorrect: false }),
      mkAnswer({ sessionId: 1, questionIndex: 1, isCorrect: true }),
      // session 2
      mkAnswer({ sessionId: 2, questionIndex: 0, isCorrect: false }),
      // session 3 (other user) — 不应被删
      mkAnswer({ sessionId: 3, questionIndex: 0, isCorrect: false }),
    ])
  })

  it('deletes all wrong answers for the given student', async () => {
    const removed = await clearWrongAnswers('default')
    expect(removed).toBe(2)
    const remaining = await db.answers.toArray()
    // 剩余: session 1 correct + session 3 wrong (other user) = 2
    expect(remaining).toHaveLength(2)
    expect(remaining.find(a => a.sessionId === 3)).toBeTruthy()  // other-user 错题保留
  })

  it('preserves correct answers for the same student', async () => {
    await clearWrongAnswers('default')
    const remaining = await db.answers.toArray()
    // session 1 第 2 题 isCorrect=true 应保留
    const session1Correct = remaining.find(a => a.sessionId === 1 && a.questionIndex === 1)
    expect(session1Correct).toBeTruthy()
    expect(session1Correct.isCorrect).toBe(true)
  })

  it('returns 0 when no wrong answers exist', async () => {
    await clearWrongAnswers('default')
    const removed = await clearWrongAnswers('default')
    expect(removed).toBe(0)
  })

  it('returns 0 for unknown student (no sessions)', async () => {
    const removed = await clearWrongAnswers('no-such-user')
    expect(removed).toBe(0)
  })
})
