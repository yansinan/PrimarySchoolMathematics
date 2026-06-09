import { describe, it, expect } from 'vitest'
import { buildAttemptScore, computeScore, sumResponseTimes } from '@/utils/score'

describe('score helpers', () => {
  it('computes score by attempt count', () => {
    expect(computeScore(1)).toBe(1)
    expect(computeScore(2)).toBeCloseTo(2 / 3, 10)
    expect(computeScore(3)).toBeCloseTo(1 / 3, 10)
    expect(computeScore(4)).toBe(0)
    expect(computeScore(9)).toBe(0)
  })

  it('builds attempt score with incremented attemptCount', () => {
    // 新签名：buildAttemptScore(previousAttemptCount, userAnswer, solution)
    // isCorrect 内部从 userAnswer === solution 计算
    expect(buildAttemptScore(0, 5, 5)).toEqual({ attemptCount: 1, score: 1 })
    expect(buildAttemptScore(1, 5, 5)).toEqual({ attemptCount: 2, score: computeScore(2) })
    expect(buildAttemptScore(1, 4, 5)).toEqual({ attemptCount: 2, score: 0 })  // 答错
    expect(buildAttemptScore(2, 5, 5)).toEqual({ attemptCount: 3, score: computeScore(3) })
  })
})

describe('sumResponseTimes', () => {
  it('空数组返回 0', () => {
    expect(sumResponseTimes([])).toBe(0)
  })

  it('null/undefined/non-array 兜底返回 0', () => {
    expect(sumResponseTimes(null)).toBe(0)
    expect(sumResponseTimes(undefined)).toBe(0)
    expect(sumResponseTimes('not array')).toBe(0)
  })

  it('正常求和', () => {
    expect(sumResponseTimes([
      { responseTime: 1000 },
      { responseTime: 2000 },
      { responseTime: 1500 },
    ])).toBe(4500)
  })

  it('responseTime 缺失/null/0 兜底为 0', () => {
    expect(sumResponseTimes([
      { responseTime: 1000 },
      {},                       // 缺失字段
      { responseTime: null },  // 显式 null
      { responseTime: 0 },     // 显式 0
    ])).toBe(1000)
  })

  it('负数 responseTime 视为异常兜底为 0', () => {
    expect(sumResponseTimes([
      { responseTime: 1000 },
      { responseTime: -500 },   // 异常值
    ])).toBe(1000)
  })
})