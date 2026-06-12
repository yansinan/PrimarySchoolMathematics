/**
 * Question 类 + Answer 类（U 层）单测
 *
 * @see utils/algorithm/question.js
 * @see utils/algorithm/answer.js
 */
import { describe, it, expect } from 'vitest'
import { Question, Answer } from '@/services'

// ── Question 类 ──────────────────────────────────────────────────

describe('Question', () => {
  const rawQuestion = {
    id: 1,
    equation: '23+47=__',
    solution: 70,
    operator: '+',
    operandMin: 23,
    operandMax: 47,
    operands: [23, 47],
    isCarry: true,
    isBorrow: false,
    stepCount: 1,
    difficulty: 7,
    inputMode: 'keypad',
    layout: 'vertical',
    assistLevel: 0,
    blankMode: 'result',
    createdAt: 1700000000000,
    synced: 0,
  }

  it('stores all fields from raw', () => {
    const q = new Question(rawQuestion)
    expect(q.equation).toBe('23+47=__')
    expect(q.solution).toBe(70)
    expect(q.operator).toBe('+')
    expect(q.difficulty).toBe(7)
    expect(q.operandMin).toBe(23)
    expect(q.operandMax).toBe(47)
  })

  it('fills missing fields with defaults', () => {
    const q = new Question({ equation: '5+3=' })
    expect(q.equation).toBe('5+3=')
    expect(q.solution).toBe(0)
    expect(q.operator).toBe('')
    expect(q.difficulty).toBe(0)
    expect(q.operandMin).toBe(0)
    expect(q.operandMax).toBe(0)
    expect(q.isCarry).toBe(false)
    expect(q.isBorrow).toBe(false)
    expect(q.synced).toBe(0)
  })

  it('does not throw on null/undefined raw (returns empty instance)', () => {
    expect(() => new Question()).not.toThrow()
    expect(() => new Question(null)).not.toThrow()
    const q = new Question(null)
    expect(q.equation).toBe('')
    expect(q.operator).toBe('')
  })

  it('operandRange getter returns [min, max]', () => {
    const q = new Question(rawQuestion)
    expect(q.operandRange).toEqual([23, 47])
  })

  it('needsCarry getter: true if isCarry', () => {
    const q = new Question({ ...rawQuestion, isCarry: true })
    expect(q.needsCarry).toBe(true)
  })

  it('needsCarry getter: true if difficulty >= 7 even without isCarry', () => {
    const q = new Question({ ...rawQuestion, isCarry: false, difficulty: 7 })
    expect(q.needsCarry).toBe(true)
  })

  it('needsBorrow getter: similar logic', () => {
    const q1 = new Question({ ...rawQuestion, isBorrow: true })
    const q2 = new Question({ ...rawQuestion, isBorrow: false, difficulty: 8 })
    const q3 = new Question({ ...rawQuestion, isBorrow: false, difficulty: 5 })
    expect(q1.needsBorrow).toBe(true)
    expect(q2.needsBorrow).toBe(true)
    expect(q3.needsBorrow).toBe(false)
  })

  it('toJSON round-trips', () => {
    const q = new Question(rawQuestion)
    const json = q.toJSON()
    const q2 = Question.fromJSON(json)
    expect(q2.equation).toBe(q.equation)
    expect(q2.solution).toBe(q.solution)
    expect(q2.operator).toBe(q.operator)
    expect(q2.operandMin).toBe(q.operandMin)
  })
})

// ── Answer 类 ────────────────────────────────────────────────────

