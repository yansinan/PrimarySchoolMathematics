/**
 * 档位顺序自检 —— 锁死「按人教教材进度排列」这一约定
 *
 * 为什么需要：DIFFICULTY_LEVELS 的数组下标就是 difficultyIdx，
 * 顺序决定了自适应引擎的登梯路径。历史上乘除被整体排在加减之后，
 * 导致「二年级的表内乘法」排在「三年级的三位数加减」后面，违背教材进度。
 */
import { describe, it, expect } from 'vitest'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

const L = Object.fromEntries(DIFFICULTY_LEVELS.map((l, i) => [l.label, i]))
const GRADE_ORDER = ['一上', '一下', '二上', '二下', '三上', '三下', '四上', '四下']

describe('档位顺序（按教材进度）', () => {
  it('共 24 级', () => {
    expect(DIFFICULTY_LEVELS.length).toBe(24)
  })

  it('每级都有合法 grade', () => {
    for (const l of DIFFICULTY_LEVELS) {
      expect(GRADE_ORDER).toContain(l.grade)
    }
  })

  it('年级顺序不得倒退', () => {
    const idx = DIFFICULTY_LEVELS.map(l => GRADE_ORDER.indexOf(l.grade))
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1])
    }
  })

  it('表内乘法（二上）排在万以内加减（三上）之前', () => {
    expect(L['乘法口诀·2~6']).toBeLessThan(L['大数加法'])
    expect(L['乘法口诀·7~9']).toBeLessThan(L['大数加法'])
  })

  it('表内除法（二下）排在表内乘法之后、万以内加减之前', () => {
    expect(L['表内除法·2~6']).toBeGreaterThan(L['乘法口诀·7~9'])
    expect(L['表内除法·2~6']).toBeLessThan(L['大数加法'])
  })

  it('多位数乘一位数 → 两位数乘两位数 → 三位数乘两位数', () => {
    expect(L['两位数×一位数']).toBeLessThan(L['两位数×两位数'])
    expect(L['两位数×两位数']).toBeLessThan(L['三位数×两位数'])
  })

  it('除数是一位数 → 除数是两位数', () => {
    expect(L['两位数÷一位数']).toBeLessThan(L['两位数÷两位数'])
    expect(L['三位数÷一位数']).toBeLessThan(L['三位数÷两位数'])
  })

  it('两位数乘两位数（三下）与除数是一位数（三下）同册，均在四上之前', () => {
    expect(L['两位数×两位数']).toBeLessThan(L['三位数×两位数'])
    expect(L['三位数÷一位数']).toBeLessThan(L['三位数×两位数'])
  })
})
