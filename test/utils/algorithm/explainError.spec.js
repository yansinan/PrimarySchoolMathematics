/**
 * 错因说明 —— 孩子写下的答案对应哪种典型错误
 */
import { describe, it, expect } from 'vitest'
import { explainError } from '@/utils/algorithm/explainError'

const say = (equation, solution, userAnswer) =>
  explainError({ equation, solution, userAnswer })

describe('加法错因', () => {
  it('27 + 15 = 42，答 32 → 忘进位', () => {
    const r = say('27+15=', 42, 32)
    expect(r.code).toBe('forgotCarry')
    expect(r.label).toBe('忘进位')
    expect(r.hint).toContain('满十')
  })

  it('8 + 7 = 15，答 5 → 忘进位', () => {
    expect(say('8+7=', 15, 5).code).toBe('forgotCarry')
  })

  it('27 + 15 答 52 → 多进一位', () => {
    expect(say('27+15=', 42, 52).code).toBe('overCarry')
  })

  it('23 + 9 = 32，答 14 → 看成减法', () => {
    expect(say('23+9=', 32, 14).code).toBe('opConfused')
  })

  it('不进位时答差 1 → 个位算错（不能归成忘进位）', () => {
    const r = say('12+13=', 25, 24)
    expect(r.code).toBe('unitsSlip')
  })
})

describe('减法错因', () => {
  it('42 − 15 = 27，答 37 → 忘退位', () => {
    const r = say('42-15=', 27, 37)
    expect(r.code).toBe('forgotBorrow')
    expect(r.label).toBe('忘退位')
  })

  it('42 − 15 答 57 → 看成加法（与「减反了」数值恒等，只保留更常见的这个）', () => {
    expect(say('42-15=', 27, 57).code).toBe('opConfused')
  })
})

describe('乘法错因', () => {
  it('7 × 8 = 56，答 48 → 口诀串行', () => {
    const r = say('7×8=', 56, 48)
    expect(r.code).toBe('tableDrift')
    expect(r.label).toBe('口诀串行')
  })

  it('7 × 8 答 15 → 看成加法', () => {
    expect(say('7×8=', 56, 15).code).toBe('opConfused')
  })

  it('7 × 8 答 49 → 口诀串行（7×7 串到隔壁口诀）', () => {
    expect(say('7×8=', 56, 49).code).toBe('tableDrift')
  })
})

describe('除法错因', () => {
  it('56 ÷ 8 = 7，答 8 → 试商偏差', () => {
    expect(say('56÷8=', 7, 8).code).toBe('trialQuotient')
  })

  it('36 ÷ 5 = 7 余 1，答 1 → 把余数当商', () => {
    expect(say('36÷5=', 7, 1).code).toBe('remainderAsQuotient')
  })

  it('56 ÷ 8 答 48 → 口诀反向错', () => {
    expect(say('56÷8=', 7, 48).code).toBe('tableReverse')
  })
})

describe('兜底与边界', () => {
  it('答对时返回 unknown（调用方只在答错时用）', () => {
    expect(say('27+15=', 42, 42).code).toBe('unknown')
  })

  it('算式解析不出 → unknown，不抛错', () => {
    expect(say('', 42, 30).code).toBe('unknown')
    expect(say('x+y=', 42, 30).code).toBe('unknown')
  })

  it('差 1 能归类成个位算错', () => {
    expect(say('27+15=', 42, 41).code).toBe('unitsSlip')
  })

  it('无法归类时给「差多少」，不再只说正确答案', () => {
    const r = say('27+15=', 42, 7)
    expect(r.code).toBe('addOther')
    expect(r.label).toBe('')          // 不硬编错因名
    expect(r.hint).toContain('少')
    expect(r.hint).toContain('35')
  })

  it('非数字输入 → unknown', () => {
    expect(explainError({ equation: '27+15=', solution: 42, userAnswer: '' }).code).toBe('unknown')
    expect(explainError({ equation: '27+15=', solution: 42, userAnswer: NaN }).code).toBe('unknown')
  })
})