describe('Answer', () => {
  // 题目元数据
  const questionPart = {
    equation: '23+47=__',
    solution: 70,
    operator: '+',
    operandMin: 23,
    operandMax: 47,
    operands: [23, 47],
    isCarry: true,
    isBorrow: false,
    stepCount: 1,
    difficulty: 7,
    inputMode: 'keypad',
    layout: 'vertical',
    assistLevel: 0,
    blankMode: 'result',
  }

  // 答题元数据
  const answerPart = {
    userAnswer: 60,
    responseTime: 1500,
    questionIndex: 0,
    timestamp: 1700000000000,
    startedAt: 1699999999000,
    endedAt: 1700000000000,
    previousAttemptCount: 0,
    correctedAt: null,
    sessionId: 1,
    questionId: 1,
  }

  it('extends Question (inherits all question fields)', () => {
    const a = new Answer({ ...questionPart, ...answerPart })
    expect(a.equation).toBe('23+47=__')
    expect(a.operator).toBe('+')
    expect(a.operandMin).toBe(23)
  })

  it('stores answer-specific fields', () => {
    const a = new Answer({ ...questionPart, ...answerPart })
    expect(a.userAnswer).toBe(60)
    expect(a.responseTime).toBe(1500)
    expect(a.questionIndex).toBe(0)
    expect(a.previousAttemptCount).toBe(0)
    expect(a.correctedAt).toBe(null)
  })

  // ── 派生属性 ──

  describe('isCorrect getter', () => {
    it('true when userAnswer === solution', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 70, solution: 70 })
      expect(a.isCorrect).toBe(true)
    })

    it('false when userAnswer !== solution', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 60, solution: 70 })
      expect(a.isCorrect).toBe(false)
    })

    it('handles string vs number comparison', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: '70', solution: 70 })
      expect(a.isCorrect).toBe(true)
    })
  })

  describe('attemptCount getter', () => {
    it('returns 1 for first attempt', () => {
      const a = new Answer({ ...questionPart, ...answerPart, previousAttemptCount: 0 })
      expect(a.attemptCount).toBe(1)
    })

    it('returns previousAttemptCount + 1', () => {
      const a = new Answer({ ...questionPart, ...answerPart, previousAttemptCount: 2 })
      expect(a.attemptCount).toBe(3)
    })
  })

  describe('score getter', () => {
    it('returns 0 for wrong answer', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 60, solution: 70, previousAttemptCount: 0 })
      expect(a.score).toBe(0)
    })

    it('returns 1 for first-attempt correct', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 70, solution: 70, previousAttemptCount: 0 })
      expect(a.score).toBe(1)
    })

    it('returns 2/3 for second-attempt correct', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 70, solution: 70, previousAttemptCount: 1 })
      expect(a.score).toBeCloseTo(2 / 3, 10)
    })

    it('returns 1/3 for third-attempt correct', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 70, solution: 70, previousAttemptCount: 2 })
      expect(a.score).toBeCloseTo(1 / 3, 10)
    })

    it('returns 0 for 4th+ attempt correct (floor)', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 70, solution: 70, previousAttemptCount: 3 })
      expect(a.score).toBe(0)
    })
  })

  describe('isFixed getter', () => {
    it('false when correctedAt is null', () => {
      const a = new Answer({ ...questionPart, ...answerPart, correctedAt: null })
      expect(a.isFixed).toBe(false)
    })

    it('true when correctedAt has a value', () => {
      const a = new Answer({ ...questionPart, ...answerPart, correctedAt: '2026-06-08T...' })
      expect(a.isFixed).toBe(true)
    })
  })

  describe('isWrong getter', () => {
    it('true when isCorrect=false and isFixed=false', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 60, solution: 70, correctedAt: null })
      expect(a.isWrong).toBe(true)
    })

    it('false when isCorrect=true (答对的不是错题)', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 70, solution: 70 })
      expect(a.isWrong).toBe(false)
    })

    it('false when isFixed=true (已修正的错题不算错题)', () => {
      const a = new Answer({ ...questionPart, ...answerPart, userAnswer: 60, solution: 70, correctedAt: '2026-06-08T...' })
      expect(a.isWrong).toBe(false)
    })
  })

  describe('isMastered getter (mastery-based)', () => {
    it('true when mastery >= MASTERY_THRESHOLD', () => {
      const a = new Answer({ equation: '23+47=', solution: 70, userAnswer: 70 })
      a.mastery = 100
      expect(a.isMastered).toBe(true)
    })

    it('false when mastery < MASTERY_THRESHOLD', () => {
      const a = new Answer({ equation: '23+47=', solution: 70, userAnswer: 70 })
      a.mastery = 50
      expect(a.isMastered).toBe(false)
    })

    it('false when no mastery set (undefined)', () => {
      const a = new Answer({ equation: '23+47=', solution: 70, userAnswer: 70 })
      expect(a.mastery).toBeUndefined()
      expect(a.isMastered).toBe(false)
    })
  })

  // ── 业务操作 ──

  describe('markFixed / unmarkFixed', () => {
    it('markFixed sets correctedAt to ISO string', () => {
      const a = new Answer({ ...questionPart, ...answerPart, correctedAt: null })
      a.markFixed()
      expect(a.correctedAt).toBeTruthy()
      expect(new Date(a.correctedAt).getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('unmarkFixed clears correctedAt to null', () => {
      const a = new Answer({ ...questionPart, ...answerPart, correctedAt: '2026-06-08T...' })
      a.unmarkFixed()
      expect(a.correctedAt).toBe(null)
    })
  })

  // ── 持久化 ──

  it('toJSON includes all fields', () => {
    const a = new Answer({ ...questionPart, ...answerPart, id: 1, createdAt: 1700000000000 })
    const json = a.toJSON()
    // Question fields
    expect(json.equation).toBe('23+47=__')
    expect(json.solution).toBe(70)
    expect(json.operator).toBe('+')
    // Answer fields
    expect(json.userAnswer).toBe(60)
    expect(json.responseTime).toBe(1500)
    expect(json.previousAttemptCount).toBe(0)
    expect(json.correctedAt).toBe(null)
  })

  describe('effectiveResponseTime + isTimeout', () => {
    it('uses responseTime when present', () => {
      const a = new Answer({ ...questionPart, ...answerPart, responseTime: 1500 })
      expect(a.effectiveResponseTime).toBe(1500)
      expect(a.isTimeout).toBe(false)
    })

    it('falls back to endedAt - startedAt when rt is null', () => {
      const a = new Answer({ ...questionPart, ...answerPart, responseTime: null, startedAt: 1000, endedAt: 3000 })
      expect(a.effectiveResponseTime).toBe(2000)
      expect(a.isTimeout).toBe(false)
    })

    it('does NOT fall back when rt is 0', () => {
      const a = new Answer({ ...questionPart, ...answerPart, responseTime: 0, startedAt: 1000, endedAt: 3000 })
      expect(a.effectiveResponseTime).toBe(0)
    })

    it('marks isTimeout for rt < 200ms', () => {
      const a = new Answer({ ...questionPart, ...answerPart, responseTime: 100 })
      expect(a.isTimeout).toBe(true)
    })

    it('marks isTimeout for rt > 5min', () => {
      const a = new Answer({ ...questionPart, ...answerPart, responseTime: 6 * 60 * 1000 })
      expect(a.isTimeout).toBe(true)
    })

    it('returns null when no time data', () => {
      const a = new Answer({ ...questionPart, ...answerPart, responseTime: null, startedAt: null, endedAt: null })
      expect(a.effectiveResponseTime).toBeNull()
      expect(a.isTimeout).toBe(false)
    })
  })

  it('fromJSON + toJSON round-trips', () => {
    const a1 = new Answer({ ...questionPart, ...answerPart, id: 42, createdAt: 1700000000000 })
    const a2 = Answer.fromJSON(a1.toJSON())
    expect(a2.equation).toBe(a1.equation)
    expect(a2.userAnswer).toBe(a1.userAnswer)
    expect(a2.isCorrect).toBe(a1.isCorrect)
    expect(a2.attemptCount).toBe(a1.attemptCount)
    expect(a2.score).toBe(a1.score)
    expect(a2.correctedAt).toBe(a1.correctedAt)
  })

  it('isWrong + isFixed = false → toJSON persists them as separate fields', () => {
    // 验证：旧 plain object 仍能读（无 isWrong/isFixed 字段也能包成 Answer）
    const a = Answer.fromJSON({ ...questionPart, ...answerPart })
    expect(a.isWrong).toBe(true)
    expect(a.isFixed).toBe(false)
  })
})
