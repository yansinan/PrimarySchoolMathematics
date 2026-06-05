/**
 * 阶段 8 单测：services/analysis.js 11 个公开函数 + 1 个 internal helper
 *
 * 必读：designDocs/PLAN-v2-ability-analysis.md § 7（验收标准）
 *
 * 覆盖策略：每个函数至少 1 个核心场景测试 + 关键边界
 * 工具：vitest + fake-indexeddb（让 Dexie 在 Node 环境跑）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import db from '@/utils/database'
import {
  getEffectiveResponseTime,
  findEquivalent,
  findRelated,
  getMasteryByNumber,
  getWrongAnswers,
  evaluateCorrectionEffect,
  prioritizeWrongAnswers,
  getLearningCurve,
  getNumberCurve,
  getDynamicWeakness,
  getDynamicStrength,
} from '@/utils/services/analysis'

// ── Mock 数据生成器 ──────────────────────────────────────────────

let nextId = 1

function mkAnswer(overrides = {}) {
  return {
    id: nextId++,
    sessionId: 1,
    questionId: 1,
    equation: '23+47=',
    solution: 70,
    userAnswer: 70,
    isCorrect: true,
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

function mkQuestion(overrides = {}) {
  return {
    id: nextId++,
    equation: '23+47=',
    solution: 70,
    operator: '+',
    operandMin: 23,
    operandMax: 47,
    operands: [23, 47],
    isCarry: true,
    isBorrow: false,
    difficulty: 7,
    inputMode: 'keypad',
    layout: 'vertical',
    assistLevel: 0,
    blankMode: 'result',
    createdAt: Date.now(),
    ...overrides,
  }
}

beforeEach(async () => {
  // 每个 test 前清空表（fake-indexeddb 持久在内存中）
  await db.questions.clear()
  await db.answers.clear()
  nextId = 1
})

// ── 3.0 getEffectiveResponseTime ─────────────────────────────────────

describe('getEffectiveResponseTime', () => {
  it('passes through valid rt', () => {
    const r = getEffectiveResponseTime({ responseTime: 1500 })
    expect(r.responseTime).toBe(1500)
    expect(r.isComputed).toBe(false)
    expect(r.isTimeout).toBe(false)
  })

  it('falls back to endedAt - startedAt when rt is null', () => {
    const r = getEffectiveResponseTime({
      responseTime: null,
      startedAt: 1000,
      endedAt: 3000,
    })
    expect(r.responseTime).toBe(2000)
    expect(r.isComputed).toBe(true)
  })

  it('does NOT fall back when rt is 0', () => {
    const r = getEffectiveResponseTime({
      responseTime: 0,
      startedAt: 1000,
      endedAt: 3000,
    })
    expect(r.responseTime).toBe(0)
    expect(r.isComputed).toBe(false)
  })

  it('marks isTimeout for rt < 200ms', () => {
    expect(getEffectiveResponseTime({ responseTime: 100 }).isTimeout).toBe(true)
  })

  it('marks isTimeout for rt > 5min', () => {
    expect(getEffectiveResponseTime({ responseTime: 6 * 60 * 1000 }).isTimeout).toBe(true)
  })

  it('returns nulls when no time data', () => {
    const r = getEffectiveResponseTime({ responseTime: null })
    expect(r.responseTime).toBeNull()
    expect(r.isComputed).toBe(false)
    expect(r.isTimeout).toBe(false)
  })
})

// ── 3.1 findEquivalent ─────────────────────────────────────────────

describe('findEquivalent', () => {
  beforeEach(async () => {
    await db.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '4+3=', solution: 7, operandMin: 3, operandMax: 4, operands: [3, 4] }),
      mkQuestion({ id: 2, equation: '3+4=', solution: 7, operandMin: 3, operandMax: 4, operands: [3, 4] }),
      mkQuestion({ id: 3, equation: '8-3=', solution: 5, operator: '-', operandMin: 3, operandMax: 8, operands: [3, 8] }),
    ])
  })

  it('finds commutative pair for addition', async () => {
    const equivs = await findEquivalent('4+3=')
    const equations = equivs.map((q) => q.equation).sort()
    expect(equations).toContain('3+4=')
  })

  it('only queries original for subtraction (no commutative)', async () => {
    const equivs = await findEquivalent('8-3=')
    expect(equivs.map((q) => q.equation)).toEqual(['8-3='])
  })

  it('returns empty for unknown equation', async () => {
    expect(await findEquivalent('99+1=')).toEqual([])
  })
})

// ── 3.1 findRelated ───────────────────────────────────────────────

describe('findRelated', () => {
  beforeEach(async () => {
    await db.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '34+3=', solution: 37, operandMin: 3, operandMax: 34, operands: [3, 34] }),
      mkQuestion({ id: 2, equation: '33+3=', solution: 36, operandMin: 3, operandMax: 33, operands: [3, 33] }),
      mkQuestion({ id: 3, equation: '35+3=', solution: 38, operandMin: 3, operandMax: 35, operands: [3, 35] }),
      mkQuestion({ id: 4, equation: '34+4=', solution: 38, operandMin: 4, operandMax: 34, operands: [4, 34] }),
      mkQuestion({ id: 5, equation: '50+50=', solution: 100, operandMin: 50, operandMax: 50, operands: [50, 50] }),
    ])
  })

  it('finds related questions within range', async () => {
    const related = await findRelated('34+3=', { range: 2, limit: 5 })
    const equations = related.map((q) => q.equation)
    expect(equations).toContain('33+3=')
    expect(equations).toContain('35+3=')
    // 50+50 超出 range，不应包含
    expect(equations).not.toContain('50+50=')
  })

  it('excludes self', async () => {
    const related = await findRelated('34+3=')
    expect(related.map((q) => q.equation)).not.toContain('34+3=')
  })

  it('returns empty for unparseable equation', async () => {
    expect(await findRelated('garbage')).toEqual([])
  })
})

// ── 3.1 getMasteryByNumber ────────────────────────────────────────

describe('getMasteryByNumber', () => {
  beforeEach(async () => {
    await db.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '8+3=', solution: 11, operands: [3, 8] }),
      mkQuestion({ id: 2, equation: '8-3=', solution: 5, operator: '-', operands: [3, 8] }),
      mkQuestion({ id: 3, equation: '8+5=', solution: 13, operandMin: 5, operandMax: 8, operands: [5, 8] }),
    ])
    await db.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: true }),
      mkAnswer({ questionId: 1, isCorrect: true }),
      mkAnswer({ questionId: 2, isCorrect: false }),
      mkAnswer({ questionId: 3, isCorrect: true }),
    ])
  })

  it('aggregates accuracy across questions containing the number', async () => {
    const r = await getMasteryByNumber(8, { days: 30 })
    expect(r.number).toBe(8)
    expect(r.total).toBe(4)
    expect(r.correct).toBe(3)
    expect(r.accuracy).toBe(0.75)
    expect(r.questionsCount).toBe(3)
  })

  it('returns empty structure for number with no questions', async () => {
    const r = await getMasteryByNumber(99, { days: 30 })
    expect(r).toEqual({
      number: 99,
      total: 0,
      correct: 0,
      accuracy: 0,
      questionsCount: 0,
      days: 30,
    })
  })
})

// ── 3.2 getWrongAnswers ───────────────────────────────────────────

describe('getWrongAnswers', () => {
  beforeEach(async () => {
    await db.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '23+47=', operator: '+', operands: [23, 47] }),
      mkQuestion({ id: 2, equation: '15-8=', operator: '-', operands: [8, 15] }),
    ])
    const now = Date.now()
    await db.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, timestamp: now - 1000 }),
      mkAnswer({ questionId: 1, isCorrect: true, userAnswer: 70, timestamp: now - 2000 }),
      mkAnswer({ questionId: 2, isCorrect: false, userAnswer: 5, timestamp: now - 500 }),
    ])
  })

  it('returns only wrong answers in descending timestamp order', async () => {
    const wrong = await getWrongAnswers({ days: 30 })
    expect(wrong).toHaveLength(2)
    expect(wrong.every((w) => w.userAnswer !== w.solution || !w.isCorrect)).toBe(true)
    // 倒序：questionId=2 (timestamp now-500) 应在前
    expect(wrong[0].questionId).toBe(2)
    expect(wrong[1].questionId).toBe(1)
  })

  it('filters by operator (uses questions.operator index)', async () => {
    const wrong = await getWrongAnswers({ operator: '-', days: 30 })
    expect(wrong).toHaveLength(1)
    expect(wrong[0].equation).toBe('15-8=')
  })

  it('respects limit', async () => {
    const wrong = await getWrongAnswers({ days: 30, limit: 1 })
    expect(wrong).toHaveLength(1)
  })
})

// ── 3.2 evaluateCorrectionEffect ──────────────────────────────────

describe('evaluateCorrectionEffect', () => {
  beforeEach(async () => {
    await db.questions.add(mkQuestion({ id: 1, equation: '23+47=' }))
    const now = Date.now()
    // 时序：W W C C C（W=Wrong, C=Correct）
    await db.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, startedAt: now - 5000 }),
      mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 65, startedAt: now - 4000 }),
      mkAnswer({ questionId: 1, isCorrect: true, userAnswer: 70, startedAt: now - 3000 }),
      mkAnswer({ questionId: 1, isCorrect: true, userAnswer: 70, startedAt: now - 2000 }),
      mkAnswer({ questionId: 1, isCorrect: true, userAnswer: 70, startedAt: now - 1000 }),
    ])
  })

  it('segments by isCorrect transitions', async () => {
    const r = await evaluateCorrectionEffect(1, { days: 30 })
    expect(r.totalAttempts).toBe(5)
    expect(r.segments).toHaveLength(2)
    expect(r.segments[0].isCorrect).toBe(false)
    expect(r.segments[0].attempts).toBe(2)
    expect(r.segments[1].isCorrect).toBe(true)
    expect(r.segments[1].attempts).toBe(3)
  })

  it('rates as improved when correctionStreak >= 3', async () => {
    const r = await evaluateCorrectionEffect(1, { days: 30 })
    expect(r.correctionStreak).toBe(3)
    expect(r.effectRating).toBe('improved')
  })

  it('returns empty object for unknown questionId', async () => {
    const r = await evaluateCorrectionEffect(999)
    expect(r.totalAttempts).toBe(0)
    expect(r.segments).toEqual([])
    expect(r.effectRating).toBe('still-struggling')
  })
})

// ── 3.2 prioritizeWrongAnswers ────────────────────────────────────

describe('prioritizeWrongAnswers', () => {
  it('ranks questions by priority (wrongCount + recency + unresolved)', async () => {
    const now = Date.now()
    await db.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '23+47=' }),
      mkQuestion({ id: 2, equation: '15-8=' }),
    ])
    // Q1 错 3 次（含 1 改正）
    await db.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: false, timestamp: now - 1000 }),
      mkAnswer({ questionId: 1, isCorrect: false, timestamp: now - 2000 }),
      mkAnswer({ questionId: 1, isCorrect: false, timestamp: now - 3000 }),
      mkAnswer({ questionId: 1, isCorrect: true, timestamp: now - 4000 }),
      // Q2 错 1 次（最近）
      mkAnswer({ questionId: 2, isCorrect: false, timestamp: now - 100 }),
    ])
    const r = await prioritizeWrongAnswers({ limit: 5 })
    expect(r).toHaveLength(2)
    // Q1 错 3 次未改正 priority = 30 + 0 (resolved=false +5? no, Q1 has lastCorrect) + recency
    // Q2 错 1 次未改正 priority = 10 + 0 + 10 (1d) = 20
    // 排序 Q1 > Q2 (wrongCount 主导)
    expect(r[0].questionId).toBe(1)
  })
})

// ── 3.3 getLearningCurve ──────────────────────────────────────────

describe('getLearningCurve', () => {
  beforeEach(async () => {
    await db.questions.add(mkQuestion({ id: 1, equation: '23+47=' }))
    const now = Date.now()
    await db.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: false, responseTime: 5000, startedAt: now - 3000 }),
      mkAnswer({ questionId: 1, isCorrect: true, responseTime: 1500, startedAt: now - 2000 }),
      mkAnswer({ questionId: 1, isCorrect: true, responseTime: 100, startedAt: now - 1000 }), // 异常
    ])
  })

  it('reuses getEffectiveResponseTime (returns responseTime + isTimeout)', async () => {
    const curve = await getLearningCurve(1, { days: 30 })
    expect(curve).toHaveLength(3)
    // 100ms < 200ms 阈值 → isTimeout: true
    expect(curve[2].responseTime).toBe(100)
    expect(curve[2].isTimeout).toBe(true)
    // 1500ms 正常
    expect(curve[1].isTimeout).toBe(false)
  })

  it('returns ascending by startedAt with 0-based attemptIndex', async () => {
    const curve = await getLearningCurve(1, { days: 30 })
    expect(curve.map((c) => c.attemptIndex)).toEqual([0, 1, 2])
  })

  it('returns empty for unknown questionId', async () => {
    expect(await getLearningCurve(999)).toEqual([])
  })
})

// ── 3.3 getNumberCurve ────────────────────────────────────────────

describe('getNumberCurve', () => {
  beforeEach(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10)
    await db.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '8+3=', solution: 11, operands: [3, 8] }),
      mkQuestion({ id: 2, equation: '8-3=', solution: 5, operator: '-', operands: [3, 8] }),
    ])
    const now = Date.now()
    // 昨天 3 题（2 对 1 错）
    await db.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: true, timestamp: now - 86400e3 - 1000 }),
      mkAnswer({ questionId: 1, isCorrect: true, timestamp: now - 86400e3 - 2000 }),
      mkAnswer({ questionId: 2, isCorrect: false, timestamp: now - 86400e3 - 3000 }),
      // 今天 1 题（对）
      mkAnswer({ questionId: 1, isCorrect: true, timestamp: now - 1000 }),
    ])
  })

  it('aggregates by date bucket with questionsCount dedup', async () => {
    const curve = await getNumberCurve(8, { days: 30 })
    expect(curve).toHaveLength(2) // 昨天 + 今天
    // 昨天 3 题 2 对，questionsCount=2 (Q1 + Q2)
    const yesterday = curve[0]
    expect(yesterday.total).toBe(3)
    expect(yesterday.correct).toBe(2)
    expect(yesterday.questionsCount).toBe(2) // Q1 + Q2 去重
  })
})

// ── 3.4 getDynamicWeakness ────────────────────────────────────────

describe('getDynamicWeakness', () => {
  beforeEach(async () => {
    await db.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '23+47=' }),
      mkQuestion({ id: 2, equation: '15-8=' }),
    ])
    const now = Date.now()
    // Q1 答 5 次都错（accuracy 0）
    for (let i = 0; i < 5; i++) {
      await db.answers.add(
        mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, timestamp: now - i * 1000 })
      )
    }
    // Q2 答 5 次都对（accuracy 1）
    for (let i = 0; i < 5; i++) {
      await db.answers.add(
        mkAnswer({ questionId: 2, isCorrect: true, timestamp: now - i * 1000 })
      )
    }
  })

  it('filters by minSample and sorts accuracy ascending', async () => {
    const weakness = await getDynamicWeakness({ minSample: 3 })
    expect(weakness).toHaveLength(2)
    expect(weakness[0].questionId).toBe(1) // accuracy 0
    expect(weakness[0].accuracy).toBe(0)
    expect(weakness[1].questionId).toBe(2) // accuracy 1
    expect(weakness[1].accuracy).toBe(1)
  })

  it('filters out questions below minSample', async () => {
    // 默认 minSample=3，需要 ≥ 3 次作答
    const weakness = await getDynamicWeakness({ minSample: 10 })
    expect(weakness).toEqual([])
  })
})

// ── 3.4 getDynamicStrength ────────────────────────────────────────

describe('getDynamicStrength', () => {
  beforeEach(async () => {
    await db.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '23+47=' }),
      mkQuestion({ id: 2, equation: '15-8=' }),
    ])
    const now = Date.now()
    // Q1 5 对，avgRT 1500
    for (let i = 0; i < 5; i++) {
      await db.answers.add(
        mkAnswer({ questionId: 1, isCorrect: true, responseTime: 1500, timestamp: now - i * 1000 })
      )
    }
    // Q2 5 对但慢，avgRT 3000
    for (let i = 0; i < 5; i++) {
      await db.answers.add(
        mkAnswer({ questionId: 2, isCorrect: true, responseTime: 3000, timestamp: now - i * 1000 })
      )
    }
  })

  it('sorts by composite score (accuracy + speed)', async () => {
    const strength = await getDynamicStrength({ minSample: 3 })
    expect(strength).toHaveLength(2)
    // Q1 (faster, same accuracy) should rank first
    expect(strength[0].questionId).toBe(1)
    // score ∈ [0, 1]
    expect(strength[0].score).toBeGreaterThan(strength[1].score)
  })

  it('handles empty groups without -Infinity bug', async () => {
    await db.answers.clear()
    const strength = await getDynamicStrength({ minSample: 3 })
    expect(strength).toEqual([])
  })

  it('handles all-no-rt gracefully (maxRT || 1 fallback)', async () => {
    await db.answers.clear()
    await db.questions.clear() // 防止与 describe beforeEach Q1 unique 冲突
    await db.questions.bulkPut([mkQuestion({ id: 1, equation: '23+47=' })])
    const now = Date.now()
    // 5 对且全 responseTime=0 + startedAt===endedAt（确保兜底也算 0）
    for (let i = 0; i < 5; i++) {
      await db.answers.add(
        mkAnswer({
          questionId: 1,
          isCorrect: true,
          responseTime: 0,
          startedAt: now - i * 1000,
          endedAt: now - i * 1000,
          timestamp: now - i * 1000,
        })
      )
    }
    const strength = await getDynamicStrength({ minSample: 3 })
    expect(strength).toHaveLength(1)
    expect(strength[0].accuracy).toBe(1)
    // maxRT fallback 触发：0/1 = 0 → score = 1*0.7 + 1*0.3 = 1.0（浮点容差）
    expect(strength[0].score).toBeCloseTo(1.0, 5)
  })
})
