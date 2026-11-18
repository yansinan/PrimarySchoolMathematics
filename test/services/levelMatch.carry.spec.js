/**
 * 档位匹配的进位语义 + 诊断档位不跨学段推档
 *
 * 两个真实 bug 的回归保护：
 *  1) matchLevel 曾把 carry='2'（允许）当成「必须进位」，
 *     导致无进位的两位数加法（51+52）跳过所有两位数档位，掉进「综合挑战」。
 *  2) computeDifficultyIdx 全对时无条件 +1，
 *     两位数加减最高档（进退位巩固 8）+1 正好是乘法口诀（9）→ 诊断 5 题全对直接跳乘法。
 */
import { describe, it, expect } from 'vitest'
import { Question } from '@/services/Question'
import { Profile } from '@/services/abilityProfile'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

const L = Object.fromEntries(DIFFICULTY_LEVELS.map((l, i) => [l.label, i]))
const m = (equation) => Question.matchLevel({ equation })

describe('进位/退位三态语义', () => {
  it('51+52=（两位数、无进位）落在「进退位巩固」，不掉到「综合挑战」', () => {
    const r = m('51+52=')
    expect(r.label).toBe('进退位巩固')
    expect(r.levelIdx).toBe(L['进退位巩固'])
    expect(r.levelIdx).toBeLessThan(L['综合挑战'])
  })

  it('47+68=（两位数、有进位）落在两位数档位', () => {
    const r = m('47+68=')
    expect(r.levelIdx).toBeGreaterThanOrEqual(L['进退位入门'])
    expect(r.levelIdx).toBeLessThan(L['大数加法'])
  })

  it('4+3=（无进位个位数）仍落在「起步」', () => {
    expect(m('4+3=').label).toBe('起步')
  })

  it('9+8=（有进位个位数）不会落在 carry=3 的禁止进位档位', () => {
    const r = m('9+8=')
    const level = DIFFICULTY_LEVELS[r.levelIdx]
    expect(level.carry).not.toBe('3')
  })

  it('95-68=（有退位）不会落在 abdication=3 的禁止退位档位', () => {
    const r = m('95-68=')
    const level = DIFFICULTY_LEVELS[r.levelIdx]
    expect(level.abdication).not.toBe('3')
  })

  it('三位数加减仍归到「综合挑战」或大数档位', () => {
    const r = m('946-243=')
    expect(r.levelIdx).toBeGreaterThanOrEqual(L['大数加法'])
  })
})

describe('诊断档位不跨运算类型推档', () => {
  const mk = (pairs) => pairs.map(([equation, solution], i) => ({
    equation, solution, userAnswer: solution, timestamp: 1700000000000 + i,
  }))

  it('两位数加减全对 → 停在该档，不跳到乘法', () => {
    // 全部落在「进退位巩固」(二上两位数加减)
    const idx = Profile.computeDifficultyIdx(mk([['51+52=', 103], ['47+68=', 115]]))
    expect(idx).toBe(L['进退位巩固'])
    expect(DIFFICULTY_LEVELS[idx].label).not.toMatch(/乘法|除法/)
  })

  it('乘法口诀全对 → 推进到下一乘法档（同运算类型内允许 +1）', () => {
    const idx = Profile.computeDifficultyIdx(mk([['3×4=', 12], ['6×6=', 36]]))
    expect(idx).toBeGreaterThan(L['乘法口诀·2~6'])
    expect(Profile._opKind(DIFFICULTY_LEVELS[idx])).toBe('mul')
  })

  it('表内除法全对 → 不跨到加减档', () => {
    const idx = Profile.computeDifficultyIdx(mk([['24÷4=', 6], ['36÷6=', 6]]))
    expect(Profile._opKind(DIFFICULTY_LEVELS[idx])).not.toBe('as')
  })
})
