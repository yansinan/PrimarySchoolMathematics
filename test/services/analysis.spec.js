/**
 * 阶段 8 单测：services/analysis.js 11 个公开函数 + 1 个 internal helper
 *
 * 必读：designDocs/PLAN-v2-ability-analysis.md § 7（验收标准）
 *
 * 覆盖策略：每个函数至少 1 个核心场景测试 + 关键边界
 * 工具：vitest + fake-indexeddb（让 Dexie 在 Node 环境跑）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { DB } from '@/services/databaseInit'
import {
  findEquivalent,
  findRelated,
  getMasteryByNumber,
  getMasteryByNumberFromAnswersBatch,
  _getStrengthByNumberBatch,
  _getMidByNumberBatch,
  _getWeaknessByNumberBatch,
  getWrongAnswers,
  evaluateCorrectionEffect,
  prioritizeWrongAnswers,
  getLearningCurve,
  getNumberCurve,
  getDynamicWeakness,
  getDynamicStrength,
} from '@/services/analysis'

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
  const merged = {
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
  // 一致性：若 overrides 传了 operands 但没传 operandMin/Max，自动从 operands 推
  // （阶段 13：getMasteryByNumber 从 operandMin/Max 反推数位，operands 字段与算法解耦）
  if (overrides.operands && (overrides.operandMin == null || overrides.operandMax == null)) {
    merged.operandMin = Math.min(...overrides.operands)
    merged.operandMax = Math.max(...overrides.operands)
  }
  return merged
}

beforeEach(async () => {
  // 每个 test 前清空表（fake-indexeddb 持久在内存中）
  await DB.questions.clear()
  await DB.answers.clear()
  nextId = 1
})
// ── 3.0 effectiveResponseTime 测试已迁 answer.spec.js ──────────────

// ── 3.1 findEquivalent

describe('findEquivalent', () => {
  beforeEach(async () => {
    await DB.questions.bulkAdd([
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
    await DB.questions.bulkAdd([
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
    await DB.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '8+3=', solution: 11, operands: [3, 8] }),
      mkQuestion({ id: 2, equation: '8-3=', solution: 5, operator: '-', operands: [3, 8] }),
      mkQuestion({ id: 3, equation: '8+5=', solution: 13, operandMin: 5, operandMax: 8, operands: [5, 8] }),
    ])
    await DB.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: true }),
      mkAnswer({ questionId: 1, isCorrect: true }),
      mkAnswer({ questionId: 2, isCorrect: false, userAnswer: 60 }),
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

// ── 3.1b getMasteryByNumberFromAnswersBatch（阶段 11：上下文相关数据源） ───

describe('getMasteryByNumberFromAnswersBatch', () => {
  beforeEach(async () => {
    await DB.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '8+3=', solution: 11, operands: [3, 8] }),
      mkQuestion({ id: 2, equation: '8-3=', solution: 5, operator: '-', operands: [3, 8] }),
      mkQuestion({ id: 3, equation: '4+5=', solution: 9, operands: [4, 5] }),
    ])
  })

  it('returns 10 zero-accuracy entries for empty answers', async () => {
    const batch = await getMasteryByNumberFromAnswersBatch([])
    expect(batch).toHaveLength(10)
    expect(batch[0]).toEqual({ number: 0, total: 0, correct: 0, score: 0, accuracy: 0, questionsCount: 0 })
    expect(batch[8].total).toBe(0)
  })

  it('filters to only answers whose question operands include the number', async () => {
    // 3 answers: Q1 (operands 3,8) 2次对1次错, Q3 (operands 4,5) 1次对
    const answers = [
      mkAnswer({ questionId: 1, isCorrect: true, sessionId: 1 }),
      mkAnswer({ questionId: 1, isCorrect: true, sessionId: 1 }),
      mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, sessionId: 1 }),
      mkAnswer({ questionId: 3, isCorrect: true, sessionId: 1 }),
    ]
    const batch = await getMasteryByNumberFromAnswersBatch(answers)
    // 数字 8 出现：Q1 (3 answers 涉及 8)
    const r8 = batch.find((r) => r.number === 8)
    expect(r8).toEqual({ number: 8, total: 3, correct: 2, score: 2 / 3, accuracy: 2 / 3, questionsCount: 1 })
    // 数字 3 出现：Q1 涉及
    const r3 = batch.find((r) => r.number === 3)
    expect(r3.total).toBe(3)
    // 数字 4 出现：Q3 1 次对
    const r4 = batch.find((r) => r.number === 4)
    expect(r4).toEqual({ number: 4, total: 1, correct: 1, score: 1, accuracy: 1, questionsCount: 1 })
    // 数字 7 未出现
    const r7 = batch.find((r) => r.number === 7)
    expect(r7.total).toBe(0)
  })

  it('is scope-bounded by caller-provided answers (本组/本轮/全量 同一函数不同数据)', async () => {
    // 模拟“本组”只有 1 个 answer
    const groupAnswers = [mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, sessionId: 1 })]
    const groupBatch = await getMasteryByNumberFromAnswersBatch(groupAnswers)
    // 数字 8 只 1 次（错）
    const r8group = groupBatch.find((r) => r.number === 8)
    expect(r8group).toEqual({ number: 8, total: 1, correct: 0, score: 0, accuracy: 0, questionsCount: 1 })

    // 模拟“本轮”含 3 个 answers
    const roundAnswers = [
      mkAnswer({ questionId: 1, isCorrect: true, sessionId: 1 }),
      mkAnswer({ questionId: 2, isCorrect: true, sessionId: 1 }),
      mkAnswer({ questionId: 3, isCorrect: false, userAnswer: 60, sessionId: 1 }),
    ]
    const roundBatch = await getMasteryByNumberFromAnswersBatch(roundAnswers)
    // 数字 8 出现 2 次（Q1 + Q2）
    const r8round = roundBatch.find((r) => r.number === 8)
    expect(r8round.total).toBe(2)
    expect(r8round.correct).toBe(2)
  })

  it('treats score ~0.67 (mid retry) as mid, not weakness', async () => {
    // 注：以前用 score: 0.5 测试边界值；现在 getter 优先
    // (score 由 userAnswer === solution + attemptCount 算)
    // 要测 mid 区间，用 attemptCount: 2 (score=0.67) 替代
    const answers = [
      mkAnswer({ questionId: 1, attemptCount: 2, userAnswer: 70, solution: 70, sessionId: 1 }),
      mkAnswer({ questionId: 1, attemptCount: 2, userAnswer: 70, solution: 70, sessionId: 1 }),
      mkAnswer({ questionId: 1, attemptCount: 2, userAnswer: 70, solution: 70, sessionId: 1 }),
    ]
    const mid = await _getMidByNumberBatch(answers)
    const weak = await _getWeaknessByNumberBatch(answers)
    const strong = await _getStrengthByNumberBatch(answers)
    expect(mid.some((r) => r.number === 8)).toBe(true)
    expect(weak.some((r) => r.number === 8)).toBe(false)
    expect(strong.some((r) => r.number === 8)).toBe(false)
  })
})

// ── 3.2 getWrongAnswers ───────────────────────────────────────────

describe('getWrongAnswers', () => {
  beforeEach(async () => {
    await DB.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '23+47=', operator: '+', operands: [23, 47] }),
      mkQuestion({ id: 2, equation: '15-8=', operator: '-', operands: [8, 15] }),
    ])
    const now = Date.now()
    await DB.answers.bulkAdd([
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
    await DB.questions.add(mkQuestion({ id: 1, equation: '23+47=' }))
    const now = Date.now()
    // 时序：W W C C C（W=Wrong, C=Correct）
    await DB.answers.bulkAdd([
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
    await DB.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '23+47=' }),
      mkQuestion({ id: 2, equation: '15-8=' }),
    ])
    // Q1 错 3 次（含 1 改正）
    await DB.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, timestamp: now - 1000 }),
      mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, timestamp: now - 2000 }),
      mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, timestamp: now - 3000 }),
      mkAnswer({ questionId: 1, isCorrect: true, userAnswer: 70, solution: 70, timestamp: now - 4000 }),
      // Q2 错 1 次（最近）
      mkAnswer({ questionId: 2, isCorrect: false, userAnswer: 60, timestamp: now - 100 }),
    ])
    const r = await prioritizeWrongAnswers({ limit: 5 })
    expect(r).toHaveLength(2)
    // Q1: 3 wrong (userAnswer=60, 60, 60; solution=70 → getter false)
    //     1 correct (userAnswer=70, solution=70 → getter true)
    //     isResolved=true (lastCorrectAt exists) → recencyScore from lastWrongAt=now-1000
    //     priority = 3 * 10 + 0 (resolved) + 10 (<1d) = 40
    // Q2: 1 wrong (no correct) → isResolved=false → recencyScore=10
    //     priority = 1 * 10 + 5 (unresolved) + 10 (<1d) = 25
    // 排序: Q1(40) > Q2(25)
    expect(r[0].questionId).toBe(1)
    expect(r[0].priority).toBeGreaterThan(r[1].priority)
  })
})

// ── 3.3 getLearningCurve ──────────────────────────────────────────

describe('getLearningCurve', () => {
  beforeEach(async () => {
    await DB.questions.add(mkQuestion({ id: 1, equation: '23+47=' }))
    const now = Date.now()
    await DB.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, responseTime: 5000, startedAt: now - 3000 }),
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
    await DB.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '8+3=', solution: 11, operands: [3, 8] }),
      mkQuestion({ id: 2, equation: '8-3=', solution: 5, operator: '-', operands: [3, 8] }),
    ])
    const now = Date.now()
    // 昨天 3 题（2 对 1 错）
    await DB.answers.bulkAdd([
      mkAnswer({ questionId: 1, isCorrect: true, userAnswer: 11, solution: 11, timestamp: now - 86400e3 - 1000 }),
      mkAnswer({ questionId: 1, isCorrect: true, userAnswer: 11, solution: 11, timestamp: now - 86400e3 - 2000 }),
      mkAnswer({ questionId: 2, isCorrect: false, userAnswer: 60, solution: 5, timestamp: now - 86400e3 - 3000 }),
      // 今天 1 题（对）
      mkAnswer({ questionId: 1, isCorrect: true, userAnswer: 11, solution: 11, timestamp: now - 1000 }),
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
    await DB.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '23+47=' }),
      mkQuestion({ id: 2, equation: '15-8=' }),
    ])
    const now = Date.now()
    // Q1 答 5 次都错（accuracy 0）
    for (let i = 0; i < 5; i++) {
      await DB.answers.add(
        mkAnswer({ questionId: 1, isCorrect: false, userAnswer: 60, timestamp: now - i * 1000 })
      )
    }
    // Q2 答 5 次都对（accuracy 1）
    for (let i = 0; i < 5; i++) {
      await DB.answers.add(
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

  // ── v2.3.0 1-strike 软规则（strict mode）──

  it('strict mode includes question with 1 real wrong + 1 correct (1-strike)', async () => {
    // 准备：清空 + 1 个 Q，1 个真错（rt=2000ms, isTimeout=false） + 1 个对
    await DB.answers.clear()
    await DB.questions.clear()
    await DB.questions.bulkAdd([mkQuestion({ id: 1, equation: '23+47=' })])
    const now = Date.now()
    await DB.answers.add(
      mkAnswer({
        questionId: 1,
        isCorrect: false,
        userAnswer: 60,
        responseTime: 2000,
        timestamp: now,
      })
    )
    await DB.answers.add(
      mkAnswer({ questionId: 1, isCorrect: true, responseTime: 2000, timestamp: now })
    )
    // 调 strict 模式
    const weakness = await getDynamicWeakness({ mode: 'strict' })
    // 断言：包含该 Q（不被 minSample=1 排除，且 realWrongCount=1 + correct=1 满足条件）
    expect(weakness).toHaveLength(1)
    expect(weakness[0].questionId).toBe(1)
    expect(weakness[0].realWrongCount).toBe(1)
    expect(weakness[0].correct).toBe(1)
  })

  it('strict mode excludes all-correct questions', async () => {
    // 准备：清空 + 1 个 Q，全对 3 个 answers
    await DB.answers.clear()
    await DB.questions.clear()
    await DB.questions.bulkAdd([mkQuestion({ id: 1, equation: '23+47=' })])
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await DB.answers.add(
        mkAnswer({
          questionId: 1,
          isCorrect: true,
          responseTime: 2000,
          timestamp: now - i * 1000,
        })
      )
    }
    // 调 strict 模式
    const weakness = await getDynamicWeakness({ mode: 'strict' })
    // 断言：不含该 Q（无 realWrong）
    expect(weakness).toEqual([])
  })

  it('strict mode excludes isTimeout-only wrong (快错/超时不算真错)', async () => {
    // 准备：1 个 Q，1 个快错（rt=100ms, isTimeout=true）+ 1 个超时错（rt=400000ms）
    //        + 1 个对（rt=2000ms）
    await DB.answers.clear()
    await DB.questions.clear()
    await DB.questions.bulkAdd([mkQuestion({ id: 1, equation: '23+47=' })])
    const now = Date.now()
    await DB.answers.add(
      mkAnswer({
        questionId: 1,
        isCorrect: false,
        userAnswer: 60,
        responseTime: 100, // 快错
        timestamp: now,
      })
    )
    await DB.answers.add(
      mkAnswer({
        questionId: 1,
        isCorrect: false,
        userAnswer: 60,
        responseTime: 400000, // 超时
        timestamp: now - 1000,
      })
    )
    await DB.answers.add(
      mkAnswer({
        questionId: 1,
        isCorrect: true,
        responseTime: 2000,
        timestamp: now - 2000,
      })
    )
    // 调 strict 模式
    const weakness = await getDynamicWeakness({ mode: 'strict' })
    // 断言：不含该 Q（realWrongCount=0：两个 wrong 都被 isTimeout 排除）
    expect(weakness).toEqual([])
  })

  it('strict mode requires ≥ 1 correct for comparison (避免全错被高估)', async () => {
    // 准备：1 个 Q，2 个真错（都不是 isTimeout）
    await DB.answers.clear()
    await DB.questions.clear()
    await DB.questions.bulkAdd([mkQuestion({ id: 1, equation: '23+47=' })])
    const now = Date.now()
    await DB.answers.add(
      mkAnswer({
        questionId: 1,
        isCorrect: false,
        userAnswer: 60,
        responseTime: 2000,
        timestamp: now,
      })
    )
    await DB.answers.add(
      mkAnswer({
        questionId: 1,
        isCorrect: false,
        userAnswer: 60,
        responseTime: 2000,
        timestamp: now - 1000,
      })
    )
    // 调 strict 模式
    const weakness = await getDynamicWeakness({ mode: 'strict' })
    // 断言：不含该 Q（correct=0，无对比 → 避免"全错"被高估）
    expect(weakness).toEqual([])
  })

  it('normal mode unchanged (backward compat) — mode defaults to normal', async () => {
    // 准备：1 个 Q，4 个 answers（3 对 1 错）
    await DB.answers.clear()
    await DB.questions.clear()
    await DB.questions.bulkAdd([mkQuestion({ id: 1, equation: '23+47=' })])
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await DB.answers.add(
        mkAnswer({
          questionId: 1,
          isCorrect: true,
          responseTime: 2000,
          timestamp: now - i * 1000,
        })
      )
    }
    await DB.answers.add(
      mkAnswer({
        questionId: 1,
        isCorrect: false,
        userAnswer: 60,
        responseTime: 2000,
        timestamp: now - 3000,
      })
    )
    // 调：不传 mode → 默认 'normal'，行为与 v2.2.0 完全一致
    const weakness = await getDynamicWeakness()
    // 断言：minSample=3 包含该 Q（4 >= 3）
    expect(weakness).toHaveLength(1)
    expect(weakness[0].questionId).toBe(1)
    expect(weakness[0].accuracy).toBe(0.75) // 3/4
  })
})

// ── 3.4 getDynamicStrength ────────────────────────────────────────

describe('getDynamicStrength', () => {
  beforeEach(async () => {
    await DB.questions.bulkAdd([
      mkQuestion({ id: 1, equation: '23+47=' }),
      mkQuestion({ id: 2, equation: '15-8=' }),
    ])
    const now = Date.now()
    // Q1 5 对，avgRT 1500
    for (let i = 0; i < 5; i++) {
      await DB.answers.add(
        mkAnswer({ questionId: 1, isCorrect: true, responseTime: 1500, timestamp: now - i * 1000 })
      )
    }
    // Q2 5 对但慢，avgRT 3000
    for (let i = 0; i < 5; i++) {
      await DB.answers.add(
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
    await DB.answers.clear()
    const strength = await getDynamicStrength({ minSample: 3 })
    expect(strength).toEqual([])
  })

  it('handles all-no-rt gracefully (maxRT || 1 fallback)', async () => {
    await DB.answers.clear()
    await DB.questions.clear() // 防止与 describe beforeEach Q1 unique 冲突
    await DB.questions.bulkPut([mkQuestion({ id: 1, equation: '23+47=' })])
    const now = Date.now()
    // 5 对且全 responseTime=0 + startedAt===endedAt（确保兜底也算 0）
    for (let i = 0; i < 5; i++) {
      await DB.answers.add(
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
