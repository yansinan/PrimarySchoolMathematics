import { describe, it, expect } from 'vitest'
import { buildAttemptScore, computeScore } from '@/utils/score'

describe('score helpers', () => {
  it('computes score by attempt count', () => {
    expect(computeScore(1)).toBe(1)
    expect(computeScore(2)).toBeCloseTo(2 / 3, 10)
    expect(computeScore(3)).toBeCloseTo(1 / 3, 10)
    expect(computeScore(4)).toBe(0)
    expect(computeScore(9)).toBe(0)
  })

  it('builds attempt score with incremented attemptCount', () => {
    expect(buildAttemptScore(0, false)).toEqual({ attemptCount: 1, score: 0 })
    expect(buildAttemptScore(1, false)).toEqual({ attemptCount: 2, score: 0 })
    expect(buildAttemptScore(1, true)).toEqual({ attemptCount: 2, score: computeScore(2) })
    expect(buildAttemptScore(2, true)).toEqual({ attemptCount: 3, score: computeScore(3) })
  })
})